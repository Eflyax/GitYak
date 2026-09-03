import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCargoVersion} from './cargoVersion';

const CARGO_TOML_PATH = join(
	dirname(fileURLToPath(import.meta.url)),
	'..', '..', '..', 'remote-worker-rs', 'Cargo.toml',
);

const CARGO_SAMPLE = `[package]
name = "remote-worker-rs"
version = "2.0.0"
edition = "2021"

[dependencies]
axum = { version = "0.7", features = ["ws"] }
`;

const CARGO_SAMPLE_DEP_FIRST = `[dependencies]
axum = { version = "0.7", features = ["ws"] }
tokio = { version = "1.38" }

[package]
name = "remote-worker-rs"
version = "2.0.0"
edition = "2021"
`;

describe('parseCargoVersion', () => {
	it('reads the package version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE)).toBe('2.0.0');
	});

	it('does not pick up a dependency version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE_DEP_FIRST)).not.toBe('0.7');
		expect(parseCargoVersion(CARGO_SAMPLE_DEP_FIRST)).toBe('2.0.0');
	});

	it('throws when the package section has no version', () => {
		expect(() => parseCargoVersion('[package]\nname = "x"\n')).toThrow(/no version/i);
	});
});

// vite.config.ts calls parseCargoVersion at config-load time, so a Cargo.toml reformat that
// defeats the regex breaks the BUILD, which `yarn verify` does not run. This is the check
// that keeps "single source of truth for the worker version" true end to end.
describe('parseCargoVersion against the real Cargo.toml', () => {
	it('reads a semver version off the remote worker manifest on disk', () => {
		const version = parseCargoVersion(readFileSync(CARGO_TOML_PATH, 'utf8'));

		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});
