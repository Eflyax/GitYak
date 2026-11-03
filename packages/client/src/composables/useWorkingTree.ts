import {ref, shallowRef, computed, readonly, shallowReadonly} from 'vue';
import type {IWorkingTreeStatus, IFileStatus} from '@/domain';
import {EFileStatus, EFileArea, ENetworkCommand} from '@/domain';
import {singleFlight} from '@/domain/services/singleFlight';
import {useGit} from './useGit';
import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';

export type TGitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

const COLLATOR = new Intl.Collator();

// Probe only markers that git removes once the operation finishes or is aborted.
// `.git/MERGE_MSG` and `.git/REBASE_HEAD` are NOT such markers — they linger after a
// completed merge/rebase and cause false positives. An in-progress rebase is identified by
// the rebase-merge/rebase-apply directories (probed via a file that exists for the whole
// operation). Rebase comes first so a rebase's transient merge state isn't mislabelled as a
// plain merge.
const OPERATION_PROBES: Array<[string, TGitOperation]> = [
	['.git/rebase-merge/git-rebase-todo', 'rebase'],
	['.git/rebase-apply/next', 'rebase'],
	['.git/MERGE_HEAD', 'merge'],
	['.git/CHERRY_PICK_HEAD', 'cherry-pick'],
	['.git/REVERT_HEAD', 'revert'],
];

// Shallow: a large working tree means thousands of entries, replaced wholesale on each load.
const
	status = shallowRef<IWorkingTreeStatus>({staged: [], unstaged: []}),
	conflictDetected = ref(false),
	operationKind = ref<TGitOperation | null>(null);

// Stage/unstage operations in flight. On a big tree (many or large files) `git add` can take
// a while; the staging panel covers itself with a spinner until the count drops back to 0.
const stagingOps = ref(0);
const isStaging = computed(() => stagingOps.value > 0);

async function trackStaging(op: () => Promise<void>): Promise<void> {
	stagingOps.value++;

	try {
		await op();
	}
	finally {
		stagingOps.value--;
	}
}

// The `git status` output the lists were last parsed from; an identical reload is skipped.
let lastStatusOutput: string | null = null;
// Shared by every caller, so loads requested from several components never run side by side.
let loadStatusOnce: (() => Promise<void>) | null = null;

const hasChanges = computed(
	(): boolean => status.value.staged.length > 0 || status.value.unstaged.length > 0,
);

const stagedCount = computed(() => status.value.staged.length);
const unstagedCount = computed(() => status.value.unstaged.length);

function isUnmerged(f: IFileStatus): boolean {
	return f.status === EFileStatus.Conflicted || f.status === EFileStatus.UpdatedUnmerged;
}

// True only while unmerged entries actually remain in the working tree.
// Distinct from `conflictDetected` (a merge/rebase is in progress): once every
// conflict is staged, this flips to false while `conflictDetected` stays true
// until the merge is committed.
const hasUnresolvedConflicts = computed(() =>
	status.value.staged.some(isUnmerged) || status.value.unstaged.some(isUnmerged),
);

const workingTreeStats = computed(() => {
	const all = new Map<string, EFileStatus>();

	for (const f of status.value.unstaged) all.set(f.path, f.status);
	for (const f of status.value.staged) all.set(f.path, f.status);

	const stats = {A: 0, M: 0, D: 0, R: 0};

	for (const s of all.values()) {
		if (s === EFileStatus.Added) stats.A++;
		else if (s === EFileStatus.Modified) stats.M++;
		else if (s === EFileStatus.Deleted) stats.D++;
		else if (s === EFileStatus.Renamed) stats.R++;
	}

	return stats;
});

