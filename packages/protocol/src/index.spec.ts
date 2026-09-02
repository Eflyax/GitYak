import {describe, expect, it} from 'vitest';
import {ENetworkCommand, isErrorResponse} from './index';

describe('ENetworkCommand', () => {
	it('pins the wire values the Rust worker matches on', () => {
		expect(ENetworkCommand.GitCall).toBe('gitCall');
		expect(ENetworkCommand.ReadFile).toBe('readFile');
		expect(ENetworkCommand.WriteFile).toBe('writeFile');
		expect(ENetworkCommand.BrowseFiles).toBe('browseFiles');
		expect(ENetworkCommand.Heartbeat).toBe('heartbeat');
		expect(ENetworkCommand.SshAgentInit).toBe('sshAgentInit');
	});
});

describe('isErrorResponse', () => {
	it('narrows an error frame', () => {
		expect(isErrorResponse({requestId: '1', status: 'error', message: 'nope'})).toBe(true);
	});

	it('rejects a success frame', () => {
		expect(isErrorResponse({requestId: '1', status: 'success'})).toBe(false);
	});
});
