import {describe, expect, it} from 'vitest';
import {extractRustCommands, findParityGaps} from './protocolParity';

const RUST_SAMPLE = `
	match req.command.as_str() {
		"gitCall" => git_call::run(&req).await,
		"readFile" => read_file::run(&req).await,
		"heartbeat" => heartbeat::run(&req, state),
		unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
	}
`;

describe('extractRustCommands', () => {
	it('pulls the matched command literals in order', () => {
		expect(extractRustCommands(RUST_SAMPLE)).toEqual(['gitCall', 'readFile', 'heartbeat']);
	});

	it('ignores the catch-all arm and its format string', () => {
		expect(extractRustCommands(RUST_SAMPLE)).not.toContain('Unknown command: {unknown}');
	});
});

describe('findParityGaps', () => {
	it('reports a Rust command the TypeScript enum does not know', () => {
		const gaps = findParityGaps(['gitCall', 'newThing'], ['gitCall'], []);

		expect(gaps.missingInTs).toEqual(['newThing']);
		expect(gaps.missingInRust).toEqual([]);
	});

	it('reports a TypeScript command the Rust worker does not implement', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'writeFile'], []);

		expect(gaps.missingInRust).toEqual(['writeFile']);
	});

	it('honours the exemption list', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'sshAgentInit'], ['sshAgentInit']);

		expect(gaps.missingInRust).toEqual([]);
	});

	it('reports nothing when both sides agree', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall'], []);

		expect(gaps).toEqual({missingInTs: [], missingInRust: []});
	});
});
