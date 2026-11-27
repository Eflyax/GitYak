import {describe, expect, it} from 'vitest';
import {findForbiddenGitOption} from '@git-yak/protocol';
import {
	CLONE_SSH_COMMAND,
	UNSET_CLONE_SSH_ARGS,
	checkBranchNameArgs,
	cloneArgs,
	initArgs,
	isValidBranchName,
	joinRepoPath,
	repoNameFromUrl,
	setInitialBranchArgs,
} from './repoArgs';

describe('repoNameFromUrl', () => {
	it('extracts the repository name from common URL forms', () => {
		expect(repoNameFromUrl('git@github.com:eflyax/git-yak.git')).toBe('git-yak');
		expect(repoNameFromUrl('https://github.com/a/b.git/')).toBe('b');
		expect(repoNameFromUrl('https://host/a/b')).toBe('b');
		expect(repoNameFromUrl('ssh://git@host:2222/srv/repo.git')).toBe('repo');
		expect(repoNameFromUrl('/tmp/source-repo')).toBe('source-repo');
	});

	it('returns an empty string when there is no name', () => {
		expect(repoNameFromUrl('git@github.com:')).toBe('');
		expect(repoNameFromUrl('  ')).toBe('');
	});
});

describe('joinRepoPath', () => {
	it('joins without doubling slashes', () => {
		expect(joinRepoPath('/', 'x')).toBe('/x');
		expect(joinRepoPath('/a/', 'x')).toBe('/a/x');
		expect(joinRepoPath('/a', 'x')).toBe('/a/x');
	});
});

describe('git args', () => {
	it('builds clone args that pass the GitCall check', () => {
		expect(cloneArgs('git@h:a/b.git', 'b')).toEqual(['clone', '--progress', '--config', 'core.sshCommand=ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes', '--', 'git@h:a/b.git', 'b']);
		expect(findForbiddenGitOption(cloneArgs('git@h:a/b.git', 'b'))).toBeUndefined();
		expect(CLONE_SSH_COMMAND).toBe('ssh -o StrictHostKeyChecking=accept-new -o BatchMode=yes');
	});

	it('builds the other args', () => {
		expect(UNSET_CLONE_SSH_ARGS).toEqual(['config', '--unset', 'core.sshCommand']);
		expect(initArgs('x')).toEqual(['init', '--', 'x']);
		expect(setInitialBranchArgs('main')).toEqual(['symbolic-ref', 'HEAD', 'refs/heads/main']);
	});
});

describe('isValidBranchName', () => {
	it('accepts and rejects names', () => {
		expect(isValidBranchName('main')).toBe(true);
		expect(isValidBranchName('feature/x')).toBe(true);
		expect(isValidBranchName('')).toBe(false);
		expect(isValidBranchName('-x')).toBe(false);
		expect(isValidBranchName('a b')).toBe(false);
		expect(isValidBranchName('a..b')).toBe(false);
		for (const ch of ['~', '^', ':', '?', '*', '[', '\\']) {
			expect(isValidBranchName(`a${ch}b`)).toBe(false);
		}
	});

	it('follows the rest of git-check-ref-format', () => {
		expect(isValidBranchName('release/1.0')).toBe(true);
		for (const name of ['@', 'a@{1}', 'a.', 'a.lock', 'a/', '/a', 'a//b', '.a', 'a/.b', 'a\tb', 'a\x01b']) {
			expect(isValidBranchName(name)).toBe(false);
		}
	});
});

describe('checkBranchNameArgs', () => {
	it('asks git to check the name as a branch', () => {
		expect(checkBranchNameArgs('main')).toEqual(['check-ref-format', '--branch', 'main']);
	});
});
