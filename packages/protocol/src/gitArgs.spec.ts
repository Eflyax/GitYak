import {describe, expect, it} from 'vitest';
import {describeForbiddenGitOption, findForbiddenGitOption} from './gitArgs';

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

	it('refuses an executing option even after the subcommand', () => {
		expect(findForbiddenGitOption(['fetch', '--upload-pack=touch /tmp/x', 'origin']))
			.toBe('--upload-pack=touch /tmp/x');
		expect(findForbiddenGitOption(['push', '--receive-pack=touch /tmp/x', 'origin']))
			.toBe('--receive-pack=touch /tmp/x');
		expect(findForbiddenGitOption(['rebase', '--exec=touch /tmp/x', 'HEAD~1']))
			.toBe('--exec=touch /tmp/x');
		expect(findForbiddenGitOption(['rebase', '-x', 'touch /tmp/x'])).toBe('-x');
	});

	it('still allows the ordinary fetch and push the client sends', () => {
		expect(findForbiddenGitOption(['fetch', '--prune', '--all'])).toBeUndefined();
		expect(findForbiddenGitOption(['push', '--set-upstream', 'origin', 'main'])).toBeUndefined();
		expect(findForbiddenGitOption(['push', 'origin', '--delete', 'branch'])).toBeUndefined();
	});
});

describe('describeForbiddenGitOption', () => {
	it('describes a global option as a global option', () => {
		expect(describeForbiddenGitOption('-c'))
			.toBe('Refused: "-c" is a git global option and is not allowed here');
		expect(describeForbiddenGitOption('--git-dir=/tmp'))
			.toBe('Refused: "--git-dir=/tmp" is a git global option and is not allowed here');
	});

	it('describes an anywhere-refused option by what it does, not as a global option', () => {
		expect(describeForbiddenGitOption('--exec=touch /tmp/x'))
			.toBe('Refused: "--exec=touch /tmp/x" makes git run a command of the caller\'s choosing and is not allowed here');
		expect(describeForbiddenGitOption('-x'))
			.toBe('Refused: "-x" makes git run a command of the caller\'s choosing and is not allowed here');
		expect(describeForbiddenGitOption('--upload-pack=x')).not.toContain('global option');
		expect(describeForbiddenGitOption('--receive-pack=x')).not.toContain('global option');
	});
});
