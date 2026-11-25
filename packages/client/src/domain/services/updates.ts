import {findAsset, isNewerVersion, isPrerelease} from '@git-yak/protocol';
import type {IRelease, TReleasePlatform} from '@git-yak/protocol';

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

export interface IAvailableUpdate {
	version: string;
	notes: string;
	/** The installer for this machine, or the download page when the release has none. */
	downloadUrl: string;
	releaseNotesUrl: string;
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
		downloadUrl: asset?.url ?? DOWNLOAD_PAGE_URL,
		releaseNotesUrl: releaseNotesUrl(release.version),
	};
}
