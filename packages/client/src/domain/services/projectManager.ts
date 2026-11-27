import {EServerType} from '@/domain/enums';
import {LOCAL_SERVER} from '@/domain/models/Project';
import type {IProject, TProjectConnection} from '@/domain/models/Project';

const DEFAULT_SSH_PORT = 22;
const DEFAULT_RECENT_COUNT = 5;
const MIN_RECENT_COUNT = 1;
const MAX_RECENT_COUNT = 20;

export function isLocal(c: TProjectConnection): boolean {
	return c.server === LOCAL_SERVER;
}

/** A connection names a server (This PC counts: it is `localhost`). */
export function hasServer(c: TProjectConnection): boolean {
	return c.server.trim().length > 0;
}

/**
 * The connection as a project stores it - what `connectionKey` and `findProject` later match on.
 * The server is trimmed; This PC always uses the Bun server and keeps no credentials; a remote
 * server keeps only its own type's (SSH: user and key path; Bun: token and private key). Empty
 * values are dropped.
 */
export function toStoredConnection(c: TProjectConnection): TProjectConnection {
	const server = c.server.trim();
	const local = server === LOCAL_SERVER;
	const serverType = local ? EServerType.Bun : c.serverType;
	const ssh = serverType === EServerType.SSH;
	const bun = !local && !ssh;

	return {
		server,
		port: c.port,
		serverType,
		sshUser: ssh ? (c.sshUser || undefined) : undefined,
		sshKeyPath: ssh ? (c.sshKeyPath || undefined) : undefined,
		sshPrivateKey: bun ? (c.sshPrivateKey || undefined) : undefined,
		token: bun ? (c.token || undefined) : undefined,
	};
}

export function connectionKey(c: TProjectConnection): string {
	if (isLocal(c)) {
		return 'local';
	}

	if (c.serverType === EServerType.SSH) {
		return `ssh:${c.sshUser ?? ''}@${c.server}:${c.port}`;
	}

	return `bun:${c.server}:${c.port}`;
}

export function connectionLabel(c: TProjectConnection): string {
	if (isLocal(c)) {
		return 'Local';
	}

	if (c.serverType === EServerType.SSH) {
		const host = c.port === DEFAULT_SSH_PORT ? c.server : `${c.server}:${c.port}`;

		return `SSH · ${c.sshUser ? `${c.sshUser}@` : ''}${host}`;
	}

	return `Bun · ${c.server}:${c.port}`;
}

function byLastOpenDesc(projects: ReadonlyArray<IProject>): Array<IProject> {
	return [...projects].sort((a, b) => b.dateLastOpen - a.dateLastOpen);
}

export function recentProjects(projects: ReadonlyArray<IProject>, count: number): Array<IProject> {
	return byLastOpenDesc(projects).slice(0, count);
}

export function remoteConnections(projects: ReadonlyArray<IProject>): Array<TProjectConnection> {
	const seen = new Set<string>();
	const result: Array<TProjectConnection> = [];

	for (const p of byLastOpenDesc(projects)) {
		if (isLocal(p)) {
			continue;
		}

		const id = `${connectionKey(p)}|${p.sshKeyPath ?? ''}`;

		if (seen.has(id)) {
			continue;
		}

		seen.add(id);
		result.push({
			server: p.server,
			port: p.port,
			serverType: p.serverType,
			sshUser: p.sshUser,
			sshKeyPath: p.sshKeyPath,
			sshPrivateKey: p.sshPrivateKey,
			token: p.token,
		});
	}

	return result;
}

function stripTrailingSlash(path: string): string {
	return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export function findProject(projects: ReadonlyArray<IProject>, c: TProjectConnection, path: string): IProject | undefined {
	const key = connectionKey(c);
	const wanted = stripTrailingSlash(path);

	return projects.find(p => connectionKey(p) === key && stripTrailingSlash(p.path) === wanted);
}

export function clampRecentCount(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) {
		return DEFAULT_RECENT_COUNT;
	}

	return Math.min(MAX_RECENT_COUNT, Math.max(MIN_RECENT_COUNT, Math.round(value)));
}
