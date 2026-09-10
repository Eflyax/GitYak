import {describe, expect, it} from 'vitest';
import {parseGitError, isNotARepository, parseDubiousOwnershipPath} from './GitError';
import {EGitErrorCode} from '../enums';

describe('parseGitError', () => {
	it('recognises a missing repository', () => {
		expect(parseGitError('fatal: not a git repository', 128).code).toBe(EGitErrorCode.NotARepository);
	});

	it('recognises both authentication shapes', () => {
		expect(parseGitError('fatal: Authentication failed for …', 128).code)
			.toBe(EGitErrorCode.AuthenticationFailed);
		expect(parseGitError('git@github.com: Permission denied (publickey).', 128).code)
			.toBe(EGitErrorCode.AuthenticationFailed);
	});

	// Ordering matters: the publickey variant must be classified as an auth failure, not as
	// the generic permission error checked later in the chain.
	it('prefers authentication over the generic permission branch', () => {
		expect(parseGitError('Permission denied (publickey).', 128).code)
			.toBe(EGitErrorCode.AuthenticationFailed);
		expect(parseGitError('error: Permission denied', 1).code)
			.toBe(EGitErrorCode.PermissionDenied);
	});

	it('distinguishes the three conflict kinds', () => {
		expect(parseGitError('CONFLICT (content): Merge conflict in a.txt', 1).code)
			.toBe(EGitErrorCode.MergeConflict);
		expect(parseGitError('CONFLICT (content): Merge conflict in a.txt\nstash', 1).code)
			.toBe(EGitErrorCode.StashConflict);
		expect(parseGitError('error: could not apply 1234567… cherry-pick\nCONFLICT (content)', 1).code)
			.toBe(EGitErrorCode.CherryPickConflict);
	});

	it('recognises "Merge conflict in" on its own, without the word CONFLICT', () => {
		// This fixture must not contain the literal "CONFLICT" — otherwise it would be caught by
		// the first half of the `||` chain and prove nothing about the second half.
		expect(parseGitError('Auto-merging a.txt\nMerge conflict in a.txt', 1).code)
			.toBe(EGitErrorCode.MergeConflict);
	});

	it('recognises every push-rejection phrasing', () => {
		for (const text of [
			'! [rejected] main -> main',
			'Updates were rejected because the tip is behind',
			'error: failed to push some refs',
			'hint: (fetch first)',
			'error: cannot lock ref: stale info',
			// Must not contain "[rejected]" or any of the other four phrases above — otherwise
			// it would be caught by an earlier sub-condition and prove nothing about this one.
			'to origin: (non-fast-forward)',
		]) {
			expect(parseGitError(text, 1).code).toBe(EGitErrorCode.PushRejected);
		}
	});

	it('recognises a bad pathspec only when both halves are present', () => {
		expect(parseGitError("error: pathspec 'nope' did not match any file(s)", 1).code)
			.toBe(EGitErrorCode.BranchNotFound);
		expect(parseGitError('error: pathspec confusion', 1).code).toBe(EGitErrorCode.Unknown);
	});

	it('recognises uncommitted-change refusals', () => {
		expect(parseGitError('error: Your local changes would be overwritten', 1).code)
			.toBe(EGitErrorCode.UncommittedChanges);
		expect(parseGitError('Please commit or stash them.', 1).code)
			.toBe(EGitErrorCode.UncommittedChanges);
	});

	it('recognises network failures', () => {
		expect(parseGitError('fatal: Could not resolve host: github.com', 128).code)
			.toBe(EGitErrorCode.NetworkError);
		expect(parseGitError('Connection refused', 128).code).toBe(EGitErrorCode.NetworkError);
	});

	it('recognises the remaining permission and network phrasings', () => {
		expect(parseGitError('remote: access denied', 1).code).toBe(EGitErrorCode.PermissionDenied);
		expect(parseGitError('fatal: unable to access: Network is unreachable', 128).code)
			.toBe(EGitErrorCode.NetworkError);
	});

	it('recognises an overwrite refusal that does not mention local changes', () => {
		// "would be overwritten" must select the branch on its own; today it is only ever
		// tested next to "Your local changes", so deleting it would go unnoticed.
		expect(parseGitError('error: The following untracked files would be overwritten by merge', 1).code)
			.toBe(EGitErrorCode.UncommittedChanges);
	});

	it('falls back to Unknown and keeps the raw message', () => {
		const err = parseGitError('something nobody predicted', 3);

		expect(err.code).toBe(EGitErrorCode.Unknown);
		expect(err.message).toBe('something nobody predicted');
	});

	it('uses a placeholder message when stderr is blank', () => {
		expect(parseGitError('   ', 1).message).toBe('Unknown git error');
	});

	it('carries the exit code and the raw stderr onto the error', () => {
		const err = parseGitError('fatal: not a git repository', 128);

		expect(err.exitCode).toBe(128);
		expect(err.stderr).toBe('fatal: not a git repository');
		expect(err.name).toBe('GitError');
	});
});

