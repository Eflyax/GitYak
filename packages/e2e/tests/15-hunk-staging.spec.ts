import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

// Two edits separated by far more than a hunk's three lines of context, so git reports them
// as two independent hunks.
const BASE = Array.from({length: 30}, (_, i) => `line ${i + 1}`).join('\n') + '\n';
const EDITED = BASE
	.replace('line 2\n', 'line 2 CHANGED\n')
	.replace('line 25\n', 'line 25 CHANGED\n');

test('stage, unstage and discard individual hunks from the diff viewer', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'file.txt': BASE});
	repo.writeFile('file.txt', EDITED);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	await byTestId(page, 'unstaged-file').first().click();

	// One widget per git hunk, each offering stage and discard while unstaged.
	await expect(byTestId(page, 'hunk-stage-btn-0')).toBeVisible({timeout: 10_000});
	await expect(byTestId(page, 'hunk-stage-btn-1')).toBeVisible();
	await expect(byTestId(page, 'hunk-discard-btn-0')).toBeVisible();

	// ── Stage only the first hunk ────────────────────────────────────────────────
	await byTestId(page, 'hunk-stage-btn-0').click();

	await expect.poll(() => repo.run('diff --cached'), {timeout: 10_000})
		.toContain('line 2 CHANGED');

	expect(repo.run('diff --cached')).not.toContain('line 25 CHANGED');
	// The other hunk is still unstaged, so the file appears in both areas.
	expect(repo.run('diff')).toContain('line 25 CHANGED');

	// ── Unstage it again from the staged view ────────────────────────────────────
	await byTestId(page, 'staged-file').first().click();
	await byTestId(page, 'hunk-unstage-btn-0').click();

	await expect.poll(() => repo.run('diff --cached').trim(), {timeout: 10_000}).toBe('');

	// ── Discard the second hunk, keeping the first ───────────────────────────────
	await byTestId(page, 'unstaged-file').first().click();
	await expect(byTestId(page, 'hunk-discard-btn-1')).toBeVisible({timeout: 10_000});
	await byTestId(page, 'hunk-discard-btn-1').click();
	await byTestId(page, 'confirm-dialog-yes-btn').click();

	await expect.poll(() => repo.run('diff'), {timeout: 10_000})
		.not.toContain('line 25 CHANGED');

	expect(repo.run('diff')).toContain('line 2 CHANGED');

	// ── Staging the last remaining hunk leaves nothing unstaged, closing the viewer ─
	await byTestId(page, 'hunk-stage-btn-0').click();

	await expect.poll(() => repo.run('diff').trim(), {timeout: 10_000}).toBe('');
	await expect(byTestId(page, 'hunk-stage-btn-0')).toHaveCount(0);
});

test('a file with no stageable hunks shows no hunk buttons', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	// Untracked: there is no index entry to diff against, so git produces no hunks.
	repo.writeFile('brand-new.txt', 'hello\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	await byTestId(page, 'unstaged-file').first().click();

	// The whole-file action stays available; per-hunk actions do not appear.
	await expect(byTestId(page, 'stage-file-btn-diff')).toBeVisible({timeout: 10_000});
	await expect(byTestId(page, 'hunk-stage-btn-0')).toHaveCount(0);
});
