import {describe, expect, it} from 'vitest';
import {parseCargoVersion} from './cargoVersion';

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
