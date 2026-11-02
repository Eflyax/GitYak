import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {createBareRemote} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

function menuItem(page: Page, label: string) {
	return page.locator('.mx-context-menu-item', {hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
}

// The tag sits on a commit no branch points at, so its badge is the row's first (and only)
// ref and is rendered without hovering the collapsed badge strip.
function tagBadge(page: Page, name: string) {
	return byTestId(page, `ref-refs/tags/${name}`).first();
}

async function openTagsSection(page: Page): Promise<void> {
	// The TAGS section of the sidebar is collapsed by default.
	await byTestId(page, 'tags-header').click();
}

test('"Create tag here" tags the clicked commit and shows its badge', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Second', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await page.locator('.commit-row__message:has-text("Initial")').first().click({button: 'right'});
	await page.locator('.mx-context-menu-item:has-text("Create tag here")').first().click();
	await byTestId(page, 'reference-name-input').locator('input').fill('v0.1');
	await byTestId(page, 'reference-modal-confirm-btn').click();

	await expect.poll(() => repo.run('tag -l').trim(), {timeout: 10_000}).toBe('v0.1');
	expect(repo.run('rev-parse v0.1^{commit}').trim()).toBe(repo.run('rev-parse master~1').trim());

	await expect(tagBadge(page, 'v0.1')).toBeVisible({timeout: 10_000});
});

test('Delete on a tag badge removes the tag', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('tag v1.0');
	repo.commit('Second', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await tagBadge(page, 'v1.0').click({button: 'right'});
	await menuItem(page, 'Delete').click();

	await expect.poll(() => repo.run('tag -l').trim(), {timeout: 10_000}).toBe('');
	await expect(tagBadge(page, 'v1.0')).toHaveCount(0);
});

test('Push on a local-only tag publishes it to the remote', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin "${remote.path}"`);
		repo.run('push -u origin master');
		repo.run('tag v2.0');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');
		await openTagsSection(page);

		const tagItem = byTestId(page, 'tag-item').filter({hasText: 'v2.0'});

		await tagItem.click({button: 'right'});
		await menuItem(page, 'Push').click();

		await expect.poll(() => repo.run(`ls-remote --tags "${remote.path}"`), {timeout: 10_000})
			.toContain('refs/tags/v2.0');

		// Once the tag is on the remote, Push is no longer offered for it.
		await page.keyboard.press('Escape');
		await expect.poll(async () => {
			await tagItem.click({button: 'right'});
			// Wait for the menu itself, so "Push missing" is not just "menu not drawn yet".
			await menuItem(page, 'Delete').waitFor({state: 'visible'});
			const offered = await menuItem(page, 'Push').isVisible();

			await page.keyboard.press('Escape');

			return offered;
		}, {timeout: 10_000}).toBe(false);
	}
	finally {
		remote.cleanup();
	}
});

test('deleting a tag asks for confirmation first', async ({page, repo, openRepo}) => {
	test.fail();
	// Known defect: the tag Delete menu item runs `git tag -d` immediately, without any
	// confirmation dialog (useBranchMenu.ts, the isTag branch of contextMenuRef).

	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('tag v1.0');
	repo.commit('Second', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await tagBadge(page, 'v1.0').click({button: 'right'});
	await menuItem(page, 'Delete').click();

	await expect(byTestId(page, 'confirm-dialog-yes-btn')).toBeVisible({timeout: 5_000});
	expect(repo.run('tag -l').trim()).toBe('v1.0');
});
