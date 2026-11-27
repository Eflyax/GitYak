import type {TReleasePlatform} from '@git-yak/protocol';

export type TVisitorOs = 'macos' | 'windows' | 'linux' | 'other';

/** The visitor's OS, from the user agent. Phones and tablets count as "other". */
export function detectOs(userAgent: string): TVisitorOs {
	if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return 'other';
	if (/Mac OS X|Macintosh/i.test(userAgent)) return 'macos';
	if (/Windows/i.test(userAgent)) return 'windows';
	if (/Linux|X11|CrOS/i.test(userAgent)) return 'linux';

	return 'other';
}

/**
 * The installers to offer first, best guess leading. A browser does not reliably tell a Mac's
 * CPU (Safari reports Intel on Apple Silicon too), and nothing tells the Ubuntu release, so
 * both variants are offered there.
 */
export function suggestedPlatforms(os: TVisitorOs): Array<TReleasePlatform> {
	switch (os) {
		case 'macos': return ['macos-arm64', 'macos-x64'];
		case 'windows': return ['windows-x64'];
		case 'linux': return ['linux-x64', 'linux-x64-focal'];
		default: return [];
	}
}

/** The operating system an installer is for, which picks its icon (public/icons/<os>.svg). */
export function installerOs(platform: TReleasePlatform): Exclude<TVisitorOs, 'other'> {
	if (platform.startsWith('macos')) return 'macos';
	if (platform.startsWith('windows')) return 'windows';

	return 'linux';
}
