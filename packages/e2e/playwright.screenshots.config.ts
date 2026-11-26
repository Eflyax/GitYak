import {defineConfig} from '@playwright/test';
import baseConfig from './playwright.config';

// Captures the app screenshots for the website (packages/website/public/screenshots). Not
// part of the test suite:  yarn workspace @git-yak/e2e screenshots
// They are taken at 2x for sharp screens; the spec clips each to the part the website shows.
export default defineConfig({
	...baseConfig,
	testDir: './screenshots',
	use: {
		...baseConfig.use,
		viewport: {width: 1440, height: 900},
		deviceScaleFactor: 2,
		colorScheme: 'dark',
	},
	projects: undefined,
});
