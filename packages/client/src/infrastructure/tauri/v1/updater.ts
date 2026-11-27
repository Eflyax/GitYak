// Stands in for `@tauri-apps/plugin-updater` in the Tauri 1 build, which has no updater plugin:
// it is only built for Linux, where updates install from the signed .deb (debInstaller). The
// real module would not even bundle here (it imports Tauri 2's `Resource`).
export function check(): Promise<never> {
	return Promise.reject(new Error('The updater plugin is not available in this build.'));
}
