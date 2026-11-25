// Stands in for `@tauri-apps/plugin-deep-link` in the Tauri 1 build. On Linux a gityak:// link
// reaches the app as a command-line argument: of the first launch (get_launch_urls), or of a
// second launch that the single-instance plugin forwards as an event (see src-tauri-v1).
import {invoke} from '@tauri-apps/api-v1/tauri';
import {listen} from '@tauri-apps/api-v1/event';
import type {UnlistenFn} from '@tauri-apps/api-v1/event';

const DEEP_LINK_EVENT = 'deep-link://new-url';

export async function getCurrent(): Promise<Array<string> | null> {
	const urls = await invoke<Array<string>>('get_launch_urls');

	return urls.length ? urls : null;
}

export async function onOpenUrl(handler: (urls: Array<string>) => void): Promise<UnlistenFn> {
	return listen<Array<string>>(DEEP_LINK_EVENT, event => handler(event.payload));
}
