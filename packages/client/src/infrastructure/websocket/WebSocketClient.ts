import type {ITransportClient} from '../ITransportClient';

type PendingRequest = {
	resolve: (value: unknown) => void
	reject: (reason: unknown) => void
};

export class WebSocketClient implements ITransportClient {
	private readonly ws: WebSocket;
	private readonly pending = new Map<string, PendingRequest>();
	private readonly queue: string[] = [];
	private connected = false;

	constructor(url: string) {
		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			this.connected = true;
			this.queue.forEach(msg => this.ws.send(msg));
			this.queue.length = 0;
		};

		this.ws.onmessage = (event: MessageEvent) => {
			let data: Record<string, unknown>;

			try {
				data = JSON.parse(event.data as string) as Record<string, unknown>;
			}
			catch {
				return;
			}

			const requestId = data['requestId'] as string | undefined;

			if (requestId && this.pending.has(requestId)) {
				const entry = this.pending.get(requestId)!;

				if (data['status'] === 'success') {
					entry.resolve(data['data']);
				}
				else {
					entry.reject(new Error((data['message'] as string | undefined) ?? 'Server error'));
				}

				this.pending.delete(requestId);
			}
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

	call(command: string, payload: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
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
