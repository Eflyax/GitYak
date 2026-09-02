import {describe, expect, it} from 'vitest';
import {extractBunCommands, extractRustCommands, findParityGaps} from './protocolParity';

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

	it('extracts a command containing an underscore', () => {
		const sample = `
			match req.command.as_str() {
				"ssh_agent_init" => ssh_agent::run(&req),
				unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
			}
		`;
		expect(extractRustCommands(sample)).toContain('ssh_agent_init');
	});

	it('extracts a command containing a hyphen', () => {
		const sample = `
			match req.command.as_str() {
				"legacy-cmd" => legacy::run(&req),
				unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
			}
		`;
		expect(extractRustCommands(sample)).toContain('legacy-cmd');
	});

	it('extracts both literals from a multi-pattern arm in order', () => {
		const sample = `
			match req.command.as_str() {
				"gitCall" | "gitCallLegacy" => git_call::run(&req).await,
				unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
			}
		`;
		expect(extractRustCommands(sample)).toEqual(['gitCall', 'gitCallLegacy']);
	});

	it('still does not extract the format string from multi-pattern arms', () => {
		const sample = `
			match req.command.as_str() {
				"gitCall" | "gitCallLegacy" => git_call::run(&req).await,
				unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
			}
		`;
		expect(extractRustCommands(sample)).not.toContain('Unknown command: {unknown}');
	});
});

const BUN_SAMPLE = `
	switch (command) {
		case ENetworkCommand.GitCall:
			await GitCall.run(ws, data);
			break;

		case ENetworkCommand.ReadFile:
			await ReadFile.run(ws, data);
			break;

		default:
			ws.send(JSON.stringify({message: \`Unknown command: \${command}\`}));
	}
`;

const ENUM_MEMBERS = {
	GitCall: 'gitCall',
	ReadFile: 'readFile',
	WriteFile: 'writeFile',
	Heartbeat: 'heartbeat',
};

describe('extractBunCommands', () => {
	it('resolves each switch arm back to its wire value, in order', () => {
		expect(extractBunCommands(BUN_SAMPLE, ENUM_MEMBERS)).toEqual(['gitCall', 'readFile']);
	});

	it('ignores the default arm and its error string', () => {
		expect(extractBunCommands(BUN_SAMPLE, ENUM_MEMBERS)).not.toContain('Unknown command');
	});

	it('does not pick up a bare string-literal case arm', () => {
		const sample = `
			switch (command) {
				case 'gitCall':
					break;
			}
		`;
		expect(extractBunCommands(sample, ENUM_MEMBERS)).toEqual([]);
	});

	it('throws when the server dispatches a member the enum does not declare', () => {
		const sample = `
			switch (command) {
				case ENetworkCommand.WatchRepo:
					break;
			}
		`;
		expect(() => extractBunCommands(sample, ENUM_MEMBERS)).toThrow(/WatchRepo/);
	});

	it('catches drift: a command the enum declares but the switch never handles', () => {
		const bunCommands = extractBunCommands(BUN_SAMPLE, ENUM_MEMBERS);
		const gaps = findParityGaps(bunCommands, Object.values(ENUM_MEMBERS), ['heartbeat']);

		expect(gaps.unhandledByBackend).toEqual(['writeFile']);
	});
});

describe('findParityGaps', () => {
	it('reports a backend command the TypeScript enum does not know', () => {
		const gaps = findParityGaps(['gitCall', 'newThing'], ['gitCall'], []);

		expect(gaps.unknownToProtocol).toEqual(['newThing']);
		expect(gaps.unhandledByBackend).toEqual([]);
	});

	it('reports a TypeScript command the backend does not implement', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'writeFile'], []);

		expect(gaps.unhandledByBackend).toEqual(['writeFile']);
	});

	it('honours the exemption list', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'sshAgentInit'], ['sshAgentInit']);

		expect(gaps.unhandledByBackend).toEqual([]);
	});

	it('reports nothing when both sides agree', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall'], []);

		expect(gaps).toEqual({unknownToProtocol: [], unhandledByBackend: []});
	});
});
