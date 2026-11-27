import {RELEASES_BASE_URL} from '../../packages/protocol/src/releases';
import type {IRelease, IUpdaterManifest, TUpdaterPlatform, TUpdaterTarget} from '../../packages/protocol/src/releases';

const TARGETS: Record<TUpdaterPlatform, TUpdaterTarget> = {
	'macos-arm64': 'darwin-aarch64',
	'macos-x64': 'darwin-x86_64',
	'windows-x64': 'windows-x86_64',
};

export interface IUpdaterFile {
	platform: TUpdaterPlatform;
	file: string;
	signature: string;
}

/** `src=update` lets the download log tell in-app updates from website downloads. */
export function buildUpdaterManifest(release: IRelease, files: Array<IUpdaterFile>): IUpdaterManifest {
	const platforms: IUpdaterManifest['platforms'] = {};

	for (const {platform, file, signature} of files) {
		platforms[TARGETS[platform]] = {url: `${RELEASES_BASE_URL}/${release.tag}/${file}?src=update`, signature};
	}

	return {version: release.version, notes: release.notes, pub_date: release.date, platforms};
}
