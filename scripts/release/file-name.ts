// Prints the published file name of an installer, e.g. `GitYak-2.1.0-macos-arm64.dmg`.
//   bun run scripts/release/file-name.ts <version> <platform>
import {RELEASE_PLATFORMS, releaseFileName} from '../../packages/protocol/src/releases';
import type {TReleasePlatform} from '../../packages/protocol/src/releases';

const [version, platform] = process.argv.slice(2);

if (!version || !RELEASE_PLATFORMS.some(p => p.platform === platform)) {
	console.error(`Usage: file-name.ts <version> <${RELEASE_PLATFORMS.map(p => p.platform).join('|')}>`);
	process.exit(1);
}

console.log(releaseFileName(version, platform as TReleasePlatform));
