import {resolve, isAbsolute} from 'path';
import {promises as fs} from 'fs';
import type {IWsRequest} from '@git-yak/protocol';

function resolveFilePath(repoPath: string, filePath: string): string {
	const resolved = isAbsolute(filePath) ? filePath : resolve(repoPath, filePath);

	// Prevent directory traversal outside repository
	const normalizedRepo = repoPath.endsWith('/') ? repoPath : repoPath + '/';

	if (!resolved.startsWith(normalizedRepo) && resolved !== repoPath) {
		throw new Error(`Access denied: path outside repository: ${resolved}`);
	}

	return resolved;
}

interface IReadFileOptions {
	nullIfNotExists?: boolean;
}

export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId, repo_path, file_path, options = {}} = data;

	if (typeof repo_path !== 'string' || !repo_path) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'repo_path must be a non-empty string'}));
		return;
	}

	if (typeof file_path !== 'string' || !file_path) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'file_path must be a non-empty string'}));
		return;
	}

	const opts = options as IReadFileOptions;
	const nullIfNotExists = opts.nullIfNotExists === true;

	try {
		const resolvedRepo = isAbsolute(repo_path) ? repo_path : resolve(repo_path);
		const fullPath = resolveFilePath(resolvedRepo, file_path);

		let content: string | null;

		try {
			content = await fs.readFile(fullPath, {encoding: 'utf8'});
		}
		catch (e: unknown) {
			const err = e as NodeJS.ErrnoException;

			if (nullIfNotExists && err.code === 'ENOENT') {
				content = null;
			}
			else {
				throw e;
			}
		}

		ws.send(JSON.stringify({requestId, status: 'success', data: content}));
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Failed to read file';
		console.error('[readFile] error:', message);
		ws.send(JSON.stringify({requestId, status: 'error', message}));
	}
}
