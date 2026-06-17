import {EGitErrorCode} from '../enums';

export class GitError extends Error {
	readonly code: EGitErrorCode;
	readonly exitCode: number;
	readonly stderr: string;

	constructor(params: {
		message: string
		code?: EGitErrorCode
		exitCode?: number
		stderr?: string
	}) {
		super(params.message);
		this.name = 'GitError';
		this.code = params.code ?? EGitErrorCode.Unknown;
		this.exitCode = params.exitCode ?? -1;
		this.stderr = params.stderr ?? '';
	}
}

export function parseGitError(stderr: string, exitCode: number): GitError {
	if (stderr.includes('not a git repository')) {
		return new GitError({
			message: 'Not a git repository',
			code: EGitErrorCode.NotARepository,
			exitCode,
			stderr,
		});
	}

	if (stderr.includes('Authentication failed') || stderr.includes('Permission denied (publickey')) {
		return new GitError({
			message: 'Authentication failed',
			code: EGitErrorCode.AuthenticationFailed,
			exitCode,
			stderr,
		});
	}

	if (stderr.includes('CONFLICT') || stderr.includes('Merge conflict in')) {
		const isStash = /\b(stash|git stash)\b/i.test(stderr);
		const isCherryPick = /cherry-pick/i.test(stderr);
		const code = isStash
			? EGitErrorCode.StashConflict
			: isCherryPick
				? EGitErrorCode.CherryPickConflict
				: EGitErrorCode.MergeConflict;

		return new GitError({
			message: code === EGitErrorCode.StashConflict
				? 'Stash applied with conflicts'
				: code === EGitErrorCode.CherryPickConflict
					? 'Cherry-pick caused conflicts'
					: 'Merge conflict',
			code,
			exitCode,
			stderr,
		});
	}

	if (
		stderr.includes('[rejected]')
		|| stderr.includes('non-fast-forward')
		|| stderr.includes('Updates were rejected')
		|| stderr.includes('failed to push some refs')
		|| stderr.includes('(fetch first)')
		|| stderr.includes('stale info')
	) {
		return new GitError({
			message: 'Push rejected',
			code: EGitErrorCode.PushRejected,
			exitCode,
			stderr,
		});
	}

	if (stderr.includes('pathspec') && stderr.includes('did not match any')) {
		return new GitError({
			message: 'Branch or commit not found',
			code: EGitErrorCode.BranchNotFound,
			exitCode,
			stderr,
		});
	}

	if (
		stderr.includes('Your local changes') ||
		stderr.includes('Please commit or stash') ||
		stderr.includes('would be overwritten')
	) {
		return new GitError({
			message: 'Uncommitted changes would be overwritten',
			code: EGitErrorCode.UncommittedChanges,
			exitCode,
			stderr,
		});
	}

	if (stderr.includes('Permission denied') || stderr.includes('access denied')) {
		return new GitError({
			message: 'Permission denied',
			code: EGitErrorCode.PermissionDenied,
			exitCode,
			stderr,
		});
	}

	if (
		stderr.includes('Could not resolve host') ||
		stderr.includes('Connection refused') ||
		stderr.includes('Network is unreachable')
	) {
		return new GitError({
			message: 'Network error',
			code: EGitErrorCode.NetworkError,
			exitCode,
			stderr,
		});
	}

	return new GitError({
		message: stderr.trim() || 'Unknown git error',
		code: EGitErrorCode.Unknown,
		exitCode,
		stderr,
	});
}
