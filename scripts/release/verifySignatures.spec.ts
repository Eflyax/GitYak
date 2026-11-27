import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import type {KeyObject} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {verifyMinisign, verifySignatureDir} from './verifySignatures';

// Made by `tauri signer generate` / `tauri signer sign` (shared with the Rust deb_update tests).
const fixtures = join(__dirname, '..', '..', 'packages', 'client', 'src-tauri', 'src', 'deb_update_fixtures');
const
	SAMPLE = readFileSync(join(fixtures, 'sample.bin')),
	SAMPLE_SIG = readFileSync(join(fixtures, 'sample.bin.sig'), 'utf8'),
	TEST_PUB = readFileSync(join(fixtures, 'test.pub'), 'utf8'),
	OTHER_PUB = readFileSync(join(fixtures, 'other.pub'), 'utf8'),
	UPDATER_PUB = readFileSync(join(__dirname, '..', '..', 'packages', 'client', 'src-tauri', 'updater.pub'), 'utf8');

const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString('base64');

/** A minisign key pair in the `tauri signer` encoding (base64 of the minisign text). */
function makeKey(): {publicKey: string, privateKey: KeyObject, keyId: Buffer} {
	const
		{publicKey, privateKey} = generateKeyPairSync('ed25519'),
		raw = Buffer.from(publicKey.export({format: 'jwk'}).x!, 'base64url'),
		keyId = Buffer.from('0123456789abcdef', 'hex');

	return {
		publicKey: b64(`untrusted comment: minisign public key\n${b64(Buffer.concat([Buffer.from('Ed'), keyId, raw]))}\n`),
		privateKey,
		keyId,
	};
}

/** A minisign signature of `data`, legacy ("Ed": over the data) or prehashed ("ED": over its BLAKE2b-512). */
function makeSignature(data: Uint8Array, key: ReturnType<typeof makeKey>, algorithm: 'Ed' | 'ED'): string {
	const
		message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data,
		signature = sign(null, message, key.privateKey),
		trusted = 'timestamp:1\tfile:x',
		global = sign(null, Buffer.concat([signature, Buffer.from(trusted)]), key.privateKey);

	return b64([
		'untrusted comment: test',
		b64(Buffer.concat([Buffer.from(algorithm), key.keyId, signature])),
		`trusted comment: ${trusted}`,
		b64(global),
		'',
	].join('\n'));
}

describe('verifyMinisign', () => {
	it('accepts a tauri signer signature with its key', () => {
		expect(() => verifyMinisign(SAMPLE, SAMPLE_SIG, TEST_PUB)).not.toThrow();
	});

	it('rejects another key', () => {
		expect(() => verifyMinisign(SAMPLE, SAMPLE_SIG, OTHER_PUB)).toThrow();
	});

	it('rejects the real updater key for a test signature', () => {
		expect(() => verifyMinisign(SAMPLE, SAMPLE_SIG, UPDATER_PUB)).toThrow();
	});

	it('rejects tampered data', () => {
		const tampered = Buffer.from(SAMPLE);
		tampered[0] ^= 1;

		expect(() => verifyMinisign(tampered, SAMPLE_SIG, TEST_PUB)).toThrow();
	});

	it('rejects a tampered trusted comment', () => {
		const
			text = Buffer.from(SAMPLE_SIG.trim(), 'base64').toString('utf8'),
			forged = b64(text.replace('file:sample.bin', 'file:other.bin'));

		expect(forged).not.toBe(SAMPLE_SIG.trim());
		expect(() => verifyMinisign(SAMPLE, forged, TEST_PUB)).toThrow(/trusted comment/);
	});

	it('accepts a prehashed signature made with a fresh key, and only for that key', () => {
		const
			key = makeKey(),
			data = Buffer.from('GitYak update');

		expect(() => verifyMinisign(data, makeSignature(data, key, 'ED'), key.publicKey)).not.toThrow();
		expect(() => verifyMinisign(data, makeSignature(data, key, 'ED'), makeKey().publicKey)).toThrow();
	});

	it('rejects a legacy signature, which the Linux in-app update refuses too', () => {
		const
			key = makeKey(),
			data = Buffer.from('GitYak update');

		expect(() => verifyMinisign(data, makeSignature(data, key, 'Ed'), key.publicKey)).toThrow(/legacy/);
	});

	it('rejects garbage', () => {
		expect(() => verifyMinisign(SAMPLE, '', TEST_PUB)).toThrow();
		expect(() => verifyMinisign(SAMPLE, 'not base64 at all!', TEST_PUB)).toThrow();
		expect(() => verifyMinisign(SAMPLE, b64('hello world\n'), TEST_PUB)).toThrow();
		expect(() => verifyMinisign(SAMPLE, SAMPLE_SIG, b64('hello world\n'))).toThrow();
	});
});

describe('verifySignatureDir', () => {
	let root = '';

	afterEach(() => {
		if (root) {
			rmSync(root, {recursive: true, force: true});
		}
	});

	/** signatures/, assets/ and updater/ in a fresh temp dir. */
	function layout(): {signatures: string, assets: string, updater: string} {
		root = mkdtempSync(join(tmpdir(), 'gityak-verify-'));
		const dirs = {signatures: join(root, 'signatures'), assets: join(root, 'assets'), updater: join(root, 'updater')};
		Object.values(dirs).forEach(dir => mkdirSync(dir));

		return dirs;
	}

	it('checks each .sig against its file, wherever the file is', () => {
		const
			dirs = layout(),
			key = makeKey(),
			archive = Buffer.from('macOS archive');
		writeFileSync(join(dirs.assets, 'sample.bin'), SAMPLE);
		writeFileSync(join(dirs.signatures, 'sample.bin.sig'), SAMPLE_SIG);
		writeFileSync(join(dirs.updater, 'GitYak.app.tar.gz'), archive);
		writeFileSync(join(dirs.signatures, 'GitYak.app.tar.gz.sig'), makeSignature(archive, key, 'ED'));

		expect(verifySignatureDir(dirs.signatures, [dirs.assets, dirs.updater], TEST_PUB)).toEqual([
			{file: 'GitYak.app.tar.gz', error: expect.any(String)},
			{file: 'sample.bin'},
		]);
		expect(verifySignatureDir(dirs.signatures, [dirs.assets, dirs.updater], key.publicKey)).toEqual([
			{file: 'GitYak.app.tar.gz'},
			{file: 'sample.bin', error: expect.any(String)},
		]);
	});

	it('reports a signature without its file', () => {
		const dirs = layout();
		writeFileSync(join(dirs.signatures, 'sample.bin.sig'), SAMPLE_SIG);

		expect(verifySignatureDir(dirs.signatures, [dirs.assets, dirs.updater], TEST_PUB)).toEqual([
			{file: 'sample.bin', error: expect.stringMatching(/not found/)},
		]);
	});

	it('reports a tampered file', () => {
		const dirs = layout();
		const tampered = Buffer.from(SAMPLE);
		tampered[tampered.length - 1] ^= 1;
		writeFileSync(join(dirs.assets, 'sample.bin'), tampered);
		writeFileSync(join(dirs.signatures, 'sample.bin.sig'), SAMPLE_SIG);

		expect(verifySignatureDir(dirs.signatures, [dirs.assets], TEST_PUB)).toEqual([
			{file: 'sample.bin', error: expect.any(String)},
		]);
	});

	it('finds nothing to check in an empty signatures dir', () => {
		const dirs = layout();

		expect(verifySignatureDir(dirs.signatures, [dirs.assets], TEST_PUB)).toEqual([]);
	});
});
