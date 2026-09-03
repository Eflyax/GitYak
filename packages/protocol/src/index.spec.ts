import {describe, expect, it} from 'vitest';
import {ENetworkCommand, isAuthRequest, isErrorResponse, isRepoChangedEvent, isSuccessResponse} from './index';

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

	it('narrows an error frame without a requestId', () => {
		expect(isErrorResponse({status: 'error', message: 'nope'})).toBe(true);
	});

	it('rejects a success frame', () => {
		expect(isErrorResponse({requestId: '1', status: 'success'})).toBe(false);
	});

	it('rejects null', () => {
		expect(isErrorResponse(null)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isErrorResponse(undefined)).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(isErrorResponse('error')).toBe(false);
		expect(isErrorResponse(42)).toBe(false);
	});

	it('rejects an object with no status', () => {
		expect(isErrorResponse({requestId: '1', message: 'nope'})).toBe(false);
	});

	it('rejects an error frame whose message is not a string', () => {
		expect(isErrorResponse({requestId: '1', status: 'error', message: 42})).toBe(false);
		expect(isErrorResponse({requestId: '1', status: 'error'})).toBe(false);
	});
});

describe('isSuccessResponse', () => {
	it('narrows a success frame', () => {
		expect(isSuccessResponse({requestId: '1', status: 'success'})).toBe(true);
	});

	it('narrows a success frame carrying data', () => {
		expect(isSuccessResponse({requestId: '1', status: 'success', data: {branches: []}})).toBe(true);
	});

	it('rejects an error frame', () => {
		expect(isSuccessResponse({requestId: '1', status: 'error', message: 'nope'})).toBe(false);
	});

	it('rejects null', () => {
		expect(isSuccessResponse(null)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isSuccessResponse(undefined)).toBe(false);
	});

	it('rejects a non-object', () => {
		expect(isSuccessResponse('success')).toBe(false);
	});

	it('rejects an object with no status', () => {
		expect(isSuccessResponse({requestId: '1'})).toBe(false);
	});

	it('rejects a success frame with no requestId', () => {
		expect(isSuccessResponse({status: 'success'})).toBe(false);
	});
});

describe('isAuthRequest', () => {
	it('accepts a well-formed auth frame', () => {
		expect(isAuthRequest({type: 'auth', token: 'abc'})).toBe(true);
	});

	it('rejects a missing token', () => {
		expect(isAuthRequest({type: 'auth'})).toBe(false);
	});

	it('rejects a non-string token', () => {
		expect(isAuthRequest({type: 'auth', token: 42})).toBe(false);
	});

	it('rejects another frame type', () => {
		expect(isAuthRequest({type: 'event', event: 'repoChanged', paths: []})).toBe(false);
	});

	it('rejects null and non-objects', () => {
		expect(isAuthRequest(null)).toBe(false);
		expect(isAuthRequest('auth')).toBe(false);
	});
});

describe('isRepoChangedEvent', () => {
	it('accepts a well-formed event frame', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: ['a.txt']})).toBe(true);
	});

	it('accepts an empty paths array', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: []})).toBe(true);
	});

	it('rejects a non-array paths', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: 'a.txt'})).toBe(false);
	});

	it('rejects an unknown event name', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'somethingElse', paths: []})).toBe(false);
	});

	it('does not mistake a response frame for an event', () => {
		expect(isRepoChangedEvent({requestId: '1', status: 'success'})).toBe(false);
	});
});
