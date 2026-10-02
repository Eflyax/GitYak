import {chmodSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';
import type {ITempRepo} from '../fixtures/repo';

async function openAtWorkingTree(page: Page, repo: ITempRepo, openRepo: (page: Page, path: string) => Promise<void>): Promise<void> {
	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);
}

function stagedNames(repo: ITempRepo): string {
	return repo.run('diff --cached --name-only').trim();
}

test('stage and unstage a single file', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n', 'b.txt': 'b\n'});
	repo.writeFile('a.txt', 'a changed\n');
	repo.writeFile('b.txt', 'b changed\n');

	await openAtWorkingTree(page, repo, openRepo);

	// The per-file button only shows on hover, so hover the row first.
	const aRow = byTestId(page, 'unstaged-file').filter({hasText: 'a.txt'});

	await aRow.hover();
	await aRow.locator('[test-id="stage-file-btn"]').click();

	await expect.poll(() => stagedNames(repo), {timeout: 10_000}).toBe('a.txt');
	// Only the hovered file is staged; its neighbour is left alone.
	expect(repo.run('diff --name-only').trim()).toBe('b.txt');

	const stagedRow = byTestId(page, 'staged-file').filter({hasText: 'a.txt'});

	await stagedRow.hover();
	await stagedRow.locator('[test-id="unstage-file-btn"]').click();

	await expect.poll(() => stagedNames(repo), {timeout: 10_000}).toBe('');
	// Unstaging keeps the working-tree edit.
	expect(repo.run('diff --name-only').trim().split('\n').sort()).toEqual(['a.txt', 'b.txt']);
});

test('stage all and unstage all cover modified, untracked and deleted files', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'mod.txt': 'one\n', 'gone.txt': 'bye\n'});
	repo.writeFile('mod.txt', 'two\n');
	repo.writeFile('new.txt', 'fresh\n');
	// Deleted from the working tree only, so it is an unstaged deletion.
	rmSync(join(repo.path, 'gone.txt'));

	await openAtWorkingTree(page, repo, openRepo);
	await expect(byTestId(page, 'unstaged-file')).toHaveCount(3);

	await byTestId(page, 'stage-all-btn').click();

	await expect.poll(() => repo.run('diff --cached --name-status').trim().split('\n').sort(), {timeout: 10_000})
		.toEqual(['D\tgone.txt', 'M\tmod.txt', 'A\tnew.txt'].sort());
	await expect(byTestId(page, 'staged-file')).toHaveCount(3);
	await expect(byTestId(page, 'unstaged-file')).toHaveCount(0);

	await byTestId(page, 'unstage-all-btn').click();

	await expect.poll(() => stagedNames(repo), {timeout: 10_000}).toBe('');
	// Nothing was lost: the three changes are back in the working tree.
	expect(repo.run('status --porcelain').trimEnd().split('\n').sort())
		.toEqual([' D gone.txt', ' M mod.txt', '?? new.txt']);
});

test('committing staged changes creates a new HEAD and clears the form', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');
	repo.run('add a.txt');

	await openAtWorkingTree(page, repo, openRepo);

	await byTestId(page, 'commit-summary-input').locator('input').fill('Add the change');
	await byTestId(page, 'commit-btn').click();

	await expect.poll(() => repo.run('log -1 --format=%s').trim(), {timeout: 10_000}).toBe('Add the change');
	expect(repo.run('status --porcelain').trim()).toBe('');

	await waitForCommitRow(page, 'Add the change');
	await expect(byTestId(page, 'commit-summary-input').locator('input')).toHaveValue('');
});

test('Meta+Enter commits only when something is staged', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');

	await openAtWorkingTree(page, repo, openRepo);

	const summary = byTestId(page, 'commit-summary-input').locator('input');

	await summary.fill('Shortcut commit');

	// Nothing staged yet: the shortcut must be a no-op.
	await summary.press('Meta+Enter');
	await page.waitForTimeout(1_000);
	expect(repo.run('log --format=%s').trim()).toBe('Initial');
	await expect(summary).toHaveValue('Shortcut commit');

	await byTestId(page, 'stage-all-btn').click();
	await expect(byTestId(page, 'staged-file')).toHaveCount(1);

	await summary.press('Meta+Enter');

	await expect.poll(() => repo.run('log -1 --format=%s').trim(), {timeout: 10_000}).toBe('Shortcut commit');
	await expect(summary).toHaveValue('');
});

test('commit is impossible with an empty summary', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');
	repo.run('add a.txt');

	await openAtWorkingTree(page, repo, openRepo);

	const summary = byTestId(page, 'commit-summary-input').locator('input');

	await expect(byTestId(page, 'commit-btn')).toBeDisabled();

	// Whitespace alone does not count as a summary.
	await summary.fill('   ');
	await expect(byTestId(page, 'commit-btn')).toBeDisabled();

	// The keyboard shortcut is guarded by the same rule.
	await summary.press('Meta+Enter');
	await page.waitForTimeout(1_000);
	expect(repo.run('log --format=%s').trim()).toBe('Initial');

	await summary.fill('Now it works');
	await expect(byTestId(page, 'commit-btn')).toBeEnabled();
});

test('a failing pre-commit hook blocks the commit unless No verify is checked', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});

	const hook = join(repo.path, '.git', 'hooks', 'pre-commit');

	repo.writeFile('.git/hooks/pre-commit', '#!/bin/sh\necho "hook says no" >&2\nexit 1\n');
	chmodSync(hook, 0o755);

	repo.writeFile('a.txt', 'a changed\n');
	repo.run('add a.txt');

	await openAtWorkingTree(page, repo, openRepo);

	const summary = byTestId(page, 'commit-summary-input').locator('input');

	await summary.fill('Hooked commit');
	await byTestId(page, 'commit-btn').click();

	await expect(byTestId(page, 'hook-output-dialog')).toBeVisible({timeout: 10_000});
	await expect(byTestId(page, 'hook-output-text')).toContainText('hook says no');
	expect(repo.run('log --format=%s').trim()).toBe('Initial');

	await byTestId(page, 'hook-output-close-btn').click();
	await expect(byTestId(page, 'hook-output-dialog')).toHaveCount(0);

	// The rejected attempt keeps the summary, so the retry needs only the checkbox.
	await expect(summary).toHaveValue('Hooked commit');
	await byTestId(page, 'no-verify-checkbox').check();
	await byTestId(page, 'commit-btn').click();

	await expect.poll(() => repo.run('log -1 --format=%s').trim(), {timeout: 10_000}).toBe('Hooked commit');
	await expect(byTestId(page, 'hook-output-dialog')).toHaveCount(0);
});
