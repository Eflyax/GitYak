import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {createBareRemote} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// Error feedback in the app comes in two shapes: Naive UI's `message.error` (used by the
// modals) and the `useNotify` toasts, which tag their content with `gy-notify--error`.
const ERROR_FEEDBACK = '.n-message--error-type, .n-notification:has(.gy-notify--error)';

function sidebarLocalBranch(page: Page, name: string) {
	return page.locator('[test-id="branch-item-select"]:not(.branch-item--remote)', {
		has: page.locator('.branch-item__name', {hasText: new RegExp(`^${name}$`)}),
	});
}

function menuItem(page: Page, label: string) {
	return page.locator('.mx-context-menu-item', {hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
}

// Badges collapse to the first ref of a row until hovered, so a row that should expose a
// specific badge is given exactly one ref in these tests.
function refBadge(page: Page, id: string) {
	return byTestId(page, `ref-${id}`).first();
}

test('the toolbar Branch button creates a branch and checks it out', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'toolbar-branch-btn').click();
	await byTestId(page, 'reference-name-input').locator('input').fill('feature/toolbar');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('branch --show-current').trim(), {timeout: 10_000})
		.toBe('feature/toolbar');
	expect(repo.run('rev-parse feature/toolbar')).toBe(repo.run('rev-parse master'));
});

test('"Create branch here" points the new branch at the clicked commit', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Second', {'a.txt': 'a\n'});

	const initialHash = repo.run('rev-parse HEAD~1').trim();

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await page.locator('.commit-row__message:has-text("Initial")').first().click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Create branch here")').first().click();
	await byTestId(page, 'reference-name-input').locator('input').fill('from-initial');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('branch --list from-initial').trim(), {timeout: 10_000})
		.toContain('from-initial');
	// Not the tip of master: the branch must sit on the commit that was right-clicked.
	expect(repo.run('rev-parse from-initial').trim()).toBe(initialHash);
});

test('an invalid branch name is reported in the modal and creates nothing', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'toolbar-branch-btn').click();
	await byTestId(page, 'reference-name-input').locator('input').fill('foo..bar');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect(page.locator(ERROR_FEEDBACK).first()).toBeVisible({timeout: 10_000});
	// The modal stays open so the name can be corrected.
	await expect(byTestId(page, 'reference-name-input')).toBeVisible();

	expect(repo.run('branch --list').trim()).toBe('* master');
	expect(repo.run('branch --show-current').trim()).toBe('master');
});

test('clicking a local branch in the sidebar checks it out', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.branch('other');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await sidebarLocalBranch(page, 'other').click();

	await expect.poll(() => repo.run('branch --show-current').trim(), {timeout: 10_000})
		.toBe('other');
});

