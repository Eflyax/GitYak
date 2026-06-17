import {defineConfig, devices} from '@playwright/test';

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
		{
			command: 'yarn workspace @git-yak/client dev',
			port: 5173,
			reuseExistingServer: !process.env.CI,
			timeout: 60_000,
			cwd: '../..',
		},
	],
});
