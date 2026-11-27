// CI: fails unless every `<file>.sig` in --signatures verifies against its file with the
// committed updater public key, so a release never publishes signatures the apps reject.
//
//   bun run scripts/release/verify-signatures.ts --pubkey <updater.pub> --signatures <dir> --files <dir> [--files <dir>...]
//
// Each signed file is looked up in the --files dirs in order (installers, macOS updater archives).
import {readFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {verifySignatureDir} from './verifySignatures';

const {values} = parseArgs({
	options: {
		pubkey: {type: 'string'},
		signatures: {type: 'string'},
		files: {type: 'string', multiple: true},
	},
});

const {pubkey, signatures, files} = values;

if (!pubkey || !signatures || !files?.length) {
	console.error('Usage: verify-signatures.ts --pubkey <updater.pub> --signatures <dir> --files <dir> [--files <dir>...]');
	process.exit(1);
}

const checks = verifySignatureDir(signatures, files, readFileSync(pubkey, 'utf8'));

// Every installer job signs, so no signature at all means the build lost them.
if (!checks.length) {
	console.error(`::error::No signatures found in ${signatures}.`);
	process.exit(1);
}

for (const {file, error} of checks) {
	console.log(error ? `::error::${file}: ${error}` : `${file}: signature OK`);
}

const failed = checks.filter(check => check.error).length;

if (failed) {
	console.error(`${failed} of ${checks.length} signatures do not verify against ${pubkey}; nothing was published.`);
	process.exit(1);
}
