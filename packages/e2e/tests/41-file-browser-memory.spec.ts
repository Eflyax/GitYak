import {mkdirSync, rmSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {byTestId} from '../fixtures/ui';

// A project that is not open, so the manager is the main view and its row can be selected.
async function seedProject(page: Page, path: string): Promise<void> {
	await page.addInitScript(projectPath => {
		localStorage.setItem('git-yak:projects', JSON.stringify([{
			id: 'browse-project',
			alias: 'Browse Project',
			path: projectPath,
			server: 'localhost',
			port: 3000,
			serverType: 'bun',
			order: 0,
			dateCreated: 0,
			dateLastOpen: 0,
		}]));
		localStorage.removeItem('git-yak:lastProjectId');
	}, path);

	await page.goto('/');
	await byTestId(page, 'project-row').first().click();
}

// An empty Path field leaves the start to the remembered folder; a typed one wins over it.
async function openProjectBrowser(page: Page, typedPath = ''): Promise<void> {
	await byTestId(page, 'path-input').locator('input').fill(typedPath);
	await byTestId(page, 'browse-folder-btn').click();
	await expect(page.locator('.file-browser .footer')).toBeVisible();
}

async function closeBrowser(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await expect(page.locator('.file-browser')).toHaveCount(0);
}

test('reopening the folder browser starts in the last visited folder', async ({page}) => {
	const root = mkdtempSync(join(tmpdir(), 'gityak-e2e-browse-'));
	const child = join(root, 'child');

	mkdirSync(child);

	try {
		await seedProject(page, root);

		// Visit the child through the browser, then go up: the parent is the last folder.
		await openProjectBrowser(page, child);
		await expect(page.locator('.file-browser .current-path')).toHaveText(child);
		await byTestId(page, 'navigate-up-btn').click();
		await expect(page.locator('.file-browser .current-path')).toHaveText(root);
		await closeBrowser(page);

		// With the Path field empty, the remembered folder is used.
		await openProjectBrowser(page);
		await expect(page.locator('.file-browser .current-path')).toHaveText(root);
		await expect(byTestId(page, 'file-entry').filter({hasText: 'child'})).toBeVisible();
	}
	finally {
		rmSync(root, {recursive: true, force: true});
	}
});

test('a remembered folder that was deleted falls back to its nearest existing ancestor', async ({page}) => {
	const root = mkdtempSync(join(tmpdir(), 'gityak-e2e-browse-'));
	const gone = join(root, 'gone');

	mkdirSync(gone);

	try {
		await seedProject(page, root);

		await openProjectBrowser(page, gone);
		await expect(page.locator('.file-browser .current-path')).toHaveText(gone);
		await closeBrowser(page);

		rmSync(gone, {recursive: true, force: true});

		await openProjectBrowser(page);
		await expect(page.locator('.file-browser .current-path')).toHaveText(root);
		await expect(page.locator('.n-message--warning-type')).toContainText('is not available');
	}
	finally {
		rmSync(root, {recursive: true, force: true});
	}
});
