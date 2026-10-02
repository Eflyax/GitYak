import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow, selectWorkingTree} from '../fixtures/ui';

test('discard all asks first, and confirming drops tracked and untracked changes', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n', 'b.txt': 'b\n'});
	repo.writeFile('a.txt', 'a changed\n');
	repo.writeFile('b.txt', 'b staged\n');
	repo.run('add b.txt');
	repo.writeFile('dir/untracked.txt', 'junk\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	const before = repo.run('status --porcelain');

	// ── Cancel keeps everything ──────────────────────────────────────────────────
	await byTestId(page, 'discard-all-btn').click();
	await expect(page.locator('.n-card-header__main', {hasText: 'Discard all changes'})).toBeVisible();
	await byTestId(page, 'confirm-dialog-no-btn').click();

	await page.waitForTimeout(1_000);
	expect(repo.run('status --porcelain')).toBe(before);

	// ── Confirm wipes staged, unstaged and untracked changes ─────────────────────
	await byTestId(page, 'discard-all-btn').click();
	await byTestId(page, 'confirm-dialog-yes-btn').click();

	await expect.poll(() => repo.run('status --porcelain').trim(), {timeout: 10_000}).toBe('');
	expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a\n');
	expect(readFileSync(join(repo.path, 'b.txt'), 'utf8')).toBe('b\n');
	expect(existsSync(join(repo.path, 'dir'))).toBe(false);

	await expect(byTestId(page, 'unstaged-file')).toHaveCount(0);
	await expect(byTestId(page, 'staged-file')).toHaveCount(0);
});

test('"Delete file" on a modified file restores its committed content', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n', 'b.txt': 'b\n'});
	repo.writeFile('a.txt', 'a changed\n');
	repo.writeFile('b.txt', 'b changed\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	await byTestId(page, 'unstaged-file').filter({hasText: 'a.txt'}).click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Delete file")').first().click();

	await expect.poll(() => repo.run('status --porcelain').trim(), {timeout: 10_000}).toBe('M b.txt');
	expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a\n');
	// The file itself still exists - "Delete" means discarding the change, not removing it.
	await expect(byTestId(page, 'unstaged-file')).toHaveCount(1);
});

test('"Delete file" on an untracked file removes it', async ({page, repo, openRepo}) => {
	// Known defect: the menu item runs `git restore -- <path>`, which errors for a path git
	// does not know ("did not match any file(s) known to git"), so the untracked file stays.
	test.fail();

	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('untracked.txt', 'junk\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await selectWorkingTree(page);

	await byTestId(page, 'unstaged-file').filter({hasText: 'untracked.txt'}).click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Delete file")').first().click();

	await expect.poll(() => existsSync(join(repo.path, 'untracked.txt')), {timeout: 5_000}).toBe(false);
	await expect(byTestId(page, 'unstaged-file')).toHaveCount(0);
});
