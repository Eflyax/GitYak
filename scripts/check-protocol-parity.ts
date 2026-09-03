import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENetworkCommand} from '../packages/protocol/src/index';
import {extractBunCommands, extractRustCommands, findParityGaps} from './protocolParity';
import type {IParityGaps} from './protocolParity';

// The Rust worker is reached only through an SSH tunnel, so agent forwarding — a
// Bun-server concern — has no counterpart there.
const RUST_EXEMPT = [ENetworkCommand.SshAgentInit];

// Heartbeat is sent only over the SSH tunnel to keep the Rust worker alive
// (SshTunnelClient.ts), so the local Bun server never receives it.
const BUN_EXEMPT = [ENetworkCommand.Heartbeat];

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	repoRoot = join(scriptDir, '..'),
	rustDispatchPath = join(repoRoot, 'packages', 'remote-worker-rs', 'src', 'commands', 'mod.rs'),
	bunDispatchPath = join(repoRoot, 'packages', 'server', 'src', 'index.ts'),
	tsCommands = Object.values(ENetworkCommand),
	rustCommands = extractRustCommands(readFileSync(rustDispatchPath, 'utf8')),
	bunCommands = extractBunCommands(readFileSync(bunDispatchPath, 'utf8'), ENetworkCommand),
	rustGaps = findParityGaps(rustCommands, tsCommands, RUST_EXEMPT),
	bunGaps = findParityGaps(bunCommands, tsCommands, BUN_EXEMPT);

function report(backend: string, gaps: IParityGaps): number {
	for (const command of gaps.unknownToProtocol) {
		console.log(`  FAIL ${backend} dispatches "${command}", which ENetworkCommand does not declare`);
	}

	for (const command of gaps.unhandledByBackend) {
		console.log(`  FAIL ENetworkCommand declares "${command}", which ${backend} does not handle`);
	}

	return gaps.unknownToProtocol.length + gaps.unhandledByBackend.length;
}

const failures = report('the Rust worker', rustGaps) + report('the Bun server', bunGaps);

console.log(`\nrust commands: ${rustCommands.length}, bun commands: ${bunCommands.length}, protocol commands: ${tsCommands.length}`);
console.log(failures === 0 ? 'OK — protocol in parity' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
