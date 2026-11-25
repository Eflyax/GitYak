import {describe, expect, it} from 'vitest';
import {
	compareVersions,
	findAsset,
	isNewerVersion,
	isPrerelease,
	parseRelease,
	parseReleaseIndex,
	releaseFileName,
} from './releases';

const ASSET = {
	platform: 'macos-arm64',
	file: 'GitYak-2.1.0-macos-arm64.dmg',
	url: 'https://gityak.com/releases/v2.1.0/GitYak-2.1.0-macos-arm64.dmg',
	size: 1024,
	sha256: 'abc',
};

describe('compareVersions', () => {
	it('orders by major, minor and patch numerically', () => {
		expect(compareVersions('2.10.0', '2.9.9')).toBe(1);
		expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
		expect(compareVersions('2.0.1', '2.0.1')).toBe(0);
	});

	it('accepts a leading v', () => {
		expect(compareVersions('v2.1.0', '2.1.0')).toBe(0);
	});

	it('sorts a release after its prereleases', () => {
		expect(compareVersions('2.1.0', '2.1.0-beta.1')).toBe(1);
		expect(compareVersions('2.1.0-rc.1', '2.1.0')).toBe(-1);
	});

	it('orders prerelease identifiers', () => {
		expect(compareVersions('2.1.0-beta.2', '2.1.0-beta.10')).toBe(-1);
		expect(compareVersions('2.1.0-alpha', '2.1.0-beta')).toBe(-1);
		expect(compareVersions('2.1.0-beta', '2.1.0-beta.1')).toBe(-1);
		expect(compareVersions('2.1.0-1', '2.1.0-beta')).toBe(-1);
	});

	it('ignores build metadata', () => {
		expect(compareVersions('2.1.0+abc', '2.1.0')).toBe(0);
	});

	it('throws on a malformed version', () => {
		expect(() => compareVersions('2.1', '2.1.0')).toThrow('Invalid version: 2.1');
		expect(() => compareVersions('2.1.0', 'latest')).toThrow('Invalid version: latest');
	});
});

describe('isNewerVersion / isPrerelease', () => {
	it('is true only for a strictly newer version', () => {
		expect(isNewerVersion('2.1.0', '2.0.0')).toBe(true);
		expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false);
		expect(isNewerVersion('1.9.0', '2.0.0')).toBe(false);
	});

	it('detects prereleases', () => {
		expect(isPrerelease('2.1.0-beta.1')).toBe(true);
		expect(isPrerelease('v2.1.0')).toBe(false);
	});
});

describe('releaseFileName', () => {
	it('builds the stable file name for a platform', () => {
		expect(releaseFileName('2.1.0', 'linux-x64-focal')).toBe('GitYak-2.1.0-linux-x64-focal.deb');
		expect(releaseFileName('2.1.0', 'windows-x64')).toBe('GitYak-2.1.0-windows-x64-setup.exe');
	});
});

describe('parseRelease', () => {
	it('accepts a valid manifest', () => {
		const release = parseRelease({version: '2.1.0', tag: 'v2.1.0', date: '2026-11-25', notes: '- New', assets: [ASSET]});

		expect(release.version).toBe('2.1.0');
		expect(findAsset(release, 'macos-arm64')?.file).toBe(ASSET.file);
		expect(findAsset(release, 'windows-x64')).toBeUndefined();
	});

	it('drops assets of unknown platforms instead of failing', () => {
		const release = parseRelease({version: '2.1.0', assets: [ASSET, {...ASSET, platform: 'haiku-x64'}]});

		expect(release.assets).toHaveLength(1);
		expect(release.tag).toBe('v2.1.0');
	});

	it('rejects a manifest without a valid version or assets', () => {
		expect(() => parseRelease(null)).toThrow();
		expect(() => parseRelease({version: 'next', assets: []})).toThrow('valid version');
		expect(() => parseRelease({version: '2.1.0'})).toThrow('no assets');
	});
});

describe('parseReleaseIndex', () => {
	it('parses every release', () => {
		const index = parseReleaseIndex({releases: [{version: '2.1.0', assets: []}, {version: '2.0.0', assets: []}]});

		expect(index.releases.map(r => r.version)).toEqual(['2.1.0', '2.0.0']);
	});

	it('rejects an index without releases', () => {
		expect(() => parseReleaseIndex({})).toThrow();
	});
});
