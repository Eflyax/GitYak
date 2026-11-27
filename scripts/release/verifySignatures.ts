// Checks the update signatures CI is about to publish against the committed updater public key,
// so a signing secret that holds a valid but different key fails the release instead of shipping
// signatures every installed app rejects.
//
// `tauri signer` writes keys and signatures as base64 of minisign text files. Tauri signs
// "prehashed" (algorithm `ED`: Ed25519 over the BLAKE2b-512 of the file); legacy `Ed` signatures
// (over the file itself) are refused like the Linux in-app update (deb_update.rs) refuses them.
import {createHash, createPublicKey, verify} from 'node:crypto';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const
	KEY_ID_LENGTH = 8,
	ED25519_PUBLIC_KEY_LENGTH = 32,
	ED25519_SIGNATURE_LENGTH = 64,
	UNTRUSTED_PREFIX = 'untrusted comment:',
	TRUSTED_PREFIX = 'trusted comment: ';

/** Strict base64 (Node's decoder silently skips invalid characters). */
function decodeBase64(text: string, what: string): Buffer {
	const trimmed = text.trim();

	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
		throw new Error(`${what} is not valid base64`);
	}

	return Buffer.from(trimmed, 'base64');
}

/** The lines of a minisign text file given as `tauri signer` writes it (base64 of the text). */
function minisignLines(b64: string, what: string): Array<string> {
	return decodeBase64(b64, what).toString('utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

interface IPublicKey {
	keyId: Buffer;
	key: ReturnType<typeof createPublicKey>;
}

function parsePublicKey(publicKeyB64: string): IPublicKey {
	const
		line = minisignLines(publicKeyB64, 'The public key').find(l => !l.startsWith(UNTRUSTED_PREFIX)) ?? '',
		bytes = decodeBase64(line, 'The public key');

	if (bytes.length !== 2 + KEY_ID_LENGTH + ED25519_PUBLIC_KEY_LENGTH || bytes.subarray(0, 2).toString('latin1') !== 'Ed') {
		throw new Error('The public key is not a minisign Ed25519 key');
	}

	return {
		keyId: bytes.subarray(2, 2 + KEY_ID_LENGTH),
		key: createPublicKey({
			key: {kty: 'OKP', crv: 'Ed25519', x: bytes.subarray(2 + KEY_ID_LENGTH).toString('base64url')},
			format: 'jwk',
		}),
	};
}

/**
 * Throws unless `signatureB64` (a `tauri signer sign` .sig) is a valid prehashed minisign
 * signature of `data` by `publicKeyB64` (a `tauri signer generate` public key), trusted comment
 * included.
 */
export function verifyMinisign(data: Uint8Array, signatureB64: string, publicKeyB64: string): void {
	const publicKey = parsePublicKey(publicKeyB64);
	const [untrusted, signatureLine, trustedLine, globalLine] = minisignLines(signatureB64, 'The signature');

	if (!untrusted?.startsWith(UNTRUSTED_PREFIX) || !trustedLine?.startsWith(TRUSTED_PREFIX) || !signatureLine || !globalLine) {
		throw new Error('The signature is not a minisign signature');
	}

	const
		signatureBytes = decodeBase64(signatureLine, 'The signature'),
		globalSignature = decodeBase64(globalLine, 'The trusted comment signature');

	if (signatureBytes.length !== 2 + KEY_ID_LENGTH + ED25519_SIGNATURE_LENGTH || globalSignature.length !== ED25519_SIGNATURE_LENGTH) {
		throw new Error('The signature is not a minisign signature');
	}

	const
		algorithm = signatureBytes.subarray(0, 2).toString('latin1'),
		keyId = signatureBytes.subarray(2, 2 + KEY_ID_LENGTH),
		signature = signatureBytes.subarray(2 + KEY_ID_LENGTH);

	if (algorithm === 'Ed') {
		throw new Error('The signature is a legacy (non-prehashed) minisign signature, which the app refuses');
	}

	if (algorithm !== 'ED') {
		throw new Error(`Unknown signature algorithm ${JSON.stringify(algorithm)}`);
	}

	if (!keyId.equals(publicKey.keyId)) {
		throw new Error(`Signed by key ${Buffer.from(keyId).reverse().toString('hex').toUpperCase()}, not by key ${Buffer.from(publicKey.keyId).reverse().toString('hex').toUpperCase()}`);
	}

	if (!verify(null, createHash('blake2b512').update(data).digest(), publicKey.key, signature)) {
		throw new Error('The signature does not match the file');
	}

	const trustedComment = Buffer.from(trustedLine.slice(TRUSTED_PREFIX.length), 'utf8');

	if (!verify(null, Buffer.concat([signature, trustedComment]), publicKey.key, globalSignature)) {
		throw new Error('The trusted comment signature does not match');
	}
}

export interface ISignatureCheck {
	/** The signed file's name (the .sig name without `.sig`). */
	file: string;
	/** Why the signature is not valid; absent when it is. */
	error?: string;
}

/**
 * Checks every `<file>.sig` in `signaturesDir` against `<file>`, looked up in `fileDirs` in
 * order, with `publicKeyB64`. One entry per signature, sorted by file name.
 */
export function verifySignatureDir(signaturesDir: string, fileDirs: Array<string>, publicKeyB64: string): Array<ISignatureCheck> {
	return readdirSync(signaturesDir)
		.filter(name => name.endsWith('.sig'))
		.sort()
		.map(name => {
			const
				file = name.slice(0, -'.sig'.length),
				dir = fileDirs.find(d => existsSync(join(d, file)));

			if (!dir) {
				return {file, error: `${file} not found in ${fileDirs.join(', ')}`};
			}

			try {
				verifyMinisign(readFileSync(join(dir, file)), readFileSync(join(signaturesDir, name), 'utf8'), publicKeyB64);

				return {file};
			}
			catch (err) {
				return {file, error: err instanceof Error ? err.message : String(err)};
			}
		});
}
