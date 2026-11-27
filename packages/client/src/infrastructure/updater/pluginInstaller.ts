import type {Update} from '@tauri-apps/plugin-updater';
import type {IUpdateInstaller} from './IUpdateInstaller';

/**
 * Installs an update through the Tauri updater plugin (macOS, Windows). The plugin modules are
 * imported on use: the Tauri 1 shell has no such plugins and never takes this path.
 */
export function createPluginInstaller(expectedVersion: string): IUpdateInstaller {
	let downloaded: Update | null = null;

	return {
		async download(onProgress) {
			const {check} = await import('@tauri-apps/plugin-updater');
			const update = await check();

			// The plugin reads updater.json, latest.json told the user about the version: install
			// only what the user agreed to.
			if (!update || update.version !== expectedVersion) {
				await update?.close();
				throw new Error(`The update server offers ${update?.version ?? 'nothing'} instead of ${expectedVersion}.`);
			}

			let
				received = 0,
				total: number | null = null;

			try {
				await update.download(event => {
					switch (event.event) {
						case 'Started':
							total = event.data.contentLength ?? null;
							onProgress(received, total);
							break;
						case 'Progress':
							received += event.data.chunkLength;
							onProgress(received, total);
							break;
						case 'Finished':
							onProgress(total ?? received, total);
							break;
					}
				});
			}
			catch (err) {
				// The Update is a Rust-side resource: release it, a retry checks again anyway.
				// Closing must not hide why the download failed.
				await update.close().catch(() => {});
				throw err;
			}

			downloaded = update;
		},

		async install() {
			if (!downloaded) {
				throw new Error('The update has not been downloaded yet.');
			}

			// On Windows install() runs the installer and exits the app itself.
			await downloaded.install();

			const {relaunch} = await import('@tauri-apps/plugin-process');
			await relaunch();

			return 'restarting';
		},
	};
}
