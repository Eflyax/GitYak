import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

// "Discard all" is the shortest route to a ConfirmDialog with real consequences, so the
// keyboard answers are exercised on a dialog whose effect is visible in the repository.
async function openDiscardConfirm(page: import('@playwright/test').Page): Promise<void> {
	await byTestId(page, 'discard-all-btn').click();
	await expect(page.locator('.n-card-header__main', {hasText: 'Discard all changes'})).toBeVisible();
}

test('a confirm dialog names the key that runs each button', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);
	await openDiscardConfirm(page);

	await expect(byTestId(page, 'confirm-dialog-yes-btn')).toContainText('Yes');
	await expect(byTestId(page, 'confirm-dialog-yes-btn')).toContainText('(Y)');
	await expect(byTestId(page, 'confirm-dialog-no-btn')).toContainText('No');
	await expect(byTestId(page, 'confirm-dialog-no-btn')).toContainText('(N)');
});

test('pressing the key of a dialog button runs that button', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	const before = repo.run('status --porcelain');

	// ── N answers No: the dialog closes and nothing is discarded ─────────────────
	await openDiscardConfirm(page);
	await page.keyboard.press('n');

	await expect(byTestId(page, 'confirm-dialog-no-btn')).toHaveCount(0);
	await page.waitForTimeout(1_000);
	expect(repo.run('status --porcelain')).toBe(before);

	// ── Y answers Yes ────────────────────────────────────────────────────────────
	await openDiscardConfirm(page);
	await page.keyboard.press('y');

	await expect.poll(() => repo.run('status --porcelain').trim(), {timeout: 10_000}).toBe('');
});

test('a dialog key does nothing once the dialog is closed', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	const before = repo.run('status --porcelain');

	await openDiscardConfirm(page);
	await byTestId(page, 'confirm-dialog-no-btn').click();
	await expect(byTestId(page, 'confirm-dialog-no-btn')).toHaveCount(0);

	// The listener belongs to the open dialog: with it closed, Y is just a keystroke.
	await page.keyboard.press('y');

	await page.waitForTimeout(1_000);
	expect(repo.run('status --porcelain')).toBe(before);
});

test('a dialog key is not swallowed from a text field elsewhere in the app', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// No dialog is open, so typing into the branch filter must behave normally — the letters
	// of any dialog key included.
	const filter = byTestId(page, 'filter-branches-input').locator('input');

	await filter.fill('');
	await filter.pressSequentially('yn');

	await expect(filter).toHaveValue('yn');
});

test('Settings and Activity Log open as modal windows', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'settings').click();
	await expect(byTestId(page, 'settings-modal')).toBeVisible();
	await expect(page.locator('.n-drawer')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(byTestId(page, 'settings-modal')).toHaveCount(0);

	await byTestId(page, 'activity-log').click();
	await expect(byTestId(page, 'activity-log-modal')).toBeVisible();
	await expect(page.locator('.n-drawer')).toHaveCount(0);
	// The log's own heading is the modal title; the count and Clear stay with the table.
	await expect(byTestId(page, 'activity-log-modal').locator('.n-card-header__main', {hasText: 'Activity Log'})).toHaveCount(1);
});
