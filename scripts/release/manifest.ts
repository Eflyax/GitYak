// CI: turns the built installers of one tag into the published manifests.
//
//   bun run scripts/release/manifest.ts --tag v2.1.0 --assets <dir> --index <index.json> --out <dir>
//
// <dir> holds the installers already renamed to `GitYak-<version>-<platform suffix>`; --index is
// the index.json currently on the server (may be missing for the first release). Writes to --out:
// index.json, latest.json (when there is a stable release), notes.md and pruned.txt (tags whose
// installers can be deleted from the server).
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {isValidVersion, parseReleaseIndex, RELEASE_PLATFORMS, releaseFileName} from '../../packages/protocol/src/releases';
import type {IReleaseIndex} from '../../packages/protocol/src/releases';
import {addRelease, buildRelease} from './releaseIndex';
import type {IBuiltAsset} from './releaseIndex';
import {tagNotes} from './git';

const {values} = parseArgs({
	options: {
		tag: {type: 'string'},
		assets: {type: 'string'},
		index: {type: 'string'},
		out: {type: 'string'},
	},
});

const {tag, assets: assetsDir, index: indexPath, out: outDir} = values;

if (!tag || !assetsDir || !indexPath || !outDir) {
	console.error('Usage: manifest.ts --tag v2.1.0 --assets <dir> --index <index.json> --out <dir>');
	process.exit(1);
}

const version = tag.replace(/^v/, '');

if (!tag.startsWith('v') || !isValidVersion(version)) {
	console.error(`Not a release tag: ${tag}`);
	process.exit(1);
}

const files = new Set(readdirSync(assetsDir));

const assets: Array<IBuiltAsset> = RELEASE_PLATFORMS.flatMap(({platform}) => {
	const file = releaseFileName(version, platform);

	if (!files.has(file)) {
		console.warn(`No installer for ${platform} (${file})`);

		return [];
	}

	const path = join(assetsDir, file);

	return [{
		platform,
		file,
		size: statSync(path).size,
		sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
	}];
});

if (!assets.length) {
	console.error(`No installers for ${version} in ${assetsDir}`);
	process.exit(1);
}

const notes = tagNotes(tag);
const current: IReleaseIndex = existsSync(indexPath)
	? parseReleaseIndex(JSON.parse(readFileSync(indexPath, 'utf8')))
	: {releases: []};

const update = addRelease(current, buildRelease({version, date: new Date().toISOString(), notes, assets}));

mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(update.index, null, '\t')}\n`);
writeFileSync(join(outDir, 'notes.md'), `${notes}\n`);
writeFileSync(join(outDir, 'pruned.txt'), update.prunedTags.map(t => `${t}\n`).join(''));

if (update.latest) {
	writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(update.latest, null, '\t')}\n`);
}

console.log(`Release ${version}: ${assets.map(a => a.platform).join(', ')}`);
console.log(`Latest stable: ${update.latest?.version ?? 'none'}`);
