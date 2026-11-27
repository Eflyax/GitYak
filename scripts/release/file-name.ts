// Prints the published file name of an installer, e.g. `GitYak-2.1.0-macos-arm64.dmg`, or with
// --updater the file the in-app updater downloads (`GitYak-2.1.0-macos-arm64.app.tar.gz`).
//   bun run scripts/release/file-name.ts [--updater] <version> <platform>
import {RELEASE_PLATFORMS, releaseFileName, updaterFileName} from '../../packages/protocol/src/releases';
import type {TReleasePlatform, TUpdaterPlatform} from '../../packages/protocol/src/releases';

const
	args = process.argv.slice(2),
	updater = args.includes('--updater'),
	[version, platform] = args.filter(arg => arg !== '--updater');

const UPDATER_PLATFORMS = ['macos-arm64', 'macos-x64', 'windows-x64'];

if (!version || !RELEASE_PLATFORMS.some(p => p.platform === platform) || (updater && !UPDATER_PLATFORMS.includes(platform))) {
	console.error(`Usage: file-name.ts [--updater] <version> <${(updater ? UPDATER_PLATFORMS : RELEASE_PLATFORMS.map(p => p.platform)).join('|')}>`);
	process.exit(1);
}

console.log(updater ? updaterFileName(version, platform as TUpdaterPlatform) : releaseFileName(version, platform as TReleasePlatform));
