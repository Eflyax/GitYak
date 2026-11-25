import {invoke} from '@tauri-apps/api/core';
import {isWindowsHost, PATH_DELIMITER} from '@/infrastructure/platform';

// Node tooling used by git hooks (npx/node via Homebrew, nvm, fnm, volta) lives
// outside the minimal PATH a Finder-launched macOS app inherits. Resolve the
// user's real login-shell PATH once and reuse it for every local git call.
const FALLBACK_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

let cached: Promise<string> | undefined;

async function resolve(): Promise<string> {
	try {
		const login = await invoke<string>('get_login_shell_path');
		const parts = new Set(login.split(PATH_DELIMITER).filter(Boolean));

		// Windows apps inherit the user's full PATH; the Unix directories mean nothing there.
		if (!isWindowsHost) {
			FALLBACK_DIRS.forEach(dir => parts.add(dir));
		}

		return Array.from(parts).join(PATH_DELIMITER);
	}
	catch {
		return isWindowsHost ? '' : FALLBACK_DIRS.join(':');
	}
}

export function getShellPath(): Promise<string> {
	if (!cached) {
		cached = resolve();
	}

	return cached;
}
