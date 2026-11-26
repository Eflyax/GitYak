import {describe, expect, it} from 'vitest';
import {downloadEvent} from './downloads';

describe('downloadEvent', () => {
	it('reads a marked link', () => {
		expect(downloadEvent({
			downloadVersion: '2.1.1',
			downloadPlatform: 'macos-arm64',
			downloadFile: 'GitYak-2.1.1-macos-arm64.dmg',
			downloadLocation: 'hero',
			downloadSuggested: 'true',
		})).toEqual({
			event: 'download',
			release_version: '2.1.1',
			platform: 'macos-arm64',
			file_name: 'GitYak-2.1.1-macos-arm64.dmg',
			link_location: 'hero',
			suggested: true,
		});
	});

	it('ignores other links', () => {
		expect(downloadEvent({})).toBeNull();
		expect(downloadEvent({icon: 'x'})).toBeNull();
	});

	it('treats a missing suggestion as not suggested', () => {
		expect(downloadEvent({downloadPlatform: 'linux-x64'})?.suggested).toBe(false);
	});
});
