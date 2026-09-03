import {serve} from 'bun';
import {ENetworkCommand} from '@git-yak/protocol';
import type {IWsRequest} from '@git-yak/protocol';
import * as GitCall from './commands/GitCall';
import * as GitRebase from './commands/GitRebase';
import * as ReadFile from './commands/ReadFile';
import * as WriteFile from './commands/WriteFile';
import * as BrowseFiles from './commands/BrowseFiles';
import * as SshAgentInit from './commands/SshAgentInit';

const PORT = Number(process.env.PORT ?? 3_000);

serve({
	port: PORT,
	fetch(req, server) {
		if (server.upgrade(req)) {
			return;
		}

		return new Response('Git Yak server', {status: 200});
	},
	websocket: {
		open(ws) {
			console.log('[ws] client connected');
			ws.send(JSON.stringify({type: 'hello', message: 'Git Yak server ready'}));
		},
		async message(ws, message) {
			let data: IWsRequest | undefined;

			try {
				data = JSON.parse(message.toString()) as IWsRequest;

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
			SshAgentInit.destroyAgent(ws);
		},
	},
});

console.log(`[server] running on port ${PORT}`);
