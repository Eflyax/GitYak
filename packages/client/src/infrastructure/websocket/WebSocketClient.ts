import type {ENetworkCommand} from '@git-yak/protocol';
import {isErrorResponse, isSuccessResponse} from '@git-yak/protocol';
import type {ITransportClient} from '../ITransportClient';

type PendingRequest = {
	resolve: (value: unknown) => void
	reject: (reason: unknown) => void
};

// A frame that matches neither guard is still routed back to its caller (and rejected),
// so a malformed error frame cannot leave a pending request hanging forever.
function extractRequestId(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}

	const requestId = (value as {requestId?: unknown}).requestId;

	return typeof requestId === 'string' ? requestId : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export class WebSocketClient implements ITransportClient {
	private readonly ws: WebSocket;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly queue: string[] = [];
	private connected = false;
	private authFailed = false;

	constructor(url: string, private readonly token = '') {
		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			// An empty token means this peer has no auth gate — the Rust remote worker,
			// which is reachable only through the SSH tunnel and deliberately has none.
			// Sending an auth frame there would wait forever for an ack that never comes.
			if (!this.token) {
				this.connected = true;
				this.queue.forEach(msg => this.ws.send(msg));
				this.queue.length = 0;

				return;
			}

			// Otherwise the auth frame goes first, alone. Queued calls are released only
			// once the server has accepted it.
			this.ws.send(JSON.stringify({type: 'auth', token: this.token}));
		};

		this.ws.onmessage = (event: MessageEvent) => {
			let data: unknown;

			try {
				data = JSON.parse(event.data as string);
			}
			catch {
				return;
			}

			if (isRecord(data) && data['type'] === 'auth') {
				if (data['status'] === 'success') {
					this.connected = true;
					this.queue.forEach(msg => this.ws.send(msg));
					this.queue.length = 0;

					return;
				}

				// Authentication failed: fail every queued and in-flight call with the real
				// reason, or the socket close below surfaces only "connection closed".
				const message = typeof data['message'] === 'string' ? data['message'] : 'Authentication failed';

				this.authFailed = true;
				this.pending.forEach(({reject}) => reject(new Error(message)));
				this.pending.clear();
				this.queue.length = 0;

				return;
			}

			const requestId = extractRequestId(data);

			if (!requestId || !this.pending.has(requestId)) {
				return;
			}

			const entry = this.pending.get(requestId)!;

			if (isSuccessResponse(data)) {
				entry.resolve(data.data);
			}
			else if (isErrorResponse(data)) {
				entry.reject(new Error(data.message));
			}
			else {
				entry.reject(new Error('Server error'));
			}

			this.pending.delete(requestId);
		};

		this.ws.onclose = () => {
			this.connected = false;
			this.pending.forEach(({reject}) => reject(new Error('WebSocket connection closed')));
			this.pending.clear();
		};

		this.ws.onerror = () => {
			this.pending.forEach(({reject}) => reject(new Error('WebSocket error')));
			this.pending.clear();
		};
	}

	call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			if (this.authFailed) {
				reject(new Error('Authentication failed'));

				return;
			}

			const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

			this.pending.set(requestId, {resolve, reject});

			const message = JSON.stringify({requestId, command, ...payload});

			if (this.connected) {
				this.ws.send(message);
			}
			else {
				this.queue.push(message);
			}
		});
	}

	isOpen(): boolean {
		return this.ws.readyState === WebSocket.OPEN;
	}

	close(): void {
		this.ws.close();
	}
}
