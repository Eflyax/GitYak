import {Command} from '@tauri-apps/plugin-shell';
import type {Child} from '@tauri-apps/plugin-shell';
import {invoke} from '@tauri-apps/api/core';
import {WebSocketClient} from '../websocket/WebSocketClient';
import type {ITransportClient} from '../ITransportClient';
import {ENetworkCommand} from '@/domain';
import {useActivityLog} from '@/composables/useActivityLog';
import {useConnectionStatus} from '@/composables/useConnectionStatus';

const REMOTE_BINARY_PATH = '~/.local/bin/gityak';
const REMOTE_WORKER_VERSION = '1.0.3';
const FORCE_PROVISION = false;

export class SshTunnelClient implements ITransportClient {
	private serverChild: Child | null = null;
	private tunnelChild: Child | null = null;
	private wsClient: WebSocketClient | null = null;
	private localPort = 0;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private readonly log = useActivityLog().addLog;
	private readonly cs = useConnectionStatus();

	constructor(
		private readonly host: string,
		private readonly sshPort: number,
		private readonly user: string,
		private readonly keyPath?: string,
	) {}

	async connect(): Promise<void> {
		this.cs.setConnectingTo(`${this.user}@${this.host}:${this.sshPort}`);
		this.cs.setPhase('connecting');
		this.log({type: 'ssh', status: 'info', direction: 'request', message: `Connecting to ${this.user}@${this.host}:${this.sshPort}`});

		try {
			const binaryPath = await invoke<string>('get_server_binary_path');

			this.cs.setPhase('checking');
			await this.provision(binaryPath);

			const remotePort = await this.startServer();

			this.localPort = await invoke<number>('find_free_port');

			await this.createTunnel(remotePort);

			this.wsClient = new WebSocketClient(`ws://127.0.0.1:${this.localPort}`);

			this.startHeartbeat();
			this.cs.reset();
		}
		catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this.log({type: 'ssh', status: 'error', direction: 'response', message: msg});
			this.cs.setError(msg);
			this.close();
			throw err;
		}
	}

	private async provision(binaryPath: string): Promise<void> {
		try {
			const remoteVer = await this.runSsh(
				`${REMOTE_BINARY_PATH} --version 2>/dev/null || echo NOT_INSTALLED`,
			);

			if (!FORCE_PROVISION && remoteVer.trim() === REMOTE_WORKER_VERSION) {
				this.log({type: 'ssh', status: 'info', direction: 'response', message: `Remote worker up-to-date (v${REMOTE_WORKER_VERSION})`});
				this.cs.setPhase('starting');
				return;
			}

			this.log({type: 'ssh', status: 'info', direction: 'request', message: 'Uploading remote worker binary…'});
			this.cs.setPhase('uploading');

			// Kill any stale process before overwriting — prevents "Text file busy"
			await this.killRemoteWorker();

			const localSize = await invoke<number>('get_file_size', {path: binaryPath});
			this.cs.setUploadTotal(localSize);
			this.cs.setUploadProgress(0);

			await this.runSsh(`mkdir -p ~/.local/bin`);
			await this.runScpWithProgress(binaryPath, '/tmp/gityak-upload', localSize);

			// Verify SCP actually created the file (SCP via SFTP can exit 0 without writing)
			const uploadedSize = await this.runSsh(`stat -c%s /tmp/gityak-upload 2>/dev/null || echo 0`);
			if (parseInt(uploadedSize.trim()) === 0) {
				throw new Error('SCP failed: /tmp/gityak-upload missing on remote after transfer');
			}

			await this.runSsh(`mv /tmp/gityak-upload ${REMOTE_BINARY_PATH} && chmod +x ${REMOTE_BINARY_PATH}`);

			const verifyOutput = await this.runSsh(
				`test -x ${REMOTE_BINARY_PATH} && file ${REMOTE_BINARY_PATH} | grep -q ELF && echo OK || echo EXEC_FAILED`,
			);
			if (verifyOutput.trim() !== 'OK') {
				const archInfo = await this.runSsh(`uname -m 2>/dev/null || echo unknown`).catch(() => 'unknown');
				throw new Error(`Binary not executable on remote (arch: ${archInfo.trim()}). Build the correct binary with: yarn workspace @git-yak/remote-worker build:linux`);
			}

			this.log({type: 'ssh', status: 'success', direction: 'response', message: 'Remote worker provisioned'});
		}
		catch (err: unknown) {
			this.log({type: 'ssh', status: 'error', direction: 'response', message: err instanceof Error ? err.message : String(err)});
			throw err;
		}
	}

	private async startServer(): Promise<number> {
		this.cs.setPhase('starting');
		this.log({type: 'ssh', status: 'info', direction: 'request', message: `Starting remote worker on ${this.host}`});

		// Kill any stale instance — needed when version matched and upload was skipped
		await this.killRemoteWorker();
		await new Promise(r => setTimeout(r, 500));

		return new Promise((resolve, reject) => {
			let settled = false;
			const timeoutId = setTimeout(() => {
				if (!settled) {
					settled = true;
					const err = new Error('Server startup timeout (30s)');
					this.log({type: 'ssh', status: 'error', direction: 'response', message: err.message});
					reject(err);
				}
			}, 30_000);

			const cmd = Command.create('ssh', this.buildSshArgs(
				`ONESHOT=1 PORT=0 ${REMOTE_BINARY_PATH}`,
			));

			cmd.stdout.addListener('data', (line: string) => {
				const m = /SERVER_READY\|PORT:(\d+)/.exec(line);
				if (m && !settled) {
					settled = true;
					clearTimeout(timeoutId);
					const port = Number(m[1]);
					this.log({type: 'ssh', status: 'success', direction: 'response', message: `Remote worker ready on port ${port}`});
					resolve(port);
				}
			});

			cmd.stderr.addListener('data', (line: string) => {
				const trimmed = line.trim();
				if (trimmed) {
					this.log({type: 'ssh', status: 'error', direction: 'response', message: `[remote] ${trimmed}`});
				}
			});

			cmd.on('close', ({code}: {code: number | null}) => {
				if (code !== 0 && code !== null && !settled) {
					settled = true;
					clearTimeout(timeoutId);
					const err = new Error(`Remote worker exited with code ${code}`);
					this.log({type: 'ssh', status: 'error', direction: 'response', message: err.message});
					reject(err);
				}
			});

			cmd.spawn()
				.then(child => { this.serverChild = child; })
				.catch(err => {
					if (!settled) {
						settled = true;
						clearTimeout(timeoutId);
						this.log({type: 'ssh', status: 'error', direction: 'response', message: err instanceof Error ? err.message : String(err)});
						reject(err);
					}
				});
		});
	}

	private createTunnel(remotePort: number): Promise<void> {
		this.cs.setPhase('tunneling');
		this.log({type: 'ssh', status: 'info', direction: 'request', message: `Creating SSH tunnel :${this.localPort} → :${remotePort}`});

		return new Promise((resolve, reject) => {
			const args = [
				'-p', String(this.sshPort),
				'-o', 'BatchMode=yes',
				'-o', 'StrictHostKeyChecking=accept-new',
				'-o', 'ExitOnForwardFailure=yes',
				...(this.keyPath ? ['-i', this.keyPath] : []),
				'-L', `${this.localPort}:127.0.0.1:${remotePort}`,
				'-N',
				`${this.user}@${this.host}`,
			];

			Command.create('ssh', args).spawn()
				.then(child => {
					this.tunnelChild = child;
					setTimeout(() => {
						this.log({type: 'ssh', status: 'success', direction: 'response', message: 'SSH tunnel established'});
						resolve();
					}, 800);
				})
				.catch(err => {
					this.log({type: 'ssh', status: 'error', direction: 'response', message: err instanceof Error ? err.message : String(err)});
					reject(err);
				});
		});
	}

	private killRemoteWorker(): Promise<void> {
		// Kill by PID file — reliable, no dependency on process name matching
		const cmd = 'pid=$(cat /tmp/gityak.pid 2>/dev/null); [ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -f /tmp/gityak.pid; true';
		return Command.create('ssh', this.buildSshArgs(cmd))
			.execute()
			.then(() => {})
			.catch(() => {});
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			this.wsClient?.call(ENetworkCommand.Heartbeat, {}).catch(() => {});
		}, 10_000);
	}

	private buildSshArgs(remoteCmd: string): string[] {
		return [
			'-p', String(this.sshPort),
			'-o', 'BatchMode=yes',
			'-o', 'StrictHostKeyChecking=accept-new',
			'-o', 'SendEnv=NONE',
			...(this.keyPath ? ['-i', this.keyPath] : []),
			`${this.user}@${this.host}`,
			remoteCmd,
		];
	}

	private async runSsh(cmd: string): Promise<string> {
		this.log({type: 'ssh', status: 'info', direction: 'request', message: `ssh: ${cmd}`});
		const r = await Command.create('ssh', this.buildSshArgs(cmd)).execute();
		if (r.code !== 0) {
			const detail = r.stderr?.trim() || `exit ${r.code}`;
			this.log({type: 'ssh', status: 'error', direction: 'response', message: `ssh error (${r.code}): ${detail}`});
			throw new Error(detail);
		}
		this.log({type: 'ssh', status: 'success', direction: 'response', message: `ssh ok: ${r.stdout.trim().slice(0, 120)}`});
		return r.stdout;
	}

	/** Like runSsh but without activity log — used for progress polling */
	private async execSsh(cmd: string): Promise<string> {
		const r = await Command.create('ssh', this.buildSshArgs(cmd)).execute();
		if (r.code !== 0) throw new Error(r.stderr?.trim() || `exit ${r.code}`);
		return r.stdout;
	}

	private async runScpWithProgress(localPath: string, remotePath: string, localSize: number): Promise<void> {
		const args = [
			'-P', String(this.sshPort),
			'-o', 'BatchMode=yes',
			'-o', 'StrictHostKeyChecking=accept-new',
			...(this.keyPath ? ['-i', this.keyPath] : []),
			localPath,
			`${this.user}@${this.host}:${remotePath}`,
		];

		let pollInterval: ReturnType<typeof setInterval> | null = null;
		let done = false;

		const scpPromise = Command.create('scp', args).execute();

		if (localSize > 0) {
			const CHUNK = 1 * 1024 * 1024;

			pollInterval = setInterval(async () => {
				if (done) return;
				try {
					const remoteSizeStr = await this.execSsh(`stat -c%s ${remotePath} 2>/dev/null || echo 0`);
					const remoteSize = parseInt(remoteSizeStr) || 0;
					const rounded = Math.floor(remoteSize / CHUNK) * CHUNK;
					const pct = Math.min(Math.floor(rounded / localSize * 100), 99);
					this.cs.setUploadProgress(pct);
				}
				catch {
					// ignore polling errors
				}
			}, 1000);
		}

		try {
			const r = await scpPromise;
			if (r.code !== 0) throw new Error(r.stderr || 'SCP failed');
		}
		finally {
			done = true;
			if (pollInterval !== null) clearInterval(pollInterval);
		}

		this.cs.setUploadProgress(100);
	}

	call(command: string, payload: Record<string, unknown>): Promise<unknown> {
		if (!this.wsClient) return Promise.reject(new Error('Not connected'));
		return this.wsClient.call(command, payload);
	}

	close(): void {
		this.log({type: 'ssh', status: 'info', direction: 'request', message: `Disconnecting from ${this.host}`});
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.wsClient?.close();
		this.tunnelChild?.kill();
		this.serverChild?.kill();
		this.heartbeatTimer = null;
		this.wsClient = null;
		this.tunnelChild = null;
		this.serverChild = null;
	}
}
