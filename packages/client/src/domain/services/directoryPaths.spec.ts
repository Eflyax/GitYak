import {describe, it, expect} from 'vitest';
import {ancestorPaths, parentPath} from './directoryPaths';

describe('ancestorPaths', () => {
	it('lists the directory and then every ancestor down to the root', () => {
		expect(ancestorPaths('/home/me/code/repo')).toEqual([
			'/home/me/code/repo',
			'/home/me/code',
			'/home/me',
			'/home',
			'/',
		]);
	});

	it('ends at the root for a directory directly below it', () => {
		expect(ancestorPaths('/tmp')).toEqual(['/tmp', '/']);
	});

	it('is just the root for the root', () => {
		expect(ancestorPaths('/')).toEqual(['/']);
	});

	it('ignores a trailing slash and repeated separators', () => {
		expect(ancestorPaths('/home//me/')).toEqual(['/home/me', '/home', '/']);
	});

	it('is the root alone for an empty path', () => {
		expect(ancestorPaths('')).toEqual(['/']);
	});
});

describe('parentPath', () => {
	it('is the containing directory', () => {
		expect(parentPath('/home/me/code')).toBe('/home/me');
	});

	it('is the root for a directory directly below it', () => {
		expect(parentPath('/tmp')).toBe('/');
	});

	it('is the root for the root itself', () => {
		expect(parentPath('/')).toBe('/');
	});
});
