import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('amend previous commit prefills form and creates an amended commit', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Original subject', {'file.txt': 'first content\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Original subject');

	// Initially amend checkbox is unchecked and form is empty
	const amend = byTestId(page, 'amend-checkbox');

	await expect(amend).toBeVisible();
	await expect(amend).not.toBeChecked();

	// Stage a new change so commit button can fire
	repo.writeFile('file.txt', 'changed content\n');

	// Reload to pick up filesystem changes
	await page.reload();
	await waitForRepoLoaded(page);

	await amend.check();

	const summary = byTestId(page, 'commit-summary-input').locator('input');
	await expect(summary).toHaveValue('Original subject');

	await summary.fill('Amended subject');
	await byTestId(page, 'stage-all-btn').click();
	await byTestId(page, 'commit-btn').click();

	await waitForCommitRow(page, 'Amended subject');
	// Original subject row must be gone (replaced by amend)
	await expect(page.locator('.commit-row__message', {hasText: 'Original subject'})).toHaveCount(0);
});
