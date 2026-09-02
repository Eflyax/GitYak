import {resolve, dirname, isAbsolute} from 'path';
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

interface IWriteFileOptions {
	makeDirectory?: boolean;
}

export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId, repo_path, file_path, content, options = {}} = data;

	if (typeof repo_path !== 'string' || !repo_path) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'repo_path must be a non-empty string'}));
		return;
	}

	if (typeof file_path !== 'string' || !file_path) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'file_path must be a non-empty string'}));
		return;
	}

	if (typeof content !== 'string') {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'content must be a string'}));
		return;
	}

	const opts = options as IWriteFileOptions;
	const makeDirectory = opts.makeDirectory === true;

	try {
		const resolvedRepo = isAbsolute(repo_path) ? repo_path : resolve(repo_path);
		const fullPath = resolveFilePath(resolvedRepo, file_path);

		if (makeDirectory) {
			await fs.mkdir(dirname(fullPath), {recursive: true});
		}

		await fs.writeFile(fullPath, content, {encoding: 'utf8'});

		ws.send(JSON.stringify({requestId, status: 'success'}));
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Failed to write file';
		console.error('[writeFile] error:', message);
		ws.send(JSON.stringify({requestId, status: 'error', message}));
	}
}
