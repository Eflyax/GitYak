import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {byTestId, waitForCommitRow, waitForRepoLoaded} from '../fixtures/ui';

// The rows of the full list; Recent shows the same projects a second time.
function allRows(page: Page) {
	return page.locator('[test-id="all-projects"] [test-id="project-row"]');
}

function input(page: Page, id: string) {
	return byTestId(page, id).locator('input');
}

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'gityak-e2e-action-'));
}

// The app may still be writing into a repository it just opened when the test ends.
function removeDir(path: string): void {
	rmSync(path, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}

// git exits 1 with no output for a key that is not set; execSync would throw on that.
function git(cwd: string, args: Array<string>): {status: number | null; stdout: string} {
	const result = spawnSync('git', args, {cwd, encoding: 'utf8'});

	return {status: result.status, stdout: result.stdout.trim()};
}

// A local HTTP "remote": `handler` decides what git's first request gets.
async function httpRemote(handler: Parameters<typeof createServer>[1]): Promise<{url: string; server: Server}> {
	const server = createServer(handler);

	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

	return {url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/repo.git`, server};
}

function closeRemote(server: Server): void {
	server.closeAllConnections();
	server.close();
}

// No projects and nothing open: the manager is the main view.
async function startEmpty(page: Page): Promise<void> {
	await page.addInitScript(() => {
		if (sessionStorage.getItem('e2e:seeded')) return;

		sessionStorage.setItem('e2e:seeded', '1');
		localStorage.setItem('git-yak:projects', '[]');
		localStorage.removeItem('git-yak:lastProjectId');
	});
	await page.goto('/');
	await expect(byTestId(page, 'project-manager')).toBeVisible();
}

function storedProjects(page: Page): Promise<Array<{alias: string; path: string}>> {
	return page.evaluate(() => JSON.parse(localStorage.getItem('git-yak:projects') ?? '[]') as Array<{alias: string; path: string}>);
}

async function openFolder(page: Page, folder: string): Promise<void> {
	await byTestId(page, 'repo-action-open').click();
	await input(page, 'folder-input').fill(folder);
	await expect(byTestId(page, 'repo-action-submit')).toHaveText(/Add & open/);
	await byTestId(page, 'repo-action-submit').click();
}

test.describe('open, clone and create from the project manager', () => {
	test('Open adds the repository root of a subfolder, and opening it again adds nothing', async ({page, repo}) => {
		repo.commit('Initial', {'sub/a.txt': 'a\n'});

		await startEmpty(page);
		await openFolder(page, join(repo.path, 'sub'));

		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Initial');

		const projects = await storedProjects(page);
		expect(projects).toHaveLength(1);
		expect(projects[0].path).toBe(realpathSync(repo.path));
		expect(projects[0].alias).toBe(basename(repo.path));

		await byTestId(page, 'open-repo-manager-btn').click();
		await expect(allRows(page)).toHaveCount(1);

		await openFolder(page, join(repo.path, 'sub'));
		await expect(byTestId(page, 'project-manager')).toHaveCount(0);
		await waitForCommitRow(page, 'Initial');

		await byTestId(page, 'open-repo-manager-btn').click();
		await expect(allRows(page)).toHaveCount(1);
	});

	test('Open of a folder without git says so and adds nothing', async ({page}) => {
		const plain = tempDir();

		try {
			await startEmpty(page);
			await openFolder(page, plain);

			await expect(byTestId(page, 'repo-action-error')).toContainText('is not a git repository');
			await expect(input(page, 'folder-input')).toHaveValue(plain);
			expect(await storedProjects(page)).toHaveLength(0);
		}
		finally {
			removeDir(plain);
		}
	});

	test('Clone takes the folder name from the URL and opens the clone', async ({page, repo}) => {
		repo.commit('Initial', {'a.txt': 'a\n'});
		const parent = tempDir();

		try {
			await startEmpty(page);
			await byTestId(page, 'repo-action-clone').click();

			// Nothing to clone yet.
			await expect(byTestId(page, 'repo-action-submit')).toBeDisabled();

			await input(page, 'clone-url-input').fill(repo.path);
			await input(page, 'parent-folder-input').fill(parent);
			await expect(input(page, 'folder-name-input')).toHaveValue(basename(repo.path));
			await expect(byTestId(page, 'target-path-preview')).toContainText(join(parent, basename(repo.path)));
			await expect(byTestId(page, 'repo-action-submit')).toHaveText(/Clone & open/);
			await byTestId(page, 'repo-action-submit').click();

			await waitForRepoLoaded(page);
			await waitForCommitRow(page, 'Initial', 30_000);

			const clone = join(parent, basename(repo.path));
			expect(existsSync(join(clone, '.git'))).toBe(true);
			// The clone-time SSH options are not left behind in the clone's config.
			expect(git(clone, ['config', '--get', 'core.sshCommand'])).toEqual({status: 1, stdout: ''});
		}
		finally {
			removeDir(parent);
		}
	});

	test('Clone into an existing folder that is not empty is refused', async ({page, repo}) => {
		repo.commit('Initial', {'a.txt': 'a\n'});
		const parent = tempDir();

		mkdirSync(join(parent, 'taken'));
		writeFileSync(join(parent, 'taken', 'keep.txt'), 'keep\n');

		try {
			await startEmpty(page);
			await byTestId(page, 'repo-action-clone').click();
			await input(page, 'clone-url-input').fill(repo.path);
			await input(page, 'parent-folder-input').fill(parent);
			await input(page, 'folder-name-input').fill('taken');
			await byTestId(page, 'repo-action-submit').click();

			await expect(byTestId(page, 'repo-action-error')).toContainText('already exists and is not empty');
			// The form keeps what was typed.
			await expect(input(page, 'folder-name-input')).toHaveValue('taken');
			expect(await storedProjects(page)).toHaveLength(0);
			expect(existsSync(join(parent, 'taken', '.git'))).toBe(false);
		}
		finally {
			removeDir(parent);
		}
	});

	test('an HTTPS clone that needs credentials fails with git\'s error instead of waiting for a prompt', async ({page}) => {
		const parent = tempDir();
		const remote = await httpRemote((_req, res) => {
			res.writeHead(401, {'WWW-Authenticate': 'Basic realm="e2e"'});
			res.end();
		});

		try {
			await startEmpty(page);
			await byTestId(page, 'repo-action-clone').click();
			await input(page, 'clone-url-input').fill(remote.url);
			await input(page, 'parent-folder-input').fill(parent);
			await byTestId(page, 'repo-action-submit').click();

			await expect(byTestId(page, 'repo-action-error')).toContainText('terminal prompts disabled', {timeout: 20_000});
			expect(await storedProjects(page)).toHaveLength(0);
		}
		finally {
			closeRemote(remote.server);
			removeDir(parent);
		}
	});

	test('leaving a running clone asks first; declining keeps the clone and its form', async ({page}) => {
		const parent = tempDir();
		// Never answers, so the clone stays running for as long as the test needs.
		const remote = await httpRemote(() => {});

		try {
			await startEmpty(page);
			await byTestId(page, 'repo-action-clone').click();
			await input(page, 'clone-url-input').fill(remote.url);
			await input(page, 'parent-folder-input').fill(parent);
			await byTestId(page, 'repo-action-submit').click();

			await expect(byTestId(page, 'clone-output')).toBeVisible();
			// The elapsed time keeps moving while git reports nothing.
			await expect(byTestId(page, 'repo-action-elapsed')).toHaveText(/^0:0[1-9]$/, {timeout: 5_000});

			await byTestId(page, 'repo-action-open').click();
			const dialog = page.locator('.n-dialog', {hasText: 'A clone is running'});
			await expect(dialog).toBeVisible();
			await dialog.locator('.n-button', {hasText: 'Stay'}).click();
			await expect(dialog).toHaveCount(0);
			await expect(byTestId(page, 'clone-output')).toBeVisible();
			await expect(input(page, 'clone-url-input')).toHaveValue(remote.url);

			await byTestId(page, 'repo-action-open').click();
			await page.locator('.n-dialog', {hasText: 'A clone is running'}).locator('.n-button', {hasText: 'Leave'}).click();
			await expect(input(page, 'folder-input')).toBeVisible();
		}
		finally {
			closeRemote(remote.server);
			removeDir(parent);
		}
	});

	test('Create makes a repository on the chosen branch, which the app seeds with an Initial commit', async ({page}) => {
		const parent = tempDir();
		const created = join(parent, 'new-repo');

		try {
			await startEmpty(page);
			await byTestId(page, 'repo-action-create').click();
			await input(page, 'parent-folder-input').fill(parent);
			await input(page, 'folder-name-input').fill('new-repo');
			await expect(input(page, 'initial-branch-input')).toHaveValue('main');

			// A name git would refuse keeps the button disabled.
			await input(page, 'initial-branch-input').fill('bad name');
			await expect(byTestId(page, 'repo-action-submit')).toBeDisabled();
			await input(page, 'initial-branch-input').fill('main');

			// The form says up front what opening the new repository adds to it.
			await expect(byTestId(page, 'create-commit-note')).toHaveText('README.md and an \'Initial commit\' will be created on main.');
			await expect(byTestId(page, 'repo-action-submit')).toHaveText(/Create & open/);
			await byTestId(page, 'repo-action-submit').click();

			await expect(byTestId(page, 'project-manager')).toHaveCount(0);
			await waitForRepoLoaded(page);
			// Opening a repository without commits seeds it; the history shows once that is done.
			await waitForCommitRow(page, 'Initial commit');

			expect(existsSync(join(created, '.git'))).toBe(true);
			expect(git(created, ['symbolic-ref', 'HEAD']).stdout).toBe('refs/heads/main');
			expect(git(created, ['log', '--format=%s']).stdout).toBe('Initial commit');
			expect(existsSync(join(created, 'README.md'))).toBe(true);

			const projects = await storedProjects(page);
			expect(projects.map(p => p.alias)).toEqual(['new-repo']);
		}
		finally {
			removeDir(parent);
		}
	});
});
