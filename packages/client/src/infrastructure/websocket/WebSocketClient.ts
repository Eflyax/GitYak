import type {ENetworkCommand, IWsEvent} from '@git-yak/protocol';
import {isErrorResponse, isSuccessResponse, isRepoChangedEvent} from '@git-yak/protocol';
import type {ITransportClient} from '../ITransportClient';
import {nextBackoffDelay} from '../backoff';
import {useConnectionStatus} from '@/composables/useConnectionStatus';

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
	private ws!: WebSocket;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly queue: string[] = [];
	private connected = false;
	private authFailed = false;
	private eventCallback?: (event: IWsEvent) => void;
	private reconnectCallback?: () => void;
	private attempt = 0;
	private closedByUser = false;
	private reconnectTimer?: ReturnType<typeof setTimeout>;
	private readonly url: string;
	private readonly cs = useConnectionStatus();

	constructor(url: string, private readonly token = '') {
		this.url = url;
		this.open();
	}

	private open(): void {
		// A retry can still be in flight when close() runs; never resurrect a socket the
		// caller deliberately shut.
		if (this.closedByUser) {
			return;
		}

		this.ws = new WebSocket(this.url);

		this.ws.onopen = () => {
			// An empty token means this peer has no auth gate — the Rust remote worker,
			// which is reachable only through the SSH tunnel and deliberately has none.
			// Sending an auth frame there would wait forever for an ack that never comes.
			if (!this.token) {
				const wasReconnect = this.attempt > 0;

				this.attempt = 0;
				this.connected = true;
				this.queue.forEach(msg => this.ws.send(msg));
				this.queue.length = 0;

				if (wasReconnect) {
					this.cs.setReconnecting(false);
					this.reconnectCallback?.();
				}

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
					const wasReconnect = this.attempt > 0;

					this.attempt = 0;
					this.connected = true;
					this.queue.forEach(msg => this.ws.send(msg));
					this.queue.length = 0;

					if (wasReconnect) {
						this.cs.setReconnecting(false);
						this.reconnectCallback?.();
					}

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

			if (isRepoChangedEvent(data)) {
				this.eventCallback?.(data);

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

			// Anything still queued (calls waiting on the auth handshake) belongs to a
			// promise that was just rejected above — sending it on the next socket would
			// execute the command with nobody left to receive the response.
			this.queue.length = 0;

			if (this.closedByUser) {
				return;
			}

			// A rejected token is not retried: hammering the server every few seconds with
			// a credential it has already refused would never succeed and just adds noise.
			if (this.authFailed) {
				return;
			}

			// In-flight requests are deliberately NOT retried: replaying a git command
			// risks applying it twice. They reject above; the socket alone comes back.
			this.cs.setReconnecting(true);
			this.reconnectTimer = setTimeout(() => this.open(), nextBackoffDelay(this.attempt++));
		};

		this.ws.onerror = () => {
			this.pending.forEach(({reject}) => reject(new Error('WebSocket error')));
			this.pending.clear();
			this.queue.length = 0;
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

	onEvent(callback: (event: IWsEvent) => void): void {
		this.eventCallback = callback;
	}

	onReconnect(callback: () => void): void {
		this.reconnectCallback = callback;
	}

	isOpen(): boolean {
		return this.ws.readyState === WebSocket.OPEN;
	}

	close(): void {
		this.closedByUser = true;
		clearTimeout(this.reconnectTimer);
		this.reconnectTimer = undefined;
		this.ws.close();
	}
}
