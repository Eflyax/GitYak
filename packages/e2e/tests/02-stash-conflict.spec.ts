import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

test('stash pop with conflict shows Monaco conflict editor with Accept buttons', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Base', {'file.txt': 'line one\nline two\nline three\n'});

	// Modify file then stash
	repo.writeFile('file.txt', 'line ONE\nline two\nline three\n');
	repo.run('stash push -m "wip"');

	// Commit a conflicting change to the same line → stash pop now has to merge
	// instead of refusing outright (git aborts a pop early when the working tree
	// simply has uncommitted local edits to the same path).
	repo.commit('Conflicting change', {'file.txt': 'line ALT\nline two\nline three\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Base');

	// Right-click the stash row in the commit history and pop it
	const stashRow = page.locator('[test-id="commit-row-stash"]').first();

	await expect(stashRow).toBeVisible({timeout: 10_000});
	await stashRow.click({button: 'right'});

	// Wait for context menu and click "Pop stash"
	await page.locator('.mx-context-menu-item:has-text("Pop stash")').first().click();

	await selectWorkingTree(page);

	// Open the conflicted file in the staging panel
	const conflictedFile = page.locator('[test-id="unstaged-file"]').first();
	await conflictedFile.waitFor({state: 'visible', timeout: 10_000});
	await conflictedFile.click();

	// Monaco conflict editor should be visible with counter and at least one widget
	await expect(byTestId(page, 'conflict-counter')).toBeVisible({timeout: 10_000});
	await expect(byTestId(page, 'conflict-widget').first()).toBeVisible();

	// Save button is disabled while a conflict remains
	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();

	// Accept ours
	await byTestId(page, 'accept-ours-btn').first().click();

	// Counter says "All conflicts resolved" → save enabled
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
	await expect(byTestId(page, 'conflict-save-btn')).toBeEnabled();

	await byTestId(page, 'conflict-save-btn').click();
});
