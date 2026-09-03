import {describe, expect, it} from 'vitest';
import {findForbiddenGitOption} from './gitArgs';

describe('findForbiddenGitOption', () => {
	it('rejects -c, the command-injection vector', () => {
		expect(findForbiddenGitOption(['-c', 'alias.x=!sh', 'x'])).toBe('-c');
	});

	it('rejects -c written with an equals sign', () => {
		expect(findForbiddenGitOption(['-c=alias.x=!sh', 'x'])).toBe('-c=alias.x=!sh');
	});

	it('rejects --exec-path, --git-dir and --work-tree as globals', () => {
		expect(findForbiddenGitOption(['--exec-path=/tmp', 'status'])).toBe('--exec-path=/tmp');
		expect(findForbiddenGitOption(['--git-dir', '/tmp/x', 'status'])).toBe('--git-dir');
		expect(findForbiddenGitOption(['--work-tree', '/tmp', 'status'])).toBe('--work-tree');
	});

	it('rejects -C, which relocates the repository', () => {
		expect(findForbiddenGitOption(['-C', '/etc', 'status'])).toBe('-C');
	});

	// F2: git's global options may appear only BEFORE the subcommand. `--git-dir` after
	// `rev-parse` is an argument to that subcommand and must be allowed, or isGitRepo() breaks.
	it('allows --git-dir as an argument to rev-parse', () => {
		expect(findForbiddenGitOption(['rev-parse', '--git-dir'])).toBeUndefined();
	});

	it('allows a forbidden-looking flag anywhere after the subcommand', () => {
		expect(findForbiddenGitOption(['log', '--work-tree'])).toBeUndefined();
		expect(findForbiddenGitOption(['commit', '-c', 'HEAD'])).toBeUndefined();
	});

	it('allows ordinary commands', () => {
		expect(findForbiddenGitOption(['status', '--porcelain'])).toBeUndefined();
		expect(findForbiddenGitOption(['log', '--format=%H', '-n', '50'])).toBeUndefined();
		expect(findForbiddenGitOption([])).toBeUndefined();
	});

	it('allows a leading option that is not on the list', () => {
		expect(findForbiddenGitOption(['--no-pager', 'log'])).toBeUndefined();
	});
});
