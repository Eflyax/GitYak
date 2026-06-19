import {ref, computed, readonly} from 'vue';
import type {ICommit, IReference, IStash} from '@/domain';
import {EReferenceType} from '@/domain';
import {useGit} from './useGit';
import {useStash} from './useStash';

export interface ICommitFile {
	path: string;
	status: string;
	oldPath?: string;
}

const FIELD_SEP = '\x06';
const COMMIT_LIMIT = 200;
const LIMIT_MULTIPLIER = 4;
const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const LOG_FORMAT = [
	'%H',  // hash
	'%P',  // parents
	'%s',  // subject
	'%b',  // body
	'%ae', // authorEmail
	'%an', // authorName
	'%ad', // authorDate
	'%ce', // committerEmail
	'%cn', // committerName
	'%cd', // committerDate
].join(FIELD_SEP);

const LOG_KEYS: (keyof ICommit)[] = [
	'hash', 'parents', 'subject', 'body',
	'authorEmail', 'authorName', 'authorDate',
	'committerEmail', 'committerName', 'committerDate',
] as (keyof ICommit)[];

const commits = ref<ICommit[]>([]);
const selectedHashes = ref<string[]>([]);
const currentLimit = ref<number>(COMMIT_LIMIT);
const allLoaded = ref(false);
const referencesByHash = ref<Record<string, IReference[]>>({});
const commitFiles = ref<ICommitFile[] | null>(null);

const commitMap = computed(() => {
	const map = new Map<string, ICommit>();

	commits.value.forEach(c => map.set(c.hash, c));

	return map;
});

function parseRawCommit(raw: string): Partial<ICommit> {
	const fields = raw.split(FIELD_SEP);
	const result: Partial<ICommit> = {};

	LOG_KEYS.forEach((key, i) => {
		(result as Record<string, unknown>)[key] = fields[i] ?? '';
	});

	return result;
}

function mapStashes(stashes: readonly IStash[]): ICommit[] {
	return [...stashes]
		.sort((a, b) => {
			const numA = parseInt(a.id.match(/\{(\d+)\}/)?.[1] ?? '0', 10);
			const numB = parseInt(b.id.match(/\{(\d+)\}/)?.[1] ?? '0', 10);

			return numA - numB;
		})
		.map(stash => {
			const parentHash = stash.parentHash.split(' ')[0] ?? '';

			const subject = stash.message.includes(':')
				? stash.message.split(':').slice(1).join(':').trim()
				: stash.message;

			return {
				hash: stash.hash,
				hashAbbr: stash.hash.slice(0, 7),
				parents: [parentHash] as unknown as ReadonlyArray<string>,
				subject,
				body: '',
				authorName: 'Stash',
				authorEmail: '',
				authorDate: '',
				committerName: 'Stash',
				committerEmail: '',
				committerDate: '',
				isStash: true,
				references: [{
					type: EReferenceType.Stash,
					name: stash.id,
					id: stash.id,
					hash: stash.hash,
				}],
			} as ICommit;
		});
}

function buildGraph(rawCommits: ICommit[]): void {
	const occupiedLevels: Record<number, ICommit> = {};
	const remainingParents: Record<string, Set<string>> = {};
	const children: Record<string, ICommit[]> = {};

	for (const [i, commit] of rawCommits.entries()) {
		commit.index = i;
		commit.hashAbbr = commit.hash.slice(0, 7);

		const
			rawParents = commit.parents;

		let parents: string[];

		if (Array.isArray(rawParents)) {
			parents = rawParents as string[];
		}
		else {
			const raw = rawParents as unknown as string;

			parents = raw ? raw.split(' ').filter(Boolean) : [];
		}

		commit.parents = parents;

		if (!commit.isStash && commit.hash !== 'WORKING_TREE') {
			commit.references = referencesByHash.value[commit.hash] ?? [];
		}

		for (const parentHash of parents) {
			children[parentHash] ??= [];
			children[parentHash].push(commit);
		}

		remainingParents[commit.hash] = new Set(parents);

		const sortedChildren = (children[commit.hash] ?? []).sort(
			(a, b) => (a.level ?? 0) - (b.level ?? 0),
		);

		for (const child of sortedChildren) {
			if (
				occupiedLevels[child.level ?? -1] === child &&
				commit.hash === child.parents[0] &&
				(child.index ?? 0) < i
			) {
				commit.level = child.level;
				break;
			}
		}

		if (commit.level === undefined) {
			for (let level = 0; ; ++level) {
				if (occupiedLevels[level] === undefined) {
					commit.level = level;
					break;
				}
			}
		}

		if (parents.length > 0) {
			occupiedLevels[commit.level] = commit;
		}

		for (const child of children[commit.hash] ?? []) {
			remainingParents[child.hash].delete(commit.hash);

			if (
				remainingParents[child.hash].size === 0 &&
				child.level !== commit.level &&
				occupiedLevels[child.level ?? -1] === child
			) {
				delete occupiedLevels[child.level ?? -1];
			}
		}
	}
}

function parseDiffNameStatus(output: string): ICommitFile[] {
	const tokens = output.split('\0');
	const files: ICommitFile[] = [];

	for (let i = 0; i < tokens.length - 1; ++i) {
		const statusToken = tokens[i] ?? '';
		const status = statusToken[0] ?? '';
		const path = tokens[++i] ?? '';

		if (['R', 'C'].includes(status)) {
			const newPath = tokens[++i] ?? '';

			files.push({status, path: newPath, oldPath: path});
		}
		else {
			files.push({status, path});
		}
	}

	return files.filter(f => f.path);
}

