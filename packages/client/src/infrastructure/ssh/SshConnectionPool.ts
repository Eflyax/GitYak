import {SshTunnelClient} from './SshTunnelClient';
import type {ITransportClient} from '../ITransportClient';

const pool = new Map<string, SshTunnelClient>();

function serverKey(host: string, port: number, user: string, keyPath?: string): string {
	return `${host}:${port}:${user}:${keyPath ?? ''}`;
}

export const sshConnectionPool = {
	async getOrCreate(host: string, port: number, user: string, keyPath?: string): Promise<SshTunnelClient> {
		const key = serverKey(host, port, user, keyPath);
		const existing = pool.get(key);

		if (existing?.isAlive()) {
			return existing;
		}

		if (existing) {
			existing.onDead = undefined;
			existing.close();
			pool.delete(key);
		}

		const client = new SshTunnelClient(host, port, user, keyPath);
		client.onDead = () => pool.delete(key);
		await client.connect();
		pool.set(key, client);
		return client;
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
