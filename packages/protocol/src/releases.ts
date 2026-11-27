// The release manifest published to https://gityak.com/releases/. CI writes it
// (scripts/release/manifest.ts), the website renders it and the desktop app reads it to find
// updates, so all three share these types and helpers.

export const RELEASES_BASE_URL = 'https://gityak.com/releases';
export const LATEST_MANIFEST_URL = `${RELEASES_BASE_URL}/latest.json`;
export const RELEASE_INDEX_URL = `${RELEASES_BASE_URL}/index.json`;
/** Tauri updater manifest; the desktop app's in-app updater polls it. */
export const UPDATER_MANIFEST_URL = `${RELEASES_BASE_URL}/updater.json`;

/** One installer, keyed by the platform it runs on. */
export type TReleasePlatform = 'macos-arm64' | 'macos-x64' | 'windows-x64' | 'linux-x64' | 'linux-x64-focal';

export interface IReleasePlatformInfo {
	platform: TReleasePlatform;
	/** File name suffix after `GitYak-<version>-`. */
	fileSuffix: string;
	label: string;
	/** Shown next to the label, e.g. the supported OS versions. */
	detail: string;
	/** Not fully tested yet; the website marks it as such. */
	beta?: boolean;
}

export const RELEASE_PLATFORMS: ReadonlyArray<IReleasePlatformInfo> = [
	{platform: 'macos-arm64', fileSuffix: 'macos-arm64.dmg', label: 'macOS (Apple Silicon)', detail: 'M1 and newer'},
	{platform: 'macos-x64', fileSuffix: 'macos-x64.dmg', label: 'macOS (Intel)', detail: 'Intel Macs'},
	{platform: 'windows-x64', fileSuffix: 'windows-x64-setup.exe', label: 'Windows', detail: 'Windows 10 and 11, 64-bit', beta: true},
	{platform: 'linux-x64', fileSuffix: 'linux-x64.deb', label: 'Ubuntu / Debian', detail: 'Ubuntu 22.04 and newer'},
	{platform: 'linux-x64-focal', fileSuffix: 'linux-x64-focal.deb', label: 'Ubuntu 20.04', detail: 'Ubuntu 20.04 (focal)'},
];

export interface IReleaseAsset {
	platform: TReleasePlatform;
	file: string;
	url: string;
	/** Bytes. */
	size: number;
	sha256: string;
	/** Tauri updater signature (base64) of the installer; absent on releases built before in-app updates. */
	signature?: string;
}

export interface IRelease {
	/** Without the leading "v", e.g. "2.1.0". */
	version: string;
	/** The git tag, e.g. "v2.1.0". */
	tag: string;
	/** ISO 8601. */
	date: string;
	/** Markdown. */
	notes: string;
	assets: Array<IReleaseAsset>;
}

/** `index.json`: every published release, newest first. */
export interface IReleaseIndex {
	releases: Array<IRelease>;
}

export function releaseFileName(version: string, platform: TReleasePlatform): string {
	const info = RELEASE_PLATFORMS.find(p => p.platform === platform);

	if (!info) {
		throw new Error(`Unknown release platform: ${platform}`);
	}

	return `GitYak-${version}-${info.fileSuffix}`;
}

/** Platforms the Tauri updater can install on its own. */
export type TUpdaterPlatform = 'macos-arm64' | 'macos-x64' | 'windows-x64';

/**
 * The file the updater downloads: the `.app.tar.gz` on macOS (the dmg cannot be applied in
 * place), the installer itself on Windows.
 */
export function updaterFileName(version: string, platform: TUpdaterPlatform): string {
	if (platform === 'windows-x64') {
		return releaseFileName(version, platform);
	}

	return `GitYak-${version}-${platform}.app.tar.gz`;
}

export type TUpdaterTarget = 'darwin-aarch64' | 'darwin-x86_64' | 'windows-x86_64';

/** `updater.json` in the static format of the Tauri updater plugin. */
export interface IUpdaterManifest {
	version: string;
	notes: string;
	/** RFC 3339. */
	pub_date: string;
	platforms: Partial<Record<TUpdaterTarget, {url: string; signature: string}>>;
}

