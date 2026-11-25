import {open} from '@tauri-apps/plugin-shell';
import {isTauri} from '@/infrastructure/tauri/isTauri';

/** Opens an http(s) URL in the user's default browser. */
export async function openExternal(url: string): Promise<void> {
	if (!/^https?:\/\//.test(url)) {
		throw new Error(`Refusing to open ${url}`);
	}

	if (isTauri) {
		await open(url);

		return;
	}

	window.open(url, '_blank', 'noopener');
}
