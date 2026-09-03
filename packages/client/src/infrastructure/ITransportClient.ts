import type {ENetworkCommand} from '@git-yak/protocol';

export interface ITransportClient {
	connect?(): Promise<void>
	call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown>
	close(): void
}
