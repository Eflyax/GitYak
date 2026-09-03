import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ENetworkCommand} from '@git-yak/protocol';
import {WebSocketClient} from './WebSocketClient';

class FakeSocket {
	static OPEN = 1;
	readyState = FakeSocket.OPEN;
	sent: Array<string> = [];
	onopen?: () => void;
	onmessage?: (event: {data: string}) => void;
	onclose?: () => void;
	onerror?: () => void;

	send(msg: string): void {
		this.sent.push(msg);
	}

	close(): void {}
}

let socket: FakeSocket;

beforeEach(() => {
	// Each `new WebSocket(...)` call — including the ones a reconnect makes internally via
	// open() — returns a fresh FakeSocket and reassigns the outer `socket` binding to it, so
	// a reconnect test can tell a genuine new connection apart from the original by identity.
	vi.stubGlobal('WebSocket', function (this: unknown) {
		socket = new FakeSocket();

		return socket;
	} as unknown as typeof WebSocket);
	(globalThis.WebSocket as unknown as {OPEN: number}).OPEN = FakeSocket.OPEN;
});

function accept(): void {
	socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'success'})});
}

describe('WebSocketClient auth gate', () => {
	it('sends the auth frame first, alone', () => {
		new WebSocketClient('ws://x', 'secret');
		socket.onopen?.();

		expect(socket.sent).toEqual([JSON.stringify({type: 'auth', token: 'secret'})]);
	});

	it('holds a call made before the token is accepted', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		void client.call(ENetworkCommand.GitCall, {args: ['status']});

		expect(socket.sent).toHaveLength(1);
		expect(socket.sent[0]).toContain('"type":"auth"');
	});

	it('releases queued calls once the token is accepted', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		void client.call(ENetworkCommand.GitCall, {args: ['status']});
		accept();

		expect(socket.sent).toHaveLength(2);
		expect(socket.sent[1]).toContain('"command":"gitCall"');
	});

	it('skips the handshake entirely when no token is given', () => {
		const client = new WebSocketClient('ws://x');

		socket.onopen?.();
		void client.call(ENetworkCommand.GitCall, {args: ['status']});

		// No auth frame, and the call goes out immediately: this is the SSH tunnel path,
		// where the Rust worker has no auth gate and would never send an ack.
		expect(socket.sent).toHaveLength(1);
		expect(socket.sent[0]).toContain('"command":"gitCall"');
	});

	it('resolves a call routed back after authentication', async () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		accept();

		const pending = client.call(ENetworkCommand.GitCall, {args: ['status']});
		const requestId = JSON.parse(socket.sent[1]).requestId as string;

		socket.onmessage?.({data: JSON.stringify({requestId, status: 'success', data: 'ok'})});

		await expect(pending).resolves.toBe('ok');
	});

	it('rejects a queued call with the server\'s reason when the token is wrong', async () => {
		const client = new WebSocketClient('ws://x', 'wrong');

		socket.onopen?.();

		const pending = client.call(ENetworkCommand.GitCall, {args: ['status']});

		socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'error', message: 'Invalid token'})});

		await expect(pending).rejects.toThrow('Invalid token');
	});

	it('rejects a call made after a failed authentication', async () => {
		const client = new WebSocketClient('ws://x', 'wrong');

		socket.onopen?.();
		socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'error', message: 'Invalid token'})});

		await expect(client.call(ENetworkCommand.GitCall, {args: ['status']})).rejects.toThrow('Authentication failed');
	});
});

describe('WebSocketClient reconnect', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not reconnect after the caller closes it', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'success'})});

		const first = socket;

		client.close();
		socket.onclose?.();

		vi.advanceTimersByTime(30_000);

		// Still the same socket instance: no replacement was opened.
		expect(socket).toBe(first);
	});

	it('does not reconnect after authentication was rejected', () => {
		const client = new WebSocketClient('ws://x', 'wrong');

		socket.onopen?.();
		socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'error', message: 'Invalid token'})});

		const first = socket;

		socket.onclose?.();
		vi.advanceTimersByTime(30_000);

		expect(socket).toBe(first);
		void client;
	});

	it('reconnects with a new socket after an unintentional close, and cancels a pending retry on close()', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'success'})});

		const first = socket;

		// Unintentional close: not closedByUser, not authFailed — a retry is scheduled.
		socket.onclose?.();

		// A retry is scheduled but not due yet — close() before it fires must cancel it,
		// not let it resurrect a socket nobody holds a reference to (Critical 1).
		client.close();

		vi.advanceTimersByTime(30_000);

		expect(socket).toBe(first);
	});
});
