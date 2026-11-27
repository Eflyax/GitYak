import {describe, expect, it} from 'vitest';
import {countBy, parseDownload, parseDownloads} from './downloadLog';

function line(fields: Partial<Record<'time' | 'method' | 'status' | 'bytes' | 'completion' | 'range' | 'uri' | 'src' | 'from' | 'client', string>>): string {
	const all = {
		time: '2026-11-26T12:00:00+01:00',
		method: 'GET',
		status: '200',
		bytes: '5655761',
		completion: 'OK',
		range: '',
		uri: '/releases/v2.1.1/GitYak-2.1.1-macos-arm64.dmg',
		src: '',
		from: '',
		client: '37.188.142.0',
		...fields,
	};

	return [all.time, all.method, all.status, all.bytes, all.completion, all.range, all.uri, all.src, all.from, all.client, 'Mozilla/5.0'].join('\t');
}

describe('parseDownload', () => {
	it('reads a whole download from the website', () => {
		expect(parseDownload(line({}))).toEqual({
			time: '2026-11-26T12:00:00+01:00',
			version: '2.1.1',
			platform: 'macos-arm64',
			source: 'web',
			client: '37.188.142.0',
		});
	});

	it('reads an update started in the app', () => {
		expect(parseDownload(line({
			uri: '/releases/v2.1.1/GitYak-2.1.1-windows-x64-setup.exe',
			src: 'app',
			from: '2.1.0',
		}))).toMatchObject({platform: 'windows-x64', source: 'app', fromVersion: '2.1.0'});
	});

	it('reads the updater downloads as updates', () => {
		expect(parseDownload(line({uri: '/releases/v2.3.0/GitYak-2.3.0-macos-arm64.app.tar.gz', src: 'update'})))
			.toMatchObject({platform: 'macos-arm64', source: 'update'});
		expect(parseDownload(line({uri: '/releases/v2.3.0/GitYak-2.3.0-linux-x64.deb', src: 'update', from: '2.2.0'})))
			.toMatchObject({platform: 'linux-x64', source: 'update', fromVersion: '2.2.0'});

		const exe = parseDownload(line({uri: '/releases/v2.3.0/GitYak-2.3.0-windows-x64-setup.exe', src: 'update'}));

		expect(exe).toMatchObject({platform: 'windows-x64', source: 'update'});
		expect(exe).not.toHaveProperty('fromVersion');
	});

	it('counts an .app.tar.gz as an update even without src', () => {
		expect(parseDownload(line({uri: '/releases/v2.3.0/GitYak-2.3.0-macos-x64.app.tar.gz'})))
			.toMatchObject({platform: 'macos-x64', source: 'update'});
	});

	it('skips the signature files', () => {
		expect(parseDownload(line({uri: '/releases/v2.3.0/GitYak-2.3.0-macos-arm64.app.tar.gz.sig', src: 'update'}))).toBeNull();
	});

	it('tells the two Linux packages apart', () => {
		expect(parseDownload(line({uri: '/releases/v2.1.1/GitYak-2.1.1-linux-x64.deb'}))?.platform).toBe('linux-x64');
		expect(parseDownload(line({uri: '/releases/v2.1.1/GitYak-2.1.1-linux-x64-focal.deb'}))?.platform).toBe('linux-x64-focal');
	});

	it('counts a download split into ranges once', () => {
		expect(parseDownload(line({status: '206', completion: 'OK', range: 'bytes=0-1048575'}))).not.toBeNull();
		expect(parseDownload(line({status: '206', completion: 'OK', range: 'bytes=1048576-'}))).toBeNull();
	});

	it('skips cancelled, failed and non-GET requests and other files', () => {
		expect(parseDownload(line({completion: ''}))).toBeNull();
		expect(parseDownload(line({status: '404'}))).toBeNull();
		expect(parseDownload(line({method: 'HEAD'}))).toBeNull();
		expect(parseDownload(line({uri: '/releases/latest.json'}))).toBeNull();
		expect(parseDownload(line({uri: '/releases/v2.1.1/notes.txt'}))).toBeNull();
		expect(parseDownload('')).toBeNull();
	});
});

describe('countBy', () => {
	it('counts, largest first', () => {
		const downloads = parseDownloads([
			line({}),
			line({}),
			line({uri: '/releases/v2.1.1/GitYak-2.1.1-linux-x64.deb'}),
		].join('\n'));

		expect(countBy(downloads, d => d.platform)).toEqual([['macos-arm64', 2], ['linux-x64', 1]]);
	});
});
