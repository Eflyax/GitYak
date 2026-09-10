import {defineConfig, devices} from '@playwright/test';
import {DUBIOUS_OWNERSHIP_GIT_CONFIG, DUBIOUS_OWNERSHIP_PORT} from './fixtures/dubiousOwnership';

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: {timeout: 10_000},
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: 'http://localhost:5173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		actionTimeout: 10_000,
	},
	projects: [
		{
			name: 'chromium',
			use: {...devices['Desktop Chrome']},
		},
	],
	webServer: [
		{
			command: 'yarn workspace @git-yak/server dev',
			port: 3000,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			cwd: '../..',
		},
		// A second backend that treats every repository as owned by someone else, so the
		// dubious-ownership refusal can be exercised for real without changing file ownership.
		// Its global git config is redirected to a throwaway file: confirming the prompt writes
		// safe.directory, and that must never land in the developer's own ~/.gitconfig.
		{
			command: 'yarn workspace @git-yak/server dev',
			port: DUBIOUS_OWNERSHIP_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 30_000,
			cwd: '../..',
			env: {
				PORT: String(DUBIOUS_OWNERSHIP_PORT),
				GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
				GIT_CONFIG_GLOBAL: DUBIOUS_OWNERSHIP_GIT_CONFIG,
			},
		},
		{
			command: 'yarn workspace @git-yak/client dev',
			port: 5173,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: '../..',
		},
	],
});
