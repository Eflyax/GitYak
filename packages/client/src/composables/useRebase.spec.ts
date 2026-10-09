import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ref} from 'vue';

const
	mergeBase = vi.fn<(a: string, b: string) => Promise<string>>(),
	logRange = vi.fn<(from: string, to: string) => Promise<Array<{hash: string; shortHash: string; subject: string}>>>(),
	rebaseOnto = vi.fn<(upstream: string) => Promise<void>>(),
	rebaseInteractive = vi.fn<(upstream: string, todo: string) => Promise<void>>(),
	writeFile = vi.fn<(path: string, content: string) => Promise<void>>(),
	switchBranch = vi.fn<(name: string) => Promise<void>>(),
	loadBranches = vi.fn<() => Promise<void>>(),
	loadStatus = vi.fn<() => Promise<void>>(),
	loadCommits = vi.fn<() => Promise<void>>(),
	selectCommit = vi.fn<(hash: string) => void>(),
	loadStashes = vi.fn<() => Promise<void>>(),
	currentBranch = ref<{name: string} | null>(null);

vi.mock('./useGit', () => ({
	useGit: () => ({mergeBase, logRange, rebaseOnto, rebaseInteractive, writeFile}),
}));

vi.mock('./useBranches', () => ({
	useBranches: () => ({currentBranch, switchBranch, loadBranches}),
}));

vi.mock('./useWorkingTree', () => ({
	useWorkingTree: () => ({loadStatus, conflictDetected: ref(false)}),
}));

vi.mock('./useCommits', () => ({
	useCommits: () => ({loadCommits, selectCommit}),
}));

vi.mock('./useStash', () => ({
	useStash: () => ({loadStashes}),
}));

const {useRebase} = await import('./useRebase');

const COMMIT = {hash: 'a'.repeat(40), shortHash: 'aaaaaaa', subject: 'Add a thing'};

beforeEach(() => {
	vi.clearAllMocks();
	useRebase().close();
	currentBranch.value = {name: 'master'};
	mergeBase.mockResolvedValue('b'.repeat(40));
});

describe('useRebase.open', () => {
	it('opens the editor when the source has commits of its own', async () => {
		logRange.mockResolvedValue([COMMIT]);

		const {open, show, steps} = useRebase();

		expect(await open('feature', 'master')).toBe(true);
		expect(show.value).toBe(true);
		expect(steps.value).toHaveLength(1);
		expect(rebaseOnto).not.toHaveBeenCalled();
	});

	// A branch whose tip *is* the merge base has nothing to replay, so there is no
	// plan to edit — but the rebase is still meaningful: it fast-forwards the branch
	// onto the target. Before this the call silently did nothing at all.
	it('fast-forwards instead of opening an empty editor when the source has no commits', async () => {
		logRange.mockResolvedValue([]);

		const {open, show} = useRebase();

		expect(await open('hotfix/GOV-269', 'master')).toBe(true);
		expect(show.value).toBe(false);
		expect(switchBranch).toHaveBeenCalledWith('hotfix/GOV-269');
		expect(rebaseOnto).toHaveBeenCalledWith('master');
		expect(loadBranches).toHaveBeenCalled();
		expect(loadCommits).toHaveBeenCalled();
	});

	it('skips the checkout when the source is already the current branch', async () => {
		logRange.mockResolvedValue([]);
		currentBranch.value = {name: 'hotfix/GOV-269'};

		const {open} = useRebase();

		await open('hotfix/GOV-269', 'master');

		expect(switchBranch).not.toHaveBeenCalled();
		expect(rebaseOnto).toHaveBeenCalledWith('master');
	});

	it('reports failure and leaves the editor closed when the fast-forward fails', async () => {
		logRange.mockResolvedValue([]);
		rebaseOnto.mockRejectedValue(new Error('git rebase exited 1'));

		const {open, show, running} = useRebase();

		await expect(open('hotfix/GOV-269', 'master')).rejects.toThrow('git rebase exited 1');
		expect(show.value).toBe(false);
		expect(running.value).toBe(false);
	});
});