// ── Versions ─────────────────────────────────────────────────────────────────

interface IParsedVersion {
	core: [number, number, number];
	prerelease: Array<string>;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseVersion(version: string): IParsedVersion | null {
	const match = VERSION_PATTERN.exec(version.trim());

	if (!match) {
		return null;
	}

	return {
		core: [Number(match[1]), Number(match[2]), Number(match[3])],
		prerelease: match[4] ? match[4].split('.') : [],
	};
}

export function isValidVersion(version: string): boolean {
	return parseVersion(version) !== null;
}

/** A prerelease (`2.1.0-beta.1`) never becomes the latest stable release. */
export function isPrerelease(version: string): boolean {
	return (parseVersion(version)?.prerelease.length ?? 0) > 0;
}

function comparePrereleaseIds(a: string, b: string): number {
	const
		aNumeric = /^\d+$/.test(a),
		bNumeric = /^\d+$/.test(b);

	if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
	if (aNumeric) return -1;
	if (bNumeric) return 1;

	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Semver ordering: negative when `a` is older than `b`, positive when newer, 0 when equal.
 * Throws on a malformed version, so a broken manifest is never mistaken for an update.
 */
export function compareVersions(a: string, b: string): number {
	const
		left = parseVersion(a),
		right = parseVersion(b);

	if (!left || !right) {
		throw new Error(`Invalid version: ${left ? b : a}`);
	}

	for (let i = 0; i < 3; i++) {
		if (left.core[i] !== right.core[i]) {
			return Math.sign(left.core[i] - right.core[i]);
		}
	}

	// A release sorts after any of its prereleases.
	if (!left.prerelease.length || !right.prerelease.length) {
		return Math.sign(right.prerelease.length - left.prerelease.length);
	}

	for (let i = 0; i < Math.min(left.prerelease.length, right.prerelease.length); i++) {
		const order = comparePrereleaseIds(left.prerelease[i], right.prerelease[i]);

		if (order !== 0) {
			return order;
		}
	}

	return Math.sign(left.prerelease.length - right.prerelease.length);
}

export function isNewerVersion(candidate: string, current: string): boolean {
	return compareVersions(candidate, current) > 0;
}

// ── Manifest parsing ─────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAsset(value: unknown): value is Omit<IReleaseAsset, 'signature'> & {signature?: unknown} {
	return isRecord(value)
		&& RELEASE_PLATFORMS.some(p => p.platform === value['platform'])
		&& typeof value['file'] === 'string'
		&& typeof value['url'] === 'string'
		&& typeof value['size'] === 'number'
		&& typeof value['sha256'] === 'string';
}

/**
 * Validates a manifest read from the network. Assets for platforms this build does not know
 * are dropped rather than rejected, so a newer manifest stays readable by older apps.
 */
export function parseRelease(value: unknown): IRelease {
	if (!isRecord(value)) {
		throw new Error('Release manifest is not an object');
	}

	const {version, tag, date, notes, assets} = value;

	if (typeof version !== 'string' || !isValidVersion(version)) {
		throw new Error('Release manifest has no valid version');
	}

	if (!Array.isArray(assets)) {
		throw new Error('Release manifest has no assets');
	}

	return {
		version,
		tag: typeof tag === 'string' ? tag : `v${version}`,
		date: typeof date === 'string' ? date : '',
		notes: typeof notes === 'string' ? notes : '',
		assets: assets.filter(isAsset).map(({signature, ...asset}): IReleaseAsset => (
			typeof signature === 'string' ? {...asset, signature} : asset
		)),
	};
}

export function parseReleaseIndex(value: unknown): IReleaseIndex {
	if (!isRecord(value) || !Array.isArray(value['releases'])) {
		throw new Error('Release index has no releases');
	}

	return {releases: value['releases'].map(parseRelease)};
}

export function findAsset(release: IRelease, platform: TReleasePlatform): IReleaseAsset | undefined {
	return release.assets.find(asset => asset.platform === platform);
}
