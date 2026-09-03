import {defineConfig} from 'vitest/config';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {parseCargoVersion} from './packages/client/src/infrastructure/cargoVersion';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	clientSrc = join(currentDir, 'packages', 'client', 'src');

// Mirrors the define in packages/client/vite.config.ts so specs that touch code compiled
// against __REMOTE_WORKER_VERSION__ (SshTunnelClient) resolve it the same way the app does.
const remoteWorkerVersion = parseCargoVersion(
	readFileSync(join(currentDir, 'packages', 'remote-worker-rs', 'Cargo.toml'), 'utf8'),
);

export default defineConfig({
	define: {
		__REMOTE_WORKER_VERSION__: JSON.stringify(remoteWorkerVersion),
	},
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
			'packages/client/scripts/**/*.spec.ts',
			'packages/protocol/src/**/*.spec.ts',
			'packages/server/src/**/*.spec.ts',
			'scripts/**/*.spec.ts',
		],
	},
});
