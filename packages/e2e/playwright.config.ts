import {defineConfig, devices} from '@playwright/test';
import {DUBIOUS_OWNERSHIP_GIT_CONFIG, DUBIOUS_OWNERSHIP_PORT} from './fixtures/dubiousOwnership';

// The suite runs its own Vite instance on a port of its own, so an unrelated dev server on
// Vite's usual 5173 is never picked up by `reuseExistingServer`. Override with E2E_CLIENT_PORT.
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT ?? 5273);
const CLIENT_ORIGIN = `http://localhost:${CLIENT_PORT}`;
// The backends only accept sockets from allowlisted origins, and their default list names 5173.
const ALLOWED_ORIGINS = `${CLIENT_ORIGIN},http://127.0.0.1:${CLIENT_PORT}`;

export default defineConfig({
	testDir: './tests',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	expect: {timeout: 10_000},
	retries: 0,
	reporter: [['list']],
	use: {
		baseURL: CLIENT_ORIGIN,
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
			env: {GITYAK_ALLOWED_ORIGINS: ALLOWED_ORIGINS},
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
				GITYAK_ALLOWED_ORIGINS: ALLOWED_ORIGINS,
				GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
				GIT_CONFIG_GLOBAL: DUBIOUS_OWNERSHIP_GIT_CONFIG,
			},
		},
		{
			command: `yarn workspace @git-yak/client dev --port ${CLIENT_PORT}`,
			port: CLIENT_PORT,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: '../..',
		},
	],
});
