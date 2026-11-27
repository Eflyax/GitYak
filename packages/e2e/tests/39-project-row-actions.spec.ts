import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// The rows of the full list; Recent shows the same projects a second time.
function allRows(page: Page) {
	return page.locator('[test-id="all-projects"] [test-id="project-row"]');
}

test.describe('project rows', () => {
	test('a row selects its project, and the form duplicates, removes and opens it', async ({page, repo, openRepo}) => {
		repo.commit('Initial', {'a.txt': 'a\n'});

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');
		await byTestId(page, 'open-repo-manager-btn').click();

		// The row says where the project lives.
		await expect(allRows(page).first().locator('[test-id="project-location-badge"]')).toHaveText('Local');

		// A click shows the project's form on the right.
		await allRows(page).first().click();
		await expect(byTestId(page, 'alias-input').locator('input')).toHaveValue('Test Project');

		// Duplicate prepares a copy; saving adds it to the list.
		await byTestId(page, 'project-form-duplicate-btn').click();
		await byTestId(page, 'project-form-save-btn').click();
		await expect(allRows(page)).toHaveCount(2);

		// Remove asks first, then takes it off the list again.
		await byTestId(page, 'project-form-remove-btn').click();
		await page.locator('.n-dialog .n-button', {hasText: 'Remove'}).click();
		await expect(allRows(page)).toHaveCount(1);

		// A double click opens the project.
		await allRows(page).first().dblclick();
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');
	});

	test('the manager goes back to the open project with Back, Esc or the rail', async ({page, repo, openRepo}) => {
		repo.commit('Initial', {'a.txt': 'a\n'});

		await openRepo(page, repo.path);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'open-repo-manager-btn').click();
		await expect(byTestId(page, 'close-project-manager-btn')).toHaveText(/Back to Test Project/);
		await byTestId(page, 'close-project-manager-btn').click();
		await waitForCommitRow(page, 'Initial');

		// Esc that closes a dialog over the manager is the dialog's, not the manager's.
		await byTestId(page, 'open-repo-manager-btn').click();
		await byTestId(page, 'manage-groups-btn').click();
		await byTestId(page, 'add-group-btn').click();
		await byTestId(page, 'group-name-input').locator('input').fill('Work');
		await byTestId(page, 'group-form-save-btn').click();
		await expect(byTestId(page, 'group-manager-dialog')).toContainText('Work');
		await page.keyboard.press('Escape');
		await expect(byTestId(page, 'group-manager-dialog')).toHaveCount(0);
		await expect(byTestId(page, 'project-manager')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(byTestId(page, 'project-manager')).toHaveCount(0);
		await waitForCommitRow(page, 'Initial');

		// The rail leaves the manager even for the project that is already open.
		await byTestId(page, 'open-repo-manager-btn').click();
		await byTestId(page, 'project-btn').first().click();
		await expect(byTestId(page, 'project-manager')).toHaveCount(0);
		await waitForCommitRow(page, 'Initial');
	});

	test('a second double-click while the project is still connecting opens it only once', async ({page, repo, openRepo}) => {
		repo.commit('Initial', {'a.txt': 'a\n'});

		await openRepo(page, repo.path);
		await waitForCommitRow(page, 'Initial');
		await byTestId(page, 'open-repo-manager-btn').click();

		// Both in one task, so the second arrives while the first connect is certainly pending.
		await allRows(page).first().evaluate(row => {
			row.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
			row.dispatchEvent(new MouseEvent('dblclick', {bubbles: true}));
		});

		await expect(byTestId(page, 'project-manager')).toHaveCount(0);
		await waitForCommitRow(page, 'Initial');

		// The startup reopen is not counted, so one open from the manager makes it 1.
		expect(await page.evaluate(() => {
			const projects = JSON.parse(localStorage.getItem('git-yak:projects') ?? '[]') as Array<{openCount?: number}>;

			return projects[0]?.openCount;
		})).toBe(1);
	});

	test('Recent shows the five most recently opened projects', async ({page}) => {
		const now = Date.now();
		const projects = Array.from({length: 6}, (_, i) => ({
			id: `recent-${i}`,
			alias: `Project ${i}`,
			path: `/tmp/gityak-e2e-recent-${i}`,
			server: 'localhost',
			port: 3000,
			serverType: 'bun',
			order: i,
			dateCreated: 0,
			dateLastOpen: now - i * 1000,
		}));

		await page.addInitScript(list => {
			localStorage.setItem('git-yak:projects', JSON.stringify(list));
			localStorage.removeItem('git-yak:lastProjectId');
		}, projects);
		await page.goto('/');

		await expect(allRows(page)).toHaveCount(6);
		await expect(page.locator('[test-id="recent-projects"] [test-id="project-row"]')).toHaveCount(5);
	});
});
