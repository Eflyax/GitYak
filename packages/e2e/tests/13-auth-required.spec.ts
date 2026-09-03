import {test, expect} from '../fixtures/test';

test('the server refuses a socket that never authenticates', async ({page}) => {
	await page.goto('/');

	const reply = await page.evaluate(() => new Promise<string>(resolve => {
		const ws = new WebSocket('ws://localhost:3000');

		ws.onopen = () => ws.send(JSON.stringify({
			requestId: 'probe',
			command: 'gitCall',
			repo_path: '/tmp',
			args: ['status'],
		}));

		ws.onmessage = event => {
			const data = String(event.data);

			// Skip the server's unsolicited hello frame.
			if (data.includes('"hello"')) {
				return;
			}

			resolve(data);
		};

		setTimeout(() => resolve('NO REPLY'), 5_000);
	}));

	expect(reply).toContain('Not authenticated');
});

test('an authenticated project loads its repository', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);

	// The app authenticates on connect; reaching the commit list proves it succeeded.
	await expect(page.locator('.commit-row__message', {hasText: 'Initial'})).toBeVisible({timeout: 30_000});
});
