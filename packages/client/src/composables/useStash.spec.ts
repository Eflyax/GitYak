import {describe, it, expect, beforeEach, vi} from 'vitest';

const
	callGit = vi.fn<(...args: Array<string>) => Promise<string>>(),
	stashSave = vi.fn<(message?: string) => Promise<void>>(),
	stashPop = vi.fn<(id: string) => Promise<void>>(),
	stashDrop = vi.fn<(id: string) => Promise<void>>();

vi.mock('./useGit', () => ({
	useGit: () => ({callGit, stashSave, stashPop, stashDrop}),
}));

const {useStash} = await import('./useStash');

const
	HASH = 'a'.repeat(40),
	PARENTS = `${'b'.repeat(40)} ${'c'.repeat(40)}`;

function listOf(...lines: Array<string>): string {
	return lines.join('\n') + '\n';
}

beforeEach(() => {
	vi.clearAllMocks();
	callGit.mockResolvedValue('');
});

describe('useStash.loadStashes', () => {
	// `git stash store -m` rewrites the *reflog* subject; the stash commit's own
	// subject is immutable. Asking for %s therefore shows the pre-rename name
	// forever, which made Rename look like a no-op. %gs is what `git stash list`
	// itself prints.
	it('asks git for the reflog subject, not the commit subject', async () => {
		await useStash().loadStashes();

		const args = callGit.mock.calls[0]!;

		expect(args).toContain('--format=%gd|%H|%P|%gs');
		expect(args.join(' ')).not.toContain('%s|');
		expect(args.join(' ')).not.toMatch(/\|%s$/);
	});

	it('parses the stash list into entries', async () => {
		callGit.mockResolvedValue(listOf(
			`stash@{0}|${HASH}|${PARENTS}|On master: work in progress`,
			`stash@{1}|${'d'.repeat(40)}|${'e'.repeat(40)}|renamed`,
		));

		const {loadStashes, stashes} = useStash();

		await loadStashes();

		expect(stashes.value).toHaveLength(2);
		expect(stashes.value[0]).toEqual({
			id: 'stash@{0}',
			hash: HASH,
			parentHash: PARENTS,
			message: 'On master: work in progress',
			isStash: true,
		});
		expect(stashes.value[1]!.message).toBe('renamed');
	});

	it('keeps pipes that are part of the message', async () => {
		callGit.mockResolvedValue(listOf(`stash@{0}|${HASH}|${PARENTS}|feat: a | b | c`));

		const {loadStashes, stashes} = useStash();

		await loadStashes();

		expect(stashes.value[0]!.message).toBe('feat: a | b | c');
	});
});

describe('useStash.renameStash', () => {
	// git has no `stash rename`: the entry is dropped and re-stored under the new
	// reflog message. Order matters — storing first would leave two entries for the
	// same commit, and the drop would then remove the wrong one.
	it('drops the entry and re-stores the same commit under the new message', async () => {
		const {renameStash} = useStash();

		await renameStash('stash@{1}', HASH, 'better name');

		expect(callGit.mock.calls[0]).toEqual(['stash', 'drop', 'stash@{1}']);
		expect(callGit.mock.calls[1]).toEqual(['stash', 'store', '-m', 'better name', HASH]);
	});

	it('reloads the list so the new name shows up', async () => {
		callGit.mockImplementation(async (...args) => args[1] === 'list'
			? listOf(`stash@{0}|${HASH}|${PARENTS}|better name`)
			: '');

		const {renameStash, stashes} = useStash();

		await renameStash('stash@{0}', HASH, 'better name');

		expect(stashes.value[0]!.message).toBe('better name');
	});

	// A failed drop must not re-store the commit: that would resurrect the stash
	// under a second reflog entry while the original is still there.
	it('does not store when the drop fails', async () => {
		callGit.mockRejectedValueOnce(new Error('fatal: log for refs/stash is empty'));

		const {renameStash} = useStash();

		await expect(renameStash('stash@{0}', HASH, 'better name'))
			.rejects.toThrow('log for refs/stash is empty');

		expect(callGit).toHaveBeenCalledTimes(1);
	});
});
