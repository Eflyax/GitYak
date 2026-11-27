import {readonly, ref} from 'vue';
import type {Ref} from 'vue';
import type {IAvailableUpdate} from '@/domain/services/updates';
import type {TUpdatePhase} from '@/domain/services/updateProgress';
import type {IUpdateInstaller} from '@/infrastructure/updater/IUpdateInstaller';
import {createPluginInstaller} from '@/infrastructure/updater/pluginInstaller';
import {createDebInstaller} from '@/infrastructure/updater/debInstaller';
import {confirmLeave} from '@/composables/useProjectManager';

const CANNOT_SELF_UPDATE = 'This build cannot update itself. Download the new version instead.';

/** Picks the installer for an update; only called for one the app can install itself. */
export type TMakeInstaller = (update: IAvailableUpdate) => IUpdateInstaller;

export interface IUpdateFlow {
	phase: Readonly<Ref<TUpdatePhase>>;
	/** Downloads the update; ignored while another one is downloading, ready or installing. */
	startUpdate: (update: IAvailableUpdate) => Promise<void>;
	/** Installs the ready update and restarts - only ever on the user's Restart click. */
	restartToUpdate: () => Promise<void>;
	/** Forgets the update (and a download still running). */
	resetUpdate: () => void;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** The update flow over the given installers; `confirm` asks whether the app may be left now. */
export function createUpdateFlow(makeInstaller: TMakeInstaller, confirm: () => Promise<boolean>): IUpdateFlow {
	const phase = ref<TUpdatePhase>({phase: 'idle'});

	let installer: IUpdateInstaller | null = null;
	// Bumped by every start and reset, so a download that was dropped cannot report back.
	let run = 0;

	async function startUpdate(update: IAvailableUpdate): Promise<void> {
		if (phase.value.phase !== 'idle' && phase.value.phase !== 'failed') {
			return;
		}

		const current = ++run;
		installer = null;

		if (update.install.kind === 'none') {
			phase.value = {phase: 'failed', message: CANNOT_SELF_UPDATE};

			return;
		}

		phase.value = {phase: 'downloading', downloaded: 0, total: null};

		try {
			const candidate = makeInstaller(update);

			await candidate.download((downloaded, total) => {
				if (current === run) {
					phase.value = {phase: 'downloading', downloaded, total};
				}
			});

			if (current === run) {
				installer = candidate;
				phase.value = {phase: 'ready'};
			}
		}
		catch (err: unknown) {
			if (current === run) {
				phase.value = {phase: 'failed', message: errorMessage(err)};
			}
		}
	}

	async function restartToUpdate(): Promise<void> {
		if (phase.value.phase !== 'ready' || !installer) {
			return;
		}

		// A clone in progress would be lost with the restart.
		if (!await confirm()) {
			return;
		}

		// A second click (or a reset) while the guard was asking.
		const ready = installer;

		if (phase.value.phase !== 'ready' || !ready) {
			return;
		}

		phase.value = {phase: 'installing'};

		try {
			if (await ready.install() === 'cancelled') {
				phase.value = {phase: 'ready'};
			}
			// 'restarting': the app is about to exit, the phase stays 'installing'.
		}
		catch (err: unknown) {
			phase.value = {phase: 'failed', message: errorMessage(err)};
		}
	}

	function resetUpdate(): void {
		run++;
		installer = null;
		phase.value = {phase: 'idle'};
	}

	return {phase, startUpdate, restartToUpdate, resetUpdate};
}

function makeInstaller(update: IAvailableUpdate): IUpdateInstaller {
	const install = update.install;

	switch (install.kind) {
		case 'plugin':
			return createPluginInstaller(update.version);
		case 'deb':
			return createDebInstaller(install.url, install.signature);
		case 'none':
			throw new Error(CANNOT_SELF_UPDATE);
	}
}

// One flow for the app: the notice and Settings show the same download.
const flow = createUpdateFlow(makeInstaller, confirmLeave);

export function useUpdateInstall() {
	return {
		phase: readonly(flow.phase) as Readonly<Ref<TUpdatePhase>>,
		startUpdate: flow.startUpdate,
		restartToUpdate: flow.restartToUpdate,
		resetUpdate: flow.resetUpdate,
	};
}
