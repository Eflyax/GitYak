import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import type {ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

// master and feature both rewrite the only line of file.txt, so merging (or cherry-picking)
// one into the other always stops on a conflict. Leaves master checked out.
function seedDivergedBranches(repo: ITempRepo): void {
	repo.commit('Initial', {'file.txt': 'base\n'});

	repo.run('checkout -b feature');
	repo.commit('Feature change', {'file.txt': 'feature\n'});

	repo.run('checkout master');
	repo.commit('Master change', {'file.txt': 'master\n'});
}

// HTML5 drag is hard to simulate; dispatch events programmatically (same as 08-drag-merge).
async function dragBranchOnto(page: Page, source: string, target: string): Promise<void> {
	await expect(page.locator('[test-id="branch-item-select"]', {hasText: source}).first()).toBeVisible({timeout: 10_000});

	await page.evaluate(({source, target}) => {
		// Match on the name span alone: the row also shows track/HEAD badges.
		const items = Array.from(document.querySelectorAll('[test-id="branch-item-select"]:not(.branch-item--remote)'));
		const byName = (name: string): Element | undefined =>
			items.find(it => it.querySelector('.branch-item__name')?.textContent?.trim() === name);
		const src = byName(source);
		const tgt = byName(target);

		if (!src || !tgt) throw new Error('Could not find branch items');

		const dt = new DataTransfer();
		src.dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, clientX: 200, clientY: 200}));
	}, {source, target});
}

async function startConflictingMerge(page: Page, repo: ITempRepo, openRepo: (page: Page, path: string) => Promise<void>): Promise<void> {
	seedDivergedBranches(repo);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature change');

	await dragBranchOnto(page, 'feature', 'master');
	await page.locator('.mx-context-menu-item:has-text("Merge feature into master")').click();

	// The merge stops half-way: git is the source of truth that a conflict is pending.
	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toContain('UU file.txt');
}

async function openConflictedFile(page: Page): Promise<void> {
	await selectWorkingTree(page);

	const conflictedFile = page.locator('[test-id="unstaged-file"]', {hasText: 'file.txt'}).first();

	await conflictedFile.click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/1 conflict remaining/);
}

test('resolving a merge conflict with "incoming" and committing creates a merge commit', async ({page, repo, openRepo}) => {
	await startConflictingMerge(page, repo, openRepo);
	await openConflictedFile(page);

	// Nothing is saved while a conflict is still undecided.
	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();

	await byTestId(page, 'accept-theirs-btn').first().click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
	await byTestId(page, 'conflict-save-btn').click();

	// Saving writes the chosen side and stages it — git no longer reports it unmerged.
	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('M  file.txt\n');
	expect(repo.run('rev-parse -q --verify MERGE_HEAD').trim()).not.toBe('');

	await byTestId(page, 'commit-summary-input').locator('input').fill('Merge feature');

	const commitBtn = byTestId(page, 'commit-btn');

	await expect(commitBtn).toHaveText(/Commit & Merge/);
	await commitBtn.click();

	// A real merge commit: two parents, the chosen ("incoming" = feature) content, no MERGE_HEAD.
	await expect.poll(() => repo.run('rev-list --parents -n1 HEAD').trim().split(' ').length, {timeout: 10_000}).toBe(3);
	expect(repo.run('show HEAD:file.txt')).toBe('feature\n');
	expect(repo.run('log -1 --format=%s')).toBe('Merge feature\n');
	expect(() => repo.run('rev-parse -q --verify MERGE_HEAD')).toThrow();
	expect(repo.run('status --porcelain')).toBe('');
});

test('a merge resolved to the current side can still be committed', async ({page, repo, openRepo}) => {
	// Known defect: when the resolution equals HEAD (e.g. "Current" everywhere) nothing ends up
	// staged, and the commit button requires staged files — "Commit & Merge" stays disabled, so
	// the merge can only be finished or aborted outside the app. git itself allows this commit.
	test.fail();

	await startConflictingMerge(page, repo, openRepo);
	await openConflictedFile(page);

	await byTestId(page, 'accept-ours-btn').first().click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
	await byTestId(page, 'conflict-save-btn').click();

	// Resolved and staged; the index matches HEAD, but MERGE_HEAD still awaits a commit.
	await expect.poll(() => repo.run('ls-files -u'), {timeout: 10_000}).toBe('');
	expect(repo.run('show :file.txt')).toBe('master\n');
	expect(repo.run('rev-parse -q --verify MERGE_HEAD').trim()).not.toBe('');

	await byTestId(page, 'commit-summary-input').locator('input').fill('Merge feature');

	const commitBtn = byTestId(page, 'commit-btn');

	await expect(commitBtn).toHaveText(/Commit & Merge/);
	await expect(commitBtn).toBeEnabled({timeout: 3_000});
	await commitBtn.click();

	await expect.poll(() => repo.run('rev-list --parents -n1 HEAD').trim().split(' ').length, {timeout: 10_000}).toBe(3);
	expect(repo.run('show HEAD:file.txt')).toBe('master\n');
});

