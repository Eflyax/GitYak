import type {Page, Locator} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import type {ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

// Two conflicts in one file, separated by enough context that git keeps them apart. The
// incoming side of the first one is longer, so the panes need padding to stay aligned.
const BASE = 'top\n1\n2\n3\n4\n5\n6\nbottom\n';
const OURS = 'top-ours\n1\n2\n3\n4\n5\n6\nbottom-ours\n';
const THEIRS = 'top-theirs\ntop-theirs-extra\n1\n2\n3\n4\n5\n6\nbottom-theirs\n';

// Merged with git itself rather than through the UI: these tests are about the editor, and
// git leaving the file in a conflicted state is all they need.
function seedConflictedMerge(repo: ITempRepo): void {
	repo.commit('Initial', {'file.txt': BASE});
	repo.run('checkout -b feature');
	repo.commit('Feature change', {'file.txt': THEIRS});
	repo.run('checkout master');
	repo.commit('Master change', {'file.txt': OURS});

	try {
		repo.run('merge feature');
	}
	catch {
		// Exits non-zero on the conflict, which is the point.
	}
}

async function openConflictedFile(page: Page, repo: ITempRepo, openRepo: (page: Page, path: string) => Promise<void>): Promise<void> {
	seedConflictedMerge(repo);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Master change');
	await selectWorkingTree(page);
	await page.locator('[test-id="unstaged-file"]', {hasText: 'file.txt'}).first().click();

	await expect(byTestId(page, 'conflict-counter')).toHaveText(/2 conflicts remaining/);
	// The result pane is the last of the three editors to load.
	await expect(resultLines(page)).toContainText('<<<<<<<', {timeout: 10_000});
}

// Monaco picks its shortcuts from the user agent, and the Desktop Chrome profile reports
// Windows, so it expects Ctrl even when the suite runs on a Mac.
const SELECT_ALL = 'Control+A';
const UNDO = 'Control+Z';

function resultLines(page: Page): Locator {
	return byTestId(page, 'conflict-result-editor').locator('.view-lines');
}

// What the result editor holds right now, read from its model rather than the rendered
// lines, which Monaco only draws while they are on screen.
async function resultValue(page: Page): Promise<string> {
	return page.evaluate(() => {
		const monacoGlobal = (window as unknown as {monaco?: {editor: {getEditors(): Array<{getValue(): string; getDomNode(): HTMLElement | null}>}}}).monaco;
		const host = document.querySelector('[test-id="conflict-result-editor"]');
		const editor = monacoGlobal?.editor.getEditors().find(e => host?.contains(e.getDomNode()));

		return editor?.getValue() ?? '';
	});
}

test('shows current and incoming side by side above an editable result', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	await expect(byTestId(page, 'conflict-ours-editor')).toContainText('top-ours');
	await expect(byTestId(page, 'conflict-ours-editor')).not.toContainText('top-theirs');
	await expect(byTestId(page, 'conflict-theirs-editor')).toContainText('top-theirs-extra');
	await expect(byTestId(page, 'conflict-theirs-editor')).not.toContainText('top-ours');

	// The result starts as git left the file, so nothing can be saved yet.
	await expect(resultLines(page)).toContainText('>>>>>>> feature');
	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();
});

test('each conflict starts at the same height in both panes', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	// The first conflict is one line on the left and two on the right; the second conflict
	// only lines up if the left pane was padded to match.
	const ours = await byTestId(page, 'accept-ours-btn').nth(1).boundingBox();
	const theirs = await byTestId(page, 'accept-theirs-btn').nth(1).boundingBox();

	expect(ours).not.toBeNull();
	expect(theirs).not.toBeNull();
	expect(Math.abs(ours!.y - theirs!.y)).toBeLessThan(2);
});

test('picking a side rewrites only that conflict in the result', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	await byTestId(page, 'accept-theirs-btn').first().click();

	await expect(byTestId(page, 'conflict-counter')).toHaveText(/1 conflict remaining/);
	await expect(byTestId(page, 'accept-theirs-btn').first()).toHaveAttribute('aria-pressed', 'true');

	const value = await resultValue(page);

	expect(value.startsWith('top-theirs\ntop-theirs-extra\n1\n')).toBe(true);
	// The second conflict is untouched, so saving is still refused.
	expect(value).toContain('<<<<<<< HEAD\nbottom-ours\n');
	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();
});

test('picking both sides keeps current first, and unpicking puts the markers back', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	await byTestId(page, 'accept-ours-btn').first().click();
	await byTestId(page, 'accept-theirs-btn').first().click();

	await expect.poll(() => resultValue(page)).toMatch(/^top-ours\ntop-theirs\ntop-theirs-extra\n1\n/);

	await byTestId(page, 'accept-ours-btn').first().click();
	await byTestId(page, 'accept-theirs-btn').first().click();

	await expect.poll(() => resultValue(page)).toMatch(/^<<<<<<< HEAD\ntop-ours\n=======\n/);
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/2 conflicts remaining/);
});

test('the result can be edited by hand and is saved exactly as typed', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	// Take incoming for both, then rewrite the first line by hand.
	await byTestId(page, 'take-all-incoming-btn').click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);

	await resultLines(page).locator('.view-line').first().click();
	await page.keyboard.press('Home');
	await page.keyboard.press('Shift+End');
	await page.keyboard.insertText('written by hand');

	await expect.poll(() => resultValue(page)).toMatch(/^written by hand\ntop-theirs-extra\n/);

	await byTestId(page, 'conflict-save-btn').click();

	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('M  file.txt\n');
	expect(repo.run('show :file.txt')).toBe('written by hand\ntop-theirs-extra\n1\n2\n3\n4\n5\n6\nbottom-theirs\n');
});

test('a conflict resolved by hand counts as resolved, and a stray marker blocks saving', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	// Replace the whole result with a clean text, as someone resolving by hand would.
	await resultLines(page).click();
	await page.keyboard.press(SELECT_ALL);
	await page.keyboard.insertText('clean\n');

	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
	await expect(byTestId(page, 'conflict-save-btn')).toBeEnabled();

	await page.keyboard.insertText('>>>>>>> left over\n');

	await expect(byTestId(page, 'conflict-counter')).toHaveText(/1 conflict remaining/);
	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();
});

test('undo in the result reverts a pick', async ({page, repo, openRepo}) => {
	await openConflictedFile(page, repo, openRepo);

	await byTestId(page, 'accept-ours-btn').first().click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/1 conflict remaining/);

	await resultLines(page).click();
	await page.keyboard.press(UNDO);

	await expect(byTestId(page, 'conflict-counter')).toHaveText(/2 conflicts remaining/);
	await expect.poll(() => resultValue(page)).toMatch(/^<<<<<<< HEAD\ntop-ours\n/);
});
