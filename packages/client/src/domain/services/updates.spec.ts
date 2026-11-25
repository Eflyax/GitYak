import {describe, expect, it} from 'vitest';
import type {IRelease} from '@git-yak/protocol';
import {availableUpdate, DOWNLOAD_PAGE_URL, releasePlatform} from './updates';

function release(version: string): IRelease {
	return {
		version,
		tag: `v${version}`,
		date: '2026-11-25T00:00:00Z',
		notes: '- Image preview',
		assets: [{
			platform: 'macos-arm64',
			file: `GitYak-${version}-macos-arm64.dmg`,
			url: `https://gityak.com/releases/v${version}/GitYak-${version}-macos-arm64.dmg`,
			size: 1,
			sha256: 'x',
		}],
	};
}

describe('releasePlatform', () => {
	it('maps macOS architectures', () => {
		expect(releasePlatform({os: 'macos', arch: 'aarch64'}, 'tauri')).toBe('macos-arm64');
		expect(releasePlatform({os: 'macos', arch: 'x86_64'}, 'tauri')).toBe('macos-x64');
	});

	it('picks the focal installer for the Tauri 1 build', () => {
		expect(releasePlatform({os: 'linux', arch: 'x86_64'}, 'tauri-v1')).toBe('linux-x64-focal');
		expect(releasePlatform({os: 'linux', arch: 'x86_64'}, 'tauri')).toBe('linux-x64');
	});

	it('maps Windows and rejects platforms without an installer', () => {
		expect(releasePlatform({os: 'windows', arch: 'x86_64'}, 'tauri')).toBe('windows-x64');
		expect(releasePlatform({os: 'linux', arch: 'aarch64'}, 'tauri')).toBeNull();
		expect(releasePlatform({os: 'freebsd', arch: 'x86_64'}, 'tauri')).toBeNull();
	});
});

describe('availableUpdate', () => {
	it('offers a newer release with the installer for this platform', () => {
		const update = availableUpdate(release('2.1.0'), '2.0.0', 'macos-arm64');

		expect(update).toEqual({
			version: '2.1.0',
			notes: '- Image preview',
			downloadUrl: 'https://gityak.com/releases/v2.1.0/GitYak-2.1.0-macos-arm64.dmg',
			releaseNotesUrl: 'https://gityak.com/changelog.html#v2.1.0',
		});
	});

	it('falls back to the download page when the platform has no installer', () => {
		expect(availableUpdate(release('2.1.0'), '2.0.0', 'windows-x64')?.downloadUrl).toBe(DOWNLOAD_PAGE_URL);
		expect(availableUpdate(release('2.1.0'), '2.0.0', null)?.downloadUrl).toBe(DOWNLOAD_PAGE_URL);
	});

	it('offers nothing for the same, an older or a prerelease version', () => {
		expect(availableUpdate(release('2.0.0'), '2.0.0', 'macos-arm64')).toBeNull();
		expect(availableUpdate(release('1.9.0'), '2.0.0', 'macos-arm64')).toBeNull();
		expect(availableUpdate(release('2.1.0-beta.1'), '2.0.0', 'macos-arm64')).toBeNull();
	});

	it('offers nothing for a skipped version, but does for a later one', () => {
		expect(availableUpdate(release('2.1.0'), '2.0.0', 'macos-arm64', '2.1.0')).toBeNull();
		expect(availableUpdate(release('2.2.0'), '2.0.0', 'macos-arm64', '2.1.0')).not.toBeNull();
	});
});
