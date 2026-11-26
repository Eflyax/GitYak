import {execFileSync} from 'node:child_process';
import {lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {Page} from '@playwright/test';
import {test} from '../fixtures/test';
import {byTestId, selectWorkingTree, waitForRepoLoaded} from '../fixtures/ui';

const
	repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
	outDir = join(repoRoot, 'packages', 'website', 'public', 'screenshots'),
	themeDir = join(outDir, 'themes'),
	tmpRoot = mkdtempSync(join(tmpdir(), 'gityak-shots-'));

let clones = 0;

// The part of the 1440x900 window each picture on the website shows (CSS pixels; saved at 2x).
const CLIPS = {
	staging:    {x: 583, y: 50, width: 857, height: 850},     // the new side of the diff and the staging panel
	rebase:     {x: 370, y: 240, width: 700, height: 452},    // the interactive rebase dialog on the dimmed history
	conflict:   {x: 88, y: 90, width: 704, height: 454},      // the conflict bar, the current side and the first conflict
	imageDiff:  {x: 88, y: 50, width: 1020, height: 850},    // the SVG diff and the logo before and after
	projects:   {x: 371, y: 288, width: 706, height: 446},    // the repository list
	sshProject: {x: 432, y: 93, width: 576, height: 411},     // the form of a server project
};

// GitYak's own history makes a realistic graph. Every scene gets a fresh clone, so it is
// independent of whatever is uncommitted in the working copy and of the other scenes.
function freshClone(): string {
	const clone = join(tmpRoot, `GitYak-${++clones}`);

	execFileSync('git', ['clone', '--quiet', '--no-local', repoRoot, clone]);

	return clone;
}

function git(cwd: string, ...args: Array<string>): string {
	return execFileSync('git', args, {cwd, stdio: ['pipe', 'pipe', 'pipe']}).toString();
}

function edit(clone: string, file: string, change: (text: string) => string): void {
	const path = join(clone, file);

	writeFileSync(path, change(readFileSync(path, 'utf8')));
}

function commitFile(clone: string, file: string, content: string, message: string): void {
	const path = join(clone, file);

	mkdirSync(dirname(path), {recursive: true});
	writeFileSync(path, content);
	git(clone, 'add', file);
	git(clone, 'commit', '--quiet', '-m', message);
}

// Removes a symlink this spec made; anything else at that path is left alone.
function removeLink(path: string): void {
	try {
		if (lstatSync(path).isSymbolicLink()) {
			unlinkSync(path);
		}
	}
	catch {
		// nothing there
	}
}

async function openClone(page: Page, openRepo: (page: Page, path: string, alias?: string) => Promise<void>, clone: string): Promise<void> {
	await openRepo(page, clone, 'GitYak');
	await waitForRepoLoaded(page);
	await page.locator('.commit-row').nth(12).waitFor();
}

async function settle(page: Page): Promise<void> {
	await page.mouse.move(0, 899);
	await page.waitForTimeout(800);
}

test.afterAll(() => {
	removeLink('/tmp/GitYak');
	rmSync(tmpRoot, {recursive: true, force: true});
});

test('history', async ({page, openRepo}) => {
	await openClone(page, openRepo, freshClone());
	await page.locator('.commit-row').nth(3).click();
	await settle(page);
	await page.screenshot({path: join(outDir, 'history.png')});
	// a copy for 1x screens
	await page.screenshot({path: join(outDir, 'history-1440.png'), scale: 'css'});
});

test('image diff', async ({page, openRepo}) => {
	const clone = freshClone();

	edit(clone, 'assets/logo.svg', text => text.replace(/#8956FB/gi, '#20B2AA'));
	await openClone(page, openRepo, clone);
	await selectWorkingTree(page);
	await byTestId(page, 'unstaged-file').filter({hasText: 'logo.svg'}).click();
	await byTestId(page, 'image-preview').waitFor();
	await settle(page);
	await page.screenshot({path: join(outDir, 'image-diff.png'), clip: CLIPS.imageDiff});
});

// A change in progress: two hunks in one file, a staged README, a new theme file.
test('staging', async ({page, openRepo}) => {
	const clone = freshClone();

	edit(clone, 'packages/client/src/composables/useTheme.ts', text => text
		.replace('const DEFAULT_THEMES_DIR = \'~/.git-yak/themes\';', 'const DEFAULT_THEMES_DIR = \'~/.config/git-yak/themes\';')
		.replace('primaryColor: \'#6f9ef8\',', 'primaryColor: \'#8956fb\',')
		.replace('primaryColorHover: \'#8fb4ff\',', 'primaryColorHover: \'#a07cfc\','));
	edit(clone, 'README.md', text => `${text.trimEnd()}\n\nCustom themes live in \`~/.config/git-yak/themes\`.\n`);
	edit(clone, 'themes/nord-aurora.jsonc', text => text.replace('"Nord Aurora"', '"Nord Aurora Night"'));
	git(clone, 'add', 'README.md');

	await openClone(page, openRepo, clone);
	await selectWorkingTree(page);
	await byTestId(page, 'commit-summary-input').locator('input').fill('Move custom themes under ~/.config');
	await byTestId(page, 'unstaged-file').filter({hasText: 'useTheme.ts'}).click();
	await byTestId(page, 'hunk-stage-btn-1').waitFor();
	await settle(page);
	await page.screenshot({path: join(outDir, 'staging.png'), clip: CLIPS.staging});
});

// A feature branch with a fixup commit, rebased onto master in the interactive rebase dialog.
test('interactive rebase', async ({page, openRepo}) => {
	const clone = freshClone();

	git(clone, 'checkout', '--quiet', '-b', 'feature/theme-folder');
	commitFile(clone, 'packages/client/src/infrastructure/themesDir.ts', 'export const THEMES_DIR = \'~/.config/git-yak/themes\';\n', 'Read custom themes from ~/.config/git-yak');
	commitFile(clone, 'packages/client/src/infrastructure/migrateThemes.ts', 'export async function migrateThemes(): Promise<void> {}\n', 'Move themes from the old folder on start');
	commitFile(clone, 'packages/client/src/infrastructure/migrateThemes.ts', 'export async function migrateThemes(): Promise<void> {\n\t// copy, then remove\n}\n', 'fix typo in migration');
	commitFile(clone, 'docs-themes.md', 'Custom themes live in ~/.config/git-yak/themes.\n', 'Document the new themes folder');
	git(clone, 'checkout', '--quiet', 'master');
	commitFile(clone, 'packages/client/src/infrastructure/version.ts', 'export const VERSION = \'2.1.0\';\n', 'Release 2.1.0');

	await openClone(page, openRepo, clone);
	await page.evaluate(({source, target}) => {
		const items = Array.from(document.querySelectorAll('[test-id="branch-item-select"]:not(.branch-item--remote)'));
		const byName = (name: string): Element | undefined =>
			items.find(it => it.querySelector('.branch-item__name')?.textContent?.trim() === name);
		const src = byName(source);
		const tgt = byName(target);

		if (!src || !tgt) throw new Error('Could not find branch items');

		const dt = new DataTransfer();
		src.dispatchEvent(new DragEvent('dragstart', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true}));
		tgt.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, clientX: 200, clientY: 200}));
	}, {source: 'feature/theme-folder', target: 'master'});
	await page.locator('.mx-context-menu-item:has-text("Rebase feature/theme-folder onto master…")').click();
	await byTestId(page, 'rebase-start-btn').waitFor();
	await byTestId(page, 'rebase-step').filter({hasText: 'fix typo in migration'}).locator('[test-id="rebase-fixup-btn"]').click();
	await byTestId(page, 'rebase-step').filter({hasText: 'Document the new themes folder'}).locator('[test-id="rebase-reword-btn"]').click();
	await settle(page);
	await page.screenshot({path: join(outDir, 'rebase.png'), clip: CLIPS.rebase});
});

