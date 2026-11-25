/**
 * True inside the desktop app. Tauri 2 injects `__TAURI_INTERNALS__`, Tauri 1 (the build for
 * older Linux, see src-tauri-v1) injects `__TAURI_IPC__`.
 */
export const isTauri = typeof window !== 'undefined'
	&& ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);
