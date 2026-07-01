import {invoke} from '@tauri-apps/api/core';

// Node tooling used by git hooks (npx/node via Homebrew, nvm, fnm, volta) lives
// outside the minimal PATH a Finder-launched macOS app inherits. Resolve the
// user's real login-shell PATH once and reuse it for every local git call.
const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

let cached: Promise<string> | undefined;

async function resolve(): Promise<string> {
	try {
		const login = await invoke<string>('get_login_shell_path');
		const parts = new Set(login.split(':').filter(Boolean));

		FALLBACK_DIRS.forEach(dir => parts.add(dir));

		return Array.from(parts).join(':');
	}
	catch {
		return FALLBACK_DIRS.join(':');
	}
}

export function getShellPath(): Promise<string> {
	if (!cached) {
		cached = resolve();
	}

	return cached;
}
