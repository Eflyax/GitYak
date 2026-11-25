import {ref, readonly, watch} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {LATEST_MANIFEST_URL, parseRelease} from '@git-yak/protocol';
import type {TReleasePlatform} from '@git-yak/protocol';
import {availableUpdate, releasePlatform} from '@/domain/services/updates';
import type {IAvailableUpdate, IHostPlatform} from '@/domain/services/updates';
import {isTauri} from '@/infrastructure/tauri/isTauri';

const SETTINGS_KEY = 'git-yak:updateSettings';

const MANIFEST_URL = import.meta.env.VITE_UPDATE_MANIFEST_URL || LATEST_MANIFEST_URL;

export const APP_VERSION = __APP_VERSION__;

export type TUpdateCheckStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'error';

interface IUpdateSettings {
	autoCheck?: boolean;
	/** A version the user chose not to be reminded of on startup. */
	skippedVersion?: string;
}

function read(): IUpdateSettings {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY);

		return raw ? (JSON.parse(raw) as IUpdateSettings) : {};
	}
	catch {
		return {};
	}
}

function write(value: IUpdateSettings): void {
	try {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

const stored = read();

const
	autoCheck = ref(stored.autoCheck ?? true),
	skippedVersion = ref(stored.skippedVersion ?? ''),
	status = ref<TUpdateCheckStatus>('idle'),
	update = ref<IAvailableUpdate | null>(null),
	errorMessage = ref('');

watch([autoCheck, skippedVersion], ([auto, skipped]) => {
	write({autoCheck: auto, skippedVersion: skipped || undefined});
});

let platform: Promise<TReleasePlatform | null> | undefined;

function hostReleasePlatform(): Promise<TReleasePlatform | null> {
	platform ??= invoke<IHostPlatform>('get_platform')
		.then(host => releasePlatform(host, __APP_FLAVOR__))
		.catch(() => null);

	return platform;
}

async function fetchLatestRelease() {
	const response = await fetch(MANIFEST_URL, {cache: 'no-store'});

	if (!response.ok) {
		throw new Error(`${MANIFEST_URL} answered ${response.status}`);
	}

	return parseRelease(await response.json());
}

/**
 * Looks for a newer release. Only the desktop app checks: the browser flow runs whatever the
 * user built. `includeSkipped` is for an explicit check, which reports a skipped version too.
 */
async function checkForUpdates(options: {includeSkipped?: boolean} = {}): Promise<IAvailableUpdate | null> {
	if (!isTauri || status.value === 'checking') {
		return update.value;
	}

	status.value = 'checking';
	errorMessage.value = '';

	try {
		const [release, platformKey] = await Promise.all([fetchLatestRelease(), hostReleasePlatform()]);

		update.value = availableUpdate(
			release,
			APP_VERSION,
			platformKey,
			options.includeSkipped ? undefined : skippedVersion.value,
		);
		status.value = update.value ? 'available' : 'upToDate';
	}
	catch (err: unknown) {
		update.value = null;
		errorMessage.value = err instanceof Error ? err.message : String(err);
		status.value = 'error';
	}

	return update.value;
}

function skipVersion(version: string): void {
	skippedVersion.value = version;
}

export function useUpdateCheck() {
	return {
		autoCheck,
		status: readonly(status),
		update: readonly(update),
		errorMessage: readonly(errorMessage),
		checkForUpdates,
		skipVersion,
	};
}
