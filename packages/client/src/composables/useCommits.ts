import {ref, shallowRef, computed, readonly, shallowReadonly, watch} from 'vue';
import type {ICommit, IReference, IStash} from '@/domain';
import {EReferenceType} from '@/domain';
import {buildSearchArgs} from '@/domain/services/commitSearch';
import {buildGraph} from '@/domain/services/commitGraph';
import {singleFlight} from '@/domain/services/singleFlight';
import {useGit} from './useGit';
import {useStash} from './useStash';
import {useProject} from './useProject';
import {useHistorySettings} from './useHistorySettings';

export interface ICommitFile {
	path: string;
	status: string;
	oldPath?: string;
}

const FIELD_SEP = '\x06';
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

const COLLATOR = new Intl.Collator();

// Shallow: thousands of commits are replaced wholesale on every load and never edited in
// place, so deep reactivity would only add proxies and dependency tracking per field.
const commits = shallowRef<ICommit[]>([]);
const selectedHashes = ref<string[]>([]);
const allLoaded = ref(false);
const limitReached = ref(false);
const isLoadingMore = ref(false);
const maxLevel = ref(0);
const referencesByHash = shallowRef<Record<string, IReference[]>>({});
const commitFiles = shallowRef<ICommitFile[] | null>(null);
const searchQuery = ref('');
const isSearching = computed(() => searchQuery.value.trim().length > 0);

let detailsRequestId = 0;

// Regular commits (not the working-tree row or stashes) held by the history, and the repo +
// query they belong to. A refresh reloads as many as were loaded so a scrolled-down history
// keeps its place; a different repo or query starts over at one page.
let loadedCount = 0;
let pagingKey = '';
// The raw output the history was last built from; an identical reload is skipped entirely.
let lastSignature = '';
// Bumped on every reload, so a page that was being fetched across one is dropped.
let generation = 0;
// Shared by every caller, so loads requested from several components never run side by side.
let loadCommitsOnce: (() => Promise<void>) | null = null;

// Raising the limit in Settings after the history hit it lets scrolling load further again.
watch(useHistorySettings().maxCommits, max => {
	if (limitReached.value && (max === 0 || max > loadedCount)) {
		limitReached.value = false;
		allLoaded.value = false;
	}
});

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

function parseLog(log: string): ICommit[] {
	return log
		.split('\0')
		.filter(Boolean)
		.map(row => parseRawCommit(row) as ICommit);
}

