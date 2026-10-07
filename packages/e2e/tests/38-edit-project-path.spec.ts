import {rmSync} from 'node:fs';
import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {createTempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// A project whose directory has been deleted since it was added: the repository cannot be
// read, and the only way back is to point the project at another directory.
async function seedProjectWithMissingPath(page: Page, missingPath: string): Promise<void> {
	await page.addInitScript(path => {
		localStorage.setItem('git-yak:projects', JSON.stringify([{
			id: 'stale-project',
			alias: 'Stale Project',
			path,
			server: 'localhost',
			port: 3000,
			serverType: 'bun',
			order: 0,
			dateCreated: 0,
			dateLastOpen: 0,
		}]));
		localStorage.setItem('git-yak:lastProjectId', 'stale-project');
	}, missingPath);

	await page.goto('/');
}

async function openEditForm(page: Page): Promise<void> {
	await byTestId(page, 'open-repo-manager-btn').click();
	await byTestId(page, 'project-edit-btn').first().click();
	await expect(byTestId(page, 'path-input').locator('input')).toBeVisible();
}

test('the path of a local project can be typed in when editing', async ({page}) => {
	const gone = createTempRepo();
	const gonePath = gone.path;

	gone.cleanup();

	await seedProjectWithMissingPath(page, gonePath);
	await openEditForm(page);

	// Browse is useless here — the directory it would open no longer exists — so the field
	// itself has to accept a new path.
	await expect(byTestId(page, 'path-input').locator('input')).toBeEnabled();
});

test('a project pointed at a deleted directory can be repaired by editing its path', async ({page}) => {
	const replacement = createTempRepo();

	try {
		replacement.commit('Commit in the replacement', {'README.md': '# replacement\n'});

		const gone = createTempRepo();
		const gonePath = gone.path;

		gone.cleanup();

		await seedProjectWithMissingPath(page, gonePath);
		await openEditForm(page);

		await byTestId(page, 'path-input').locator('input').fill(replacement.path);
		await byTestId(page, 'project-form-save-btn').click();

		await byTestId(page, 'project-open-btn').first().click();

		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Commit in the replacement');

		expect(await page.evaluate(() => {
			const projects = JSON.parse(localStorage.getItem('git-yak:projects') ?? '[]') as Array<{path: string}>;

			return projects[0]?.path;
		})).toBe(replacement.path);
	}
	finally {
		rmSync(replacement.path, {recursive: true, force: true});
	}
});

test('repairing the path of the open project reloads it without reopening', async ({page}) => {
	const replacement = createTempRepo();

	try {
		replacement.commit('Commit in the replacement', {'README.md': '# replacement\n'});
		replacement.run('branch repaired-branch');

		const gone = createTempRepo();
		const gonePath = gone.path;

		gone.cleanup();

		// The broken project is the one already open, which is how this is met in practice.
		await seedProjectWithMissingPath(page, gonePath);
		await openEditForm(page);

		await byTestId(page, 'path-input').locator('input').fill(replacement.path);
		await byTestId(page, 'project-form-save-btn').click();

		// No reopening: saving the new path is what the view has to follow.
		await waitForCommitRow(page, 'Commit in the replacement');
		await expect(page.locator('.branch-item__name', {hasText: 'repaired-branch'})).toBeVisible();
	}
	finally {
		rmSync(replacement.path, {recursive: true, force: true});
	}
});
