// Stands in for `@tauri-apps/api/window` in the Tauri 1 build.
import {appWindow} from '@tauri-apps/api-v1/window';
import type {WebviewWindow} from '@tauri-apps/api-v1/window';

export function getCurrentWindow(): WebviewWindow {
	return appWindow;
}