test('commit summary is prefilled with git\'s merge message after a conflicted merge', async ({page, repo, openRepo}) => {
	// Known defect: the commit form ignores .git/MERGE_MSG, so the summary stays empty and the
	// user must invent a merge message (git's own "Merge branch 'feature'" is lost).
	test.fail();

	await startConflictingMerge(page, repo, openRepo);
	await selectWorkingTree(page);

	await expect(byTestId(page, 'commit-summary-input').locator('input')).toHaveValue(/Merge branch 'feature'/, {timeout: 3_000});
});

test('"Take all current" / "Take all incoming" resolve every conflict at once', async ({page, repo, openRepo}) => {
	// Two separate conflicting hunks, so "all" means more than one.
	repo.commit('Initial', {'file.txt': 'a\n1\n2\n3\n4\n5\n6\nb\n'});
	repo.run('checkout -b feature');
	repo.commit('Feature change', {'file.txt': 'A-feature\n1\n2\n3\n4\n5\n6\nB-feature\n'});
	repo.run('checkout master');
	repo.commit('Master change', {'file.txt': 'A-master\n1\n2\n3\n4\n5\n6\nB-master\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature change');

	await dragBranchOnto(page, 'feature', 'master');
	await page.locator('.mx-context-menu-item:has-text("Merge feature into master")').click();
	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toContain('UU file.txt');

	await selectWorkingTree(page);
	await page.locator('[test-id="unstaged-file"]', {hasText: 'file.txt'}).first().click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/2 conflicts remaining/);

	await byTestId(page, 'take-all-current-btn').click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);

	// Switching to "incoming" replaces the previous choice rather than keeping both sides.
	await byTestId(page, 'take-all-incoming-btn').click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
	await byTestId(page, 'conflict-save-btn').click();

	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('M  file.txt\n');
	expect(repo.run('show :file.txt')).toBe('A-feature\n1\n2\n3\n4\n5\n6\nB-feature\n');
});

test('aborting a conflicted merge restores the pre-merge HEAD', async ({page, repo, openRepo}) => {
	await startConflictingMerge(page, repo, openRepo);

	const headBefore = repo.run('rev-parse HEAD').trim();

	await selectWorkingTree(page);

	const abortBtn = byTestId(page, 'abort-merge-btn');

	await expect(abortBtn).toHaveText(/Abort merge/);
	await abortBtn.click();

	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('');
	expect(() => repo.run('rev-parse -q --verify MERGE_HEAD')).toThrow();
	expect(repo.run('rev-parse HEAD').trim()).toBe(headBefore);
	expect(repo.run('show HEAD:file.txt')).toBe('master\n');
	await expect(abortBtn).toHaveCount(0);
});

test('merge is disabled while the working tree is dirty', async ({page, repo, openRepo}) => {
	seedDivergedBranches(repo);
	repo.writeFile('other.txt', 'uncommitted\n');

	const headBefore = repo.run('rev-parse HEAD').trim();

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature change');

	await dragBranchOnto(page, 'feature', 'master');

	// The merge item explains why instead of offering the merge.
	const item = page.locator('.mx-context-menu-item:has-text("Working tree has uncommitted changes")').first();

	await expect(item).toBeVisible({timeout: 5_000});
	await expect(item).toHaveClass(/disabled/);
	await expect(page.locator('.mx-context-menu-item:has-text("Merge feature into master")')).toHaveCount(0);

	await item.click({force: true});
	await page.waitForTimeout(500);

	expect(repo.run('rev-parse HEAD').trim()).toBe(headBefore);
});

test('aborting a conflicted cherry-pick restores HEAD and clears CHERRY_PICK_HEAD', async ({page, repo, openRepo}) => {
	seedDivergedBranches(repo);

	const headBefore = repo.run('rev-parse HEAD').trim();

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature change');

	await page.locator('.commit-row__message:has-text("Feature change")').first().click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Cherry pick")').first().click();

	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toContain('UU file.txt');
	expect(repo.run('rev-parse -q --verify CHERRY_PICK_HEAD').trim()).not.toBe('');

	await selectWorkingTree(page);

	const abortBtn = byTestId(page, 'abort-merge-btn');

	await expect(abortBtn).toHaveText(/Abort cherry-pick/);
	await abortBtn.click();

	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('');
	expect(() => repo.run('rev-parse -q --verify CHERRY_PICK_HEAD')).toThrow();
	expect(repo.run('rev-parse HEAD').trim()).toBe(headBefore);
});
