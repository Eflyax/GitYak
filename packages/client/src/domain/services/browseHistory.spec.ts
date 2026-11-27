import {describe, it, expect} from 'vitest';
import {parseBrowseHistory, rememberFolder, startFolder} from './browseHistory';

describe('parseBrowseHistory', () => {
	it('returns an empty history for null, invalid JSON and non-objects', () => {
		expect(parseBrowseHistory(null)).toEqual({});
		expect(parseBrowseHistory('{oops')).toEqual({});
		expect(parseBrowseHistory('[1]')).toEqual({});
		expect(parseBrowseHistory('"x"')).toEqual({});
	});

	it('keeps only string values', () => {
		expect(parseBrowseHistory('{"local":"/a","bun:h:1":3,"x":null}')).toEqual({local: '/a'});
	});
});

describe('rememberFolder', () => {
	it('keeps a separate folder per connection key without mutating', () => {
		const first = rememberFolder({}, 'local', '/a');
		const second = rememberFolder(first, 'ssh:u@h:22', '/b');

		expect(first).toEqual({local: '/a'});
		expect(second).toEqual({local: '/a', 'ssh:u@h:22': '/b'});
		expect(rememberFolder(second, 'local', '/c').local).toBe('/c');
	});
});

describe('startFolder', () => {
	it('prefers the requested path, then the remembered one, then the root', () => {
		expect(startFolder({local: '/a'}, 'local', '/req')).toBe('/req');
		expect(startFolder({local: '/a'}, 'local')).toBe('/a');
		expect(startFolder({local: '/a'}, 'local', '')).toBe('/a');
		expect(startFolder({local: '/a'}, 'other')).toBe('/');
	});
});
