import {Command} from '@tauri-apps/plugin-shell';
import {invoke} from '@tauri-apps/api/core';
import type {ITransportClient} from '../ITransportClient';
import {getShellPath} from './shellPath';
import {ENetworkCommand} from '@/domain';

interface IDirEntry {
	name: string;
	is_directory: boolean;
}

export class TauriLocalClient implements ITransportClient {
	async call(command: string, payload: Record<string, unknown>): Promise<unknown> {
		switch (command) {
			case ENetworkCommand.GitCall: {
				const repoPath = payload['repo_path'] as string;
				const args = payload['args'] as Array<string>;
				// Pass the user's login-shell PATH so git hooks can find node tooling
				// (npx/node) even when the app was launched from Finder.
				const path = await getShellPath();
				const result = await Command.create('git', ['-C', repoPath, ...args], {env: {PATH: path}}).execute();

				if (result.code !== 0) {
					throw new Error(result.stderr || result.stdout || 'Git command failed');
				}

				return result.stdout;
			}

			case ENetworkCommand.ReadFile: {
				const repoPath = payload['repo_path'] as string;
				const filePath = payload['file_path'] as string;
				const opts = payload['options'] as {nullIfNotExists?: boolean} | undefined;
				const fullPath = filePath.startsWith('/') ? filePath : `${repoPath}/${filePath}`;

				const content = await invoke<string | null>('read_file_at', {
					path: fullPath,
					nullIfNotExists: opts?.nullIfNotExists ?? false,
				});

				if (content === null) {
					return null;
				}

				return content;
			}

			case ENetworkCommand.WriteFile: {
				const repoPath = payload['repo_path'] as string;
				const filePath = payload['file_path'] as string;
				const content = payload['content'] as string;
				const opts = payload['options'] as {makeDirectory?: boolean} | undefined;
				const fullPath = filePath.startsWith('/') ? filePath : `${repoPath}/${filePath}`;

				await invoke('write_file_at', {
					path: fullPath,
					content,
					makeDirectory: opts?.makeDirectory ?? false,
				});

				return null;
			}

			case ENetworkCommand.BrowseFiles: {
				const path = payload['path'] as string;
				const entries = await invoke<Array<IDirEntry>>('browse_directory', {path});

				return {
					path,
					entries: entries.map(e => ({name: e.name, isDirectory: e.is_directory})),
				};
			}

			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	close(): void {
		// no persistent connection to close
	}
}
