// CI: turns the built installers of one tag into the published manifests.
//
//   bun run scripts/release/manifest.ts --tag v2.1.0 --assets <dir> --index <index.json> --out <dir>
//
// <dir> holds the installers already renamed to `GitYak-<version>-<platform suffix>`; --index is
// the index.json currently on the server (may be missing for the first release). Writes to --out:
// index.json, latest.json (when there is a stable release), notes.md and pruned.txt (tags whose
// installers can be deleted from the server).
//
// Optional in-app update inputs: --signatures <dir> holds `<file>.sig` for every installer and
// updater file (the base64 text `tauri signer sign` writes); --updater <dir> holds the
// updater-only files (the macOS `.app.tar.gz`). With them, assets carry their signature and
// updater.json is written when this release is the new latest stable. Without, nothing changes.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {isValidVersion, parseReleaseIndex, RELEASE_PLATFORMS, releaseFileName, updaterFileName} from '../../packages/protocol/src/releases';
import type {IReleaseIndex, TUpdaterPlatform} from '../../packages/protocol/src/releases';
import {addRelease, buildRelease} from './releaseIndex';
import type {IBuiltAsset} from './releaseIndex';
import {tagNotes} from './git';
import {buildUpdaterManifest} from './updaterManifest';
import type {IUpdaterFile} from './updaterManifest';

const {values} = parseArgs({
	options: {
		tag: {type: 'string'},
		assets: {type: 'string'},
		index: {type: 'string'},
		out: {type: 'string'},
		signatures: {type: 'string'},
		updater: {type: 'string'},
	},
});

const {tag, assets: assetsDir, index: indexPath, out: outDir, signatures: signaturesDir, updater: updaterDir} = values;

if (!tag || !assetsDir || !indexPath || !outDir) {
	console.error('Usage: manifest.ts --tag v2.1.0 --assets <dir> --index <index.json> --out <dir> [--signatures <dir>] [--updater <dir>]');
	process.exit(1);
}

const version = tag.replace(/^v/, '');

if (!tag.startsWith('v') || !isValidVersion(version)) {
	console.error(`Not a release tag: ${tag}`);
	process.exit(1);
}

/** The trimmed `<file>.sig` from the signatures directory, if there is one. */
function readSignature(file: string): string | undefined {
	if (!signaturesDir) {
		return undefined;
	}

	const path = join(signaturesDir, `${file}.sig`);

	return existsSync(path) ? readFileSync(path, 'utf8').trim() : undefined;
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
		signature: readSignature(file),
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

const release = buildRelease({version, date: new Date().toISOString(), notes, assets});
const update = addRelease(current, release);

mkdirSync(outDir, {recursive: true});
writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(update.index, null, '\t')}\n`);
writeFileSync(join(outDir, 'notes.md'), `${notes}\n`);
writeFileSync(join(outDir, 'pruned.txt'), update.prunedTags.map(t => `${t}\n`).join(''));

if (update.latest) {
	writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(update.latest, null, '\t')}\n`);
}

// Only the newest stable release is offered as an update. Windows updates with the installer
// itself; the macOS archives are updater-only and live in --updater.
if (update.latest?.version === version) {
	const updaterFiles: Array<IUpdaterFile> = (['macos-arm64', 'macos-x64', 'windows-x64'] as Array<TUpdaterPlatform>).flatMap(platform => {
		const file = updaterFileName(version, platform);

		if (!(platform === 'windows-x64' ? files.has(file) : updaterDir && existsSync(join(updaterDir, file)))) {
			return [];
		}

		const signature = readSignature(file);

		if (!signature) {
			console.warn(`No signature for ${file}; ${platform} gets no in-app update`);

			return [];
		}

		return [{platform, file, signature}];
	});

	if (updaterFiles.length) {
		writeFileSync(join(outDir, 'updater.json'), `${JSON.stringify(buildUpdaterManifest(release, updaterFiles), null, '\t')}\n`);
	}
}

console.log(`Release ${version}: ${assets.map(a => a.platform).join(', ')}`);
console.log(`Latest stable: ${update.latest?.version ?? 'none'}`);
