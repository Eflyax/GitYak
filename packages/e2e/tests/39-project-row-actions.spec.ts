import {test, expect} from '../fixtures/test';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

// The row's actions are icon-only, so each one has to say what it does on hover.
const TITLES: Array<[string, string]> = [
	['project-open-btn', 'Open'],
	['project-edit-btn', 'Edit'],
	['project-duplicate-btn', 'Duplicate'],
	['project-delete-btn', 'Delete'],
];

test('each row action names itself', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await byTestId(page, 'open-repo-manager-btn').click();

	for (const [id, title] of TITLES) {
		await expect(byTestId(page, id).first()).toHaveAttribute('title', title);
	}
});

test('the row actions still open, edit and duplicate the project', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'a.txt': 'a\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
	await byTestId(page, 'open-repo-manager-btn').click();

	// Edit opens the form on that project.
	await byTestId(page, 'project-edit-btn').first().click();
	await expect(byTestId(page, 'alias-input').locator('input')).toHaveValue('Test Project');
	await byTestId(page, 'project-form-cancel-btn').click();

	// Duplicate adds a copy to the list.
	await byTestId(page, 'project-duplicate-btn').first().click();
	await byTestId(page, 'project-form-save-btn').click();
	await expect(byTestId(page, 'project-open-btn')).toHaveCount(2);

	// Delete removes it again.
	await byTestId(page, 'project-delete-btn').last().click();
	await page.locator('.n-button', {hasText: 'Remove'}).first().click();
	await expect(byTestId(page, 'project-open-btn')).toHaveCount(1);

	// Open loads the repository.
	await byTestId(page, 'project-open-btn').first().click();
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');
});
