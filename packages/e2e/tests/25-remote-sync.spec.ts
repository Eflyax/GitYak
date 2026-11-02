import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import {createBareRemote, createTempRepo, type ITempRepo} from '../fixtures/repo';

// A second working copy of the same remote: "someone else" who pushes behind our back.
function cloneOf(remotePath: string): ITempRepo {
	const other = createTempRepo({init: false});

	other.run(`clone ${remotePath} .`);

	return other;
}

// Local repo with one commit, pushed to a fresh bare remote and tracking origin/master.
function publish(repo: ITempRepo): {path: string; cleanup: () => void} {
	const remote = createBareRemote();

	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run(`remote add origin ${remote.path}`);
	repo.run('push -u origin master');

	return remote;
}

function remoteHead(remotePath: string, branch = 'master'): string {
	const bare = createTempRepo({init: false});

	try {
		return bare.run(`ls-remote ${remotePath} refs/heads/${branch}`).split(/\s/)[0] ?? '';
	}
	finally {
		bare.cleanup();
	}
}

const errorToast = (page: import('@playwright/test').Page) =>
	page.locator('.n-notification').filter({has: page.locator('.gy-notify--error')});

test('fetch brings in a commit someone else pushed', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
		other.run('push origin master');

		await byTestId(page, 'toolbar-fetch-btn').click();

		await expect.poll(() => repo.run('rev-parse origin/master').trim(), {timeout: 15_000})
			.toBe(remoteHead(remote.path));
		// Fetch only moves the remote-tracking ref; the local branch stays where it was.
		expect(repo.run('rev-parse HEAD').trim()).not.toBe(remoteHead(remote.path));
		await waitForCommitRow(page, 'Pushed by a colleague', 15_000);
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

test('pull fast-forwards the local branch to the remote', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
		other.run('push origin master');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'toolbar-pull-btn').click();

		await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 15_000})
			.toBe(remoteHead(remote.path));
		await waitForCommitRow(page, 'Pushed by a colleague', 15_000);
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

test('push publishes a branch that has no upstream yet and starts tracking it', async ({page, repo, openRepo}) => {
	const remote = publish(repo);

	try {
		repo.run('checkout -b feature');
		repo.commit('Feature work', {'feature.txt': 'feature\n'});

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Feature work');

		await byTestId(page, 'toolbar-push-btn').click();

		await expect.poll(() => remoteHead(remote.path, 'feature'), {timeout: 15_000})
			.toBe(repo.run('rev-parse feature').trim());
		expect(repo.run('rev-parse --abbrev-ref feature@{upstream}').trim()).toBe('origin/feature');
	}
	finally {
		remote.cleanup();
	}
});

// Remote and local each have a commit the other lacks, so a plain push is refused.
async function divergeAndPush(page: import('@playwright/test').Page, repo: ITempRepo, other: ITempRepo): Promise<void> {
	other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
	other.run('push origin master');
	repo.commit('Local only', {'mine.txt': 'mine\n'});

	await byTestId(page, 'toolbar-push-btn').click();
	await expect(byTestId(page, 'push-rejected-dialog')).toBeVisible({timeout: 15_000});
	await expect(byTestId(page, 'push-rejected-stderr')).toContainText('rejected');
}

