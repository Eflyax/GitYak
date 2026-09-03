import type {ENetworkCommand, IWsEvent} from '@git-yak/protocol';

export interface ITransportClient {
	connect?(): Promise<void>
	call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown>
	onEvent?(callback: (event: IWsEvent) => void): void
	onReconnect?(callback: () => void): void
	close(): void
}
