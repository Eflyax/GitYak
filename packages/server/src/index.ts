import {serve} from 'bun';
import {ENetworkCommand, isAuthRequest} from '@git-yak/protocol';
import type {IWsRequest} from '@git-yak/protocol';
import {BIND_HOST, defaultAllowlist, isOriginAllowed, resolveToken} from './auth';
import * as GitCall from './commands/GitCall';
import * as GitRebase from './commands/GitRebase';
import * as ReadFile from './commands/ReadFile';
import * as WriteFile from './commands/WriteFile';
import * as BrowseFiles from './commands/BrowseFiles';
import * as SshAgentInit from './commands/SshAgentInit';

const PORT = Number(process.env.PORT ?? 3_000);

const
	TOKEN = resolveToken(),
	ALLOWED_ORIGINS = defaultAllowlist(),
	AUTH_TIMEOUT_MS = 5_000;

// Sockets start unauthenticated. A socket that has not sent a valid auth frame within
// AUTH_TIMEOUT_MS is closed, and any command sent before authentication is refused.
const authenticated = new WeakSet<object>();
const authTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();

serve({
	hostname: BIND_HOST,
	port: PORT,
	fetch(req, server) {
		if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
			if (!isOriginAllowed(req.headers.get('origin'), ALLOWED_ORIGINS)) {
				console.warn('[ws] refused upgrade from origin:', req.headers.get('origin'));

				return new Response('Forbidden origin', {status: 403});
			}
		}

		if (server.upgrade(req)) {
			return;
		}

		return new Response('Git Yak server', {status: 200});
	},
	websocket: {
		open(ws) {
			console.log('[ws] client connected');
			authTimers.set(ws, setTimeout(() => {
				if (!authenticated.has(ws)) {
					console.warn('[ws] closing socket that never authenticated');
					ws.close();
				}
			}, AUTH_TIMEOUT_MS));
			ws.send(JSON.stringify({type: 'hello', message: 'Git Yak server ready'}));
		},
		async message(ws, message) {
			let data: IWsRequest | undefined;

			let parsed: unknown;

			try {
				parsed = JSON.parse(message.toString());
			}
			catch {
				ws.send(JSON.stringify({status: 'error', message: 'Failed to parse message'}));

				return;
			}

			if (isAuthRequest(parsed)) {
				if (parsed.token === TOKEN) {
					authenticated.add(ws);
					clearTimeout(authTimers.get(ws));
					ws.send(JSON.stringify({type: 'auth', status: 'success'}));
				}
				else {
					console.warn('[ws] rejected a bad token');
					ws.send(JSON.stringify({type: 'auth', status: 'error', message: 'Invalid token'}));
					ws.close();
				}

				return;
			}

			if (!authenticated.has(ws)) {
				const requestId = (parsed as {requestId?: string} | null)?.requestId;

				ws.send(JSON.stringify({requestId, status: 'error', message: 'Not authenticated'}));
				ws.close();

				return;
			}

			try {
				data = parsed as IWsRequest;

				const {command} = data;

				switch (command) {
					case ENetworkCommand.GitCall:
						await GitCall.run(ws, data);
						break;

					case ENetworkCommand.GitRebase:
						await GitRebase.run(ws, data);
						break;

					case ENetworkCommand.ReadFile:
						await ReadFile.run(ws, data);
						break;

					case ENetworkCommand.WriteFile:
						await WriteFile.run(ws, data);
						break;

					case ENetworkCommand.BrowseFiles:
						await BrowseFiles.run(ws, data);
						break;

					case ENetworkCommand.SshAgentInit:
						await SshAgentInit.run(ws, data);
						break;

					default:
						ws.send(JSON.stringify({
							requestId: data.requestId,
							status: 'error',
							message: `Unknown command: ${command}`,
						}));
				}
			}
			catch (e: unknown) {
				const message = e instanceof Error ? e.message : 'Internal server error';
				console.error('[ws] error processing message:', message);

				ws.send(JSON.stringify({
					requestId: data?.requestId,
					status: 'error',
					message: 'Failed to process message',
					details: message,
				}));
			}
		},
		close(ws) {
			console.log('[ws] client disconnected');
			clearTimeout(authTimers.get(ws));
			SshAgentInit.destroyAgent(ws);
		},
	},
});

console.log(`[server] running on ${BIND_HOST}:${PORT}`);
