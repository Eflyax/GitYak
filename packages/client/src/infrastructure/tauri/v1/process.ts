// Stands in for `@tauri-apps/plugin-process` in the Tauri 1 build, which has no process plugin:
// a .deb update restarts through the shell's own `restart_after_update` command.
export function relaunch(): Promise<never> {
	return Promise.reject(new Error('The process plugin is not available in this build.'));
}
