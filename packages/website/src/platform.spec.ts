import {describe, expect, it} from 'vitest';
import {detectOs, installerOs, suggestedPlatforms} from './platform';

describe('detectOs', () => {
	it('recognises desktop systems', () => {
		expect(detectOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15')).toBe('macos');
		expect(detectOs('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
		expect(detectOs('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0)')).toBe('linux');
	});

	it('treats phones as other, even Android (Linux) and iPad (Mac OS X)', () => {
		expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('other');
		expect(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('other');
	});
});

describe('suggestedPlatforms', () => {
	it('offers both variants where the browser cannot tell them apart', () => {
		expect(suggestedPlatforms('macos')).toEqual(['macos-arm64', 'macos-x64']);
		expect(suggestedPlatforms('linux')).toEqual(['linux-x64', 'linux-x64-focal']);
		expect(suggestedPlatforms('other')).toEqual([]);
	});
});

describe('installerOs', () => {
	it('maps every installer to its system', () => {
		expect(installerOs('macos-arm64')).toBe('macos');
		expect(installerOs('macos-x64')).toBe('macos');
		expect(installerOs('windows-x64')).toBe('windows');
		expect(installerOs('linux-x64')).toBe('linux');
		expect(installerOs('linux-x64-focal')).toBe('linux');
	});
});
