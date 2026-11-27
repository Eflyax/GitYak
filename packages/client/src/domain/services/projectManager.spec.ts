import {describe, expect, it} from 'vitest';
import {
	clampRecentCount,
	connectionKey,
	connectionLabel,
	findProject,
	hasServer,
	isLocal,
	recentProjects,
	remoteConnections,
	toStoredConnection,
} from './projectManager';
import type {IProject, TProjectConnection} from '@/domain/models/Project';
import {EServerType} from '@/domain';

function project(id: string, over: Partial<IProject> = {}): IProject {
	return {
		id,
		order: 0,
		alias: id,
		path: `/${id}`,
		server: 'localhost',
		port: 3000,
		dateCreated: 0,
		dateLastOpen: 0,
		serverType: EServerType.Bun,
		...over,
	};
}

const SSH = {server: 'h', port: 22, serverType: EServerType.SSH, sshUser: 'deploy'};

describe('connection', () => {
	it('detects local', () => {
		expect(isLocal({server: 'localhost', port: 1, serverType: EServerType.SSH})).toBe(true);
		expect(isLocal(SSH)).toBe(false);
	});

	it('builds keys', () => {
		expect(connectionKey({server: 'localhost', port: 3000, serverType: EServerType.Bun})).toBe('local');
		expect(connectionKey(SSH)).toBe('ssh:deploy@h:22');
		expect(connectionKey({server: '10.0.0.2', port: 3000, serverType: EServerType.Bun})).toBe('bun:10.0.0.2:3000');
	});

	it('builds labels', () => {
		expect(connectionLabel({...SSH})).toBe('SSH · deploy@h');
		expect(connectionLabel({...SSH, port: 2222})).toBe('SSH · deploy@h:2222');
		expect(connectionLabel({server: 'h', port: 2222, serverType: EServerType.SSH})).toBe('SSH · h:2222');
		expect(connectionLabel({server: 'h', port: 22, serverType: EServerType.SSH})).toBe('SSH · h');
		expect(connectionLabel({server: 'localhost', port: 3000, serverType: EServerType.Bun})).toBe('Local');
		expect(connectionLabel({server: '10.0.0.2', port: 3000, serverType: EServerType.Bun})).toBe('Bun · 10.0.0.2:3000');
	});
});

describe('recentProjects', () => {
	it('returns the most recently opened, without mutating', () => {
		const list = [
			project('old', {dateLastOpen: 1}),
			project('newest', {dateLastOpen: 9}),
			project('second', {dateLastOpen: 5}),
		];
		expect(recentProjects(list, 2).map(p => p.id)).toEqual(['newest', 'second']);
		expect(list[0].id).toBe('old');
	});
});

describe('remoteConnections', () => {
	it('is unique per connection and key, skips local, newest first', () => {
		const list = [
			project('l', {dateLastOpen: 100}),
			project('a', {...SSH, dateLastOpen: 1}),
			project('b', {...SSH, dateLastOpen: 7}),
			project('c', {...SSH, sshKeyPath: '/k', dateLastOpen: 3}),
			project('d', {server: 'x', dateLastOpen: 5}),
		];
		const result = remoteConnections(list);
		expect(result).toHaveLength(3);
		expect(result.map(c => c.server)).toEqual(['h', 'x', 'h']);
		expect(result[2].sshKeyPath).toBe('/k');
	});

	it('collapses two projects on the same server with the same key', () => {
		expect(remoteConnections([project('a', SSH), project('b', SSH)])).toHaveLength(1);
	});
});

describe('findProject', () => {
	const list = [project('local-repo', {path: '/repo'}), project('r', {...SSH, path: '/srv/r'})];
	const localConn: TProjectConnection = {server: 'localhost', port: 3000, serverType: EServerType.Bun};

	it('matches ignoring a trailing slash', () => {
		expect(findProject(list, localConn, '/repo/')?.id).toBe('local-repo');
		expect(findProject(list, SSH, '/srv/r')?.id).toBe('r');
		expect(findProject(list, SSH, '/repo')).toBeUndefined();
	});
});

describe('clampRecentCount', () => {
	it('defaults, clamps and rounds', () => {
		expect(clampRecentCount(undefined)).toBe(5);
		expect(clampRecentCount(0)).toBe(1);
		expect(clampRecentCount(99)).toBe(20);
		expect(clampRecentCount(3.6)).toBe(4);
	});
});

describe('toStoredConnection', () => {
	const credentials = {sshUser: 'deploy', sshKeyPath: '~/.ssh/id', sshPrivateKey: 'KEY', token: 'TOKEN'};

	it('stores This PC as the Bun server, without credentials', () => {
		expect(toStoredConnection({server: 'localhost', port: 3000, serverType: EServerType.SSH, ...credentials})).toEqual({
			server: 'localhost',
			port: 3000,
			serverType: EServerType.Bun,
			sshUser: undefined,
			sshKeyPath: undefined,
			sshPrivateKey: undefined,
			token: undefined,
		});
	});

	it('keeps only the user and key path of an SSH server', () => {
		expect(toStoredConnection({server: 'h', port: 22, serverType: EServerType.SSH, ...credentials})).toEqual({
			server: 'h',
			port: 22,
			serverType: EServerType.SSH,
			sshUser: 'deploy',
			sshKeyPath: '~/.ssh/id',
			sshPrivateKey: undefined,
			token: undefined,
		});
	});

	it('keeps only the token and private key of a Bun server', () => {
		expect(toStoredConnection({server: 'h', port: 3000, serverType: EServerType.Bun, ...credentials})).toEqual({
			server: 'h',
			port: 3000,
			serverType: EServerType.Bun,
			sshUser: undefined,
			sshKeyPath: undefined,
			sshPrivateKey: 'KEY',
			token: 'TOKEN',
		});
	});

	it('trims the server, so a padded localhost is still This PC', () => {
		expect(toStoredConnection({server: '  h  ', port: 22, serverType: EServerType.SSH}).server).toBe('h');
		expect(toStoredConnection({server: ' localhost ', port: 3000, serverType: EServerType.SSH, ...credentials})).toMatchObject({
			server: 'localhost',
			serverType: EServerType.Bun,
			sshUser: undefined,
		});
	});

	it('drops empty credentials', () => {
		const stored = toStoredConnection({server: 'h', port: 22, serverType: EServerType.SSH, sshUser: '', sshKeyPath: ''});

		expect(stored.sshUser).toBeUndefined();
		expect(stored.sshKeyPath).toBeUndefined();

		const bun = toStoredConnection({server: 'h', port: 3000, serverType: EServerType.Bun, sshPrivateKey: '', token: ''});

		expect(bun.sshPrivateKey).toBeUndefined();
		expect(bun.token).toBeUndefined();
	});

	it('matches a stored project whatever padding the server was typed with', () => {
		const stored = project('a', {server: 'h', port: 22, serverType: EServerType.SSH, sshUser: 'deploy', path: '/srv/a'});
		const typed = toStoredConnection({server: ' h ', port: 22, serverType: EServerType.SSH, sshUser: 'deploy'});

		expect(findProject([stored], typed, '/srv/a')).toBe(stored);
	});
});

describe('hasServer', () => {
	it('needs a non-blank server', () => {
		expect(hasServer({server: 'localhost', port: 3000, serverType: EServerType.Bun})).toBe(true);
		expect(hasServer({server: 'h', port: 22, serverType: EServerType.SSH})).toBe(true);
		expect(hasServer({server: '   ', port: 22, serverType: EServerType.SSH})).toBe(false);
		expect(hasServer({server: '', port: 22, serverType: EServerType.SSH})).toBe(false);
	});
});