function makeWorkingTree(headHash: string, mergeHeadHash: string): ICommit {
	const parents = headHash ? [headHash, ...(mergeHeadHash ? [mergeHeadHash] : [])] : [];

	return {
		hash: 'WORKING_TREE',
		hashAbbr: 'WORKING',
		parents: parents as unknown as ReadonlyArray<string>,
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
}

export function useCommits() {
	const {callGit} = useGit();
	const {stashes} = useStash();
	const {currentProject} = useProject();
	const {pageSize, maxCommits} = useHistorySettings();

	/** How many more regular commits the history may hold under the `maxCommits` setting. */
	function capacityLeft(): number {
		return maxCommits.value > 0 ? Math.max(0, maxCommits.value - loadedCount) : Infinity;
	}

	function logArgs(count: number, skip: number): string[] {
		// A pathspec has to be the last thing on the command line, so the search arguments go
		// after every option of ours.
		return [
			'log',
			'--exclude=refs/stash',
			'--all',
			'-z',
			`--pretty=format:${LOG_FORMAT}`,
			'--date=format-local:%Y-%m-%d %H:%M',
			`--max-count=${count}`,
			...(skip ? [`--skip=${skip}`] : []),
			'--date-order',
			...buildSearchArgs(searchQuery.value),
		];
	}

	async function revParse(rev: string): Promise<string> {
		try {
			return (await callGit('rev-parse', rev)).trim();
		}
		catch {
			// No HEAD yet (freshly initialised repo) or no MERGE_HEAD (not mid-merge).
			return '';
		}
	}

	async function doLoadCommits(): Promise<void> {
		const key = `${currentProject.value?.id ?? ''}\0${searchQuery.value}`;

		if (key !== pagingKey) {
			pagingKey = key;
			loadedCount = 0;
		}

		let count = Math.max(pageSize.value, loadedCount);

		if (maxCommits.value > 0) {
			count = Math.min(count, maxCommits.value);
		}

		// Independent reads: issued together so a remote transport pays one round trip, not four.
		const [refOutput, log, headHash, mergeHeadHash] = await Promise.all([
			callGit(
				'for-each-ref',
				'--format=%(objectname) %(refname)',
				'refs/heads',
				'refs/remotes',
				'refs/tags',
			),
			callGit(...logArgs(count, 0)),
			revParse('HEAD'),
			revParse('MERGE_HEAD'),
		]);

		const signature = [
			key, count, refOutput, log, headHash, mergeHeadHash,
			stashes.value.map(s => `${s.id}:${s.hash}`).join(','),
		].join('\0');

		// A refresh triggered by a file event or window focus usually finds nothing new; rebuilding
		// would re-render the whole history for the same picture.
		if (signature === lastSignature) {
			return;
		}

		lastSignature = signature;
		generation++;

		const
			references = parseReferences(refOutput),
			regularCommits = parseLog(log),
			isSearch = buildSearchArgs(searchQuery.value).length > 0;

		// A search returns matching commits only: the working-tree row and the stashes are not
		// results, and keeping them would put rows in the list that the query never matched.
		const rawCommits: ICommit[] = isSearch
			? regularCommits
			: [
				makeWorkingTree(headHash, mergeHeadHash),
				...mapStashes(stashes.value),
				...regularCommits,
			];

		maxLevel.value = buildGraph(rawCommits, references);

		referencesByHash.value = references;
		commits.value = rawCommits;
		loadedCount = regularCommits.length;
		limitReached.value = maxCommits.value > 0 && loadedCount >= maxCommits.value;
		allLoaded.value = regularCommits.length < count || limitReached.value;

		// Reassign only when a selected commit actually vanished: a new array reference re-runs
		// every `watch(selectedHashes)`, and CommitDetails answers that by clearing and refetching
		// its file list — on a slow transport (SSH) every background refresh made it blink.
		const surviving = selectedHashes.value.filter(h => commitMap.value.has(h));

		if (surviving.length !== selectedHashes.value.length) {
			selectedHashes.value = surviving;
		}
	}

	/** Appends the next page of history below the commits already loaded. */
	async function loadMore(): Promise<void> {
		if (allLoaded.value || isLoadingMore.value) {
			return;
		}

		const count = Math.min(pageSize.value, capacityLeft());

		if (count <= 0) {
			limitReached.value = true;
			allLoaded.value = true;

			return;
		}

		const startedAt = generation;

		isLoadingMore.value = true;

		try {
			const page = parseLog(await callGit(...logArgs(count, loadedCount)));

			// A reload replaced the history meanwhile; the skip offset no longer matches it.
			if (startedAt !== generation) {
				return;
			}

			// A commit made between the two reads shifts the --skip window by one; never show a
			// commit twice.
			const fresh = page.filter(c => !commitMap.value.has(c.hash));
			const merged = [...commits.value, ...fresh];

			maxLevel.value = buildGraph(merged, referencesByHash.value);

			commits.value = merged;
			loadedCount += fresh.length;
			// The next refresh reloads `loadedCount` commits; its output can never match the
			// signature of the shorter load before this page.
			lastSignature = '';
			limitReached.value = maxCommits.value > 0 && loadedCount >= maxCommits.value;
			allLoaded.value = page.length < count || limitReached.value;
		}
		finally {
			isLoadingMore.value = false;
		}
	}

	loadCommitsOnce ??= singleFlight(doLoadCommits);

	const loadCommits = loadCommitsOnce;

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
		// Each call supersedes the previous one; a slower, older response must not overwrite
		// the file list of the commit that is selected now.
		const requestId = ++detailsRequestId;
		const isStale = (): boolean => requestId !== detailsRequestId;

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

			if (isStale()) return;

			commitFiles.value = parseDiffNameStatus(output);

			return;
		}

		const dedup = new Map<string, ICommitFile>();

		for (const hash of realHashes) {
			const commit = commitMap.value.get(hash);
			const parentHash = (commit?.parents as string[] | undefined)?.[0] ?? EMPTY_TREE_HASH;
			const output = await callGit('diff', parentHash, hash, '--name-status', '-z');

			if (isStale()) return;

			for (const f of parseDiffNameStatus(output)) {
				dedup.set(f.path, f);
			}
		}

		commitFiles.value = [...dedup.values()].sort((a, b) => COLLATOR.compare(a.path, b.path));
	}

	/** Re-runs the log with a new query; an empty query restores the full history. */
	async function search(query: string): Promise<void> {
		searchQuery.value = query;
		await loadCommits();
	}

	return {
		commits: shallowReadonly(commits),
		searchQuery: readonly(searchQuery),
		isSearching,
		search,
		selectedHashes: readonly(selectedHashes),
		commitMap,
		commitFiles: shallowReadonly(commitFiles),
		allLoaded: readonly(allLoaded),
		limitReached: readonly(limitReached),
		isLoadingMore: readonly(isLoadingMore),
		maxLevel: readonly(maxLevel),
		loadCommits,
		loadMore,
		selectCommit,
		toggleCommitSelection,
		clearSelection,
		loadCommitDetails,
	};
}
