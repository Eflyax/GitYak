import {realpathSync} from 'node:fs';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import {
	DUBIOUS_OWNERSHIP_PORT,
	resetDubiousOwnershipConfig,
	safeDirectories,
} from '../fixtures/dubiousOwnership';

// These run against the backend that treats every repository as owned by another user, so
// git answers with the real "detected dubious ownership" refusal.
//
// git names the resolved directory in that refusal, and the exception has to be recorded for
// exactly that path — on macOS the fixture's /var/folders/… is a symlink into /private/var.
test.beforeEach(() => resetDubiousOwnershipConfig());

test('a repository git refuses to trust offers to add the exception', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path, 'Dubious Project', DUBIOUS_OWNERSHIP_PORT);

	const dialog = byTestId(page, 'safe-directory-dialog');

	await expect(dialog).toBeVisible({timeout: 15_000});
	// The exact directory git named, so the user confirms what will be trusted.
	await expect(dialog).toContainText(realpathSync(repo.path));

	expect(safeDirectories()).toEqual([]);

	await byTestId(page, 'safe-directory-add-btn').click();

	await expect.poll(() => safeDirectories(), {timeout: 15_000}).toContain(realpathSync(repo.path));

	// With the exception in place the repository loads normally.
	await expect(dialog).toHaveCount(0);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
});

test('declining leaves the global config untouched', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path, 'Dubious Project', DUBIOUS_OWNERSHIP_PORT);

	await expect(byTestId(page, 'safe-directory-dialog')).toBeVisible({timeout: 15_000});
	await byTestId(page, 'safe-directory-cancel-btn').click();

	await expect(byTestId(page, 'safe-directory-dialog')).toHaveCount(0);
	expect(safeDirectories()).toEqual([]);
});

test('the prompt appears once, not once per failed command', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path, 'Dubious Project', DUBIOUS_OWNERSHIP_PORT);

	await expect(byTestId(page, 'safe-directory-dialog')).toBeVisible({timeout: 15_000});

	// Opening a repository fires several git commands at once and each one is refused.
	await expect(byTestId(page, 'safe-directory-dialog')).toHaveCount(1);
});