function parseReferences(refOutput: string): Record<string, IReference[]> {
	const result: Record<string, IReference[]> = {};

	for (const line of refOutput.trim().split('\n').filter(Boolean)) {
		const [hash, refName] = line.split(' ');

		if (!hash || !refName) continue;

		result[hash] ??= [];

		let type: EReferenceType;
		let name: string;

		if (refName.startsWith('refs/heads/')) {
			type = EReferenceType.Branch;
			name = refName.replace('refs/heads/', '');
		}
		else if (refName.startsWith('refs/remotes/')) {
			type = EReferenceType.RemoteBranch;
			name = refName.replace('refs/remotes/', '');

			if (name === 'HEAD' || name.endsWith('/HEAD')) continue;
		}
		else if (refName.startsWith('refs/tags/')) {
			type = EReferenceType.Tag;
			name = refName.replace('refs/tags/', '');
		}
		else {
			type = EReferenceType.Head;
			name = refName;
		}

		result[hash].push({type, name, id: refName, hash});
	}

	return result;
}

export function useCommits() {
	const {callGit} = useGit();
	const {stashes} = useStash();

	async function loadReferences(): Promise<void> {
		const output = await callGit(
			'for-each-ref',
			'--format=%(objectname) %(refname)',
			'refs/heads',
			'refs/remotes',
			'refs/tags',
		);

		referencesByHash.value = parseReferences(output);
	}

	async function loadCommits(limit = COMMIT_LIMIT): Promise<void> {
		await loadReferences();

		const log = await callGit(
			'log',
			'--exclude=refs/stash',
			'--all',
			'-z',
			`--pretty=format:${LOG_FORMAT}`,
			'--date=format-local:%Y-%m-%d %H:%M',
			...(limit ? [`--max-count=${limit}`] : []),
			'--date-order',
		);

		const regularCommits = log
			.split('\0')
			.filter(Boolean)
			.map(row => parseRawCommit(row) as ICommit);

		let headHash = '';

		try {
			headHash = (await callGit('rev-parse', 'HEAD')).trim();
		}
		catch {

		}

		let mergeHeadHash = '';

		try {
			mergeHeadHash = (await callGit('rev-parse', 'MERGE_HEAD')).trim();
		}
		catch {

		}

		const workingTreeParents = headHash ? [headHash, ...(mergeHeadHash ? [mergeHeadHash] : [])] : [];

		const workingTree: ICommit = {
			hash: 'WORKING_TREE',
			hashAbbr: 'WORKING',
			parents: workingTreeParents as unknown as ReadonlyArray<string>,
			subject: 'Working Tree',
			body: '',
			authorName: '',
			authorEmail: '',
			authorDate: '',
			committerName: '',
			committerEmail: '',
			committerDate: '',
			references: [],
		};

		const rawCommits: ICommit[] = [
			workingTree,
			...mapStashes(stashes.value),
			...regularCommits,
		];

		buildGraph(rawCommits);

		commits.value = rawCommits;
		currentLimit.value = limit;
		allLoaded.value = regularCommits.length < limit;

		selectedHashes.value = selectedHashes.value.filter(
			h => commitMap.value.has(h),
		);
	}

	async function loadMore(): Promise<void> {
		const nextLimit = currentLimit.value * LIMIT_MULTIPLIER;

		await loadCommits(nextLimit);
	}

	function selectCommit(hash: string): void {
		selectedHashes.value = [hash];
	}

	function toggleCommitSelection(hash: string): void {
		// Reassign the array (never mutate in place) so the reference changes and
		// non-deep `watch(selectedHashes)` consumers (e.g. CommitDetails loading
		// the aggregated file list) actually re-run.
		if (selectedHashes.value.includes(hash)) {
			selectedHashes.value = selectedHashes.value.filter(h => h !== hash);
		}
		else {
			selectedHashes.value = [...selectedHashes.value, hash];
		}
	}

	function clearSelection(): void {
		selectedHashes.value = [];
	}

	async function loadCommitDetails(hashes: readonly string[]): Promise<void> {
		commitFiles.value = null;

		if (hashes.length === 0) return;

		const realHashes = hashes.filter(h => h !== 'WORKING_TREE');

		if (realHashes.length === 0) {
			commitFiles.value = [];

			return;
		}

		if (realHashes.length === 1) {
			const hash = realHashes[0]!;
			const commit = commitMap.value.get(hash);
			const parents = commit?.parents as string[] | undefined;
			const parentHash = parents?.[0];

			const diffArgs = parentHash
				? [parentHash, hash]
				: [EMPTY_TREE_HASH, hash];

			const output = await callGit('diff', ...diffArgs, '--name-status', '-z');

			commitFiles.value = parseDiffNameStatus(output);

			return;
		}

		const dedup = new Map<string, ICommitFile>();

		for (const hash of realHashes) {
			const commit = commitMap.value.get(hash);
			const parentHash = (commit?.parents as string[] | undefined)?.[0] ?? EMPTY_TREE_HASH;
			const output = await callGit('diff', parentHash, hash, '--name-status', '-z');

			for (const f of parseDiffNameStatus(output)) {
				dedup.set(f.path, f);
			}
		}

		commitFiles.value = [...dedup.values()].sort((a, b) => a.path.localeCompare(b.path));
	}

	return {
		commits: readonly(commits),
		selectedHashes: readonly(selectedHashes),
		commitMap,
		commitFiles: readonly(commitFiles),
		allLoaded: readonly(allLoaded),
		loadCommits,
		loadMore,
		selectCommit,
		toggleCommitSelection,
		clearSelection,
		loadCommitDetails,
	};
}
