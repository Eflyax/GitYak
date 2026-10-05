import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {createTempRepo, type ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

function menuItem(page: Page, label: string) {
	return page.locator('.mx-context-menu-item', {hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
}

function sidebarLocalBranch(page: Page, name: string) {
	return page.locator('[test-id="branch-item-select"]:not(.branch-item--remote)', {
		has: page.locator('.branch-item__name', {hasText: new RegExp(`^${name}$`)}),
	});
}

async function openTagsSection(page: Page): Promise<void> {
	// The TAGS section of the sidebar is collapsed by default.
	await byTestId(page, 'tags-header').click();
}

test('a tag created in the app shows up in the sidebar without a reload', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await page.locator('.commit-row__message:has-text("Initial")').first().click({button: 'right'});
	await menuItem(page, 'Create tag here').click();
	await byTestId(page, 'reference-name-input').locator('input').fill('v0.1');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('tag -l').trim(), {timeout: 10_000}).toBe('v0.1');

	await openTagsSection(page);

	const tagItem = byTestId(page, 'tag-item').filter({hasText: 'v0.1'});

	// The sidebar's tag list is what the Push action is reached from, so a tag that is
	// missing here cannot be pushed at all until the app is reloaded.
	await expect(tagItem).toBeVisible({timeout: 10_000});

	await tagItem.click({button: 'right'});
	await expect(menuItem(page, 'Push')).toBeVisible();
});

test('switching the open project redraws the sidebar branches and tags', async ({page}) => {
	const other: ITempRepo = createTempRepo();

	try {
		other.commit('Commit in other', {'README.md': '# other\n'});
		other.run('branch only-in-other');
		other.run('tag only-in-other-1.0');

		const first = createTempRepo();

		try {
			first.commit('Commit in first', {'README.md': '# first\n'});
			first.run('branch only-in-first');
			first.run('tag only-in-first-1.0');

			// Both projects have to be in storage before the app loads: the project list is
			// read once, at module scope.
			await page.addInitScript(({firstPath, otherPath}: {firstPath: string; otherPath: string}) => {
				const projects = [
					{
						id: 'first-project', alias: 'First Project', path: firstPath,
						server: 'localhost', port: 3000, serverType: 'bun', order: 0,
						dateCreated: 0, dateLastOpen: 0,
					},
					{
						id: 'second-project', alias: 'Second Project', path: otherPath,
						server: 'localhost', port: 3000, serverType: 'bun', order: 1,
						dateCreated: 0, dateLastOpen: 0,
					},
				];

				localStorage.setItem('git-yak:projects', JSON.stringify(projects));
				localStorage.setItem('git-yak:lastProjectId', 'first-project');
			}, {firstPath: first.path, otherPath: other.path});

			await page.goto('/');
			await waitForRepoLoaded(page);
			await waitForCommitRow(page, 'Commit in first');
			await expect(sidebarLocalBranch(page, 'only-in-first')).toBeVisible();

			await page.keyboard.press('Meta+Shift+P');
			await expect(byTestId(page, 'command-palette')).toBeVisible();
			await byTestId(page, 'command-palette-item-open-repo').click();
			await byTestId(page, 'command-palette-subitem-second-project').click();

			await waitForCommitRow(page, 'Commit in other');

			await expect(sidebarLocalBranch(page, 'only-in-other')).toBeVisible({timeout: 10_000});
			await expect(sidebarLocalBranch(page, 'only-in-first')).toHaveCount(0);

			await openTagsSection(page);
			await expect(byTestId(page, 'tag-item').filter({hasText: 'only-in-other-1.0'})).toBeVisible({timeout: 10_000});
			await expect(byTestId(page, 'tag-item').filter({hasText: 'only-in-first-1.0'})).toHaveCount(0);
		}
		finally {
			first.cleanup();
		}
	}
	finally {
		other.cleanup();
	}
});

test('switching projects with a file diff open still redraws the sidebar branches', async ({page}) => {
	const other = createTempRepo();

	try {
		other.commit('Commit in other', {'README.md': '# other\n'});
		other.run('branch only-in-other');

		const first = createTempRepo();

		try {
			first.commit('Commit in first', {'README.md': '# first\n'});
			first.run('branch only-in-first');

			await page.addInitScript(({firstPath, otherPath}: {firstPath: string; otherPath: string}) => {
				const projects = [
					{
						id: 'first-project', alias: 'First Project', path: firstPath,
						server: 'localhost', port: 3000, serverType: 'bun', order: 0,
						dateCreated: 0, dateLastOpen: 0,
					},
					{
						id: 'second-project', alias: 'Second Project', path: otherPath,
						server: 'localhost', port: 3000, serverType: 'bun', order: 1,
						dateCreated: 0, dateLastOpen: 0,
					},
				];

				localStorage.setItem('git-yak:projects', JSON.stringify(projects));
				localStorage.setItem('git-yak:lastProjectId', 'first-project');
			}, {firstPath: first.path, otherPath: other.path});

			await page.goto('/');
			await waitForRepoLoaded(page);
			await waitForCommitRow(page, 'Commit in first');
			await expect(sidebarLocalBranch(page, 'only-in-first')).toBeVisible();

			// A file diff replaces the commit history pane, so whatever the history reloads on
			// a project switch is not reloaded here.
			await page.locator('.commit-row__message:has-text("Commit in first")').first().click();
			await byTestId(page, 'changed-file').filter({hasText: 'README.md'}).click();
			await byTestId(page, 'close-file-diff-btn').waitFor({state: 'visible', timeout: 10_000});

			await page.keyboard.press('Meta+Shift+P');
			await expect(byTestId(page, 'command-palette')).toBeVisible();
			await byTestId(page, 'command-palette-item-open-repo').click();
			await byTestId(page, 'command-palette-subitem-second-project').click();

			// Opening a diff collapses the sidebar; expand it again without leaving the diff,
			// so the branch list is read while the commit history is still unmounted.
			await byTestId(page, 'sidebar-toggle-btn').click();

			await expect(sidebarLocalBranch(page, 'only-in-other')).toBeVisible({timeout: 10_000});
			await expect(sidebarLocalBranch(page, 'only-in-first')).toHaveCount(0);
		}
		finally {
			first.cleanup();
		}
	}
	finally {
		other.cleanup();
	}
});
