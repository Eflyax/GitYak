import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('an external commit appears without reloading the page', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// Commit from outside the application entirely. No page.reload() below — that is the
	// whole point of this test.
	repo.commit('Made outside the app', {'outside.txt': 'hello\n'});

	await expect(page.locator('.commit-row__message', {hasText: 'Made outside the app'}))
		.toBeVisible({timeout: 15_000});
});
