import {ENetworkCommand} from '@/domain';
import type {IGitProcess, ITransportClient} from '@/infrastructure/ITransportClient';
import {
	checkBranchNameArgs,
	cloneArgs,
	initArgs,
	joinRepoPath,
	setInitialBranchArgs,
	UNSET_CLONE_SSH_ARGS,
} from '@/domain/services/repoArgs';

const AUTH_FAILURES = ['Permission denied (publickey)', 'Host key verification failed'];
const AUTH_HINT = '\nLoad the key into your ssh-agent: ssh-add <key>';

function gitCall(t: ITransportClient, repoPath: string, args: Array<string>): Promise<unknown> {
	return t.call(ENetworkCommand.GitCall, {repo_path: repoPath, args});
}

function withAuthHint(error: unknown): Error {
	const message = error instanceof Error ? error.message : String(error);
	if (AUTH_FAILURES.some(failure => message.includes(failure))) {
		return new Error(`${message}${AUTH_HINT}`);
	}

	return error instanceof Error ? error : new Error(message);
}

export async function resolveRepositoryRoot(t: ITransportClient, folder: string): Promise<string> {
	try {
		const out = await gitCall(t, folder, ['rev-parse', '--show-toplevel']);

		return String(out).trim();
	}
	catch {
		throw new Error(`${folder} is not a git repository`);
	}
}

export async function assertEmptyTarget(t: ITransportClient, path: string): Promise<void> {
	let entries: Array<unknown>;
	try {
		const result = await t.call(ENetworkCommand.BrowseFiles, {path}) as {entries: Array<unknown>};
		entries = result.entries;
	}
	catch {
		return;
	}
	if (entries.length > 0) {
		throw new Error(`${path} already exists and is not empty`);
	}
}

/**
 * `onWarning` hears about what went wrong without failing the clone - the ssh options the clone
 * ran with (accept-new, BatchMode) staying in the repository's config when they cannot be
 * removed afterwards.
 */
export function cloneRepository(
	t: ITransportClient,
	o: {parent: string; name: string; url: string},
	onOutput: (line: string) => void,
	onWarning: (message: string) => void = () => {},
): IGitProcess {
	let cancelled = false;
	let finished = false;
	let running: IGitProcess | undefined;

	const run = async (): Promise<void> => {
		await assertEmptyTarget(t, joinRepoPath(o.parent, o.name));
		if (cancelled) {
			throw new Error('Cancelled');
		}
		const args = cloneArgs(o.url, o.name);
		try {
			if (t.spawnGit) {
				running = t.spawnGit(o.parent, args, onOutput);
				await running.done;
			}
			else {
				await gitCall(t, o.parent, args);
			}
		}
		catch (error) {
			throw withAuthHint(error);
		}
		const path = joinRepoPath(o.parent, o.name);
		try {
			await gitCall(t, path, UNSET_CLONE_SSH_ARGS);
		}
		catch (error) {
			// The clone itself succeeded; only its ssh options are left behind.
			const reason = error instanceof Error ? error.message.trim() : String(error);
			onWarning(`Could not remove the clone's core.sshCommand from ${path}/.git/config: ${reason}`);
		}
	};

	const done = run().finally(() => {
		finished = true;
		running = undefined;
	});

	return {
		done,
		cancel(): void {
			if (finished) {
				return;
			}
			cancelled = true;
			running?.cancel();
		},
	};
}

/**
 * Asks git itself whether `branch` is a valid branch name. An error that is not about the name
 * (the parent folder missing, say) is passed on as it is.
 */
export async function assertValidBranchName(t: ITransportClient, cwd: string, branch: string): Promise<void> {
	let out: unknown;
	try {
		out = await gitCall(t, cwd, checkBranchNameArgs(branch));
	}
	catch (error) {
		if (error instanceof Error && error.message.includes('is not a valid branch name')) {
			throw new Error(`'${branch}' is not a valid branch name`);
		}
		throw error;
	}
	// `--branch` expands shorthands such as @{-1}; anything but the name itself is refused.
	if (String(out).trim() !== branch) {
		throw new Error(`'${branch}' is not a valid branch name`);
	}
}

/** Everything that can be checked is checked before `git init`, so a failure leaves no folder behind. */
export async function createRepository(
	t: ITransportClient,
	o: {parent: string; name: string; branch: string},
): Promise<string> {
	const path = joinRepoPath(o.parent, o.name);
	await assertEmptyTarget(t, path);
	await assertValidBranchName(t, o.parent, o.branch);
	await gitCall(t, o.parent, initArgs(o.name));
	await gitCall(t, path, setInitialBranchArgs(o.branch));

	return path;
}

export function canCancelClone(t: ITransportClient): boolean {
	return !!t.spawnGit;
}
