import {test, expect} from '../fixtures/test';
import {createBareRemote} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('drag local master onto origin/master rebases local commit onto remote', async ({page, repo, openRepo}) => {
	const remote = createBareRemote();

	try {
		repo.commit('Initial', {'README.md': '# repo\n'});
		repo.run(`remote add origin "${remote.path}"`);
		repo.run('push -u origin master');

		// Remote gains a commit the local branch doesn't have
		repo.commit('Remote work', {'remote.txt': 'remote\n'});
		repo.run('push origin master');
		repo.run('reset --hard HEAD~1');

		// Local diverges with its own commit, plus an uncommitted change
		repo.commit('Local work', {'local.txt': 'local\n'});
		repo.run('fetch origin');
		repo.writeFile('README.md', '# repo (uncommitted edit)\n');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Local work');
		await waitForCommitRow(page, 'Remote work');

		// Remote branches section is collapsed by default
		await byTestId(page, 'remote-branches-header').click();

		const remoteItem = page.locator('[test-id="branch-item-select"].branch-item--remote', {hasText: 'master'}).first();

		await expect(remoteItem).toBeVisible({timeout: 10_000});

		// HTML5 drag is hard to simulate; dispatch events programmatically.
		await page.evaluate(() => {
			const items = document.querySelectorAll('[test-id="branch-item-select"]');
			let src: Element | null = null;
			let tgt: Element | null = null;

			for (const it of Array.from(items)) {
				const isRemote = it.classList.contains('branch-item--remote');
				const txt = (it as HTMLElement).innerText;

				if (!txt.includes('master')) continue;
				if (isRemote && !tgt) tgt = it;
				else if (!isRemote && !src) src = it;
			}

			if (!src || !tgt) throw new Error('Could not find branch items');

			const dt = new DataTransfer();
			src.dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt, bubbles: true}));
			tgt.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true}));
			tgt.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, clientX: 200, clientY: 200}));
		});

		// Rebase must be offered despite the dirty working tree (autostash)
		const rebaseItem = page.locator('.mx-context-menu-item:has-text("Rebase master onto origin/master")');

		await expect(rebaseItem).toBeVisible({timeout: 5_000});

		await rebaseItem.click();

		// Interactive rebase modal opens with the single local commit
		const startBtn = byTestId(page, 'rebase-start-btn');

		await expect(startBtn).toBeVisible({timeout: 5_000});

		await startBtn.click();

		// Local commit is replayed on top of the remote one → linear history
		await expect(async () => {
			const log = repo.run('log --format=%s').trim().split('\n');

			expect(log).toEqual(['Local work', 'Remote work', 'Initial']);
		}).toPass({timeout: 10_000});

		// The uncommitted change survived the autostash round-trip
		expect(repo.run('status --porcelain')).toContain('M README.md');
	}
	finally {
		remote.cleanup();
	}
});
