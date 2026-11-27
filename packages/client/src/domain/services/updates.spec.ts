import {describe, expect, it} from 'vitest';
import type {IRelease} from '@git-yak/protocol';
import type {IReleaseAsset, TReleasePlatform} from '@git-yak/protocol';
import {availableUpdate, DOWNLOAD_PAGE_URL, releasePlatform} from './updates';

function asset(version: string, platform: TReleasePlatform, file: string, signature?: string): IReleaseAsset {
	return {
		platform,
		file,
		url: `https://gityak.com/releases/v${version}/${file}`,
		size: 1,
		sha256: 'x',
		...(signature === undefined ? {} : {signature}),
	};
}

/** A release with an installer for every platform; `signature` signs each of them. */
function fullRelease(version: string, signature?: string): IRelease {
	return {
		version,
		tag: `v${version}`,
		date: '2026-11-25T00:00:00Z',
		notes: '',
		assets: [
			asset(version, 'macos-arm64', `GitYak-${version}-macos-arm64.dmg`, signature),
			asset(version, 'macos-x64', `GitYak-${version}-macos-x64.dmg`, signature),
			asset(version, 'windows-x64', `GitYak-${version}-windows-x64-setup.exe`, signature),
			asset(version, 'linux-x64', `GitYak-${version}-linux-x64.deb`, signature),
			asset(version, 'linux-x64-focal', `GitYak-${version}-linux-x64-focal.deb`, signature),
		],
	};
}

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
			downloadUrl: 'https://gityak.com/releases/v2.1.0/GitYak-2.1.0-macos-arm64.dmg?src=app&from=2.0.0',
			releaseNotesUrl: 'https://gityak.com/changelog.html#v2.1.0',
			install: {kind: 'plugin'},
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

describe('availableUpdate install', () => {
	it('installs through the updater plugin on macOS and Windows', () => {
		for (const platform of ['macos-arm64', 'macos-x64', 'windows-x64'] as const) {
			expect(availableUpdate(fullRelease('2.3.0', 'sig'), '2.2.0', platform)?.install).toEqual({kind: 'plugin'});
		}
	});

	it('installs a signed Linux .deb itself, counted as an update in the download log', () => {
		expect(availableUpdate(fullRelease('2.3.0', 'c2ln'), '2.2.0', 'linux-x64')?.install).toEqual({
			kind: 'deb',
			url: 'https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb?src=update&from=2.2.0',
			signature: 'c2ln',
		});
		expect(availableUpdate(fullRelease('2.3.0', 'c2ln'), '2.2.0', 'linux-x64-focal')?.install).toEqual({
			kind: 'deb',
			url: 'https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64-focal.deb?src=update&from=2.2.0',
			signature: 'c2ln',
		});
	});

	it('cannot install an unsigned Linux .deb (a manifest from before in-app updates)', () => {
		expect(availableUpdate(fullRelease('2.3.0'), '2.2.0', 'linux-x64')?.install).toEqual({kind: 'none'});
		expect(availableUpdate(fullRelease('2.3.0', ''), '2.2.0', 'linux-x64-focal')?.install).toEqual({kind: 'none'});
	});

	it('cannot install without a platform', () => {
		expect(availableUpdate(fullRelease('2.3.0', 'sig'), '2.2.0', null)?.install).toEqual({kind: 'none'});
	});

	it('keeps the web download link unchanged', () => {
		expect(availableUpdate(fullRelease('2.3.0', 'sig'), '2.2.0', 'linux-x64')?.downloadUrl)
			.toBe('https://gityak.com/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb?src=app&from=2.2.0');
		expect(availableUpdate(fullRelease('2.3.0', 'sig'), '2.2.0', 'macos-arm64')?.downloadUrl)
			.toBe('https://gityak.com/releases/v2.3.0/GitYak-2.3.0-macos-arm64.dmg?src=app&from=2.2.0');
	});
});
