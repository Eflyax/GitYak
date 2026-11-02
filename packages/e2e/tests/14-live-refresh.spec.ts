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

test('an idle repository raises no change events of its own', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	const events: Array<number> = [];

	page.on('websocket', ws => {
		ws.on('framereceived', frame => {
			if (String(frame.payload).includes('"repoChanged"')) {
				events.push(Date.now());
			}
		});
	});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// Let the initial load settle, then watch a quiet window. The app's own refresh must not
	// look like a change: `git status` refreshing the index used to take .git/index.lock, the
	// watcher reported it, and the resulting refresh ran `git status` again — a loop that
	// never ended and collided with rebases and commits.
	await page.waitForTimeout(1_500);

	const quietFrom = Date.now();

	await page.waitForTimeout(3_000);

	expect(events.filter(t => t >= quietFrom)).toHaveLength(0);
});
