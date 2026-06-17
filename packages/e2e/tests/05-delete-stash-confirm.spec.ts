import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('deleting a stash shows a confirmation dialog with cancel + confirm paths', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	// Create a stash entry
	repo.writeFile('a.txt', 'wip\n');
	repo.run('add a.txt');
	repo.run('stash push -m "wip stash"');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	const stashRow = page.locator('[test-id="commit-row-stash"]').first();

	await expect(stashRow).toBeVisible({timeout: 10_000});

	// First: open menu, click delete → confirm dialog appears → cancel
	await stashRow.click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Delete stash")').first().click();

	await expect(page.locator('.n-card-header__main', {hasText: 'Delete stash'})).toBeVisible();
	await page.locator('[test-id="confirm-dialog-no-btn"]').click();

	// Stash still there
	const stashListAfterCancel = repo.run('stash list').trim();

	expect(stashListAfterCancel).toContain('wip stash');

	// Second: open menu, click delete → confirm
	await stashRow.click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Delete stash")').first().click();
	await page.locator('[test-id="confirm-dialog-yes-btn"]').click();

	await page.waitForTimeout(2_000);

	const stashListAfterConfirm = repo.run('stash list').trim();

	expect(stashListAfterConfirm).toBe('');
});
