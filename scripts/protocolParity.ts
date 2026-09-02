export interface IParityGaps {
	// Commands a backend dispatches that ENetworkCommand does not declare.
	unknownToProtocol: Array<string>;
	// Commands ENetworkCommand declares that the backend does not handle (minus exemptions).
	unhandledByBackend: Array<string>;
}

// Matches the entire pattern group before => in a Rust match arm, including multi-pattern
// arms joined with |. Extracts each command literal. The catch-all arm binds an identifier
// rather than a literal, so it never matches.
const MATCH_ARM = /("[^"]+"(?:\s*\|\s*"[^"]+")*)\s*=>/g;
const EXTRACT_LITERAL = /"([^"]+)"/g;

// Matches a `case ENetworkCommand.Member:` arm of the Bun server's dispatch switch. The
// server switches on enum members rather than string literals, so the member name is
// resolved back to its wire value through the enum itself.
const BUN_CASE_ARM = /case\s+ENetworkCommand\.(\w+)\s*:/g;

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

export function extractBunCommands(source: string, enumMembers: Record<string, string>): Array<string> {
	const commands: Array<string> = [];
	for (const match of source.matchAll(BUN_CASE_ARM)) {
		const member = match[1];
		const value = enumMembers[member];
		if (value === undefined) {
			throw new Error(`Bun server dispatches ENetworkCommand.${member}, which the enum does not declare`);
		}
		commands.push(value);
	}
	return commands;
}

export function findParityGaps(
	backendCommands: Array<string>,
	protocolCommands: Array<string>,
	exemptCommands: Array<string>,
): IParityGaps {
	const
		backend = new Set(backendCommands),
		protocol = new Set(protocolCommands),
		exempt = new Set(exemptCommands);

	return {
		unknownToProtocol: backendCommands.filter(c => !protocol.has(c)),
		unhandledByBackend: protocolCommands.filter(c => !backend.has(c) && !exempt.has(c)),
	};
}
