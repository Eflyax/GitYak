import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import {createBareRemote, createTempRepo} from '../fixtures/repo';
import type {Page} from '@playwright/test';

// The palette binding lives in useKeyboard.ts: ⌘⇧P, matched on a lower-cased key.
async function openPalette(page: Page): Promise<void> {
	await page.keyboard.press('Meta+Shift+P');
	await expect(byTestId(page, 'command-palette')).toBeVisible();
}

test('⌘⇧P opens the palette and Escape closes it', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await openPalette(page);
	// The input is focused on open, so the user can type straight away.
	await expect(byTestId(page, 'command-palette-input').locator('input')).toBeFocused();
	await expect(byTestId(page, 'command-palette-item-fetch')).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(byTestId(page, 'command-palette')).toBeHidden();
});

// Fetch is run once by clicking the item and once by typing + Enter; either way it must do
// exactly what the toolbar button does: update the remote-tracking ref.
for (const via of ['click', 'type'] as const) {
	test(`fetch from the palette (${via}) updates origin/master like the toolbar`, async ({page, repo, openRepo}) => {
		const remote = createBareRemote();
		const other = createTempRepo({init: false});

		try {
			repo.commit('Initial', {'README.md': '# repo\n'});
			repo.run(`remote add origin ${remote.path}`);
			repo.run('push -u origin master');
			other.run(`clone ${remote.path} .`);

			await openRepo(page, repo.path);
			await waitForRepoLoaded(page);
			await waitForCommitRow(page, 'Initial');

			other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
			other.run('push origin master');

			const remoteTip = other.run('rev-parse HEAD').trim();

			expect(repo.run('rev-parse origin/master').trim()).not.toBe(remoteTip);

			await openPalette(page);

			if (via === 'click') {
				await byTestId(page, 'command-palette-item-fetch').click();
			}
			else {
				await byTestId(page, 'command-palette-input').locator('input').fill('fetch');
				await page.keyboard.press('Enter');
			}

			// Running a command closes the palette.
			await expect(byTestId(page, 'command-palette')).toBeHidden();
			await expect.poll(() => repo.run('rev-parse origin/master').trim(), {timeout: 15_000}).toBe(remoteTip);
			await waitForCommitRow(page, 'Pushed by a colleague', 15_000);
		}
		finally {
			other.cleanup();
			remote.cleanup();
		}
	});
}

// Stash is run from the toolbar and from the palette against identical working trees; both
// must leave the same git state (clean tree, one stash that includes the untracked file).
for (const via of ['toolbar', 'palette'] as const) {
	test(`stash via the ${via} stashes tracked and untracked changes`, async ({page, repo, openRepo}) => {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.writeFile('README.md', '# changed\n');
		repo.writeFile('new.txt', 'untracked\n');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		if (via === 'toolbar') {
			await byTestId(page, 'toolbar-stash-btn').click();
		}
		else {
			await openPalette(page);
			await byTestId(page, 'command-palette-input').locator('input').fill('stash');
			await expect(byTestId(page, 'command-palette-item-stash')).toHaveClass(/command-palette__item--active/);
			await page.keyboard.press('Enter');
			await expect(byTestId(page, 'command-palette')).toBeHidden();
		}

		await expect.poll(() => repo.run('stash list').trim().split('\n').filter(Boolean).length, {timeout: 15_000})
			.toBe(1);
		expect(repo.run('status --porcelain').trim()).toBe('');
		// --include-untracked keeps the untracked file in the stash's third parent.
		expect(repo.run('show --name-only --format= stash@{0}^3').trim()).toBe('new.txt');
		expect(repo.run('stash show --name-only stash@{0}').trim()).toBe('README.md');
	});
}
