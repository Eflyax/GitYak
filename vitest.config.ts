import {defineConfig} from 'vitest/config';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	clientSrc = join(currentDir, 'packages', 'client', 'src');

export default defineConfig({
	resolve: {
		alias: {
			'@': clientSrc,
			'@git-yak/protocol': join(currentDir, 'packages', 'protocol', 'src', 'index.ts'),
		},
	},
	test: {
		environment: 'node',
		include: [
			'packages/client/src/**/*.spec.ts',
			'packages/protocol/src/**/*.spec.ts',
			'scripts/**/*.spec.ts',
		],
	},
});
