import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import type {ITempRepo} from '../fixtures/repo';

function stashList(repo: ITempRepo): Array<string> {
	const out = repo.run('stash list').trim();

	return out ? out.split('\n') : [];
}

function stashRow(page: Page, subject: string) {
	return byTestId(page, 'commit-row-stash').filter({hasText: subject});
}

test('toolbar stash and pop round-trip tracked changes', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'a changed\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'toolbar-stash-btn').click();

	await expect.poll(() => stashList(repo).length, {timeout: 10_000}).toBe(1);
	expect(repo.run('status --porcelain').trim()).toBe('');
	expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a\n');
	await expect(byTestId(page, 'commit-row-stash')).toHaveCount(1);

	await byTestId(page, 'toolbar-pop-btn').click();

	await expect.poll(() => stashList(repo).length, {timeout: 10_000}).toBe(0);
	expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a changed\n');
	await expect(byTestId(page, 'commit-row-stash')).toHaveCount(0);
});

test('apply and pop target the stash that was right-clicked, not the newest', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n', 'b.txt': 'b\n'});

	// Two stashes touching different files, so each one's effect is unambiguous.
	repo.writeFile('a.txt', 'a from older\n');
	repo.run('stash push -m "older stash"');
	repo.writeFile('b.txt', 'b from newer\n');
	repo.run('stash push -m "newer stash"');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await expect(byTestId(page, 'commit-row-stash')).toHaveCount(2);

	// ── Apply keeps the stash ────────────────────────────────────────────────────
	await stashRow(page, 'older stash').click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Apply stash")').first().click();

	await expect.poll(() => readFileSync(join(repo.path, 'a.txt'), 'utf8'), {timeout: 10_000}).toBe('a from older\n');
	// The newer stash's change was not applied.
	expect(readFileSync(join(repo.path, 'b.txt'), 'utf8')).toBe('b\n');
	expect(stashList(repo)).toHaveLength(2);
	expect(repo.run('stash list')).toContain('older stash');

	// Back to clean so the pop applies without conflicting with the applied copy.
	repo.run('checkout -- a.txt');

	// ── Pop removes exactly that stash ───────────────────────────────────────────
	await stashRow(page, 'older stash').click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Pop stash")').first().click();

	await expect.poll(() => stashList(repo).length, {timeout: 10_000}).toBe(1);
	expect(repo.run('stash list')).toContain('newer stash');
	expect(repo.run('stash list')).not.toContain('older stash');
	expect(readFileSync(join(repo.path, 'a.txt'), 'utf8')).toBe('a from older\n');
	await expect(byTestId(page, 'commit-row-stash')).toHaveCount(1);
});

test('renaming a stash changes its message but keeps its content', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'stashed edit\n');
	repo.run('stash push -m "old name"');

	const treeBefore = repo.run('rev-parse stash@{0}^{tree}').trim();

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await stashRow(page, 'old name').click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Rename")').first().click();

	const input = byTestId(page, 'reference-name-input').locator('input');

	await expect(input).toHaveValue('old name');
	await input.fill('new name');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('stash list'), {timeout: 10_000}).toContain('new name');
	expect(stashList(repo)).toHaveLength(1);
	expect(repo.run('stash list')).not.toContain('old name');
	// Rename re-stores the same stash commit, so the snapshot is untouched.
	expect(repo.run('rev-parse stash@{0}^{tree}').trim()).toBe(treeBefore);
	expect(repo.run('show stash@{0}:a.txt')).toBe('stashed edit\n');
});

test('a renamed stash shows its new name in the graph', async ({page, repo, openRepo}) => {
	// Known defect: rename re-stores the stash with a new reflog message, but the graph lists
	// stashes with `--format=%s` - the stash commit's own subject ("On master: old name"),
	// which a rename never touches - instead of the reflog subject `%gs`. So the row keeps
	// showing the old name although `git stash list` already reports the new one.
	test.fail();

	repo.commit('Initial', {'a.txt': 'a\n'});
	repo.writeFile('a.txt', 'stashed edit\n');
	repo.run('stash push -m "old name"');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await stashRow(page, 'old name').click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Rename")').first().click();
	await byTestId(page, 'reference-name-input').locator('input').fill('new name');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('stash list'), {timeout: 10_000}).toContain('new name');

	await expect(stashRow(page, 'new name')).toBeVisible({timeout: 5_000});
	await expect(stashRow(page, 'old name')).toHaveCount(0);
});
