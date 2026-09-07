import {describe, it, expect} from 'vitest';
import {buildSearchArgs} from './commitSearch';

describe('buildSearchArgs', () => {
	it('produces no arguments for an empty query', () => {
		expect(buildSearchArgs('')).toEqual([]);
		expect(buildSearchArgs('   ')).toEqual([]);
	});

	it('searches commit messages case-insensitively by default', () => {
		expect(buildSearchArgs('fix login')).toEqual(['--regexp-ignore-case', '--grep=fix login']);
	});

	it('searches by author with the author: prefix', () => {
		expect(buildSearchArgs('author:jane')).toEqual(['--regexp-ignore-case', '--author=jane']);
	});

	it('searches the diff content with the content: prefix', () => {
		expect(buildSearchArgs('content:useState')).toEqual(['--regexp-ignore-case', '-SuseState']);
	});

	// A pathspec has to come last, after a `--` separator, or git reads it as a revision.
	it('limits the log to a path with the file: prefix', () => {
		expect(buildSearchArgs('file:src/app.ts')).toEqual(['--regexp-ignore-case', '--', 'src/app.ts']);
	});

	it('combines a message search with a path limit', () => {
		expect(buildSearchArgs('login file:src/auth.ts')).toEqual([
			'--regexp-ignore-case',
			'--grep=login',
			'--',
			'src/auth.ts',
		]);
	});

	it('combines an author and a message search', () => {
		expect(buildSearchArgs('author:jane login')).toEqual([
			'--regexp-ignore-case',
			'--author=jane',
			'--grep=login',
		]);
	});

	it('keeps the free text as one grep term rather than splitting it', () => {
		expect(buildSearchArgs('author:jane fix the login')).toContain('--grep=fix the login');
	});

	// The value is glued to its flag, so a leading dash can never be read as a flag of its
	// own — but a bare `-x` as free text would be, and git's arg allowlist refuses it.
	it('never emits a value as a separate argument that git could read as a flag', () => {
		for (const arg of buildSearchArgs('-x --exec=touch /tmp/x')) {
			expect(['--regexp-ignore-case', '--'].includes(arg) || arg.startsWith('--grep=')).toBe(true);
		}
	});

	it('ignores a prefix with an empty value', () => {
		expect(buildSearchArgs('author:')).toEqual([]);
		expect(buildSearchArgs('file:')).toEqual([]);
	});
});
