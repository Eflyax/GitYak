import {describe, expect, it} from 'vitest';
import type {Child, Command} from '@tauri-apps/plugin-shell';
import {createChunkDecoder, createLineSplitter, runSpawnedGit, splitOutputLines, streamEncoding} from './spawnedGit';

describe('splitOutputLines', () => {
	it('splits on both separators and drops empty pieces', () => {
		expect(splitOutputLines('a 1%\ra 2%\r\nb\n')).toEqual(['a 1%', 'a 2%', 'b']);
	});
});

describe('createLineSplitter', () => {
	it('emits each \\r progress update as its own line', () => {
		const s = createLineSplitter();
		expect(s.push('Receiving objects:  1% (1/100)\rReceiving objects:  2% (2/100)\r')).toEqual([
			'Receiving objects:  1% (1/100)',
			'Receiving objects:  2% (2/100)',
		]);
	});

	it('holds an unterminated piece back until the next chunk completes it', () => {
		const s = createLineSplitter();
		expect(s.push('Receiving obj')).toEqual([]);
		expect(s.push('ects: 50%\rRes')).toEqual(['Receiving objects: 50%']);
		expect(s.push('olving deltas: 10%\r\n')).toEqual(['Resolving deltas: 10%']);
	});

	it('flushes the tail once, at the end', () => {
		const s = createLineSplitter();
		s.push('done\nfatal: no');
		expect(s.flush()).toEqual(['fatal: no']);
		expect(s.flush()).toEqual([]);
	});
});

describe('createChunkDecoder', () => {
	it('passes text through', () => {
		expect(createChunkDecoder()('abc')).toBe('abc');
	});

	it('decodes bytes and number arrays, keeping a character split across chunks', () => {
		const decode = createChunkDecoder();
		const bytes = new TextEncoder().encode('ž1');
		expect(decode(bytes.slice(0, 1))).toBe('');
		expect(decode(Array.from(bytes.slice(1)))).toBe('ž1');
	});
});

describe('streamEncoding', () => {
	it('streams raw on Tauri 2', () => {
		expect(streamEncoding()).toBe('raw');
	});
});

type TListener = (payload: never) => void;

/** A stand-in for the shell plugin's Command: tests drive its stdout/stderr/close events. */
function fakeCommand(pid = 42) {
	const listeners: Record<string, Array<TListener>> = {};
	const on = (key: string) => (event: string, fn: TListener) => {
		(listeners[`${key}:${event}`] ??= []).push(fn);
	};
	const kills: Array<number> = [];
	const child = {pid, kill: async () => { kills.push(pid); }} as unknown as Child;
	const command = {
		stdout: {on: on('stdout')},
		stderr: {on: on('stderr')},
		on: on('cmd'),
		spawn: async () => child,
	} as unknown as Command<string>;
	const emit = (key: string, payload: unknown): void => {
		(listeners[key] ?? []).forEach(fn => fn(payload as never));
	};

	return {command, child, kills, emit};
}

async function spawned(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
}

describe('runSpawnedGit', () => {
	it('streams raw progress chunks line by line and resolves on exit 0', async () => {
		const f = fakeCommand();
		const lines: Array<string> = [];
		const proc = runSpawnedGit(async () => f.command, line => lines.push(line));
		await spawned();
		const enc = new TextEncoder();
		f.emit('stderr:data', Array.from(enc.encode('Receiving objects:  1%\rReceiving ')));
		f.emit('stderr:data', enc.encode('objects:  2%\r'));
		f.emit('cmd:close', {code: 0, signal: null});
		await proc.done;
		expect(lines).toEqual(['Receiving objects:  1%', 'Receiving objects:  2%']);
	});

	it('rejects with the stderr lines on failure', async () => {
		const f = fakeCommand();
		const proc = runSpawnedGit(async () => f.command, () => {});
		await spawned();
		f.emit('stderr:data', 'Cloning into \'x\'...\nfatal: repository not found');
		f.emit('cmd:close', {code: 128, signal: null});
		await expect(proc.done).rejects.toThrow("Cloning into 'x'...\nfatal: repository not found");
	});

	it('cancels through terminate, not kill, and reports Cancelled', async () => {
		const f = fakeCommand(7);
		const terminated: Array<number> = [];
		const proc = runSpawnedGit(async () => f.command, () => {}, async child => { terminated.push(child.pid); });
		await spawned();
		proc.cancel();
		await spawned();
		f.emit('cmd:close', {code: null, signal: 15});
		await expect(proc.done).rejects.toThrow('Cancelled');
		expect(terminated).toEqual([7]);
		expect(f.kills).toEqual([]);
	});

	it('falls back to kill when terminate fails', async () => {
		const f = fakeCommand(9);
		const proc = runSpawnedGit(async () => f.command, () => {}, async () => { throw new Error('windows'); });
		await spawned();
		proc.cancel();
		await spawned();
		f.emit('cmd:close', {code: null, signal: 9});
		await expect(proc.done).rejects.toThrow('Cancelled');
		expect(f.kills).toEqual([9]);
	});

	it('stops a child that spawns after cancel', async () => {
		const f = fakeCommand(3);
		const proc = runSpawnedGit(async () => f.command, () => {});
		proc.cancel();
		await spawned();
		expect(f.kills).toEqual([3]);
		f.emit('cmd:close', {code: null, signal: 9});
		await expect(proc.done).rejects.toThrow('Cancelled');
	});
});
