import {describe, it, expect, beforeEach, vi} from 'vitest';
import type {ISshProxyJumpConfig} from '@/domain/models/SshProxyJump';

const
	SSH_CONFIG_PATH = '/Users/me/.ssh/config',
	USER_CONFIG = 'Host github.com\n\tUser git\n',
	VALID: ISshProxyJumpConfig = {
		jumpHost: '10.99.0.1',
		jumpUser: 'me',
		jumpPort: undefined,
		identityFile: '',
		targetHosts: 'git.example.com',
	},
	files = new Map<string, string>(),
	storage = new Map<string, string>(),
	invoke = vi.fn(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
		const path = String(args['path']);

		if (command === 'read_file_at') {
			if (files.has(path)) {
				return files.get(path);
			}
			if (args['nullIfNotExists']) {
				return null;
			}
			throw new Error('No such file');
		}

		if (command === 'write_file_at') {
			files.set(path, String(args['content']));
			return null;
		}

		throw new Error(`Unexpected command ${command}`);
	});

vi.mock('@tauri-apps/api/core', () => ({invoke}));
vi.mock('@tauri-apps/api/path', () => ({homeDir: async () => '/Users/me'}));

vi.stubGlobal('localStorage', {
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => storage.set(key, value),
	removeItem: (key: string) => storage.delete(key),
});

// State lives in module-scope refs, so every test starts from a fresh module instance.
async function load(): Promise<ReturnType<typeof import('./useSshProxyJump')['useSshProxyJump']>> {
	vi.resetModules();

	return (await import('./useSshProxyJump')).useSshProxyJump();
}

beforeEach(() => {
	files.clear();
	storage.clear();
	invoke.mockClear();
});

describe('useSshProxyJump.enable', () => {
	it('appends the managed block to ~/.ssh/config and turns the switch on', async () => {
		files.set(SSH_CONFIG_PATH, USER_CONFIG);
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		await proxyJump.enable();

		expect(files.get(SSH_CONFIG_PATH)).toMatch(/^Host github\.com\n\tUser git\n\n# >>> GitYak ProxyJump >>>\n[\s\S]*\tProxyJump gityak-jump\n# <<< GitYak ProxyJump <<<\n$/);
		expect(proxyJump.enabled.value).toBe(true);
	});

	it('remembers the config it enabled even if the form was never blurred', async () => {
		const first = await load();

		first.config.value = {...VALID};
		await first.enable();

		expect((await load()).config.value).toEqual(VALID);
	});

	it('creates the config when the user has none yet', async () => {
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		await proxyJump.enable();

		expect(invoke).toHaveBeenCalledWith('write_file_at', expect.objectContaining({path: SSH_CONFIG_PATH, makeDirectory: true}));
		expect(files.get(SSH_CONFIG_PATH)).toMatch(/^# >>> GitYak ProxyJump >>>/);
	});

	it('rejects an invalid config without touching the file', async () => {
		files.set(SSH_CONFIG_PATH, USER_CONFIG);
		const proxyJump = await load();

		proxyJump.config.value = {...VALID, jumpHost: ''};

		await expect(proxyJump.enable()).rejects.toThrow('Jump host is required');
		expect(files.get(SSH_CONFIG_PATH)).toBe(USER_CONFIG);
		expect(proxyJump.enabled.value).toBe(false);
	});

	it('leaves the switch off when writing fails', async () => {
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		invoke.mockImplementationOnce(async () => null).mockRejectedValueOnce(new Error('Permission denied'));

		await expect(proxyJump.enable()).rejects.toThrow('Permission denied');
		expect(proxyJump.enabled.value).toBe(false);
	});
});

describe('useSshProxyJump.disable', () => {
	it('removes the block, restores the user config and turns the switch off', async () => {
		files.set(SSH_CONFIG_PATH, USER_CONFIG);
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		await proxyJump.enable();
		await proxyJump.disable();

		expect(files.get(SSH_CONFIG_PATH)).toBe(USER_CONFIG);
		expect(proxyJump.enabled.value).toBe(false);
	});
});

describe('useSshProxyJump.refresh', () => {
	it('reads the switch state from the actual ~/.ssh/config', async () => {
		files.set(SSH_CONFIG_PATH, `${USER_CONFIG}\n# >>> GitYak ProxyJump >>>\nHost x\n# <<< GitYak ProxyJump <<<\n`);
		const proxyJump = await load();

		await proxyJump.refresh();

		expect(proxyJump.enabled.value).toBe(true);

		files.set(SSH_CONFIG_PATH, USER_CONFIG);
		await proxyJump.refresh();

		expect(proxyJump.enabled.value).toBe(false);
	});

	it('is off when there is no ~/.ssh/config', async () => {
		const proxyJump = await load();

		await proxyJump.refresh();

		expect(proxyJump.enabled.value).toBe(false);
	});
});

describe('useSshProxyJump.saveConfig', () => {
	it('remembers the form between app starts', async () => {
		const first = await load();

		first.config.value = {...VALID, jumpPort: 2222};
		await first.saveConfig();

		const second = await load();

		expect(second.config.value).toEqual({...VALID, jumpPort: 2222});
	});

	it('rewrites the block while the switch is on', async () => {
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		await proxyJump.enable();
		proxyJump.config.value = {...VALID, jumpHost: '10.99.0.9'};
		await proxyJump.saveConfig();

		expect(files.get(SSH_CONFIG_PATH)).toContain('\tHostName 10.99.0.9\n');
		expect(files.get(SSH_CONFIG_PATH)).not.toContain('10.99.0.1');
	});

	it('does not touch ~/.ssh/config while the switch is off', async () => {
		const proxyJump = await load();

		proxyJump.config.value = {...VALID};
		await proxyJump.saveConfig();

		expect(files.has(SSH_CONFIG_PATH)).toBe(false);
	});
});
