import {findAsset, isNewerVersion, isPrerelease} from '@git-yak/protocol';
import type {IRelease, IReleaseAsset, TReleasePlatform} from '@git-yak/protocol';

export const WEBSITE_URL = 'https://gityak.com';
export const DOWNLOAD_PAGE_URL = `${WEBSITE_URL}/#download`;

/** Which desktop shell a bundle was built for (vite.config.ts `__APP_FLAVOR__`). */
export type TAppFlavor = 'tauri' | 'tauri-v1';

export interface IHostPlatform {
	/** `std::env::consts::OS`, e.g. "macos", "linux", "windows". */
	os: string;
	/** `std::env::consts::ARCH`, e.g. "aarch64", "x86_64". */
	arch: string;
}

/**
 * How the app installs an update itself: through the Tauri updater plugin (macOS, Windows), by
 * downloading and verifying the signed .deb (Linux), or not at all (the user downloads it).
 */
export type TUpdateInstall =
	| {kind: 'plugin'}
	| {kind: 'deb'; url: string; signature: string}
	| {kind: 'none'};

export interface IAvailableUpdate {
	version: string;
	notes: string;
	/** The installer for this machine, or the download page when the release has none. */
	downloadUrl: string;
	releaseNotesUrl: string;
	install: TUpdateInstall;
}

/** The installer platform this app was built for; null when no installer fits it. */
export function releasePlatform(host: IHostPlatform, flavor: TAppFlavor): TReleasePlatform | null {
	const isX64 = host.arch === 'x86_64';

	switch (host.os) {
		case 'macos':
			return host.arch === 'aarch64' ? 'macos-arm64' : isX64 ? 'macos-x64' : null;
		case 'windows':
			return isX64 ? 'windows-x64' : null;
		case 'linux':
			// The Tauri 1 build exists for Ubuntu 20.04 and is only updated by its own installer.
			return isX64 ? (flavor === 'tauri-v1' ? 'linux-x64-focal' : 'linux-x64') : null;
		default:
			return null;
	}
}

export function releaseNotesUrl(version: string): string {
	return `${WEBSITE_URL}/changelog.html#v${version}`;
}

function updateInstall(
	platform: TReleasePlatform | null,
	asset: IReleaseAsset | undefined,
	currentVersion: string,
): TUpdateInstall {
	if (platform?.startsWith('macos-') || platform === 'windows-x64') {
		// The plugin reads its own manifest (updater.json) and checks the signature itself.
		return {kind: 'plugin'};
	}

	// Only a signed .deb may be installed: releases from before in-app updates carry no signature.
	if ((platform === 'linux-x64' || platform === 'linux-x64-focal') && asset?.signature) {
		return {
			kind: 'deb',
			// src=update tells the server's download log an in-app update from a web download
			url: `${asset.url}?src=update&from=${encodeURIComponent(currentVersion)}`,
			signature: asset.signature,
		};
	}

	return {kind: 'none'};
}

/**
 * The update `release` offers over `currentVersion`, or null when there is none: it is not
 * newer, it is a prerelease, or the user chose to skip that version.
 */
export function availableUpdate(
	release: IRelease,
	currentVersion: string,
	platform: TReleasePlatform | null,
	skippedVersion?: string,
): IAvailableUpdate | null {
	if (isPrerelease(release.version) || !isNewerVersion(release.version, currentVersion)) {
		return null;
	}

	if (skippedVersion === release.version) {
		return null;
	}

	const asset = platform ? findAsset(release, platform) : undefined;

	return {
		version: release.version,
		notes: release.notes,
		// src and from tell the server's download log an update from a web download
		downloadUrl: asset ? `${asset.url}?src=app&from=${encodeURIComponent(currentVersion)}` : DOWNLOAD_PAGE_URL,
		releaseNotesUrl: releaseNotesUrl(release.version),
		install: updateInstall(platform, asset, currentVersion),
	};
}