test('double-clicking a remote-only branch badge creates a tracking branch', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin "${remote.path}"`);
		repo.run('push -u origin master');

		// `feature` exists only on the remote, on a commit of its own so its badge is the
		// only ref on that row.
		repo.run('checkout -b feature');
		repo.commit('Feature work', {'f.txt': 'f\n'});
		repo.run('push origin feature');
		repo.checkout('master');
		repo.run('branch -D feature');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Feature work');

		await refBadge(page, 'branch:feature').dblclick();

		await expect.poll(() => repo.run('branch --show-current').trim(), {timeout: 10_000})
			.toBe('feature');
		expect(repo.run('rev-parse --abbrev-ref feature@{upstream}').trim()).toBe('origin/feature');
	}
	finally {
		remote.cleanup();
	}
});

test('double-clicking a tag badge detaches HEAD at the tagged commit', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('tag v1.0');
	repo.commit('Later', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await refBadge(page, 'refs/tags/v1.0').dblclick();

	await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 10_000})
		.toBe(repo.run('rev-parse v1.0^{commit}').trim());
	// Detached: no branch is checked out.
	expect(repo.run('branch --show-current').trim()).toBe('');
});

test('double-click checkout with a dirty tree stashes the changes instead of losing them', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.branch('other');
	repo.commit('Master tip', {'m.txt': 'm\n'});
	repo.writeFile('README.md', '# repo (uncommitted edit)\n');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await refBadge(page, 'branch:other').dblclick();

	await expect.poll(() => repo.run('branch --show-current').trim(), {timeout: 10_000})
		.toBe('other');

	// The edit was set aside, not discarded: it lives in the stash.
	expect(repo.run('stash list').trim().split('\n')).toHaveLength(1);
	expect(repo.run('stash show -p stash@{0}')).toContain('+# repo (uncommitted edit)');
});

test.describe('deleting a branch from the sidebar', () => {
	for (const scope of ['Local', 'Remote', 'Both'] as const) {
		test(`Delete → ${scope}`, async ({page, repo, openRepo}) => {
			const remote = createBareRemote();

			try {
				repo.commit('Initial', {'README.md': '# repo\n'});
				repo.run(`remote add origin "${remote.path}"`);
				repo.run('push -u origin master');
				repo.branch('doomed');
				repo.run('push -u origin doomed');

				await openRepo(page, repo.path);
				await waitForRepoLoaded(page);
				await waitForCommitRow(page, 'Initial');

				await sidebarLocalBranch(page, 'doomed').click({button: 'right'});
				await menuItem(page, 'Delete').hover();
				await menuItem(page, scope).click();

				const localGone = scope !== 'Remote';
				const remoteGone = scope !== 'Local';

				await expect.poll(() => repo.run(`ls-remote --heads "${remote.path}" doomed`).trim(), {timeout: 10_000})
					.toEqual(remoteGone ? '' : expect.stringContaining('refs/heads/doomed'));
				await expect.poll(() => repo.run('branch --list doomed').trim(), {timeout: 10_000})
					.toBe(localGone ? '' : 'doomed');
				// The other branch is untouched either way.
				expect(repo.run(`ls-remote --heads "${remote.path}" master`)).toContain('refs/heads/master');
			}
			finally {
				remote.cleanup();
			}
		});
	}
});

test('the filter input narrows the branch list', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.branch('feature-alpha');
	repo.branch('feature-beta');
	repo.branch('bugfix-gamma');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	const localItems = page.locator('[test-id="branch-item-select"]:not(.branch-item--remote)');

	await expect(localItems).toHaveCount(4);

	await byTestId(page, 'filter-branches-input').locator('input').fill('feature');

	await expect(localItems).toHaveCount(2);
	await expect(sidebarLocalBranch(page, 'feature-alpha')).toBeVisible();
	await expect(sidebarLocalBranch(page, 'feature-beta')).toBeVisible();
	await expect(sidebarLocalBranch(page, 'bugfix-gamma')).toHaveCount(0);
});

test('deleting a branch asks for confirmation first', async ({page, repo, openRepo}) => {
	test.fail();
	// Known defect: the Delete menu item runs `git branch -D` immediately — no confirmation,
	// even though -D throws away unmerged commits (useBranchMenu.ts, deleteChildren).

	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('checkout -b unmerged');
	repo.commit('Only on unmerged', {'u.txt': 'u\n'});
	repo.checkout('master');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await sidebarLocalBranch(page, 'unmerged').click({button: 'right'});
	await menuItem(page, 'Delete').click();

	await expect(byTestId(page, 'confirm-dialog-yes-btn')).toBeVisible({timeout: 5_000});
	expect(repo.run('branch --list unmerged').trim()).toBe('unmerged');
});

test('a failing context-menu action tells the user', async ({page, repo, openRepo}) => {
	test.fail();
	// Known defect: context-menu onClick handlers have no try/catch, so a failing git command
	// only rejects a promise nobody awaits — the user sees nothing.

	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.branch('feature');
	// A remote that does not exist on disk: any push to it fails deterministically.
	repo.run('remote add origin /nonexistent/gityak-e2e-remote.git');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await sidebarLocalBranch(page, 'feature').click({button: 'right'});
	await menuItem(page, 'Push').click();

	await expect(page.locator(ERROR_FEEDBACK).first()).toBeVisible({timeout: 10_000});
});