describe('isNotARepository', () => {
	it('recognises the error git raises outside a repository', () => {
		expect(isNotARepository(parseGitError('fatal: not a git repository', 128))).toBe(true);
	});

	// The bug this guards: a dropped socket used to be indistinguishable from "no repo here",
	// so a remote project that was merely still connecting was reported as not a repository.
	it('does not claim a dropped connection means there is no repository', () => {
		expect(isNotARepository(new Error('WebSocket connection closed'))).toBe(false);
		expect(isNotARepository(new Error('Not connected'))).toBe(false);
		expect(isNotARepository(new Error('Timed out waiting for the connection'))).toBe(false);
	});

	it('does not treat other git failures as a missing repository', () => {
		expect(isNotARepository(parseGitError('fatal: Authentication failed', 128))).toBe(false);
		expect(isNotARepository(parseGitError('something nobody predicted', 3))).toBe(false);
	});

	it('handles values that are not errors at all', () => {
		expect(isNotARepository(undefined)).toBe(false);
		expect(isNotARepository('not a git repository')).toBe(false);
	});
});

// Exactly what git 2.39 writes when a repository is owned by another user — the case that
// shows up on a remote host where the working copy belongs to www-data.
const DUBIOUS = `fatal: detected dubious ownership in repository at '/var/www/html/foo'
To add an exception for this directory, call:

	git config --global --add safe.directory /var/www/html/foo`;

describe('dubious ownership', () => {
	it('is recognised as its own error code', () => {
		expect(parseGitError(DUBIOUS, 128).code).toBe(EGitErrorCode.DubiousOwnership);
	});

	it('is not mistaken for a missing repository', () => {
		expect(isNotARepository(parseGitError(DUBIOUS, 128))).toBe(false);
	});

	it('carries a message that names the problem', () => {
		expect(parseGitError(DUBIOUS, 128).message).toBe('Repository has dubious ownership');
	});
});

describe('parseDubiousOwnershipPath', () => {
	it('reads the repository path git quoted', () => {
		expect(parseDubiousOwnershipPath(DUBIOUS)).toBe('/var/www/html/foo');
	});

	it('reads a path that contains spaces', () => {
		const stderr = "fatal: detected dubious ownership in repository at '/srv/my sites/foo'";

		expect(parseDubiousOwnershipPath(stderr)).toBe('/srv/my sites/foo');
	});

	// Older git wordings quote the path differently but still print the remedy line, which
	// names the same directory.
	it('falls back to the path in the suggested command', () => {
		const stderr = `fatal: detected dubious ownership in repository
	git config --global --add safe.directory /var/www/html/bar`;

		expect(parseDubiousOwnershipPath(stderr)).toBe('/var/www/html/bar');
	});

	it('returns null when the message is about something else', () => {
		expect(parseDubiousOwnershipPath('fatal: not a git repository')).toBeNull();
	});

	it('returns null when no path can be found', () => {
		expect(parseDubiousOwnershipPath('fatal: detected dubious ownership in repository')).toBeNull();
	});
});
