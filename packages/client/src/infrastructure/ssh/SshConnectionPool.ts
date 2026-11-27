import {SshTunnelClient} from './SshTunnelClient';
import type {ITransportClient} from '../ITransportClient';

const pool = new Map<string, SshTunnelClient>();
// Connects in progress. A second caller for the same server (the open project while the
// manager's browser is still provisioning it) waits for that one rather than starting its
// own: two provisionings of one host would kill each other's worker through its PID file.
const connecting = new Map<string, {client: SshTunnelClient; connected: Promise<SshTunnelClient>}>();

function serverKey(host: string, port: number, user: string, keyPath?: string): string {
	return `${host}:${port}:${user}:${keyPath ?? ''}`;
}

export const sshConnectionPool = {
	/**
	 * `reportStatus`: see SshTunnelClient. A live pooled client is reused either way; one made
	 * silently for the manager starts reporting when the open project asks for it.
	 */
	async getOrCreate(host: string, port: number, user: string, keyPath?: string, reportStatus = false): Promise<SshTunnelClient> {
		const key = serverKey(host, port, user, keyPath);
		const existing = pool.get(key);

		if (existing?.isAlive()) {
			if (reportStatus) existing.enableStatusReporting();

			return existing;
		}

		const pending = connecting.get(key);

		if (pending) {
			// The rest of its provisioning (and a failure) is reported from here on.
			if (reportStatus) pending.client.enableStatusReporting();

			return pending.connected;
		}

		if (existing) {
			existing.onDead = undefined;
			existing.close();
			pool.delete(key);
		}

		const client = new SshTunnelClient(host, port, user, keyPath, reportStatus);
		// The pool entry alone is not enough: the dead tunnel's inner WebSocketClient still has
		// closedByUser === false, so without close() it reconnects forever against a worker
		// that is gone, keeps the reconnecting indicator lit and leaks its ssh children.
		client.onDead = () => {
			pool.delete(key);
			client.close();
		};

		const connected = client.connect().then(() => {
			pool.set(key, client);

			return client;
		});

		connecting.set(key, {client, connected});

		try {
			return await connected;
		}
		finally {
			connecting.delete(key);
		}
	},

	has(client: ITransportClient): boolean {
		return [...pool.values()].some(c => c === client);
	},

	closeByClient(client: ITransportClient): void {
		for (const [key, c] of pool) {
			if (c === client) {
				c.onDead = undefined;
				c.close();
				pool.delete(key);
				return;
			}
		}
		client.close();
	},

	closeAll(): void {
		for (const c of pool.values()) {
			c.onDead = undefined;
			c.close();
		}
		pool.clear();
	},
};