test('a rejected push offers a dialog, and Cancel leaves both sides untouched', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await divergeAndPush(page, repo, other);

		const localBefore = repo.run('rev-parse HEAD').trim();
		const remoteBefore = remoteHead(remote.path);

		await byTestId(page, 'push-cancel-btn').click();
		await expect(byTestId(page, 'push-rejected-dialog')).toBeHidden();

		expect(repo.run('rev-parse HEAD').trim()).toBe(localBefore);
		expect(remoteHead(remote.path)).toBe(remoteBefore);
		expect(remoteBefore).not.toBe(localBefore);
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

test('force push from the rejection dialog overwrites the remote', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
		other.run('push origin master');

		// --force-with-lease only overwrites what we have seen, so the colleague's commit must
		// be fetched first; without it the lease is stale and git refuses even the force push.
		await byTestId(page, 'toolbar-fetch-btn').click();
		await expect.poll(() => repo.run('rev-parse origin/master').trim(), {timeout: 15_000})
			.toBe(remoteHead(remote.path));

		repo.commit('Local only', {'mine.txt': 'mine\n'});

		await byTestId(page, 'toolbar-push-btn').click();
		await expect(byTestId(page, 'push-rejected-dialog')).toBeVisible({timeout: 15_000});

		await byTestId(page, 'push-force-btn').click();

		await expect.poll(() => remoteHead(remote.path), {timeout: 15_000})
			.toBe(repo.run('rev-parse HEAD').trim());
		// The colleague's commit is gone from the remote branch.
		expect(repo.run('log --format=%s origin/master')).not.toContain('Pushed by a colleague');
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

// "Pull (ff-only)" can only succeed when the local branch is strictly behind: git still
// refuses the push ("fetch first"), but the remote's commits can be fast-forwarded and the
// retried push then has nothing to send.
test('pull (ff-only) from the rejection dialog catches up when the local branch is only behind', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		other.commit('Pushed by a colleague', {'theirs.txt': 'theirs\n'});
		other.run('push origin master');

		await byTestId(page, 'toolbar-push-btn').click();
		await expect(byTestId(page, 'push-rejected-dialog')).toBeVisible({timeout: 15_000});

		await byTestId(page, 'push-pull-btn').click();

		await expect.poll(() => repo.run('rev-parse HEAD').trim(), {timeout: 15_000})
			.toBe(remoteHead(remote.path));
		await waitForCommitRow(page, 'Pushed by a colleague', 15_000);
		// The retried push succeeds, so the dialog does not come back.
		await expect(page.locator('.n-notification').filter({has: page.locator('.gy-notify--success')}))
			.toBeVisible({timeout: 15_000});
		await expect(byTestId(page, 'push-rejected-dialog')).toBeHidden();
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

test('pull (ff-only) on diverged history reports an error and changes nothing', async ({page, repo, openRepo}) => {
	const remote = publish(repo);
	const other = cloneOf(remote.path);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await divergeAndPush(page, repo, other);

		const localBefore = repo.run('rev-parse HEAD').trim();
		const remoteBefore = remoteHead(remote.path);

		await byTestId(page, 'push-pull-btn').click();

		await expect(errorToast(page)).toBeVisible({timeout: 15_000});
		expect(repo.run('rev-parse HEAD').trim()).toBe(localBefore);
		expect(remoteHead(remote.path)).toBe(remoteBefore);
		// No merge commit was made behind the user's back.
		expect(repo.run('rev-list --merges HEAD').trim()).toBe('');
	}
	finally {
		other.cleanup();
		remote.cleanup();
	}
});

test('a local branch with no remote counterpart can be pushed from its context menu', async ({page, repo, openRepo}) => {
	const remote = publish(repo);

	try {
		repo.branch('topic');
		repo.checkout('topic');
		repo.commit('Topic work', {'topic.txt': 'topic\n'});
		repo.checkout('master');

		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Topic work');

		await byTestId(page, 'branch-item-select').filter({hasText: 'topic'}).click({button: 'right'});
		await page.locator('.mx-context-menu-item:has-text("Push")').first().click();

		await expect.poll(() => remoteHead(remote.path, 'topic'), {timeout: 15_000})
			.toBe(repo.run('rev-parse topic').trim());
		expect(repo.run('rev-parse --abbrev-ref topic@{upstream}').trim()).toBe('origin/topic');
	}
	finally {
		remote.cleanup();
	}
});

test('a branch that already exists on the remote offers no Push item', async ({page, repo, openRepo}) => {
	const remote = publish(repo);

	try {
		await openRepo(page, repo.path);
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'branch-item-select').filter({hasText: 'master'}).first().click({button: 'right'});
		await expect(page.locator('.mx-context-menu-item:has-text("Copy name")')).toBeVisible();
		await expect(page.locator('.mx-context-menu-item', {hasText: /^Push$/})).toHaveCount(0);
	}
	finally {
		remote.cleanup();
	}
});

test('fetching from an unreachable remote shows an error and the app stays usable', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	repo.run('remote add origin /nonexistent/gityak-e2e-remote');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	await byTestId(page, 'toolbar-fetch-btn').click();

	await expect(errorToast(page)).toBeVisible({timeout: 15_000});
	await expect(errorToast(page)).toContainText('does not appear to be a git repository');

	// Still responsive: an external commit is picked up and the fetch button is clickable again.
	repo.commit('After the failure', {'after.txt': 'after\n'});
	await waitForCommitRow(page, 'After the failure', 15_000);
	await expect(byTestId(page, 'toolbar-fetch-btn')).toBeEnabled();
});
