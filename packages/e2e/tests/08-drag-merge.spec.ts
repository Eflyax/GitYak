import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('drag feature branch onto master triggers Merge context menu', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	repo.run('checkout -b feature');
	repo.commit('Feature work', {'feature.txt': 'feature\n'});

	repo.run('checkout master');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Feature work');

	// Expand local branches in sidebar (should be expanded by default)
	const featureItem = page.locator('[test-id="branch-item-select"]', {hasText: 'feature'}).first();
	const masterItem = page.locator('[test-id="branch-item-select"]', {hasText: 'master'}).first();

	await expect(featureItem).toBeVisible({timeout: 10_000});
	await expect(masterItem).toBeVisible({timeout: 10_000});

	// HTML5 drag is hard to simulate; dispatch events programmatically.
	await page.evaluate(() => {
		const items = document.querySelectorAll('[test-id="branch-item-select"]');
		let src: Element | null = null;
		let tgt: Element | null = null;

		for (const it of Array.from(items)) {
			const txt = (it as HTMLElement).innerText;
			if (txt.includes('feature') && !src) src = it;
			else if (txt.includes('master') && !tgt) tgt = it;
		}

		if (!src || !tgt) throw new Error('Could not find branch items');

		const dt = new DataTransfer();
		src.dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, clientX: 200, clientY: 200}));
	});

	// Context menu should appear with "Merge feature into master"
	const mergeItem = page.locator('.mx-context-menu-item:has-text("Merge feature into master")');

	await expect(mergeItem).toBeVisible({timeout: 5_000});

	await mergeItem.click();

	await page.waitForTimeout(2_000);

	// Verify merge took effect: master now contains feature.txt
	const log = repo.run('log master --format=%s').trim();

	expect(log).toContain('Feature work');
});
