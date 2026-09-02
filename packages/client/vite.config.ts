import {defineConfig} from 'vite';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import svgLoader from 'vite-svg-loader';
import vue from '@vitejs/plugin-vue';
import {parseCargoVersion} from './src/infrastructure/cargoVersion';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	srcDir = join(currentDir, 'src');

const remoteWorkerVersion = parseCargoVersion(
	readFileSync(join(currentDir, '..', 'remote-worker-rs', 'Cargo.toml'), 'utf8'),
);

export default defineConfig({
	define: {
		__REMOTE_WORKER_VERSION__: JSON.stringify(remoteWorkerVersion),
	},
	plugins: [
		vue(),
		svgLoader(),
	],
	resolve: {
		alias: {
			'@': srcDir,
			'@git-yak/protocol': join(currentDir, '..', 'protocol', 'src', 'index.ts'),
		},
		dedupe: ['vue', 'naive-ui'],
	},
	build: {
		outDir: 'dist',
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
		host: true,
		port: 5173,
		cors: true,
		strictPort: true,
	},
});
