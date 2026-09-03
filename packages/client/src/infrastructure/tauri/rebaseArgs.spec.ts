import {describe, expect, it} from 'vitest';
import {buildRebasePlan, resolveWithin, validateRepoPath, validateTodoPath} from './rebaseArgs';

const REPO = '/home/dev/project';

describe('resolveWithin', () => {
	it('joins a relative path onto the root', () => {
		expect(resolveWithin(REPO, '.git/gityak-rebase-todo')).toBe('/home/dev/project/.git/gityak-rebase-todo');
	});

	it('collapses "." and ".." segments', () => {
		expect(resolveWithin(REPO, './a/../b')).toBe('/home/dev/project/b');
	});

	it('lets an absolute path replace the root, as node resolve does', () => {
		expect(resolveWithin(REPO, '/etc/passwd')).toBe('/etc/passwd');
	});
});

describe('validateRepoPath', () => {
	it('refuses a non-string or empty repo path', () => {
		expect(() => validateRepoPath(undefined)).toThrow('repo_path must be a non-empty string');
		expect(() => validateRepoPath('')).toThrow('repo_path must be a non-empty string');
	});

	it('refuses a relative repo path, which a webview cannot resolve', () => {
		expect(() => validateRepoPath('project')).toThrow('repo_path must be an absolute path');
	});

	it('normalises an absolute repo path', () => {
		expect(validateRepoPath('/home/dev/./project/')).toBe(REPO);
	});
});

describe('validateTodoPath', () => {
	it('refuses a todo path containing a single quote', () => {
		expect(() => validateTodoPath(REPO, ".git/x';touch /tmp/pwned;'"))
			.toThrow('todo_path must not contain a single quote');
	});

	it('refuses a todo path that escapes the repository', () => {
		expect(() => validateTodoPath(REPO, '../../etc/passwd')).toThrow('Access denied: todo path outside repository');
		expect(() => validateTodoPath(REPO, '/etc/passwd')).toThrow('Access denied: todo path outside repository');
	});

	it('refuses an empty todo path', () => {
		expect(() => validateTodoPath(REPO, '')).toThrow('todo_path must be a non-empty string');
	});

	it('accepts a todo path inside the repository', () => {
		expect(validateTodoPath(REPO, '.git/gityak-rebase-todo')).toBe('/home/dev/project/.git/gityak-rebase-todo');
	});
});

describe('buildRebasePlan', () => {
	it('builds the same vector as the Bun server for "start"', () => {
		const plan = buildRebasePlan(REPO, 'start', {upstream: 'origin/main', todo_path: '.git/gityak-rebase-todo'});

		expect(plan.args).toEqual([
			'-C', REPO,
			'-c', 'core.editor=false',
			'-c', 'rebase.missingCommitsCheck=ignore',
			'-c', 'sequence.editor=cp \'/home/dev/project/.git/gityak-rebase-todo\'',
			'rebase', '-i', '--autostash', '--', 'origin/main',
		]);
		expect(plan.todoPath).toBe('/home/dev/project/.git/gityak-rebase-todo');
	});

	it('builds the "continue" vector with no todo file to check', () => {
		const plan = buildRebasePlan(REPO, 'continue', {});

		expect(plan.args).toEqual(['-C', REPO, '-c', 'core.editor=true', 'rebase', '--continue']);
		expect(plan.todoPath).toBeUndefined();
	});

	it('refuses an action outside the enumerated set', () => {
		expect(() => buildRebasePlan(REPO, 'skip', {})).toThrow('Unknown rebase action: skip');
		expect(() => buildRebasePlan(REPO, '', {})).toThrow('Unknown rebase action: ');
	});

	it('refuses an upstream that starts with "-"', () => {
		expect(() => buildRebasePlan(REPO, 'start', {upstream: '--exec=touch /tmp/pwned', todo_path: '.git/todo'}))
			.toThrow('upstream must not start with "-"');
		expect(() => buildRebasePlan(REPO, 'start', {upstream: '-x', todo_path: '.git/todo'}))
			.toThrow('upstream must not start with "-"');
	});

	it('refuses a missing or non-string upstream', () => {
		expect(() => buildRebasePlan(REPO, 'start', {todo_path: '.git/todo'}))
			.toThrow('upstream must be a non-empty string');
	});

	it('validates the todo path before it reaches sequence.editor', () => {
		expect(() => buildRebasePlan(REPO, 'start', {upstream: 'main', todo_path: '../evil'}))
			.toThrow('Access denied: todo path outside repository');
	});
});
