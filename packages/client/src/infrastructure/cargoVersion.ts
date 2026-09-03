// Reads `version` from the [package] section only — a dependency's inline
// `version = "0.7"` must never win.
export function parseCargoVersion(cargoToml: string): string {
	const packageSection = /^\[package\]$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(cargoToml);

	if (!packageSection) {
		throw new Error('Cargo.toml has no [package] section');
	}

	const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(packageSection[1]);

	if (!version) {
		throw new Error('Cargo.toml [package] has no version key');
	}

	return version[1];
}
