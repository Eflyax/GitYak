import {defineConfig} from 'vite';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import svgLoader from 'vite-svg-loader';
import vue from '@vitejs/plugin-vue';
import {parseCargoVersion} from './src/infrastructure/cargoVersion';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	srcDir = join(currentDir, 'src');

const remoteWorkerVersion = parseCargoVersion(
	readFileSync(join(currentDir, '..', 'remote-worker-rs', 'Cargo.toml'), 'utf8'),
);

// Dev-server convenience only: a browser cannot read the user's home directory, so the
// token is injected at dev time. Guarded on `command === 'serve'` so a production build
// always embeds an empty string.
function readDevToken(): string {
	try {
		return readFileSync(join(homedir(), '.git-yak', 'server-token'), 'utf8').trim();
	}
	catch {
		return '';
	}
}

// `vite build --mode tauri-v1` targets the Tauri 1 shell for older Linux (src-tauri-v1): each
// Tauri 2 module the app imports resolves to a shim over the Tauri 1 API instead.
const TAURI_V1_MODE = 'tauri-v1';

function tauriV1Aliases(): Array<{find: RegExp; replacement: string}> {
	const shims = join(srcDir, 'infrastructure', 'tauri', 'v1');

	return [
		{find: /^@tauri-apps\/api\/core$/, replacement: join(shims, 'core.ts')},
		{find: /^@tauri-apps\/api\/window$/, replacement: join(shims, 'window.ts')},
		{find: /^@tauri-apps\/api\/path$/, replacement: '@tauri-apps/api-v1/path'},
		{find: /^@tauri-apps\/plugin-shell$/, replacement: join(shims, 'shell.ts')},
		{find: /^@tauri-apps\/plugin-deep-link$/, replacement: join(shims, 'deepLink.ts')},
	];
}

export default defineConfig(({command, mode}) => ({
	define: {
		__REMOTE_WORKER_VERSION__: JSON.stringify(remoteWorkerVersion),
		__DEV_SERVER_TOKEN__: JSON.stringify(command === 'serve' ? readDevToken() : ''),
	},
	plugins: [
		vue(),
		svgLoader(),
	],
	resolve: {
		alias: [
			...(mode === TAURI_V1_MODE ? tauriV1Aliases() : []),
			{find: '@', replacement: srcDir},
			{find: '@git-yak/protocol', replacement: join(currentDir, '..', 'protocol', 'src', 'index.ts')},
		],
		dedupe: ['vue', 'naive-ui'],
	},
	build: {
		outDir: mode === TAURI_V1_MODE ? 'dist-tauri-v1' : 'dist',
		target: 'es2022',
	},
	css: {
		preprocessorOptions: {
			scss: {
				additionalData: '@use "@/styles/variables" as *;',
			},
		},
	},
	optimizeDeps: {
		exclude: ['fsevents', '@vitejs/plugin-vue'],
	},
	server: {
		// Loopback only. The dev bundle carries the user's server token (see readDevToken
		// above), and the Bun server's Origin allowlist accepts only localhost/127.0.0.1
		// anyway, so binding every interface published a 0600 secret to the LAN and bought
		// nothing. Tauri's devUrl and the e2e suite both use http://localhost:5173.
		host: 'localhost',
		port: 5173,
		cors: true,
		strictPort: true,
	},
}));
