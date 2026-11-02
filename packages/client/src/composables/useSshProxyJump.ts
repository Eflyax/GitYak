import {ref, readonly} from 'vue';
import type {Ref} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {homeDir} from '@tauri-apps/api/path';
import type {ISshProxyJumpConfig} from '@/domain/models/SshProxyJump';
import {
	applyProxyJumpBlock,
	buildProxyJumpBlock,
	hasProxyJumpBlock,
	removeProxyJumpBlock,
	validateProxyJumpConfig,
} from '@/domain/services/sshProxyJump';

const
	CONFIG_KEY = 'git-yak:ssh-proxy-jump',
	EMPTY_CONFIG: ISshProxyJumpConfig = {
		jumpHost: '',
		jumpUser: '',
		jumpPort: undefined,
		identityFile: '',
		targetHosts: '',
	};

function loadStoredConfig(): ISshProxyJumpConfig {
	try {
		const raw = localStorage.getItem(CONFIG_KEY);

		return raw ? {...EMPTY_CONFIG, ...JSON.parse(raw) as Partial<ISshProxyJumpConfig>} : {...EMPTY_CONFIG};
	}
	catch {
		return {...EMPTY_CONFIG};
	}
}

const
	config = ref<ISshProxyJumpConfig>(loadStoredConfig()),
	enabled = ref(false);

// Every change is a read-modify-write of ~/.ssh/config; chaining them keeps a quick
// on/off/on from interleaving and losing one of the writes.
let queue: Promise<unknown> = Promise.resolve();

export interface IUseSshProxyJump {
	config: Ref<ISshProxyJumpConfig>;
	enabled: Readonly<Ref<boolean>>;
	refresh: () => Promise<void>;
	enable: () => Promise<void>;
	disable: () => Promise<void>;
	saveConfig: () => Promise<void>;
	readSshConfig: () => Promise<string>;
	writeSshConfig: (content: string) => Promise<void>;
}

export const useSshProxyJump: () => IUseSshProxyJump = () => {
	const instance: IUseSshProxyJump = {
		config,
		enabled: readonly(enabled),
		refresh,
		enable,
		disable,
		saveConfig,
		readSshConfig,
		writeSshConfig,
	};

	function serialized(task: () => Promise<void>): Promise<void> {
		const next = queue.then(task);

		queue = next.catch(() => undefined);

		return next;
	}

	async function sshConfigPath(): Promise<string> {
		const home = (await homeDir()).replace(/\/+$/, '');

		return `${home}/.ssh/config`;
	}

	async function readSshConfig(): Promise<string> {
		const content = await invoke<string | null>('read_file_at', {
			path: await sshConfigPath(),
			nullIfNotExists: true,
		});

		return content ?? '';
	}

	async function writeSshConfig(content: string): Promise<void> {
		await invoke('write_file_at', {
			path: await sshConfigPath(),
			content,
			makeDirectory: true,
		});
	}

	async function writeBlock(): Promise<void> {
		const errors = validateProxyJumpConfig(config.value);

		if (errors.length > 0) {
			throw new Error(errors.join('. '));
		}

		const current = await instance.readSshConfig();

		await instance.writeSshConfig(applyProxyJumpBlock(current, buildProxyJumpBlock(config.value)));
	}

	function refresh(): Promise<void> {
		return serialized(async () => {
			enabled.value = hasProxyJumpBlock(await instance.readSshConfig());
		});
	}

	function persistConfig(): void {
		localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value));
	}

	function enable(): Promise<void> {
		persistConfig();

		return serialized(async () => {
			await writeBlock();
			enabled.value = true;
		});
	}

	function disable(): Promise<void> {
		return serialized(async () => {
			const current = await instance.readSshConfig();

			await instance.writeSshConfig(removeProxyJumpBlock(current));
			enabled.value = false;
		});
	}

	function saveConfig(): Promise<void> {
		persistConfig();

		return serialized(async () => {
			if (enabled.value) {
				await writeBlock();
			}
		});
	}

	return instance;
};
