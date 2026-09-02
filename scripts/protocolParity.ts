export interface IParityGaps {
	missingInTs: Array<string>;
	missingInRust: Array<string>;
}

// Matches the entire pattern group before => in a Rust match arm, including multi-pattern
// arms joined with |. Extracts each command literal. The catch-all arm binds an identifier
// rather than a literal, so it never matches.
const MATCH_ARM = /("[^"]+"(?:\s*\|\s*"[^"]+")*)\s*=>/g;
const EXTRACT_LITERAL = /"([^"]+)"/g;

export function extractRustCommands(source: string): Array<string> {
	const commands: Array<string> = [];
	for (const match of source.matchAll(MATCH_ARM)) {
		const patternGroup = match[1];
		for (const literalMatch of patternGroup.matchAll(EXTRACT_LITERAL)) {
			commands.push(literalMatch[1]);
		}
	}
	return commands;
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
