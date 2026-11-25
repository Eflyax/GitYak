import {describe, expect, it} from 'vitest';
import {readVersion, writeVersion} from './versionFiles';
import type {TVersionFile} from './versionFiles';

const PACKAGE_JSON: TVersionFile = {kind: 'json', path: 'package.json', key: ['version']};
const TAURI_V1_CONF: TVersionFile = {kind: 'json', path: 'tauri.conf.json', key: ['package', 'version']};
const CARGO_TOML: TVersionFile = {kind: 'cargoToml', path: 'Cargo.toml'};
const CARGO_LOCK: TVersionFile = {kind: 'cargoLock', path: 'Cargo.lock', crate: 'git-yak'};

describe('json files', () => {
	it('replaces only the version, keeping the formatting', () => {
		const text = '{\n\t"name": "x",\n\t"version": "2.0.0",\n\t"deps": {"a": "1"}\n}\n';

		expect(writeVersion(PACKAGE_JSON, text, '2.1.0')).toBe('{\n\t"name": "x",\n\t"version": "2.1.0",\n\t"deps": {"a": "1"}\n}\n');
	});

	it('reads and writes a nested key', () => {
		const text = '{\n  "package": {\n    "productName": "GitYak",\n    "version": "2.0.0"\n  }\n}';

		expect(readVersion(TAURI_V1_CONF, text)).toBe('2.0.0');
		expect(readVersion(TAURI_V1_CONF, writeVersion(TAURI_V1_CONF, text, '3.0.0'))).toBe('3.0.0');
	});

	it('fails when the first version is not the wanted key', () => {
		const text = '{"deps": {"version": "1"}, "package": {"version": "2.0.0"}}';

		expect(() => writeVersion(TAURI_V1_CONF, text, '2.1.0')).toThrow('Could not set the version');
	});
});

describe('Cargo.toml', () => {
	const text = '[package]\nname = "git-yak"\nversion = "2.0.0"\n\n[dependencies]\nserde = { version = "1" }\nfoo = "0.1"\n';

	it('changes the [package] version only', () => {
		const updated = writeVersion(CARGO_TOML, text, '2.1.0');

		expect(updated).toContain('version = "2.1.0"');
		expect(updated).toContain('serde = { version = "1" }');
		expect(readVersion(CARGO_TOML, updated)).toBe('2.1.0');
	});
});

describe('Cargo.lock', () => {
	const text = '[[package]]\nname = "git-yak"\nversion = "2.0.0"\ndependencies = []\n\n[[package]]\nname = "git-yak-other"\nversion = "9.9.9"\n';

	it('changes the entry of the named crate only', () => {
		const updated = writeVersion(CARGO_LOCK, text, '2.1.0');

		expect(updated).toContain('name = "git-yak"\nversion = "2.1.0"');
		expect(updated).toContain('name = "git-yak-other"\nversion = "9.9.9"');
	});

	it('fails for a missing crate', () => {
		expect(() => readVersion({...CARGO_LOCK, crate: 'nope'}, text)).toThrow('no entry for nope');
	});
});
