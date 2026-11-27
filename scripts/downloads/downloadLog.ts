// Reads the installer download log the gityak.com nginx writes (deploy/nginx-gityak.com.conf,
// log_format gityak_downloads): one tab-separated line per request,
//   time  method  status  bytes  completion  range  uri  src  from  client  user-agent
import {RELEASE_PLATFORMS, releaseFileName, updaterFileName} from '../../packages/protocol/src/releases';
import type {TReleasePlatform, TUpdaterPlatform} from '../../packages/protocol/src/releases';

export interface IDownload {
	/** ISO date and time of the request. */
	time: string;
	version: string;
	platform: TReleasePlatform;
	/** 'app' for the update notification's Download button, 'update' for the in-app updater, 'web' for everything else. */
	source: 'app' | 'web' | 'update';
	/** The version the app updated from (source 'app' and 'update', when the app sent it). */
	fromVersion?: string;
	/** The visitor's network: the address without its last part. */
	client: string;
}

/** The platform of an installer's file name, e.g. `GitYak-2.1.0-macos-arm64.dmg`. */
function platformOf(version: string, file: string): TReleasePlatform | undefined {
	return RELEASE_PLATFORMS.find(p => releaseFileName(version, p.platform) === file)?.platform
		?? UPDATER_PLATFORMS.find(platform => updaterFileName(version, platform) === file);
}

/** The platforms whose updater file differs from the installer: the macOS `.app.tar.gz`. */
const UPDATER_PLATFORMS: Array<TUpdaterPlatform> = ['macos-arm64', 'macos-x64'];

/** Only the updater downloads an `.app.tar.gz`, so it counts as an update even without `src`. */
function sourceOf(src: string | undefined, file: string): IDownload['source'] {
	if (src === 'update' || file.endsWith('.app.tar.gz')) {
		return 'update';
	}

	return src === 'app' ? 'app' : 'web';
}

/**
 * The download a log line records, or null when it is not one: another method, a failed or
 * cancelled request, or a later part of a download split into ranges (only the part from byte 0
 * counts, so a download manager's parallel parts count once).
 */
export function parseDownload(line: string): IDownload | null {
	const [time, method, status, , completion, range, uri, src, from, client] = line.split('\t');
	const match = /^\/releases\/v([^/]+)\/([^/]+)$/.exec(uri ?? '');

	if (method !== 'GET' || !match) {
		return null;
	}

	const whole = status === '200' && completion === 'OK';
	const firstPart = status === '206' && /^bytes=0-/.test(range ?? '');

	if (!whole && !firstPart) {
		return null;
	}

	const [, version, file] = match;
	const platform = platformOf(version, file);

	if (!platform) {
		return null;
	}

	const source = sourceOf(src, file);

	return {
		time,
		version,
		platform,
		source,
		...(source !== 'web' && from ? {fromVersion: from} : {}),
		client: client || '-',
	};
}

export function parseDownloads(text: string): Array<IDownload> {
	return text.split('\n').flatMap(line => {
		const download = parseDownload(line);

		return download ? [download] : [];
	});
}

/** Counts by a key, largest first. */
export function countBy<T>(items: Array<T>, key: (item: T) => string): Array<[string, number]> {
	const counts = new Map<string, number>();

	for (const item of items) {
		counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
	}

	return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
