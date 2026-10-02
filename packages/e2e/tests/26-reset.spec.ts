import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import type {ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// Two commits on master: resetting to "Initial" un-does "Second", whose change to
// file.txt is what each mode keeps (index / working tree) or throws away.
function seed(repo: ITempRepo): string {
	repo.commit('Initial', {'file.txt': 'original\n'});

	const initialHash = repo.run('rev-parse HEAD').trim();

	repo.commit('Second', {'file.txt': 'changed\n'});

	return initialHash;
}

async function resetTo(page: Page, subject: string, mode: 'Soft' | 'Mixed' | 'Hard'): Promise<void> {
	await page.locator(`.commit-row__message:has-text("${subject}")`).first().click({button: 'right'});

	// The modes live in a submenu that opens on hover of its parent item.
	await page.locator('.mx-context-menu-item:has-text("Reset HEAD to this commit")').first().hover();

	const modeItem = page.locator(`.mx-context-menu-item:has-text("${mode}")`).first();

	await expect(modeItem).toBeVisible();
	await modeItem.click();
}

test('soft reset moves HEAD and keeps the undone change staged', async ({page, repo, openRepo}) => {
	const initialHash = seed(repo);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Second');

	await resetTo(page, 'Initial', 'Soft');

	await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 10_000}).toBe(initialHash);

	// "M " = modified in the index, untouched in the working tree.
	expect(repo.run('status --porcelain')).toBe('M  file.txt\n');
	expect(repo.run('diff --cached')).toContain('+changed');
});

test('mixed reset moves HEAD and leaves the undone change unstaged', async ({page, repo, openRepo}) => {
	const initialHash = seed(repo);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Second');

	await resetTo(page, 'Initial', 'Mixed');

	await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 10_000}).toBe(initialHash);

	// " M" = index matches HEAD, the change survives only in the working tree.
	expect(repo.run('status --porcelain')).toBe(' M file.txt\n');
	expect(repo.run('diff')).toContain('+changed');
});

test('hard reset moves HEAD and discards the undone change', async ({page, repo, openRepo}) => {
	const initialHash = seed(repo);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Second');

	await resetTo(page, 'Initial', 'Hard');

	// The app may (should) ask first — accept if it does, so this test covers the
	// reset itself regardless of the confirmation defect below.
	const yes = byTestId(page, 'confirm-dialog-yes-btn');

	if (await yes.waitFor({timeout: 1_000}).then(() => true, () => false)) await yes.click();

	await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 10_000}).toBe(initialHash);

	expect(repo.run('status --porcelain')).toBe('');
	expect(repo.run('show HEAD:file.txt')).toBe('original\n');
	await expect(page.locator('.commit-row__message:has-text("Second")')).toHaveCount(0);
});

test('hard reset asks for confirmation before discarding work', async ({page, repo, openRepo}) => {
	// Known defect: "Hard" runs `git reset --hard` immediately — no confirmation, although it
	// destroys uncommitted work and drops commits from the branch.
	test.fail();

	seed(repo);

	const secondHash = repo.run('rev-parse HEAD').trim();

	repo.writeFile('file.txt', 'uncommitted work\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Second');

	await resetTo(page, 'Initial', 'Hard');

	await expect(byTestId(page, 'confirm-dialog-no-btn')).toBeVisible({timeout: 3_000});
	await byTestId(page, 'confirm-dialog-no-btn').click();

	// Declining leaves both the branch and the uncommitted edit alone.
	expect(repo.run('rev-parse HEAD').trim()).toBe(secondHash);
	expect(repo.run('status --porcelain')).toBe(' M file.txt\n');
});
