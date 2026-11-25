// The files that carry the app version. scripts/release.ts rewrites them all at once, and CI
// checks that they agree with the tag being released.

export type TVersionFile =
	| {kind: 'json'; path: string; key: Array<string>}
	| {kind: 'cargoToml'; path: string}
	| {kind: 'cargoLock'; path: string; crate: string};

export const VERSION_FILES: ReadonlyArray<TVersionFile> = [
	{kind: 'json', path: 'package.json', key: ['version']},
	{kind: 'json', path: 'packages/client/package.json', key: ['version']},
	{kind: 'json', path: 'packages/client/src-tauri/tauri.conf.json', key: ['version']},
	{kind: 'json', path: 'packages/client/src-tauri-v1/tauri.conf.json', key: ['package', 'version']},
	{kind: 'cargoToml', path: 'packages/client/src-tauri/Cargo.toml'},
	{kind: 'cargoToml', path: 'packages/client/src-tauri-v1/Cargo.toml'},
	{kind: 'cargoToml', path: 'packages/remote-worker-rs/Cargo.toml'},
	{kind: 'cargoLock', path: 'packages/client/src-tauri/Cargo.lock', crate: 'git-yak'},
	{kind: 'cargoLock', path: 'packages/client/src-tauri-v1/Cargo.lock', crate: 'git-yak'},
	{kind: 'cargoLock', path: 'packages/remote-worker-rs/Cargo.lock', crate: 'remote-worker-rs'},
];

function jsonValueAt(text: string, key: Array<string>): unknown {
	return key.reduce<unknown>(
		(value, part) => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[part] : undefined),
		JSON.parse(text),
	);
}

const CARGO_PACKAGE_SECTION = /^\[package\]$[\s\S]*?(?=^\[|(?![\s\S]))/m;
const CARGO_VERSION_LINE = /^(\s*version\s*=\s*")[^"]*(")/m;

// Crate names are [a-z0-9_-], none of them special in a regex.
function cargoLockEntry(crate: string): RegExp {
	return new RegExp(`(^name = "${crate}"\\nversion = ")([^"]*)(")`, 'm');
}

/** The version a file currently holds. */
export function readVersion(file: TVersionFile, text: string): string {
	switch (file.kind) {
		case 'json': {
			const value = jsonValueAt(text, file.key);

			if (typeof value !== 'string') {
				throw new Error(`${file.path} has no ${file.key.join('.')}`);
			}

			return value;
		}
		case 'cargoToml': {
			const section = CARGO_PACKAGE_SECTION.exec(text)?.[0] ?? '';
			const match = /^\s*version\s*=\s*"([^"]*)"/m.exec(section);

			if (!match) {
				throw new Error(`${file.path} has no [package] version`);
			}

			return match[1];
		}
		case 'cargoLock': {
			const match = cargoLockEntry(file.crate).exec(text);

			if (!match) {
				throw new Error(`${file.path} has no entry for ${file.crate}`);
			}

			return match[2];
		}
	}
}

/**
 * Returns the file's text with its version replaced, keeping the rest byte for byte (a JSON
 * round trip would reformat the file).
 */
export function writeVersion(file: TVersionFile, text: string, version: string): string {
	let updated: string;

	switch (file.kind) {
		case 'json': {
			// The wanted key is the first "version" in each of these files; checked below.
			updated = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
			break;
		}
		case 'cargoToml': {
			updated = text.replace(CARGO_PACKAGE_SECTION, section => section.replace(CARGO_VERSION_LINE, `$1${version}$2`));
			break;
		}
		case 'cargoLock': {
			updated = text.replace(cargoLockEntry(file.crate), `$1${version}$3`);
			break;
		}
	}

	if (readVersion(file, updated) !== version) {
		throw new Error(`Could not set the version in ${file.path}`);
	}

	return updated;
}
