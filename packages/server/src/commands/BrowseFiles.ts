import {join} from 'path';
import {readdirSync, statSync} from 'fs';
import type {IWsRequest} from '@git-yak/protocol';

interface IDirEntry {
	name: string;
	isDirectory: boolean;
}

export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId, path: dirPath = '/'} = data;

	if (typeof dirPath !== 'string' || !dirPath) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'path must be a non-empty string'}));
		return;
	}

	try {
		const names = readdirSync(dirPath);

		const entries: IDirEntry[] = names
			.map(name => {
				const fullPath = join(dirPath, name);
				let isDirectory = false;

				try {
					isDirectory = statSync(fullPath).isDirectory();
				}
				catch {
					// Ignore entries we can't stat (permission errors, broken symlinks)
				}

				return {name, isDirectory};
			})
			.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) {
					return a.isDirectory ? -1 : 1;
				}
				return a.name.localeCompare(b.name);
			});

		ws.send(JSON.stringify({
			requestId,
			status: 'success',
			data: {path: dirPath, entries},
		}));
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Failed to browse directory';
		ws.send(JSON.stringify({requestId, status: 'error', message}));
	}
}
