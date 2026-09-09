import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

async function searchFor(page: import('@playwright/test').Page, query: string): Promise<void> {
	const input = byTestId(page, 'commit-search-input');

	await input.fill(query);
	await input.press('Enter');
}

test('searching the history narrows the graph to matching commits', async ({page, repo, openRepo}) => {
	repo.commit('Add login form', {'login.ts': 'export const login = 1;\n'});
	repo.commit('Fix header spacing', {'header.css': '.h {}\n'});
	repo.commit('Add logout button', {'logout.ts': 'export const logout = 1;\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Add logout button');

	await searchFor(page, 'login');

	await expect(byTestId(page, 'commit-search-summary')).toHaveText('1 matching commit', {timeout: 10_000});
	await expect(page.locator('.commit-row__message:has-text("Add login form")')).toBeVisible();
	await expect(page.locator('.commit-row__message:has-text("Fix header spacing")')).toHaveCount(0);

	// Clearing brings the whole history back.
	await byTestId(page, 'commit-search-clear').click();

	await expect(byTestId(page, 'commit-search-summary')).toHaveCount(0);
	await waitForCommitRow(page, 'Fix header spacing');
});

test('search matches by author, by touched file and by diff content', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('commit --allow-empty -m "Release notes" --author="Jane Roe <jane@example.com>"');
	repo.commit('Tweak parser', {'src/parser.ts': 'const marker = "NEEDLE";\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Tweak parser');

	await searchFor(page, 'author:Jane');
	await expect(byTestId(page, 'commit-search-summary')).toHaveText('1 matching commit', {timeout: 10_000});
	await expect(page.locator('.commit-row__message:has-text("Release notes")')).toBeVisible();

	await searchFor(page, 'file:src/parser.ts');
	await expect(byTestId(page, 'commit-search-summary')).toHaveText('1 matching commit', {timeout: 10_000});
	await expect(page.locator('.commit-row__message:has-text("Tweak parser")')).toBeVisible();

	await searchFor(page, 'content:NEEDLE');
	await expect(byTestId(page, 'commit-search-summary')).toHaveText('1 matching commit', {timeout: 10_000});
	await expect(page.locator('.commit-row__message:has-text("Tweak parser")')).toBeVisible();
});

test('a search with no matches says so instead of showing an empty history', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await searchFor(page, 'nothing-matches-this');

	await expect(byTestId(page, 'commit-search-empty')).toBeVisible({timeout: 10_000});
});