function parseStatus(output: string): IWorkingTreeStatus {
	const tokens = output.split('\0').filter((t, i, arr) => i < arr.length - 1 || t);
	const staged: IFileStatus[] = [];
	const unstaged: IFileStatus[] = [];

	let i = 0;

	while (i < tokens.length) {
		const token = tokens[i];

		if (!token || token.length < 3) {
			i++;
			continue;
		}

		const xCode = token[0]!;
		const yCode = token[1]!;
		const x = xCode as EFileStatus;
		const y = yCode as EFileStatus;
		const path = token.slice(3);
		let oldPath: string | undefined;

		if (x === EFileStatus.Renamed || x === EFileStatus.Conflicted) {
			oldPath = tokens[++i];
		}

		// Staged (index status)
		if (x !== EFileStatus.Unmodified && x !== EFileStatus.Untracked) {
			staged.push({
				status: x,
				path,
				oldPath,
				area: EFileArea.Staged,
			});
		}

		// Unstaged (worktree status)
		if (y !== EFileStatus.Unmodified) {
			unstaged.push({
				status: y === EFileStatus.Untracked ? EFileStatus.Added : y,
				path,
				oldPath,
				area: EFileArea.Unstaged,
			});
		}

		i++;
	}

	return {
		staged: staged.filter(f => f.status !== EFileStatus.Unmodified).sort((a, b) => COLLATOR.compare(a.path, b.path)),
		unstaged: unstaged.filter(f => f.status !== EFileStatus.Unmodified).sort((a, b) => COLLATOR.compare(a.path, b.path)),
	};
}

export function useWorkingTree() {
	const {callGit, stageFile: gitStageFile, stageAll: gitStageAll, unstageFile: gitUnstageFile, unstageAll: gitUnstageAll, discardFile: gitDiscardFile, discardAllChanges: gitDiscardAllChanges} = useGit();
	const {call} = useWebSocket();
	const {currentProject} = useProject();

	async function probeOperation(): Promise<TGitOperation | null> {
		const repoPath = currentProject.value?.path ?? '';

		// All probes at once: on a remote transport five sequential round trips would add up on
		// every refresh. The first existing marker in probe order wins.
		const results = await Promise.allSettled(OPERATION_PROBES.map(([file]) =>
			call(ENetworkCommand.ReadFile, {repo_path: repoPath, file_path: file}),
		));

		const hit = results.findIndex(r => r.status === 'fulfilled');

		return hit === -1 ? null : OPERATION_PROBES[hit]![1];
	}

	async function doLoadStatus(): Promise<void> {
		const [output, kind] = await Promise.all([
			callGit(
				'status',
				'--porcelain',
				'-z',
				'--untracked-files=all',
			),
			probeOperation(),
		]);

		// A refresh usually finds the same working tree; re-parsing would hand thousands of
		// identical rows to the lists as new objects and re-render them all.
		if (output !== lastStatusOutput) {
			lastStatusOutput = output;
			status.value = parseStatus(output);
		}

		// Conflict detection: either a merge/rebase/cherry-pick is in progress,
		// or there are unmerged (UU/AA/etc.) entries in the working tree.
		operationKind.value = kind;
		conflictDetected.value = kind !== null || hasUnresolvedConflicts.value;
	}

	loadStatusOnce ??= singleFlight(doLoadStatus);

	const loadStatus = loadStatusOnce;

	async function stageFile(filePath: string): Promise<void> {
		await trackStaging(async () => {
			await gitStageFile(filePath);
			await loadStatus();
		});
	}

	async function stageAll(): Promise<void> {
		await trackStaging(async () => {
			await gitStageAll();
			await loadStatus();
		});
	}

	async function unstageFile(filePath: string): Promise<void> {
		await trackStaging(async () => {
			await gitUnstageFile(filePath);
			await loadStatus();
		});
	}

	async function unstageAll(): Promise<void> {
		await trackStaging(async () => {
			await gitUnstageAll();
			await loadStatus();
		});
	}

	async function discardFile(filePath: string): Promise<void> {
		await gitDiscardFile(filePath);
		await loadStatus();
	}

	async function discardAllChanges(): Promise<void> {
		await gitDiscardAllChanges();
		await loadStatus();
	}

	return {
		status: shallowReadonly(status),
		hasChanges,
		stagedCount,
		unstagedCount,
		conflictDetected: readonly(conflictDetected),
		operationKind: readonly(operationKind),
		hasUnresolvedConflicts,
		isStaging,
		loadStatus,
		stageFile,
		stageAll,
		unstageFile,
		unstageAll,
		discardFile,
		discardAllChanges,
		workingTreeStats,
	};
}
