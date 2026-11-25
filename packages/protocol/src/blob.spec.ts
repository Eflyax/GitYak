import {describe, expect, it} from 'vitest';
import {blobObjectName} from './blob';

describe('blobObjectName', () => {
	it('joins revision and path', () => {
		expect(blobObjectName('HEAD', 'img/logo.png')).toBe('HEAD:img/logo.png');
		expect(blobObjectName(':0', 'logo.svg')).toBe(':0:logo.svg');
		expect(blobObjectName('abc123^', 'a.png')).toBe('abc123^:a.png');
	});

	it('refuses a revision that git would read as an option', () => {
		expect(() => blobObjectName('--output=/tmp/x', 'a.png')).toThrow('Invalid revision');
	});

	it('refuses an empty revision or path', () => {
		expect(() => blobObjectName('', 'a.png')).toThrow();
		expect(() => blobObjectName('HEAD', '')).toThrow();
	});
});
