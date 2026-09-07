import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import {createBareRemote} from '../fixtures/repo';

test('the sidebar shows how far a branch has diverged from its upstream', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin ${remote.path}`);
		repo.run('push -u origin master');

		// Two commits the remote has not seen, and one the local branch has not.
		repo.commit('Local one', {'a.txt': 'a\n'});
		repo.commit('Local two', {'b.txt': 'b\n'});

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Local two');

		await expect(byTestId(page, 'branch-track').first()).toHaveText('↑2', {timeout: 10_000});
	}
	finally {
		remote.cleanup();
	}
});

test('a branch with no upstream is marked as untracked and can be given one', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin ${remote.path}`);
		repo.run('push origin master');
		// Pushed without -u, so origin/master exists but master tracks nothing.
		repo.run('branch --unset-upstream master 2>/dev/null || true');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await expect(byTestId(page, 'branch-no-upstream').first()).toBeVisible({timeout: 10_000});

		await byTestId(page, 'branch-item-select').first().click({button: 'right'});
		await page.locator('.mx-context-menu-item:has-text("Set upstream")').first().hover();
		await page.locator('.mx-context-menu-item:has-text("origin/master")').first().click();

		await expect.poll(() => repo.run('rev-parse --abbrev-ref master@{upstream}').trim(), {timeout: 10_000})
			.toBe('origin/master');
	}
	finally {
		remote.cleanup();
	}
});
