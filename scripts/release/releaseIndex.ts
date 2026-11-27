import {compareVersions, isPrerelease, RELEASES_BASE_URL} from '../../packages/protocol/src/releases';
import type {IRelease, IReleaseAsset, IReleaseIndex, TReleasePlatform} from '../../packages/protocol/src/releases';

/** Releases whose installers stay on the server; older ones keep only their notes. */
export const KEEP_INSTALLERS = 10;

export interface IBuiltAsset {
	platform: TReleasePlatform;
	file: string;
	size: number;
	sha256: string;
	signature?: string;
}

export function buildRelease(input: {version: string; date: string; notes: string; assets: Array<IBuiltAsset>}): IRelease {
	const tag = `v${input.version}`;

	return {
		version: input.version,
		tag,
		date: input.date,
		notes: input.notes.trim(),
		assets: input.assets.map((asset): IReleaseAsset => ({
			...asset,
			url: `${RELEASES_BASE_URL}/${tag}/${asset.file}`,
		})),
	};
}

export interface IIndexUpdate {
	index: IReleaseIndex;
	/** The newest stable release, i.e. the next latest.json; null when there is none. */
	latest: IRelease | null;
	/** Tags whose installer directories can be deleted from the server. */
	prunedTags: Array<string>;
}

/**
 * Adds (or replaces) a release in the index, newest first. Only the newest KEEP_INSTALLERS
 * releases keep their installers listed; older entries keep their notes for the changelog.
 */
export function addRelease(index: IReleaseIndex, release: IRelease, keepInstallers = KEEP_INSTALLERS): IIndexUpdate {
	const releases = [release, ...index.releases.filter(r => r.version !== release.version)]
		.sort((a, b) => compareVersions(b.version, a.version));

	const prunedTags: Array<string> = [];

	const kept = releases.map((r, position) => {
		if (position < keepInstallers || !r.assets.length) {
			return r;
		}

		prunedTags.push(r.tag);

		return {...r, assets: []};
	});

	return {
		index: {releases: kept},
		latest: kept.find(r => !isPrerelease(r.version)) ?? null,
		prunedTags,
	};
}
