import type {ENetworkCommand, IWsEvent} from '@git-yak/protocol';

export interface IGitProcess {
	done: Promise<void>
	cancel(): void
}

export interface ITransportClient {
	connect?(): Promise<void>
	call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown>
	onEvent?(callback: (event: IWsEvent) => void): void
	onReconnect?(callback: () => void): void
	/**
	 * Optional: runs git in `repoPath`, passing every stdout/stderr line (including `\r`-separated
	 * progress lines) to `onOutput`. `done` rejects with Error(stderr) on a non-zero exit or cancel.
	 */
	spawnGit?(repoPath: string, args: Array<string>, onOutput: (line: string) => void): IGitProcess
	close(): void
}
