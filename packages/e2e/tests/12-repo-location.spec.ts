import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded} from '../fixtures/ui';

test('toolbar marks a localhost project as local', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);

	const location = byTestId(page, 'repo-location');

	await expect(location).toBeVisible();
	await expect(location).toHaveText('Local');
	await expect(location).toHaveAttribute('title', /this machine/i);
});

test('toolbar marks a project on another host as remote', async ({page, repo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	// Seed a non-localhost project directly — the repo fixture only produces localhost ones.
	// SSH projects cannot be covered here: their tunnel runs through the Tauri shell.
	await page.addInitScript((path: string) => {
		const id = 'test-project-remote';

		localStorage.setItem('git-yak:projects', JSON.stringify([{
			id,
			alias: 'Remote Project',
			path,
			server: '192.168.1.50',
			port: 3000,
			serverType: 'bun',
			order: 0,
			dateCreated: Date.now(),
			dateLastOpen: Date.now(),
		}]));
		localStorage.setItem('git-yak:lastProjectId', id);
	}, repo.path);

	await page.goto('/');

	const location = byTestId(page, 'repo-location');

	await expect(location).toBeVisible();
	await expect(location).toHaveText('192.168.1.50:3000');
	await expect(location).toHaveAttribute('title', /remote server/i);
});
