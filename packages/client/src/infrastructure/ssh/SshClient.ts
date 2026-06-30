import {Command} from '@tauri-apps/plugin-shell';
import type {ITransportClient} from '../ITransportClient';
import {ENetworkCommand} from '@/domain';

/**
 * Escape a string so it is safe as a single-quoted shell argument.
 * Single quotes in the value are replaced with: '"'"'
 */
function sq(arg: string): string {
	return "'" + arg.replace(/'/g, "'\\''") + "'";
}

export class SshClient implements ITransportClient {
	private readonly host: string;
	private readonly port: number;
	private readonly user: string;
	private readonly keyPath?: string;
	private readonly controlPath: string;

	constructor(host: string, port: number, user: string, keyPath?: string) {
		this.host = host;
		this.port = port;
		this.user = user;
		this.keyPath = keyPath;

		const hash = `${host}-${port}-${user}`.replace(/[^a-zA-Z0-9]/g, '-');
		this.controlPath = `/tmp/git-yak-${hash}`;
	}

	/**
	 * Build the SSH argv prefix (everything before the remote command string).
	 * The remote command must be passed as a SINGLE pre-escaped string so SSH
	 * hands it verbatim to the remote shell instead of joining it with spaces.
	 */
	private buildSshArgs(remoteCmd: string): string[] {
		const args: string[] = [
			'-p', String(this.port),
			// Forward the local ssh-agent so the remote git can authenticate to
			// upstreams (e.g. git@host) using the user's locally loaded keys.
			'-A',
			'-o', 'ForwardAgent=yes',
			'-o', 'ControlMaster=auto',
			'-o', `ControlPath=${this.controlPath}`,
			'-o', 'ControlPersist=60',
			'-o', 'BatchMode=yes',
			'-o', 'StrictHostKeyChecking=accept-new',
			'-o', 'SendEnv=NONE',
		];

		if (this.keyPath) {
			args.push('-i', this.keyPath);
		}

		args.push(`${this.user}@${this.host}`);
		// Single string → SSH passes it to the remote shell as-is
		args.push(remoteCmd);

		return args;
	}

	async call(command: string, payload: Record<string, unknown>): Promise<unknown> {
		switch (command) {
			case ENetworkCommand.GitCall: {
				const repoPath = payload['repo_path'] as string;
				const gitArgs = payload['args'] as string[];
				// Build a properly quoted remote command; LC_ALL=C silences locale warnings
				const remoteCmd = ['LC_ALL=C', 'git', '-C', repoPath, ...gitArgs].map(sq).join(' ');
				const result = await Command.create('ssh', this.buildSshArgs(remoteCmd)).execute();

				if (result.code !== 0) {
					throw new Error(result.stderr || result.stdout || 'Git command failed');
				}

				return result.stdout;
			}

			case ENetworkCommand.ReadFile: {
				const repoPath = payload['repo_path'] as string;
				const filePath = payload['file_path'] as string;
				const fullPath = filePath.startsWith('/') ? filePath : `${repoPath}/${filePath}`;
				const remoteCmd = `cat ${sq(fullPath)}`;
				const result = await Command.create('ssh', this.buildSshArgs(remoteCmd)).execute();

				if (result.code !== 0) {
					const opts = payload['options'] as {nullIfNotExists?: boolean} | undefined;

					if (opts?.nullIfNotExists) {
						return null;
					}

					throw new Error(result.stderr || 'Read file failed');
				}

				return result.stdout;
			}

			case ENetworkCommand.WriteFile: {
				const repoPath = payload['repo_path'] as string;
				const filePath = payload['file_path'] as string;
				const content = payload['content'] as string;
				const opts = payload['options'] as {makeDirectory?: boolean} | undefined;
				const fullPath = filePath.startsWith('/') ? filePath : `${repoPath}/${filePath}`;
				const encoded = btoa(unescape(encodeURIComponent(content)));

				let remoteCmd = `printf '%s' ${sq(encoded)} | base64 -d > ${sq(fullPath)}`;

				if (opts?.makeDirectory) {
					remoteCmd = `mkdir -p $(dirname ${sq(fullPath)}) && ${remoteCmd}`;
				}

				const result = await Command.create('ssh', this.buildSshArgs(remoteCmd)).execute();

				if (result.code !== 0) {
					throw new Error(result.stderr || 'Write file failed');
				}

				return null;
			}

			case ENetworkCommand.BrowseFiles:
				throw new Error('File browsing is not supported in SSH mode');

			case ENetworkCommand.SshAgentInit:
				throw new Error('SSH agent init is not needed in SSH mode');

			default:
				throw new Error(`Unknown command: ${command}`);
		}
	}

	close(): void {
		const args = [
			'-O', 'exit',
			'-o', `ControlPath=${this.controlPath}`,
			`${this.user}@${this.host}`,
		];

		Command.create('ssh', args).execute().catch(() => {
			// Ignore errors when closing control socket
		});
	}
}
