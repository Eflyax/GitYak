import {defineConfig} from 'vite';
import type {Plugin} from 'vite';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync, readFileSync} from 'node:fs';

const currentDir = dirname(fileURLToPath(new URL(import.meta.url)));

// In production nginx serves /releases/ from the directory CI publishes to. The dev server
// answers it from dev-releases/ (sample manifests), so the download section can be worked on.
function devReleases(): Plugin {
	return {
		name: 'gityak-dev-releases',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/releases', (req, res, next) => {
				const file = join(currentDir, 'dev-releases', (req.url ?? '').split('?')[0]);

				if (!file.endsWith('.json') || !existsSync(file)) {
					next();

					return;
				}

				res.setHeader('Content-Type', 'application/json');
				res.end(readFileSync(file));
			});
		},
	};
}

export default defineConfig({
	plugins: [devReleases()],
	resolve: {
		alias: {
			'@git-yak/protocol': join(currentDir, '..', 'protocol', 'src', 'index.ts'),
		},
	},
	build: {
		target: 'es2022',
		rollupOptions: {
			input: {
				index: join(currentDir, 'index.html'),
				changelog: join(currentDir, 'changelog.html'),
			},
		},
	},
	server: {
		host: 'localhost',
		port: 5180,
	},
});
