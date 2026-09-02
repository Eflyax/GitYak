import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENetworkCommand} from '../packages/protocol/src/index';
import {extractRustCommands, findParityGaps} from './protocolParity';

// The Rust worker is reached only through an SSH tunnel, so agent forwarding — a
// Bun-server concern — has no counterpart there.
const RUST_EXEMPT = [ENetworkCommand.SshAgentInit];

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	dispatchPath = join(scriptDir, '..', 'packages', 'remote-worker-rs', 'src', 'commands', 'mod.rs'),
	rustCommands = extractRustCommands(readFileSync(dispatchPath, 'utf8')),
	tsCommands = Object.values(ENetworkCommand),
	gaps = findParityGaps(rustCommands, tsCommands, RUST_EXEMPT);

for (const command of gaps.missingInTs) {
	console.log(`  FAIL Rust dispatches "${command}", which ENetworkCommand does not declare`);
}

for (const command of gaps.missingInRust) {
	console.log(`  FAIL ENetworkCommand declares "${command}", which the Rust worker does not handle`);
}

const failures = gaps.missingInTs.length + gaps.missingInRust.length;

console.log(`\nrust commands: ${rustCommands.length}, protocol commands: ${tsCommands.length}`);
console.log(failures === 0 ? 'OK — protocol in parity' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
