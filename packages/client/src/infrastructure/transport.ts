import {WebSocketClient} from '@/infrastructure/websocket/WebSocketClient';
import {getServerToken} from '@/infrastructure/serverToken';
import {TauriLocalClient} from '@/infrastructure/tauri/TauriLocalClient';
import {sshConnectionPool} from '@/infrastructure/ssh/SshConnectionPool';
import type {ITransportClient} from '@/infrastructure/ITransportClient';
import {EServerType} from '@/domain';
import type {TProjectConnection} from '@/domain/models/Project';
import {isLocal} from '@/domain/services/projectManager';
import {isTauri} from '@/infrastructure/tauri/isTauri';

/**
 * Creates the transport for any connection (not only the open project). SSH clients come from
 * the shared pool. Only the open project's connect passes `reportStatus: true`: its SSH
 * provisioning and connect errors take over the screen, and its reconnects light the toolbar
 * indicator. Everything else (the manager's browser and Open/Clone/Create) stays silent and
 * shows its own progress and errors.
 */
export async function createTransport(
	c: TProjectConnection,
	{reportStatus = false}: {reportStatus?: boolean} = {},
): Promise<ITransportClient> {
	if (isTauri && isLocal(c)) {
		return new TauriLocalClient();
	}

	if (c.serverType === EServerType.SSH) {
		return sshConnectionPool.getOrCreate(c.server, c.port, c.sshUser ?? '', c.sshKeyPath, reportStatus);
	}

	return new WebSocketClient(`ws://${c.server}:${c.port}`, await getServerToken(c), {reportStatus});
}

/** Pooled (SSH) clients may be shared with the open project, so they are left open; others are closed. */
export function releaseTransport(client: ITransportClient): void {
	if (!sshConnectionPool.has(client)) {
		client.close();
	}
}
