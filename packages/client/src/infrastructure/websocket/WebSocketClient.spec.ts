import {beforeEach, describe, expect, it, vi} from 'vitest';
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
	socket = new FakeSocket();
	vi.stubGlobal('WebSocket', function (this: unknown) {
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
});