// A merge that stops on two conflicts in one theme file, opened in the conflict editor.
test('conflict', async ({page, openRepo}) => {
	const clone = freshClone();
	const file = 'themes/nord-aurora.jsonc';

	git(clone, 'checkout', '--quiet', '-b', 'feature/warmer-nord');
	edit(clone, file, text => text.replace('"red": "#BF616A",', '"red": "#D0707A",').replace('"app__bg0": "#2E3440",', '"app__bg0": "#323846",'));
	git(clone, 'commit', '--quiet', '-am', 'Warmer reds and background in Nord');
	git(clone, 'checkout', '--quiet', 'master');
	edit(clone, file, text => text.replace('"red": "#BF616A",', '"red": "#C5636D",').replace('"app__bg0": "#2E3440",', '"app__bg0": "#2B303B",'));
	git(clone, 'commit', '--quiet', '-am', 'Darker background in Nord');

	try {
		git(clone, 'merge', '--quiet', 'feature/warmer-nord');
	}
	catch {
		// Exits non-zero on the conflict, which is the point.
	}

	await openClone(page, openRepo, clone);
	await selectWorkingTree(page);
	await page.locator('[test-id="unstaged-file"]', {hasText: 'nord-aurora.jsonc'}).first().click();
	await byTestId(page, 'conflict-result-editor').locator('.view-lines').filter({hasText: '<<<<<<<'}).waitFor({timeout: 15_000});
	await settle(page);
	await page.screenshot({path: join(outDir, 'conflict.png'), clip: CLIPS.conflict});
});

