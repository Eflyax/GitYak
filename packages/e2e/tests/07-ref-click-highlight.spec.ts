import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('clicking a ref-tag highlights the corresponding commit row', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Master tip', {'m.txt': 'master\n'});
	repo.run('branch feature HEAD~1');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// Click the "feature" ref tag (points at Initial)
	const featureTag = page.locator('[test-id^="ref-branch:feature"]').first();

	await expect(featureTag).toBeVisible({timeout: 10_000});
	await featureTag.click();

	// The Initial row should now be selected
	const initialRow = page.locator('.commit-row', {hasText: 'Initial'});

	await expect(initialRow).toHaveClass(/commit-row--selected/);
});
