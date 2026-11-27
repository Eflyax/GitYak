import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {UPDATER_MANIFEST_URL} from '../../packages/protocol/src/releases';

const tauriDir = join(__dirname, '..', '..', 'packages', 'client', 'src-tauri');
const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));

describe('updater configuration', () => {
	it('tauri.conf.json plugins.updater.pubkey equals src-tauri/updater.pub (trimmed)', () => {
		const pubkey = readFileSync(join(tauriDir, 'updater.pub'), 'utf8').trim();

		expect(config.plugins?.updater?.pubkey).toBe(pubkey);
	});

	it('points the first endpoint at the published updater manifest', () => {
		expect(config.plugins?.updater?.endpoints?.[0]).toBe(UPDATER_MANIFEST_URL);
	});
});