// The repository list: this clone on the laptop beside repositories on servers over SSH.
test('project manager', async ({page}) => {
	// A short path to show in the list: /tmp/GitYak points at the clone.
	const clone = '/tmp/GitYak';

	removeLink(clone);
	symlinkSync(freshClone(), clone);
	const now = Date.now();
	const day = 86_400_000;
	const projects = [
		{id: 'p-gityak', alias: 'GitYak', path: clone, server: 'localhost', port: 3000, serverType: 'bun', order: 0, dateCreated: now - 90 * day, dateLastOpen: now, openCount: 42},
		{id: 'p-shop', alias: 'shop', path: '/srv/www/shop', server: 'web-01.example.com', port: 22, serverType: 'ssh', sshUser: 'deploy', sshKeyPath: '~/.ssh/id_ed25519', order: 1, dateCreated: now - 60 * day, dateLastOpen: now - 2 * 3_600_000, openCount: 31},
		{id: 'p-infra', alias: 'infra', path: '/opt/infra', server: 'staging.example.com', port: 22, serverType: 'ssh', sshUser: 'ops', order: 2, dateCreated: now - 40 * day, dateLastOpen: now - day, openCount: 12},
		{id: 'p-dotfiles', alias: 'dotfiles', path: '/home/pi/dotfiles', server: 'pi.local', port: 22, serverType: 'ssh', sshUser: 'pi', order: 3, dateCreated: now - 30 * day, dateLastOpen: now - 5 * day, openCount: 6},
		{id: 'p-blog', alias: 'blog', path: '/tmp/blog', server: 'localhost', port: 3000, serverType: 'bun', order: 4, dateCreated: now - 20 * day, dateLastOpen: now - 9 * day, openCount: 4},
	];

	await page.addInitScript(list => {
		localStorage.setItem('git-yak:projects', JSON.stringify(list));
		localStorage.setItem('git-yak:lastProjectId', 'p-gityak');
	}, projects);
	await page.goto('/');
	await waitForRepoLoaded(page);
	await page.locator('.commit-row').nth(12).waitFor();
	await byTestId(page, 'open-repo-manager-btn').click();
	await byTestId(page, 'project-open-btn').nth(4).waitFor();
	await settle(page);
	await page.screenshot({path: join(outDir, 'projects.png'), clip: CLIPS.projects});

	// The same list's server project opened for editing: host, user and key, nothing to install.
	await byTestId(page, 'project-edit-btn').nth(1).click();
	await byTestId(page, 'ssh-user-input').waitFor();
	await settle(page);
	await page.screenshot({path: join(outDir, 'ssh-project.png'), clip: CLIPS.sshProject});
});

// The same history in every theme that ships with the app, at 1x: the website loads one at a time.
test.describe('themes', () => {
	test.use({deviceScaleFactor: 1});

	const themes = ['default', ...readdirSync(join(repoRoot, 'themes')).filter(f => f.endsWith('.jsonc'))];

	for (const theme of themes) {
		test(`theme ${theme}`, async ({page, openRepo}) => {
			if (theme !== 'default') {
				await page.addInitScript(id => localStorage.setItem('git-yak:theme', id), `builtin:${theme}`);
			}

			mkdirSync(themeDir, {recursive: true});
			await openClone(page, openRepo, freshClone());
			await page.locator('.commit-row').nth(3).click();
			await settle(page);
			await page.screenshot({path: join(themeDir, `${theme.replace('.jsonc', '')}.png`)});
		});
	}
});
