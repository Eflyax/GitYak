import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

async function openDiffForFirstUnstagedFile(page: import('@playwright/test').Page): Promise<void> {
	await selectWorkingTree(page);
	await byTestId(page, 'unstaged-file').first().click();
	await byTestId(page, 'toggle-history-btn').waitFor({state: 'visible', timeout: 10_000});
}

test('the history button lists the commits that touched the open file', async ({page, repo, openRepo}) => {
	repo.commit('Add the parser', {'parser.ts': 'const a = 1;\n'});
	repo.commit('Rewrite the parser', {'parser.ts': 'const a = 2;\n'});
	repo.commit('Unrelated change', {'other.ts': 'const b = 1;\n'});
	repo.writeFile('parser.ts', 'const a = 3;\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Unrelated change');
	await openDiffForFirstUnstagedFile(page);

	await byTestId(page, 'toggle-history-btn').click();

	const entries = byTestId(page, 'file-history-entry');

	await expect(entries).toHaveCount(2, {timeout: 10_000});
	await expect(entries.first()).toContainText('Rewrite the parser');
	await expect(entries.last()).toContainText('Add the parser');
	// A commit that never touched this file is not in its history.
	await expect(byTestId(page, 'file-history-panel')).not.toContainText('Unrelated change');
});

test('the history follows a file across a rename', async ({page, repo, openRepo}) => {
	repo.commit('Add the parser', {'old-parser.ts': 'const a = 1;\n'});
	repo.run('mv old-parser.ts parser.ts');
	repo.commit('Rename the parser');
	repo.writeFile('parser.ts', 'const a = 2;\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Rename the parser');
	await openDiffForFirstUnstagedFile(page);

	await byTestId(page, 'toggle-history-btn').click();

	// Without --follow the history would stop at the rename and show one entry.
	await expect(byTestId(page, 'file-history-entry')).toHaveCount(2, {timeout: 10_000});
	await expect(byTestId(page, 'file-history-panel')).toContainText('Add the parser');
});

test('blame annotates each line with the commit and author that last touched it', async ({page, repo, openRepo}) => {
	// The repo fixture commits as "Test Author" through GIT_AUTHOR_NAME.
	repo.commit('Add the parser', {'parser.ts': 'const a = 1;\nconst b = 2;\n'});
	repo.writeFile('parser.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Add the parser');
	await openDiffForFirstUnstagedFile(page);

	await byTestId(page, 'toggle-blame-btn').click();

	const gutter = page.locator('.file-diff__blame-gutter');

	await expect(gutter.first()).toBeVisible({timeout: 10_000});
	await expect(gutter.first()).toContainText('Test Author');
	// The line that exists only in the working tree is marked as such.
	await expect(page.locator('.file-diff__blame-gutter', {hasText: 'uncommitted'})).toHaveCount(1);

	// Toggling off removes the annotations.
	await byTestId(page, 'toggle-blame-btn').click();
	await expect(gutter).toHaveCount(0);
});

test('a file with no commits yet shows an empty history', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.writeFile('brand-new.txt', 'hello\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await openDiffForFirstUnstagedFile(page);

	await byTestId(page, 'toggle-history-btn').click();

	await expect(byTestId(page, 'file-history-empty')).toBeVisible({timeout: 10_000});
});
