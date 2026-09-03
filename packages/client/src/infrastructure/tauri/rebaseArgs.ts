// The desktop app's local transport builds its own `git rebase` argument vector, exactly as
// packages/server/src/commands/GitRebase.ts does for the Bun server. This module is the
// "server side" of that transport: every part of the command is composed here from validated
// pieces, so no client string is ever handed to `git -c` unchecked.
//
// It is deliberately free of node's `path`/`fs` (the webview has neither) and of every Tauri
// import, so it is directly unit-testable. Existence checks — which need the filesystem — are
// left to the caller, which is told through `todoPath` what to check.

export interface IRebasePlan {
	// Arguments for `git`, starting with `-C <repository>`.
	args: Array<string>;
	// Set for the `start` action: the resolved todo file the caller must prove exists before
	// spawning git. Absent for `continue`.
	todoPath?: string;
}

// POSIX path resolution over absolute paths only. Mirrors node's `resolve(root, relative)`:
// an absolute `relative` replaces the root (and is then caught by the containment check).
export function resolveWithin(root: string, relative: string): string {
	const
		combined = relative.startsWith('/') ? relative : `${root}/${relative}`,
		segments: Array<string> = [];

	for (const segment of combined.split('/')) {
		if (!segment || segment === '.') {
			continue;
		}

		if (segment === '..') {
			segments.pop();
			continue;
		}

		segments.push(segment);
	}

	return `/${segments.join('/')}`;
}

export function validateRepoPath(repoPath: unknown): string {
	if (typeof repoPath !== 'string' || !repoPath) {
		throw new Error('repo_path must be a non-empty string');
	}

	if (!repoPath.startsWith('/')) {
		// There is no working directory to resolve against inside a webview, so a relative
		// repository path cannot be made safe here.
		throw new Error('repo_path must be an absolute path');
	}

	return resolveWithin('/', repoPath);
}

// The todo path becomes part of a `sequence.editor` shell command, so it must be proven to
// sit inside the repository before it is interpolated. A path that escapes the repo — or
// contains a quote that could break out of the surrounding single quotes — is refused.
export function validateTodoPath(repoRoot: string, todoPath: unknown): string {
	if (typeof todoPath !== 'string' || !todoPath) {
		throw new Error('todo_path must be a non-empty string');
	}

	if (todoPath.includes('\'')) {
		throw new Error('todo_path must not contain a single quote');
	}

	const resolved = resolveWithin(repoRoot, todoPath);

	if (resolved !== repoRoot && !resolved.startsWith(`${repoRoot}/`)) {
		throw new Error(`Access denied: todo path outside repository: ${resolved}`);
	}

	return resolved;
}

export function buildRebasePlan(repoRoot: string, action: string, data: Record<string, unknown>): IRebasePlan {
	if (action === 'continue') {
		// core.editor=true accepts the in-progress message as-is, with no prompt.
		return {args: ['-C', repoRoot, '-c', 'core.editor=true', 'rebase', '--continue']};
	}

	if (action !== 'start') {
		throw new Error(`Unknown rebase action: ${action}`);
	}

	const upstream = data['upstream'];

	if (typeof upstream !== 'string' || !upstream) {
		throw new Error('upstream must be a non-empty string');
	}

	// The only caller-supplied token in the vector. Refusing every leading "-" is strictly
	// stronger than findForbiddenGitOption, which cannot be applied to the finished vector
	// here because that vector deliberately carries our own `-C` and `-c`.
	if (upstream.startsWith('-')) {
		throw new Error('upstream must not start with "-"');
	}

	const todoPath = validateTodoPath(repoRoot, data['todo_path']);

	// Our pre-written todo is copied over git's generated one via sequence.editor, and
	// core.editor is disabled so no action ever opens an interactive editor.
	return {
		args: [
			'-C', repoRoot,
			'-c', 'core.editor=false',
			'-c', 'rebase.missingCommitsCheck=ignore',
			'-c', `sequence.editor=cp '${todoPath}'`,
			'rebase', '-i', '--autostash', '--', upstream,
		],
		todoPath,
	};
}
