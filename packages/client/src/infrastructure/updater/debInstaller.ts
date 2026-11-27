import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import type {IUpdateInstaller} from './IUpdateInstaller';

interface IDownloadProgress {
	downloaded: number;
	total: number | null;
}

/**
 * Installs a Linux .deb update through the shell's commands: the download is verified against
 * the GitYak updater key before it is kept, and dpkg runs behind a pkexec password prompt.
 */
export function createDebInstaller(url: string, signature: string): IUpdateInstaller {
	let path: string | null = null;

	return {
		async download(onProgress) {
			const unlisten = await listen<IDownloadProgress>('update://progress', event => {
				onProgress(event.payload.downloaded, event.payload.total);
			});

			try {
				path = await invoke<string>('download_deb_update', {url, signature});
			}
			finally {
				unlisten();
			}
		},

		async install() {
			if (!path) {
				throw new Error('The update has not been downloaded yet.');
			}

			const outcome = await invoke<string>('install_deb_update', {path});

			if (outcome === 'cancelled') {
				return 'cancelled';
			}

			if (outcome !== 'installed') {
				throw new Error(`Unexpected install outcome: ${outcome}`);
			}

			await invoke('restart_after_update');

			return 'restarting';
		},
	};
}
