import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('toolbar stash includes untracked files and pop restores them', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	repo.writeFile('README.md', '# repo\nchanged\n');
	repo.writeFile('new-file.txt', 'brand new\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'toolbar-stash-btn').click();

	await expect.poll(() => repo.run('status --porcelain').trim(), {timeout: 10_000}).toBe('');
	expect(repo.run('stash list').trim().split('\n')).toHaveLength(1);

	await expect(page.locator('[test-id="commit-row-stash"]').first()).toBeVisible({timeout: 10_000});

	await byTestId(page, 'toolbar-pop-btn').click();

	await expect.poll(() => repo.run('status --porcelain').trim(), {timeout: 10_000}).toContain('?? new-file.txt');
	expect(repo.run('status --porcelain')).toContain(' M README.md');
	expect(repo.run('stash list').trim()).toBe('');
});
