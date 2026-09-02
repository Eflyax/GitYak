import {defineConfig} from 'vite';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import svgLoader from 'vite-svg-loader';
import vue from '@vitejs/plugin-vue';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	srcDir = join(currentDir, 'src');

export default defineConfig({
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
				additionalData: `@use "@/styles/variables" as *;`,
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
