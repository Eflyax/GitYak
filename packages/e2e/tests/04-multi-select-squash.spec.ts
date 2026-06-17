import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('multi-select two consecutive commits and squash via context menu', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.commit('Step one', {'a.txt': 'aaa\n'});
	repo.commit('Step two', {'b.txt': 'bbb\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Step two');

	const stepOneRow = page.locator('.commit-row', {hasText: 'Step one'});
	const stepTwoRow = page.locator('.commit-row', {hasText: 'Step two'});

	// Single-click step two
	await stepTwoRow.click();

	// CMD/CTRL+click step one to add it to selection
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

	await stepOneRow.click({modifiers: [modifier]});

	// CommitDetails should now show multi-selection summary
	await expect(byTestId(page, 'commit-details-multi-summary')).toBeVisible();
	await expect(byTestId(page, 'commit-details-multi-summary')).toContainText('2 commits');

	// Right-click one of the selected rows
	await stepTwoRow.click({button: 'right'});

	const squashItem = page.locator('.mx-context-menu-item:has-text("Squash 2 commits")');

	await expect(squashItem).toBeVisible();
	await expect(squashItem).not.toHaveClass(/mx-disabled/);

	await squashItem.click();

	// Commit form is prefilled — fill summary if blank and commit
	const summaryInput = byTestId(page, 'commit-summary-input').locator('input');
	const value = await summaryInput.inputValue();

	expect(value.length).toBeGreaterThan(0);

	await byTestId(page, 'commit-btn').click();

	// After squash there should be 2 regular commits total (Initial + squashed)
	await page.waitForTimeout(2_000);

	const logLines = repo.run('log --format=%s').trim().split('\n');

	expect(logLines.length).toBe(2);
});
