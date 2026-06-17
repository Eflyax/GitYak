import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('cherry-pick a feature commit onto master via context menu', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	repo.run('checkout -b feature');
	repo.commit('Feature work', {'feature.txt': 'feature content\n'});

	repo.run('checkout master');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature work');

	// Right-click the feature commit row
	const featureRow = page.locator('.commit-row__message', {hasText: 'Feature work'});

	await featureRow.click({button: 'right'});

	await page.locator('.mx-context-menu-item:has-text("Cherry pick")').first().click();

	// After cherry-pick, the feature commit's subject should now appear on master too —
	// since git deduplicates by subject, we look for the file in the worktree by reload.
	await page.waitForTimeout(2_000);

	const log = repo.run('log --format=%s master');

	expect(log).toContain('Feature work');
});
