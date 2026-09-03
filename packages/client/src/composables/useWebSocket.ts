import {ref, readonly} from 'vue';
import type {IWsEvent} from '@git-yak/protocol';
import {WebSocketClient} from '@/infrastructure/websocket/WebSocketClient';
import {getServerToken} from '@/infrastructure/serverToken';
import {TauriLocalClient} from '@/infrastructure/tauri/TauriLocalClient';
import {sshConnectionPool} from '@/infrastructure/ssh/SshConnectionPool';
import type {ITransportClient} from '@/infrastructure/ITransportClient';
import {EConnectionStatus, ENetworkCommand, EServerType} from '@/domain';
import type {IProject} from '@/domain';
import {useConnectionStatus} from '@/composables/useConnectionStatus';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const client = ref<ITransportClient | null>(null);
const status = ref<EConnectionStatus>(EConnectionStatus.Idle);

// A replaced client is closed through the pool, which both removes any pooled entry and
// clears its onDead handler, and falls back to a plain close() for a non-pooled client.
function closePrevious(previous: ITransportClient | null): void {
	if (previous && previous !== client.value) {
		sshConnectionPool.closeByClient(previous);
	}
}

export function useWebSocket() {
	async function connect(project: IProject): Promise<void> {
		useConnectionStatus().reset();

		// Whatever was open before is closed once its replacement is installed — including an
		// SSH tunnel, which used to be left behind. An abandoned client still has
		// closedByUser === false, so it would reconnect on a backoff loop forever, hold a
		// server-side watch session, and light the reconnecting indicator for a project that
		// is no longer open.
		const previous = client.value;

		status.value = EConnectionStatus.Connecting;

		try {
			let newClient: ITransportClient;

			if (isTauri && project.server === 'localhost') {
				newClient = new TauriLocalClient();
			}
			else if (project.serverType === EServerType.SSH) {
				const pooled = await sshConnectionPool.getOrCreate(
					project.server,
					project.port,
					project.sshUser ?? '',
					project.sshKeyPath,
				);
				client.value = pooled;
				closePrevious(previous);
				status.value = EConnectionStatus.Connected;
				return;
			}
			else {
				const token = await getServerToken(project);

				newClient = new WebSocketClient(`ws://${project.server}:${project.port}`, token);
			}

			client.value = newClient;
			closePrevious(previous);
			status.value = EConnectionStatus.Connected;
		}
		catch (e) {
			status.value = EConnectionStatus.Disconnected;
			throw e;
		}
	}

	function disconnect(): void {
		if (client.value) {
			sshConnectionPool.closeByClient(client.value);
		}
		client.value = null;
		status.value = EConnectionStatus.Disconnected;
	}

	function call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown> {
		if (!client.value) {
			return Promise.reject(new Error('Not connected'));
		}

		return client.value.call(command, payload);
	}

	function onEvent(callback: (event: IWsEvent) => void): void {
		client.value?.onEvent?.(callback);
	}

	function onReconnect(callback: () => void): void {
		client.value?.onReconnect?.(callback);
	}

	return {
		client: readonly(client),
		status: readonly(status),
		connect,
		disconnect,
		call,
		onEvent,
		onReconnect,
	};
}
