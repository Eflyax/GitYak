import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('reverting a commit adds a commit that undoes it and keeps the original', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'file.txt': 'original\n'});
	repo.commit('Break it', {'file.txt': 'broken\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Break it');

	await page.locator('.commit-row__message:has-text("Break it")').first().click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Revert commit")').first().click();

	await expect.poll(() => repo.run('log --oneline'), {timeout: 10_000})
		.toContain('Revert "Break it"');

	// The content is back, and the reverted commit is still in the history.
	expect(repo.run('show HEAD:file.txt')).toBe('original\n');
	expect(repo.run('log --oneline')).toContain('Break it');
});

test('revert is refused while the working tree is dirty', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'file.txt': 'original\n'});
	repo.commit('Break it', {'file.txt': 'broken\n'});
	repo.writeFile('file.txt', 'uncommitted edit\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Break it');

	await page.locator('.commit-row__message:has-text("Break it")').first().click({button: 'right'});

	const item = page.locator('.mx-context-menu-item:has-text("Revert commit")').first();

	await expect(item).toBeVisible();
	await expect(item).toHaveClass(/disabled/);
});
