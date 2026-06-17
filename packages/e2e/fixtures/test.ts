import {test as base, type Page} from '@playwright/test';
import {createTempRepo, type ITempRepo} from './repo';

export interface IFixtures {
	repo: ITempRepo;
	openRepo: (page: Page, repoPath: string, alias?: string) => Promise<void>;
}

export const test = base.extend<IFixtures>({
	repo: async ({}, use) => {
		const repo = createTempRepo({init: true});

		await use(repo);

		repo.cleanup();
	},

	openRepo: async ({}, use) => {
		const open = async (page: Page, repoPath: string, alias = 'Test Project') => {
			await page.addInitScript(({path, alias}: {path: string; alias: string}) => {
				const id = `test-project-${Date.now()}`;
				const project = {
					id,
					alias,
					path,
					server: 'localhost',
					port: 3000,
					serverType: 'bun',
					order: 0,
					dateCreated: Date.now(),
					dateLastOpen: Date.now(),
				};

				localStorage.setItem('git-yak:projects', JSON.stringify([project]));
				localStorage.setItem('git-yak:lastProjectId', id);
			}, {path: repoPath, alias});

			await page.goto('/');
		};

		await use(open);
	},
});

export {expect} from '@playwright/test';
