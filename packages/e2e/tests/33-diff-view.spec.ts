import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
import type {Page} from '@playwright/test';

// Monaco's diff editor renders the two sides as separate editors; their visible text lives
// in `.view-lines`. Monaco swaps spaces for non-breaking ones, so contents below avoid them.
const originalSide = (page: Page) => page.locator('.file-diff .editor.original .view-lines');
const modifiedSide = (page: Page) => page.locator('.file-diff .editor.modified .view-lines');

const errorToast = (page: Page) =>
	page.locator('.n-notification').filter({has: page.locator('.gy-notify--error')});

async function openCommitFile(page: Page, subject: string, fileName: string): Promise<void> {
	await page.locator('.commit-row__message', {hasText: subject}).click();
	await byTestId(page, 'changed-file').filter({hasText: fileName}).click();
	await byTestId(page, 'close-file-diff-btn').waitFor({state: 'visible', timeout: 10_000});
}

test('a file from a commit opens in the diff viewer and Escape returns to the history', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'notes.txt': 'alpha\n'});
	repo.commit('Edit notes', {'notes.txt': 'alpha\nbravo\n'});
	repo.commit('Later commit', {'other.txt': 'other\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Later commit');

	await openCommitFile(page, 'Edit notes', 'notes.txt');

	// The diff is against the commit's parent, not HEAD: the left side lacks "bravo".
	await expect(modifiedSide(page)).toContainText('bravo', {timeout: 15_000});
	await expect(originalSide(page)).toContainText('alpha');
	await expect(originalSide(page)).not.toContainText('bravo');
	// The commit list is replaced by the viewer while it is open.
	await expect(page.locator('.commit-history__scroll')).toHaveCount(0);

	await page.keyboard.press('Escape');

	await expect(byTestId(page, 'close-file-diff-btn')).toHaveCount(0);
	await expect(page.locator('.commit-history__scroll')).toBeVisible();
	await waitForCommitRow(page, 'Edit notes');
});

test('a renamed file shows its content on both sides', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'old-name.txt': 'renamed-content\n'});
	repo.run('mv old-name.txt new-name.txt');
	repo.commit('Rename the file');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Rename the file');

	// git reports the commit as a rename, not a delete + add.
	await page.locator('.commit-row__message', {hasText: 'Rename the file'}).click();
	await expect(byTestId(page, 'changed-file')).toHaveCount(1);
	await expect(byTestId(page, 'changed-file')).toHaveClass(/changed-file--R/);

	await openCommitFile(page, 'Rename the file', 'new-name.txt');

	// The left side is read from the old path; without that it would be empty.
	await expect(originalSide(page)).toContainText('renamed-content', {timeout: 15_000});
	await expect(modifiedSide(page)).toContainText('renamed-content');
	await expect(errorToast(page)).toHaveCount(0);
});

test('a deleted file shows its old content against an empty side', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'doomed.txt': 'soon-gone\n', 'keep.txt': 'keep\n'});
	repo.run('rm doomed.txt');
	repo.commit('Delete the file');

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Delete the file');

	await page.locator('.commit-row__message', {hasText: 'Delete the file'}).click();
	await expect(byTestId(page, 'changed-file')).toHaveClass(/changed-file--D/);

	await openCommitFile(page, 'Delete the file', 'doomed.txt');

	await expect(originalSide(page)).toContainText('soon-gone', {timeout: 15_000});
	await expect(modifiedSide(page)).not.toContainText('soon-gone');
	await expect(errorToast(page)).toHaveCount(0);
});

test('an added binary file opens without an error', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});
	// A NUL byte is what makes git classify the file as binary.
	repo.writeFile('blob.bin', 'BIN\u0000\u0001\u0002tail');
	repo.commit('Add a binary');

	expect(repo.run('diff --numstat HEAD~1 HEAD').trim()).toMatch(/^-\t-\tblob\.bin$/);

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Add a binary');

	await page.locator('.commit-row__message', {hasText: 'Add a binary'}).click();
	await expect(byTestId(page, 'changed-file')).toHaveClass(/changed-file--A/);

	await openCommitFile(page, 'Add a binary', 'blob.bin');

	// There is no binary placeholder: the raw bytes are shown as text on the right, and the
	// left side is empty because the file is new.
	await expect(modifiedSide(page)).toContainText('BIN', {timeout: 15_000});
	await expect(modifiedSide(page)).toContainText('tail');
	await expect(originalSide(page)).not.toContainText('BIN');
	await expect(errorToast(page)).toHaveCount(0);

	await page.keyboard.press('Escape');
	await expect(page.locator('.commit-history__scroll')).toBeVisible();
});
