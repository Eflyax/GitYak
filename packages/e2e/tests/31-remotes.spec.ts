import {test, expect} from '../fixtures/test';
import {createBareRemote} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('a remote can be added to a repository that has none', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'remote-settings-btn').click();

		// With no remote yet the form starts blank apart from the conventional name.
		await expect(byTestId(page, 'remote-name-input').locator('input')).toHaveValue('origin');
		await byTestId(page, 'remote-name-input').locator('input').fill('upstream');
		await byTestId(page, 'remote-pull-url-input').locator('input').fill(remote.path);
		await byTestId(page, 'remote-settings-save-btn').click();

		await expect.poll(() => repo.run('remote -v').trim().split('\n'), {timeout: 10_000})
			.toEqual([
				`upstream\t${remote.path} (fetch)`,
				`upstream\t${remote.path} (push)`,
			]);
	}
	finally {
		remote.cleanup();
	}
});

test('an existing remote can be renamed and given a separate push URL', async ({page, repo, openRepo}) => {
	const fetchRemote = createBareRemote();
	const pushRemote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin "${fetchRemote.path}"`);

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'remote-settings-btn').click();

		// The form is pre-filled from git, so only the changed fields are touched.
		await expect(byTestId(page, 'remote-pull-url-input').locator('input')).toHaveValue(fetchRemote.path);
		await byTestId(page, 'remote-name-input').locator('input').fill('mirror');
		await byTestId(page, 'remote-push-url-input').locator('input').fill(pushRemote.path);
		await byTestId(page, 'remote-settings-save-btn').click();

		await expect.poll(() => repo.run('remote -v').trim().split('\n'), {timeout: 10_000})
			.toEqual([
				`mirror\t${fetchRemote.path} (fetch)`,
				`mirror\t${pushRemote.path} (push)`,
			]);
	}
	finally {
		fetchRemote.cleanup();
		pushRemote.cleanup();
	}
});
