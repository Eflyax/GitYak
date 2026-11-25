import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from '../fixtures/test';
import {byTestId, selectWorkingTree, waitForRepoLoaded} from '../fixtures/ui';

const
	repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
	outDir = join(repoRoot, 'packages', 'website', 'public', 'screenshots');

let clone: string;

// GitYak's own history makes a realistic graph. A clone keeps the screenshots independent of
// whatever is uncommitted in the working copy; one edited SVG gives the image diff to show.
test.beforeAll(() => {
	clone = join(mkdtempSync(join(tmpdir(), 'gityak-shots-')), 'GitYak');
	execFileSync('git', ['clone', '--quiet', '--no-local', repoRoot, clone]);

	const logo = join(clone, 'assets', 'logo.svg');

	writeFileSync(logo, readFileSync(logo, 'utf8').replace(/#8956FB/gi, '#20B2AA'));
});

test.afterAll(() => {
	rmSync(dirname(clone), {recursive: true, force: true});
});

test('history', async ({page, openRepo}) => {
	await openRepo(page, clone, 'GitYak');
	await waitForRepoLoaded(page);
	await page.locator('.commit-row').nth(12).waitFor();
	await page.locator('.commit-row').nth(3).click();
	await page.waitForTimeout(800);
	await page.screenshot({path: join(outDir, 'history.png')});
});

test('image diff', async ({page, openRepo}) => {
	await openRepo(page, clone, 'GitYak');
	await waitForRepoLoaded(page);
	await selectWorkingTree(page);
	await byTestId(page, 'unstaged-file').filter({hasText: 'logo.svg'}).click();
	await byTestId(page, 'image-preview').waitFor();
	await page.waitForTimeout(800);
	await page.screenshot({path: join(outDir, 'image-diff.png')});
});
