import {describe, expect, it} from 'vitest';
import {addRelease, buildRelease} from './releaseIndex';
import type {IRelease} from '../../packages/protocol/src/releases';

function release(version: string): IRelease {
	return buildRelease({
		version,
		date: '2026-11-25T00:00:00Z',
		notes: `Notes ${version}\n`,
		assets: [{platform: 'macos-arm64', file: `GitYak-${version}-macos-arm64.dmg`, size: 1, sha256: 'x'}],
	});
}

describe('buildRelease', () => {
	it('derives the tag and the asset URLs', () => {
		const built = release('2.1.0');

		expect(built.tag).toBe('v2.1.0');
		expect(built.notes).toBe('Notes 2.1.0');
		expect(built.assets[0].url).toBe('https://gityak.com/releases/v2.1.0/GitYak-2.1.0-macos-arm64.dmg');
	});
});

describe('addRelease', () => {
	it('keeps releases newest first and points latest at the newest stable one', () => {
		const first = addRelease({releases: []}, release('2.0.0'));
		const second = addRelease(first.index, release('2.1.0'));
		const beta = addRelease(second.index, release('2.2.0-beta.1'));

		expect(beta.index.releases.map(r => r.version)).toEqual(['2.2.0-beta.1', '2.1.0', '2.0.0']);
		expect(beta.latest?.version).toBe('2.1.0');
	});

	it('replaces a re-published version', () => {
		const once = addRelease({releases: [release('2.1.0')]}, {...release('2.1.0'), notes: 'Fixed'});

		expect(once.index.releases).toHaveLength(1);
		expect(once.index.releases[0].notes).toBe('Fixed');
	});

	it('drops the installers of releases past the limit, keeping their notes', () => {
		let index = {releases: [] as Array<IRelease>};
		let pruned: Array<string> = [];

		for (const version of ['1.0.0', '1.1.0', '1.2.0']) {
			const update = addRelease(index, release(version), 2);

			index = update.index;
			pruned = update.prunedTags;
		}

		expect(index.releases.map(r => r.assets.length)).toEqual([1, 1, 0]);
		expect(index.releases[2].notes).toBe('Notes 1.0.0');
		expect(pruned).toEqual(['v1.0.0']);
	});

	it('has no latest release when only prereleases exist', () => {
		expect(addRelease({releases: []}, release('2.0.0-rc.1')).latest).toBeNull();
	});
});
