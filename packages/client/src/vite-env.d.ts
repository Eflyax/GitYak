/// <reference types="vite/client" />

declare const __REMOTE_WORKER_VERSION__: string;
declare const __DEV_SERVER_TOKEN__: string;
declare const __APP_VERSION__: string;
declare const __APP_FLAVOR__: 'tauri' | 'tauri-v1';

// Augments Vite's own interface, so its name is fixed.
// eslint-disable-next-line @typescript-eslint/naming-convention
interface ImportMetaEnv {
	/** Overrides the release manifest the update check reads, for testing. */
	readonly VITE_UPDATE_MANIFEST_URL?: string;
}
