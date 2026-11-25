import {resolve, isAbsolute} from 'path';
import {promises as fs} from 'fs';
import type {IWsRequest} from '@git-yak/protocol';
import {blobObjectName} from '@git-yak/protocol';
import {resolveFilePath} from './ReadFile';

async function readAtRevision(repoPath: string, revision: string, filePath: string): Promise<Buffer> {
	const proc = Bun.spawn(['git', 'cat-file', 'blob', blobObjectName(revision, filePath)], {
		cwd: repoPath,
		env: {...process.env, GIT_OPTIONAL_LOCKS: '0'},
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).arrayBuffer(),
		new Response(proc.stderr).text(),
	]);

	if (await proc.exited !== 0) {
		throw new Error(stderr.trim() || `Cannot read ${revision}:${filePath}`);
	}

	return Buffer.from(stdout);
}

/** File bytes as base64, so binary content such as images survives the JSON frame intact. */
export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId, repo_path, file_path, revision} = data;

	try {
		if (typeof repo_path !== 'string' || !repo_path) {
			throw new Error('repo_path must be a non-empty string');
		}

		if (typeof file_path !== 'string' || !file_path) {
			throw new Error('file_path must be a non-empty string');
		}

		const resolvedRepo = isAbsolute(repo_path) ? repo_path : resolve(repo_path);
		const bytes = typeof revision === 'string' && revision
			? await readAtRevision(resolvedRepo, revision, file_path)
			: await fs.readFile(resolveFilePath(resolvedRepo, file_path));

		ws.send(JSON.stringify({requestId, status: 'success', data: bytes.toString('base64')}));
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Failed to read file';
		ws.send(JSON.stringify({requestId, status: 'error', message}));
	}
}
