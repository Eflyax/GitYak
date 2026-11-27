import {describe, expect, it} from 'vitest';
import {buildUpdaterManifest} from './updaterManifest';
import type {IRelease} from '../../packages/protocol/src/releases';

const RELEASE: IRelease = {
	version: '2.3.0',
	tag: 'v2.3.0',
	date: '2026-11-27T10:00:00.000Z',
	notes: 'Notes',
	assets: [],
};

describe('buildUpdaterManifest', () => {
	it('maps the platforms to Tauri targets', () => {
		const manifest = buildUpdaterManifest(RELEASE, [
			{platform: 'macos-arm64', file: 'GitYak-2.3.0-macos-arm64.app.tar.gz', signature: 'a'},
			{platform: 'macos-x64', file: 'GitYak-2.3.0-macos-x64.app.tar.gz', signature: 'b'},
			{platform: 'windows-x64', file: 'GitYak-2.3.0-windows-x64-setup.exe', signature: 'c'},
		]);

		expect(Object.keys(manifest.platforms).sort()).toEqual(['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']);
		expect(manifest.platforms['darwin-aarch64']).toEqual({
			url: 'https://gityak.com/releases/v2.3.0/GitYak-2.3.0-macos-arm64.app.tar.gz?src=update',
			signature: 'a',
		});
		expect(manifest.platforms['windows-x86_64']?.signature).toBe('c');
	});

	it('takes version, notes and pub_date from the release', () => {
		const manifest = buildUpdaterManifest(RELEASE, []);

		expect(manifest.version).toBe('2.3.0');
		expect(manifest.notes).toBe('Notes');
		expect(manifest.pub_date).toBe(RELEASE.date);
	});

	it('leaves out a platform without a file', () => {
		const manifest = buildUpdaterManifest(RELEASE, [
			{platform: 'macos-x64', file: 'GitYak-2.3.0-macos-x64.app.tar.gz', signature: 'b'},
		]);

		expect(manifest.platforms).not.toHaveProperty('darwin-aarch64');
		expect(Object.keys(manifest.platforms)).toEqual(['darwin-x86_64']);
	});
});
