import {writeFileSync, unlinkSync} from 'node:fs';
import * as GitCall from './commands/GitCall';
import * as ReadFile from './commands/ReadFile';
import * as WriteFile from './commands/WriteFile';
import * as BrowseFiles from './commands/BrowseFiles';
import * as Heartbeat from './commands/Heartbeat';
import type {IWsMessage} from './types';

export const REMOTE_WORKER_VERSION = '1.0.3';
const PID_FILE = '/tmp/gityak.pid';

if (process.argv.includes('--version')) {
	console.log(REMOTE_WORKER_VERSION);
	process.exit(0);
}

// PID file only written when running as server, not during --version check
writeFileSync(PID_FILE, String(process.pid));
process.on('exit', () => { try { unlinkSync(PID_FILE); } catch {} });

const PORT = Number(process.env.PORT ?? 0); // 0 = random port
const ONESHOT = process.env.ONESHOT === '1';

declare global {
	var __resetPing: (() => void) | undefined;
}

enum ENetworkCommand {
	GitCall = 'gitCall',
	WriteFile = 'writeFile',
	ReadFile = 'readFile',
	BrowseFiles = 'browseFiles',
	Heartbeat = 'heartbeat',
}

const server = Bun.serve({
	port: PORT,
	hostname: '127.0.0.1',
	fetch(req, server) {
		if (server.upgrade(req)) {
			return;
		}

		return new Response('git-yak remote-worker', {status: 200});
	},
	websocket: {
		open(ws) {
			console.log('[ws] client connected');
			ws.send(JSON.stringify({type: 'hello', message: 'git-yak remote-worker ready'}));
		},
		async message(ws, message) {
			let data: IWsMessage | undefined;

			try {
				data = JSON.parse(message.toString()) as IWsMessage;

				const {command} = data;

				switch (command) {
					case ENetworkCommand.GitCall:
						await GitCall.run(ws, data);
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

					case ENetworkCommand.Heartbeat:
						await Heartbeat.run(ws, data);
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
				const msg = e instanceof Error ? e.message : 'Internal server error';
				console.error('[ws] error processing message:', msg);

				ws.send(JSON.stringify({
					requestId: data?.requestId,
					status: 'error',
					message: 'Failed to process message',
					details: msg,
				}));
			}
		},
		close(_ws) {
			console.log('[ws] client disconnected');
		},
	},
});

process.stdout.write(`SERVER_READY|PORT:${server.port}\n`);

if (ONESHOT) {
	let lastPing = Date.now();
	globalThis.__resetPing = () => { lastPing = Date.now(); };

	setInterval(() => {
		if (Date.now() - lastPing > 30_000) {
			console.log('[remote-worker] no heartbeat, shutting down');
			process.exit(0);
		}
	}, 5_000);
}
