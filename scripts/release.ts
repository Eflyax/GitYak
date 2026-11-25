// Prepares a release: sets the version in every file that carries it, commits and creates the
// annotated tag whose push makes CI build and publish the installers.
//
//   yarn release 2.1.0 [--notes "..."] [--push]   bump, commit, tag (opens $EDITOR for notes)
//   yarn release check v2.1.0                     CI: every version file matches the tag
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {compareVersions, isValidVersion} from '../packages/protocol/src/releases';
import {readVersion, VERSION_FILES, writeVersion} from './release/versionFiles';
import {commitSubjects, git, previousTag} from './release/git';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

function read(path: string): string {
	return readFileSync(join(repoRoot, path), 'utf8');
}

function check(tag: string): void {
	const version = tag.replace(/^v/, '');
	const mismatches = VERSION_FILES
		.map(file => ({path: file.path, found: readVersion(file, read(file.path))}))
		.filter(({found}) => found !== version);

	if (mismatches.length) {
		fail([
			`Tag ${tag} does not match the version in:`,
			...mismatches.map(m => `  ${m.path}: ${m.found}`),
			'Create releases with `yarn release <version>`.',
		].join('\n'));
	}

	console.log(`All version files are at ${version}.`);
}

function release(input: string, options: {notes?: string; push?: boolean}): void {
	const version = input.replace(/^v/, '');
	const tag = `v${version}`;

	if (!isValidVersion(version)) {
		fail(`Not a version: ${input} (expected e.g. 2.1.0 or 2.1.0-beta.1)`);
	}

	if (git(['status', '--porcelain'], repoRoot)) {
		fail('The working tree has uncommitted changes; commit or stash them first.');
	}

	if (git(['tag', '-l', tag], repoRoot)) {
		fail(`Tag ${tag} already exists.`);
	}

	const current = readVersion(VERSION_FILES[0], read(VERSION_FILES[0].path));

	if (compareVersions(version, current) <= 0) {
		fail(`${version} is not newer than the current version ${current}.`);
	}

	// Drafted before the release commit exists, so it lists only real changes.
	const since = previousTag('HEAD', repoRoot);
	const draft = options.notes ?? commitSubjects(since ? `${since}..HEAD` : 'HEAD', repoRoot);

	for (const file of VERSION_FILES) {
		writeFileSync(join(repoRoot, file.path), writeVersion(file, read(file.path), version));
	}

	git(['add', ...VERSION_FILES.map(file => file.path)], repoRoot);
	git(['commit', '-m', `Release ${tag}`], repoRoot);

	// The tag message becomes the release notes on gityak.com and in the app's update notice.
	// Without --notes, git opens the editor on a draft from the commit subjects.
	const tagArgs = options.notes !== undefined
		? ['tag', '-a', tag, '-m', options.notes]
		: ['tag', '-a', tag, '-e', '-m', draft || `GitYak ${version}`];

	execFileSync('git', tagArgs, {cwd: repoRoot, stdio: 'inherit'});

	if (options.push) {
		execFileSync('git', ['push', '--follow-tags'], {cwd: repoRoot, stdio: 'inherit'});
		console.log(`\nPushed ${tag}; GitHub Actions now builds and publishes it.`);
	}
	else {
		console.log(`\nCreated ${tag}. Publish it with:  git push --follow-tags`);
	}
}

const {values, positionals} = parseArgs({
	allowPositionals: true,
	options: {
		notes: {type: 'string'},
		push: {type: 'boolean'},
	},
});

if (positionals[0] === 'check' && positionals[1]) {
	check(positionals[1]);
}
else if (positionals.length === 1 && positionals[0] !== 'check') {
	release(positionals[0], values);
}
else {
	fail('Usage: yarn release <version> [--notes "..."] [--push]\n       yarn release check <tag>');
}
