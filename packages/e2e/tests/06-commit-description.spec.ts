import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('commit body shows in CommitDetails and click-to-edit prefills the form (amend mode)', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Feature subject\n\nThis is the body of the commit with details.', {'a.txt': 'aaa\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature subject');

	// Select the commit
	await page.locator('.commit-row', {hasText: 'Feature subject'}).click();

	// Body should be visible in CommitDetails
	const body = byTestId(page, 'commit-details-body');

	await expect(body).toBeVisible();
	await expect(body).toContainText('This is the body of the commit');

	// Click-to-edit: only HEAD commit can be amended, and Feature subject is HEAD
	await byTestId(page, 'commit-details-subject').click();

	const summaryInput = byTestId(page, 'commit-summary-input').locator('input');

	await expect(summaryInput).toHaveValue('Feature subject');
	await expect(byTestId(page, 'amend-checkbox')).toBeChecked();
});
