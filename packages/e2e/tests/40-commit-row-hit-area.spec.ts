import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// Matches REFS_WIDTH in CommitHistory.vue and PADDING_LEFT in CommitGraph.vue: the centre of a
// level-0 graph node.
const GRAPH_NODE_X = 180 + 12;
const ROW_MIDDLE_Y = 13;

function rowLine(page: Page, subject: string) {
	return page.locator('.commit-row-line', {has: page.locator(`.commit-row__message:has-text("${subject}")`)});
}

function rowBlock(page: Page, subject: string) {
	return rowLine(page, subject).locator('.commit-row');
}

test('the empty refs column and the graph of a row select its commit', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.commit('Second', {'a.txt': 'b\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// "Initial" has no ref chip, so the left edge of its row is empty refs column.
	await rowLine(page, 'Initial').click({position: {x: 20, y: ROW_MIDDLE_Y}});
	await expect(rowBlock(page, 'Initial')).toHaveClass(/commit-row--selected/);
	await expect(rowBlock(page, 'Second')).not.toHaveClass(/commit-row--selected/);

	await rowLine(page, 'Second').click({position: {x: GRAPH_NODE_X, y: ROW_MIDDLE_Y}});
	await expect(rowBlock(page, 'Second')).toHaveClass(/commit-row--selected/);
	await expect(rowBlock(page, 'Initial')).not.toHaveClass(/commit-row--selected/);
});

test('right-clicking the graph of a row opens the commit menu', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.commit('Second', {'a.txt': 'b\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await rowLine(page, 'Initial').click({button: 'right', position: {x: GRAPH_NODE_X, y: ROW_MIDDLE_Y}});

	await expect(page.locator('.mx-context-menu-item:has-text("Create tag here")').first()).toBeVisible();
	await expect(rowBlock(page, 'Initial')).toHaveClass(/commit-row--selected/);
});
