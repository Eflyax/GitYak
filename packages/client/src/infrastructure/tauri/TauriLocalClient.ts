import {Command} from '@tauri-apps/plugin-shell';
import type {Child} from '@tauri-apps/plugin-shell';
import {invoke} from '@tauri-apps/api/core';
import type {IGitProcess, ITransportClient} from '../ITransportClient';
import {runSpawnedGit, streamEncoding} from '../spawnedGit';
import {getShellPath} from './shellPath';
import {buildRebasePlan, validateRepoPath} from './rebaseArgs';
import {ENetworkCommand} from '@/domain';
import {blobObjectName} from '@git-yak/protocol';
import {bytesToBase64} from '@/domain/services/base64';

interface IDirEntry {
	name: string;
	is_directory: boolean;
}

/**
 * The environment every git runs with. The user's login-shell PATH lets git hooks find node
 * tooling (npx/node) even when the app was launched from Finder. GIT_TERMINAL_PROMPT=0: the app
 * never answers a prompt, so git fails at once (an HTTPS clone without credentials) instead of
 * waiting for a username on a terminal nobody sees.
 */
async function gitEnv(extra: Record<string, string> = {}): Promise<Record<string, string>> {
	return {PATH: await getShellPath(), GIT_TERMINAL_PROMPT: '0', ...extra};
}

/** SIGTERM, so git can clean up after itself - Child.kill() is SIGKILL. */
async function terminateGently(child: Child): Promise<void> {
	await invoke('terminate_process', {pid: child.pid});
}

export class TauriLocalClient implements ITransportClient {
	// Cancelling a clone must not leave its half-made folder behind, which a later clone into
	// the same place would refuse; git removes it itself when it is terminated, not killed.
	spawnGit(repoPath: string, args: Array<string>, onOutput: (line: string) => void): IGitProcess {
		return runSpawnedGit(
			async () => Command.create('git', ['-C', repoPath, ...args], {encoding: streamEncoding(), env: await gitEnv()}),
			onOutput,
			terminateGently,
		);
	}

	async call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown> {
		switch (command) {
			case ENetworkCommand.GitCall: {
				const repoPath = payload['repo_path'] as string;
				const args = payload['args'] as Array<string>;
				const result = await Command.create('git', ['-C', repoPath, ...args], {env: await gitEnv()}).execute();

				if (result.code !== 0) {
					throw new Error(result.stderr || result.stdout || 'Git command failed');
				}

				return result.stdout;
			}

			// Interactive rebase is a separate command precisely because its argument vector
			// contains `-c` flags that the generic GitCall route refuses. The vector is
			// composed here from validated parts, never from a client-supplied string.
			case ENetworkCommand.GitRebase: {
				const repoRoot = validateRepoPath(payload['repo_path']);
				const plan = buildRebasePlan(repoRoot, String(payload['action'] ?? ''), payload);

				// browse_directory fails on anything that is not an existing directory, so it
				// stands in for the server's existsSync on the repository root.
				await invoke('browse_directory', {path: repoRoot});

				if (plan.todoPath !== undefined) {
					const todo = await invoke<string | null>('read_file_at', {
						path: plan.todoPath,
						nullIfNotExists: true,
					});

					if (todo === null) {
						throw new Error(`Todo file does not exist: ${plan.todoPath}`);
					}
				}

				const result = await Command.create('git', plan.args, {env: await gitEnv()}).execute();

				if (result.code !== 0) {
					throw new Error(result.stderr.trim() || result.stdout.trim() || `git rebase exited ${result.code}`);
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

			case ENetworkCommand.ReadBlob: {
				const repoPath = payload['repo_path'] as string;
				const filePath = payload['file_path'] as string;
				const revision = payload['revision'] as string | undefined;

				if (!revision) {
					const fullPath = filePath.startsWith('/') ? filePath : `${repoPath}/${filePath}`;

					return bytesToBase64(new Uint8Array(await invoke<ArrayBuffer>('read_file_bytes', {path: fullPath})));
				}

				// Raw encoding: the default decodes stdout as UTF-8, which mangles binary files.
				const result = await Command.create(
					'git',
					['-C', repoPath, 'cat-file', 'blob', blobObjectName(revision, filePath)],
					{encoding: 'raw', env: await gitEnv({GIT_OPTIONAL_LOCKS: '0'})},
				).execute();

				if (result.code !== 0) {
					throw new Error(new TextDecoder().decode(result.stderr).trim() || `Cannot read ${revision}:${filePath}`);
				}

				return bytesToBase64(result.stdout);
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
