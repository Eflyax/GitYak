import {resolve, isAbsolute, sep} from 'path';
import {existsSync} from 'fs';
import {getAgentEnv} from './SshAgentInit';
import type {IWsRequest} from '@git-yak/protocol';

function validateRepoPath(repoPath: unknown): string {
	if (typeof repoPath !== 'string' || !repoPath) {
		throw new Error('repo_path must be a non-empty string');
	}

	const resolved = isAbsolute(repoPath) ? repoPath : resolve(repoPath);

	if (!existsSync(resolved)) {
		throw new Error(`Repository path does not exist: ${resolved}`);
	}

	return resolved;
}

// The todo path becomes part of a `sequence.editor` shell command, so it must be proven to
// sit inside the repository before it is interpolated. A path that escapes the repo — or
// contains a quote that could break out of the surrounding single quotes — is refused.
function validateTodoPath(repoRoot: string, todoPath: unknown): string {
	if (typeof todoPath !== 'string' || !todoPath) {
		throw new Error('todo_path must be a non-empty string');
	}

	if (todoPath.includes("'")) {
		throw new Error('todo_path must not contain a single quote');
	}

	const resolved = resolve(repoRoot, todoPath);

	if (resolved !== repoRoot && !resolved.startsWith(repoRoot + sep)) {
		throw new Error(`Access denied: todo path outside repository: ${resolved}`);
	}

	if (!existsSync(resolved)) {
		throw new Error(`Todo file does not exist: ${resolved}`);
	}

	return resolved;
}

function buildArgs(action: string, repoRoot: string, data: IWsRequest): Array<string> {
	if (action === 'continue') {
		// core.editor=true accepts the in-progress message as-is, with no prompt.
		return ['-c', 'core.editor=true', 'rebase', '--continue'];
	}

	if (action !== 'start') {
		throw new Error(`Unknown rebase action: ${action}`);
	}

	const {upstream} = data;

	if (typeof upstream !== 'string' || !upstream) {
		throw new Error('upstream must be a non-empty string');
	}

	if (upstream.startsWith('-')) {
		throw new Error('upstream must not start with "-"');
	}

	const todo = validateTodoPath(repoRoot, data['todo_path']);

	// Our pre-written todo is copied over git's generated one via sequence.editor, and
	// core.editor is disabled so no action ever opens an interactive editor.
	return [
		'-c', 'core.editor=false',
		'-c', 'rebase.missingCommitsCheck=ignore',
		'-c', `sequence.editor=cp '${todo}'`,
		'rebase', '-i', '--autostash', '--', upstream,
	];
}

export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId} = data;

	let args: Array<string>;
	let repoRoot: string;

	try {
		repoRoot = validateRepoPath(data['repo_path']);
		args = buildArgs(String(data['action'] ?? ''), repoRoot, data);
	}
	catch (e: unknown) {
		ws.send(JSON.stringify({
			requestId,
			status: 'error',
			message: e instanceof Error ? e.message : 'Invalid rebase request',
		}));

		return;
	}

	const proc = Bun.spawn(['git', ...args], {
		cwd: repoRoot,
		env: getAgentEnv(ws),
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;

	if (exitCode === 0) {
		ws.send(JSON.stringify({requestId, status: 'success', data: stdout}));

		return;
	}

	ws.send(JSON.stringify({
		requestId,
		status: 'error',
		message: stderr.trim() || `git rebase exited ${exitCode}`,
	}));
}
