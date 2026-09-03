import {invoke} from '@tauri-apps/api/core';
import type {IProject} from '@/domain';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Where the token comes from depends on what can reach the user's home directory:
// Tauri reads the file directly; the Vite dev server injects it at build time; anything
// else must be told the token explicitly on the project record.
export async function getServerToken(project: IProject): Promise<string> {
	if (project.token) {
		return project.token;
	}

	if (isTauri) {
		const contents = await invoke<string | null>('read_file_at', {
			path: '~/.git-yak/server-token',
			nullIfNotExists: true,
		});

		if (contents) {
			return contents.trim();
		}
	}

	return __DEV_SERVER_TOKEN__;
}
