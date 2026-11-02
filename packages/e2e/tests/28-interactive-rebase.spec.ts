import type {Page, Locator} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import type {ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// feature carries three commits touching separate files (so any reorder/drop applies
// cleanly); master moves on with one of its own so the rebase really replays them.
// Leaves master checked out — the rebase itself has to switch to feature.
function seedFeatureBranch(repo: ITempRepo): void {
	repo.commit('Initial', {'README.md': '# repo\n'});

	repo.run('checkout -b feature');
	repo.commit('Feature A', {'a.txt': 'a\n'});
	repo.commit('Feature B', {'b.txt': 'b\n'});
	repo.commit('Feature C', {'c.txt': 'c\n'});

	repo.run('checkout master');
	repo.commit('Master work', {'master.txt': 'master\n'});
}

// Both branches rewrite file.txt, so replaying "Feature edit" onto master stops on a conflict.
// "Feature extra" follows it and applies cleanly whatever happens to the first one.
function seedConflictingBranch(repo: ITempRepo): void {
	repo.commit('Initial', {'file.txt': 'base\n'});

	repo.run('checkout -b feature');
	repo.commit('Feature edit', {'file.txt': 'feature\n'});
	repo.commit('Feature extra', {'extra.txt': 'extra\n'});

	repo.run('checkout master');
	repo.commit('Master edit', {'file.txt': 'master\n'});
}

function subjects(repo: ITempRepo, ref = 'feature'): Array<string> {
	return repo.run(`log --format=%s ${ref}`).trim().split('\n');
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

async function openRebaseModal(page: Page, repo: ITempRepo, openRepo: (page: Page, path: string) => Promise<void>, firstSubject: string): Promise<void> {
	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, firstSubject);

	await dragBranchOnto(page, 'feature', 'master');
	await page.locator('.mx-context-menu-item:has-text("Rebase feature onto master…")').click();

	await expect(byTestId(page, 'rebase-start-btn')).toBeVisible({timeout: 5_000});
}

// Modal rows are listed oldest first (the order git applies them).
function step(page: Page, subject: string): Locator {
	return byTestId(page, 'rebase-step').filter({hasText: subject});
}

async function stepSubjects(page: Page): Promise<Array<string>> {
	return byTestId(page, 'rebase-step').locator('.rebase__subject').allInnerTexts();
}

test('dropping a commit removes it from the rebased branch', async ({page, repo, openRepo}) => {
	seedFeatureBranch(repo);
	await openRebaseModal(page, repo, openRepo, 'Feature C');

	await expect.poll(() => stepSubjects(page)).toEqual(['Feature A', 'Feature B', 'Feature C']);

	await step(page, 'Feature B').locator('[test-id="rebase-drop-btn"]').click();
	await expect(page.locator('.rebase__summary')).toHaveText('2 of 3 commits kept');

	await byTestId(page, 'rebase-start-btn').click();

	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature C', 'Feature A', 'Master work', 'Initial']);

	// The dropped commit's change is gone too, not just its message.
	expect(() => repo.run('cat-file -e feature:b.txt')).toThrow();
	await expect(page.locator('.commit-row__message:has-text("Feature B")')).toHaveCount(0);
});

test('squash and fixup meld three commits into one', async ({page, repo, openRepo}) => {
	seedFeatureBranch(repo);
	await openRebaseModal(page, repo, openRepo, 'Feature C');

	// The first kept row has nothing to meld into.
	await expect(step(page, 'Feature A').locator('[test-id="rebase-squash-btn"]')).toBeDisabled();
	await expect(step(page, 'Feature A').locator('[test-id="rebase-fixup-btn"]')).toBeDisabled();

	await step(page, 'Feature B').locator('[test-id="rebase-squash-btn"]').click();
	await step(page, 'Feature C').locator('[test-id="rebase-fixup-btn"]').click();

	await byTestId(page, 'rebase-start-btn').click();

	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature A', 'Master work', 'Initial']);

	// squash combines messages, fixup discards its own; all three changes survive.
	expect(repo.run('log -1 --format=%B feature').trim()).toBe('Feature A\n\nFeature B');
	expect(repo.run('ls-tree --name-only feature').split('\n')).toEqual(expect.arrayContaining(['a.txt', 'b.txt', 'c.txt']));
});

test('reword replaces a commit message', async ({page, repo, openRepo}) => {
	seedFeatureBranch(repo);
	await openRebaseModal(page, repo, openRepo, 'Feature C');

	await step(page, 'Feature B').locator('[test-id="rebase-reword-btn"]').click();

	// Reword swaps the subject label for an input prefilled with the old message.
	const input = byTestId(page, 'rebase-message-input').locator('input');

	await expect(input).toHaveValue('Feature B');
	await input.fill('Feature B, reworded');

	await byTestId(page, 'rebase-start-btn').click();

	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature C', 'Feature B, reworded', 'Feature A', 'Master work', 'Initial']);
});

test('moving commits up and down reorders them', async ({page, repo, openRepo}) => {
	seedFeatureBranch(repo);
	await openRebaseModal(page, repo, openRepo, 'Feature C');

	// The ends can't move further out.
	await expect(byTestId(page, 'rebase-move-up-btn').first()).toBeDisabled();
	await expect(byTestId(page, 'rebase-move-down-btn').last()).toBeDisabled();

	await step(page, 'Feature C').locator('[test-id="rebase-move-up-btn"]').click();
	await step(page, 'Feature C').locator('[test-id="rebase-move-up-btn"]').click();
	await step(page, 'Feature A').locator('[test-id="rebase-move-down-btn"]').click();

	await expect.poll(() => stepSubjects(page)).toEqual(['Feature C', 'Feature B', 'Feature A']);

	await byTestId(page, 'rebase-start-btn').click();

	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature A', 'Feature B', 'Feature C', 'Master work', 'Initial']);
});

test('cancel closes the modal without touching the repository', async ({page, repo, openRepo}) => {
	seedFeatureBranch(repo);

	const featureBefore = repo.run('rev-parse feature').trim();
	const headBefore = repo.run('rev-parse HEAD').trim();

	await openRebaseModal(page, repo, openRepo, 'Feature C');

	await step(page, 'Feature B').locator('[test-id="rebase-drop-btn"]').click();
	await byTestId(page, 'rebase-cancel-btn').click();

	await expect(byTestId(page, 'rebase-start-btn')).toHaveCount(0);
	await page.waitForTimeout(500);

	// Not even the branch switch the rebase would start with happened.
	expect(repo.run('rev-parse --abbrev-ref HEAD').trim()).toBe('master');
	expect(repo.run('rev-parse HEAD').trim()).toBe(headBefore);
	expect(repo.run('rev-parse feature').trim()).toBe(featureBefore);
	expect(repo.run('status --porcelain')).toBe('');
});

async function startConflictingRebase(page: Page, repo: ITempRepo, openRepo: (page: Page, path: string) => Promise<void>): Promise<void> {
	await openRebaseModal(page, repo, openRepo, 'Feature extra');
	await byTestId(page, 'rebase-start-btn').click();

	// git pauses on the first replayed commit; the app hands off to the staging panel.
	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toContain('UU file.txt');
	await expect(byTestId(page, 'rebase-continue-btn')).toBeVisible();
}

test('a conflicting rebase can be resolved and continued to completion', async ({page, repo, openRepo}) => {
	seedConflictingBranch(repo);
	await startConflictingRebase(page, repo, openRepo);

	// Continue is held back until nothing is left unresolved.
	await expect(byTestId(page, 'rebase-continue-btn')).toBeDisabled();

	await page.locator('[test-id="unstaged-file"]', {hasText: 'file.txt'}).first().click();
	await expect(byTestId(page, 'conflict-counter')).toHaveText(/1 conflict remaining/);

	// During a rebase "incoming" is the commit being replayed — feature's version.
	await byTestId(page, 'accept-theirs-btn').first().click();
	await byTestId(page, 'conflict-save-btn').click();

	const continueBtn = byTestId(page, 'rebase-continue-btn');

	await expect(continueBtn).toBeEnabled();
	await continueBtn.click();

	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature extra', 'Feature edit', 'Master edit', 'Initial']);
	expect(repo.run('rev-parse --abbrev-ref HEAD').trim()).toBe('feature');
	expect(repo.run('show feature:file.txt')).toBe('feature\n');
	expect(repo.run('status --porcelain')).toBe('');
	await expect(byTestId(page, 'rebase-continue-btn')).toHaveCount(0);
});

test('aborting a conflicting rebase restores the original branch', async ({page, repo, openRepo}) => {
	seedConflictingBranch(repo);

	const featureBefore = repo.run('rev-parse feature').trim();

	await startConflictingRebase(page, repo, openRepo);

	const abortBtn = byTestId(page, 'rebase-abort-btn');

	await expect(abortBtn).toHaveText(/Abort rebase/);
	await abortBtn.click();

	// Back on feature, at its pre-rebase commit, with no rebase in progress.
	await expect.poll(() => repo.run('status --porcelain'), {timeout: 10_000}).toBe('');
	expect(repo.run('rev-parse --abbrev-ref HEAD').trim()).toBe('feature');
	expect(repo.run('rev-parse HEAD').trim()).toBe(featureBefore);
	expect(() => repo.run('rev-parse -q --verify REBASE_HEAD')).toThrow();
	expect(repo.run('status')).not.toContain('rebase in progress');
	await expect(abortBtn).toHaveCount(0);
});

test('skipping the conflicting commit drops it and finishes the rebase', async ({page, repo, openRepo}) => {
	seedConflictingBranch(repo);
	await startConflictingRebase(page, repo, openRepo);

	await byTestId(page, 'rebase-skip-btn').click();

	// "Feature edit" is gone; the clean "Feature extra" was still replayed on top of master.
	await expect.poll(() => subjects(repo), {timeout: 10_000})
		.toEqual(['Feature extra', 'Master edit', 'Initial']);
	expect(repo.run('show feature:file.txt')).toBe('master\n');
	expect(repo.run('status --porcelain')).toBe('');
	await expect(byTestId(page, 'rebase-continue-btn')).toHaveCount(0);
});
