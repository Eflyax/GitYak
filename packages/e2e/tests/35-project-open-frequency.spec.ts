import type {Page} from '@playwright/test';
import {test, expect} from '../fixtures/test';
import {createTempRepo, type ITempRepo} from '../fixtures/repo';
import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

interface ISeed {
	id: string;
	alias: string;
	openCount?: number;
}

// Three projects opened 1, 0 and 9 times. 'rare' is the last one opened, so the app
// reopens it on startup.
const SEEDS: Array<ISeed> = [
	{id: 'rare', alias: 'Rare project', openCount: 1},
	{id: 'never', alias: 'Never opened'},
	{id: 'often', alias: 'Often opened', openCount: 9},
];

// The `openRepo` fixture stores a single project; these tests need several, each with its
// own open count, so they write the project list themselves.
async function seedProjects(page: Page, repos: Record<string, ITempRepo>, lastProjectId: string): Promise<void> {
	const projects = SEEDS.map((seed, order) => ({
		id: seed.id,
		alias: seed.alias,
		path: repos[seed.id]!.path,
		server: 'localhost',
		port: 3000,
		serverType: 'bun',
		order,
		dateCreated: 0,
		dateLastOpen: 0,
		...(seed.openCount === undefined ? {} : {openCount: seed.openCount}),
	}));

	await page.addInitScript(({projects, lastProjectId}) => {
		// Only on the first load: a reload must see what the app itself stored.
		if (!sessionStorage.getItem('seeded')) {
			localStorage.setItem('git-yak:projects', JSON.stringify(projects));
			localStorage.setItem('git-yak:lastProjectId', lastProjectId);
			sessionStorage.setItem('seeded', '1');
		}
	}, {projects, lastProjectId});
}

async function storedOpenCounts(page: Page): Promise<Record<string, number | undefined>> {
	return page.evaluate(() => {
		const projects = JSON.parse(localStorage.getItem('git-yak:projects') ?? '[]') as Array<{id: string; openCount?: number}>;

		return Object.fromEntries(projects.map(p => [p.id, p.openCount]));
	});
}

async function openProjectList(page: Page): Promise<void> {
	await page.keyboard.press('Meta+Shift+P');
	await expect(byTestId(page, 'command-palette')).toBeVisible();
	await byTestId(page, 'command-palette-item-open-repo').click();
	await expect(byTestId(page, 'command-palette-subitem-rare')).toBeVisible();
}

function subItems(page: Page) {
	return byTestId(page, 'command-palette-list').locator('[test-id^="command-palette-subitem-"]');
}

test.describe('project open frequency', () => {
	let repos: Record<string, ITempRepo>;

	test.beforeEach(() => {
		repos = Object.fromEntries(SEEDS.map(seed => {
			const repo = createTempRepo();

			repo.commit(`Commit in ${seed.id}`, {'README.md': `# ${seed.id}\n`});

			return [seed.id, repo];
		}));
	});

	test.afterEach(() => {
		Object.values(repos).forEach(repo => repo.cleanup());
	});

	async function start(page: Page): Promise<void> {
		await seedProjects(page, repos, 'rare');
		await page.goto('/');
		await waitForRepoLoaded(page);
		await waitForCommitRow(page, 'Commit in rare');
	}

	test('reopening the last project on startup does not count as an open', async ({page}) => {
		await start(page);

		expect(await storedOpenCounts(page)).toEqual({rare: 1, never: 0, often: 9});
	});

	test('the project list puts the most opened projects first', async ({page}) => {
		await start(page);
		await openProjectList(page);

		await expect(subItems(page)).toHaveCount(3);
		expect(await subItems(page).evaluateAll(items => items.map(i => i.getAttribute('test-id'))))
			.toEqual(['command-palette-subitem-often', 'command-palette-subitem-rare', 'command-palette-subitem-never']);
	});

	test('a search still filters by text, and ranks the matches by opens', async ({page}) => {
		await start(page);
		await openProjectList(page);

		// "opened" matches two aliases; the one opened 9 times comes before the one never opened.
		await byTestId(page, 'command-palette-input').locator('input').fill('opened');

		await expect(subItems(page)).toHaveCount(2);
		expect(await subItems(page).evaluateAll(items => items.map(i => i.getAttribute('test-id'))))
			.toEqual(['command-palette-subitem-often', 'command-palette-subitem-never']);
	});

	test('each project shows how often it is opened, relative to the most opened one', async ({page}) => {
		await start(page);
		await openProjectList(page);

		const meter = (id: string) => byTestId(page, `command-palette-subitem-${id}`).locator('[test-id="command-palette-meter"]');

		await expect(meter('often')).toHaveAttribute('aria-valuenow', '1');
		await expect(meter('never')).toHaveAttribute('aria-valuenow', '0');
		await expect(meter('often')).toHaveAttribute('title', 'Opened 9×');

		// Logarithmic: log(2)/log(10) ≈ 0.30, where linear would give 0.11.
		const rare = Number(await meter('rare').getAttribute('aria-valuenow'));

		expect(rare).toBeCloseTo(Math.log(2) / Math.log(10), 5);

		// Measured with offsetWidth, in one go: the palette animates in with a transform, and
		// bounding boxes taken at two moments of that animation are not comparable.
		const rareShare = await meter('rare').evaluate(bar => {
			const fill = bar.querySelector<HTMLElement>('.command-palette__meter-fill')!;

			return fill.offsetWidth / (bar as HTMLElement).offsetWidth;
		});

		expect(rareShare).toBeGreaterThan(0.25);
		expect(rareShare).toBeLessThan(0.35);
	});

	test('opening a project from the palette counts it', async ({page}) => {
		await start(page);
		await openProjectList(page);

		await byTestId(page, 'command-palette-subitem-never').click();
		await waitForCommitRow(page, 'Commit in never');

		expect(await storedOpenCounts(page)).toEqual({rare: 1, never: 1, often: 9});

		// And the count survives a reload, which itself reopens 'never' without counting it.
		await page.reload();
		await waitForCommitRow(page, 'Commit in never');

		expect(await storedOpenCounts(page)).toEqual({rare: 1, never: 1, often: 9});
	});
});
