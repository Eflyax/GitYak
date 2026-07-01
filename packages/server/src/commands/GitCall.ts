import {resolve, isAbsolute} from 'path';
import {existsSync} from 'fs';
import {getAgentEnv} from './SshAgentInit';
import type {IWsMessage} from '../types';

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

export async function run(ws: {send: (msg: string) => void}, data: IWsMessage): Promise<void> {
	const {requestId, repo_path, args} = data;

	if (!Array.isArray(args) || !args.every((a): a is string => typeof a === 'string')) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'args must be a string[]'}));
		return;
	}

	let resolvedPath: string;

	try {
		resolvedPath = validateRepoPath(repo_path);
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Invalid repository path';
		ws.send(JSON.stringify({requestId, status: 'error', message}));
		return;
	}

	console.log('[git]', args);

	const executeGit = async (): Promise<string> => {
		const proc = Bun.spawn(['git', ...args], {
			cwd: resolvedPath,
			env: getAgentEnv(ws),
			stdout: 'pipe',
			// Bun defaults stderr to "inherit" — capture it so git errors
			// (push rejections, conflicts, etc.) reach the client.
			stderr: 'pipe',
		});

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;

		if (exitCode === 0) {
			// Hooks write diagnostics to stderr; return it for `commit` so the
			// client can show hook output on success. git's own commit summary
			// goes to stdout and is redundant (the UI refreshes), so it's dropped
			// here to avoid a popup on every plain commit. Other commands keep
			// clean stdout for parsing.
			if (args[0] === 'commit') {
				return stderr;
			}

			return stdout;
		}

		const combined = (stdout + stderr).trim();

		throw new Error(combined || `git ${args.join(' ')} exited with code ${exitCode}`);
	};

	let retries = 3;
	let delay = 100;

	while (true) {
		try {
			const result = await executeGit();
			ws.send(JSON.stringify({requestId, status: 'success', data: result}));
			break;
		}
		catch (e: unknown) {
			const message = e instanceof Error ? e.message : 'Unknown git error';

			if (message.includes(`.git/index.lock': File exists`) && retries) {
				await new Promise(r => setTimeout(r, delay));
				retries--;
				delay *= 2;
				continue;
			}

			ws.send(JSON.stringify({requestId, status: 'error', message}));
			break;
		}
	}
}
