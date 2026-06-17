import type {Page, Locator} from '@playwright/test';

export function byTestId(page: Page, id: string): Locator {
	return page.locator(`[test-id="${id}"]`);
}

export async function waitForRepoLoaded(page: Page): Promise<void> {
	await page.waitForSelector(
		'.commit-history__scroll, [test-id="init-repo-btn"], .commit-history__empty',
		{timeout: 30_000},
	);
}

export async function waitForCommitRow(page: Page, subjectText: string, timeout = 10_000): Promise<void> {
	await page.locator(`.commit-row__message:has-text("${subjectText}")`).waitFor({state: 'visible', timeout});
}
