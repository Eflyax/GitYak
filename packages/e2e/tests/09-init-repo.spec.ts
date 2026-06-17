import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded} from '../fixtures/ui';
import {createTempRepo} from '../fixtures/repo';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

test('initializing an empty folder creates a master branch with Initial commit and README.md', async ({page, openRepo}) => {
	// Override default repo: we want a folder WITHOUT git
	const emptyDir = createTempRepo({init: false});

	try {
		await openRepo(page, emptyDir.path, 'Fresh Repo');
		await waitForRepoLoaded(page);

		const initBtn = byTestId(page, 'init-repo-btn');

		await expect(initBtn).toBeVisible({timeout: 10_000});
		await initBtn.click();

		// Confirm dialog
		await expect(page.locator('.n-card-header__main', {hasText: 'Initialize repository'})).toBeVisible();
		await page.locator('[test-id="confirm-dialog-yes-btn"]').click();

		// Wait for repo to be initialized
		await page.waitForTimeout(3_000);

		expect(existsSync(join(emptyDir.path, '.git'))).toBe(true);
		expect(existsSync(join(emptyDir.path, 'README.md'))).toBe(true);

		const log = emptyDir.run('log --format=%s').trim();
		expect(log).toBe('Initial commit');

		const branch = emptyDir.run('branch --show-current').trim();
		expect(branch).toBe('master');
	}
	finally {
		emptyDir.cleanup();
	}
});
