import {describe, expect, it} from 'vitest';
import {parseCargoVersion} from './cargoVersion';

const CARGO_SAMPLE = `[package]
name = "remote-worker-rs"
version = "2.0.0"
edition = "2021"

[dependencies]
axum = { version = "0.7", features = ["ws"] }
`;

describe('parseCargoVersion', () => {
	it('reads the package version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE)).toBe('2.0.0');
	});

	it('does not pick up a dependency version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE)).not.toBe('0.7');
	});

	it('throws when the package section has no version', () => {
		expect(() => parseCargoVersion('[package]\nname = "x"\n')).toThrow(/no version/i);
	});
});
