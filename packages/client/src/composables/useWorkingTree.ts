import {ref, computed, readonly} from 'vue';
import type {IWorkingTreeStatus, IFileStatus} from '@/domain';
import {EFileStatus, EFileArea, ENetworkCommand} from '@/domain';
import {useGit} from './useGit';
import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';

const
	status = ref<IWorkingTreeStatus>({staged: [], unstaged: []}),
	conflictDetected = ref(false);

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
		staged: staged.filter(f => f.status !== EFileStatus.Unmodified).sort((a, b) => a.path.localeCompare(b.path)),
		unstaged: unstaged.filter(f => f.status !== EFileStatus.Unmodified).sort((a, b) => a.path.localeCompare(b.path)),
	};
}

export function useWorkingTree() {
	const {callGit, stageFile: gitStageFile, stageAll: gitStageAll, unstageFile: gitUnstageFile, unstageAll: gitUnstageAll, discardFile: gitDiscardFile, discardAllChanges: gitDiscardAllChanges} = useGit();
	const {call} = useWebSocket();
	const {currentProject} = useProject();

	const hasChanges = computed(
		(): boolean => status.value.staged.length > 0 || status.value.unstaged.length > 0,
	);

	const stagedCount = computed(() => status.value.staged.length);
	const unstagedCount = computed(() => status.value.unstaged.length);

	async function loadStatus(): Promise<void> {
		const output = await callGit(
			'status',
			'--porcelain',
			'-z',
			'--untracked-files=all',
		);

		status.value = parseStatus(output);

		// Conflict detection: either a merge/rebase/cherry-pick is in progress,
		// or there are unmerged (UU/AA/etc.) entries in the working tree.
		const hasUnmerged = [...status.value.staged, ...status.value.unstaged]
			.some(f => f.status === EFileStatus.Conflicted || f.status === EFileStatus.UpdatedUnmerged);

		if (hasUnmerged) {
			conflictDetected.value = true;

			return;
		}

		// Probe only markers that git removes once the operation finishes or is
		// aborted. `.git/MERGE_MSG` and `.git/REBASE_HEAD` are NOT such markers —
		// they linger after a completed merge/rebase and cause false positives.
		// An in-progress rebase is identified by the rebase-merge/rebase-apply
		// directories (probed via a file that exists for the whole operation).
		const repoPath = currentProject.value?.path ?? '';
		const probes = [
			'.git/MERGE_HEAD',
			'.git/CHERRY_PICK_HEAD',
			'.git/REVERT_HEAD',
			'.git/rebase-merge/git-rebase-todo',
			'.git/rebase-apply/next',
		];
		let detected = false;

		for (const file of probes) {
			try {
				await call(ENetworkCommand.ReadFile, {repo_path: repoPath, file_path: file});
				detected = true;
				break;
			}
			catch {}
		}

		conflictDetected.value = detected;
	}

	async function stageFile(filePath: string): Promise<void> {
		await gitStageFile(filePath);
		await loadStatus();
	}

	async function stageAll(): Promise<void> {
		await gitStageAll();
		await loadStatus();
	}

	async function unstageFile(filePath: string): Promise<void> {
		await gitUnstageFile(filePath);
		await loadStatus();
	}

	async function unstageAll(): Promise<void> {
		await gitUnstageAll();
		await loadStatus();
	}

	async function discardFile(filePath: string): Promise<void> {
		await gitDiscardFile(filePath);
		await loadStatus();
	}

	async function discardAllChanges(): Promise<void> {
		await gitDiscardAllChanges();
		await loadStatus();
	}

	const workingTreeStats = computed(() => {
		const all = new Map<string, EFileStatus>();

		for (const f of status.value.unstaged) all.set(f.path, f.status);
		for (const f of status.value.staged) all.set(f.path, f.status);

		const statuses = Array.from(all.values());

		return {
			A: statuses.filter(s => s === EFileStatus.Added).length,
			M: statuses.filter(s => s === EFileStatus.Modified).length,
			D: statuses.filter(s => s === EFileStatus.Deleted).length,
			R: statuses.filter(s => s === EFileStatus.Renamed).length,
		};
	});

	return {
		status: readonly(status),
		hasChanges,
		stagedCount,
		unstagedCount,
		conflictDetected: readonly(conflictDetected),
		loadStatus,
		stageFile,
		stageAll,
		unstageFile,
		unstageAll,
		discardFile,
		discardAllChanges,
		workingTreeStats
	};
}
