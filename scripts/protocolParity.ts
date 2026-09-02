export interface IParityGaps {
	missingInTs: Array<string>;
	missingInRust: Array<string>;
}

// Matches the `"commandName" =>` arms of the Rust dispatch. The catch-all arm binds an
// identifier rather than a literal, so it never matches.
const MATCH_ARM = /"([A-Za-z][A-Za-z0-9]*)"\s*=>/g;

export function extractRustCommands(source: string): Array<string> {
	return [...source.matchAll(MATCH_ARM)].map(m => m[1]);
}

export function findParityGaps(
	rustCommands: Array<string>,
	tsCommands: Array<string>,
	rustExempt: Array<string>,
): IParityGaps {
	const
		rust = new Set(rustCommands),
		ts = new Set(tsCommands),
		exempt = new Set(rustExempt);

	return {
		missingInTs: rustCommands.filter(c => !ts.has(c)),
		missingInRust: tsCommands.filter(c => !rust.has(c) && !exempt.has(c)),
	};
}
