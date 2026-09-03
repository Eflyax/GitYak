import {watch} from 'node:fs';
import type {FSWatcher} from 'node:fs';
import {existsSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import type {IWsRequest} from '@git-yak/protocol';

const DEBOUNCE_MS = 300;

interface IWatchSession {
	watchers: Array<FSWatcher>;
	timer?: ReturnType<typeof setTimeout>;
	paths: Set<string>;
}

const sessions = new WeakMap<object, IWatchSession>();

// fs.watch's `recursive` option is unsupported on Linux in Node and Bun. `.git` is watched
// recursively where possible because it is small and captures commit, checkout, fetch and
// rebase; the repository root is watched for working-tree edits. On Linux both degrade to
// non-recursive, so edits inside working-tree subdirectories raise no event there.
const RECURSIVE = process.platform !== 'linux';

function emit(ws: {send: (msg: string) => void}, session: IWatchSession): void {
	clearTimeout(session.timer);

	session.timer = setTimeout(() => {
		const paths = [...session.paths];

		session.paths.clear();

		ws.send(JSON.stringify({type: 'event', event: 'repoChanged', paths}));
	}, DEBOUNCE_MS);
}

export function stop(ws: object): void {
	const session = sessions.get(ws);

	if (!session) {
		return;
	}

	clearTimeout(session.timer);
	session.watchers.forEach(w => w.close());
	sessions.delete(ws);
}

export function run(ws: {send: (msg: string) => void}, data: IWsRequest): void {
	const {requestId} = data;
	const repoPath = data['repo_path'];

	if (typeof repoPath !== 'string' || !repoPath) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'repo_path must be a non-empty string'}));

		return;
	}

	const root = isAbsolute(repoPath) ? repoPath : resolve(repoPath);

	if (!existsSync(root)) {
		ws.send(JSON.stringify({requestId, status: 'error', message: `Repository path does not exist: ${root}`}));

		return;
	}

	const gitDir = join(root, '.git');

	// Without this an authenticated peer could start a recursive watch of any directory it
	// names — an entire filesystem included. A repository always has a `.git` entry (a
	// directory, or a file in a worktree or submodule), so requiring one bounds the watch to
	// something the app has a reason to observe.
	if (!existsSync(gitDir)) {
		ws.send(JSON.stringify({requestId, status: 'error', message: `Not a git repository (no .git entry): ${root}`}));

		return;
	}

	stop(ws);

	const session: IWatchSession = {watchers: [], paths: new Set()};

	const onChange = (_event: string, filename: string | null): void => {
		if (filename) {
			session.paths.add(filename);
		}

		emit(ws, session);
	};

	try {
		session.watchers.push(watch(root, {recursive: RECURSIVE}, onChange));
		session.watchers.push(watch(gitDir, {recursive: RECURSIVE}, onChange));
	}
	catch (e: unknown) {
		session.watchers.forEach(w => w.close());
		ws.send(JSON.stringify({
			requestId,
			status: 'error',
			message: e instanceof Error ? e.message : 'Failed to watch repository',
		}));

		return;
	}

	sessions.set(ws, session);
	ws.send(JSON.stringify({requestId, status: 'success'}));
}

export function unwatch(ws: {send: (msg: string) => void}, data: IWsRequest): void {
	stop(ws);
	ws.send(JSON.stringify({requestId: data.requestId, status: 'success'}));
}
