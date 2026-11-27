import {h} from 'vue';
import {NButton, NProgress, useNotification} from 'naive-ui';
import {APP_VERSION, useUpdateCheck} from './useUpdateCheck';
import type {IAvailableUpdate} from '@/domain/services/updates';
import {useUpdateInstall} from './useUpdateInstall';
import {formatProgress} from '@/domain/services/updateProgress';
import {openExternal} from '@/infrastructure/openExternal';

/** Lines of release notes shown in the notice; the rest is on the changelog page. */
const NOTES_PREVIEW_LINES = 6;

function notesPreview(notes: string): string {
	const lines = notes.trim().split('\n');

	return lines.length > NOTES_PREVIEW_LINES
		? [...lines.slice(0, NOTES_PREVIEW_LINES), '…'].join('\n')
		: lines.join('\n');
}

/**
 * Tells the user about a new release with a notice that stays until dismissed. Must be called
 * from a component inside NNotificationProvider (AppLayout).
 */
export function useUpdateNotifier() {
	const
		notification = useNotification(),
		{autoCheck, checkForUpdates, skipVersion} = useUpdateCheck(),
		{phase, startUpdate, restartToUpdate} = useUpdateInstall();

	function notify(update: IAvailableUpdate): void {
		const notice = notification.create({
			title: `GitYak ${update.version} is available`,
			description: `You are using ${APP_VERSION}.`,
			// Both render functions read `phase`, so the notice follows the flow live. Closing it
			// neither resets the flow nor stops a download; Settings shows the same state.
			content: () => h('div', {class: 'gy-notify gy-notify--info gy-update-notice', 'test-id': 'update-notice'}, [
				phase.value.phase === 'idle' && update.notes
					? h('pre', {class: 'gy-update-notice__notes'}, notesPreview(update.notes))
					: null,
				...statusNodes(),
			]),
			duration: 0,
			action: () => h('div', {class: 'gy-update-notice__actions'}, actionNodes(update, () => notice.destroy())),
		});
	}

	function statusNodes() {
		const state = phase.value;

		switch (state.phase) {
			case 'downloading':
				return [
					h(NProgress, {
						type: 'line',
						percentage: state.total ? Math.min(100, Math.round(state.downloaded / state.total * 100)) : 0,
						processing: state.total === null,
						showIndicator: false,
						'test-id': 'update-progress',
					}),
					h('div', {class: 'gy-update-notice__status', 'test-id': 'update-progress-text'}, formatProgress(state.downloaded, state.total)),
				];
			case 'ready':
				return [h('div', {class: 'gy-update-notice__status'}, 'Downloaded. Restart to finish updating.')];
			case 'installing':
				return [h('div', {class: 'gy-update-notice__status'}, 'Installing…')];
			case 'failed':
				return [h('div', {class: 'gy-update-notice__status gy-update-notice__status--error', 'test-id': 'update-error'}, state.message)];
			default:
				return [];
		}
	}

	function downloadButton(update: IAvailableUpdate, close: () => void) {
		return h(NButton, {
			size: 'small',
			type: update.install.kind === 'none' ? 'primary' : 'default',
			'test-id': 'update-download-btn',
			onClick: () => {
				openExternal(update.downloadUrl);
				close();
			},
		}, () => 'Download');
	}

	function actionNodes(update: IAvailableUpdate, close: () => void) {
		const
			state = phase.value,
			notesButton = h(NButton, {
				size: 'small',
				secondary: true,
				'test-id': 'update-notes-btn',
				onClick: () => openExternal(update.releaseNotesUrl),
			}, () => 'Release notes'),
			skipButton = h(NButton, {
				size: 'small',
				quaternary: true,
				title: 'Do not remind me of this version',
				'test-id': 'update-skip-btn',
				onClick: () => {
					skipVersion(update.version);
					close();
				},
			}, () => 'Skip');

		if (update.install.kind === 'none') {
			return [skipButton, notesButton, downloadButton(update, close)];
		}

		switch (state.phase) {
			case 'idle':
				return [skipButton, notesButton, h(NButton, {
					size: 'small',
					type: 'primary',
					'test-id': 'update-install-btn',
					onClick: () => startUpdate(update),
				}, () => 'Update')];
			case 'downloading':
				return [notesButton];
			case 'ready':
				return [notesButton, h(NButton, {
					size: 'small',
					type: 'primary',
					'test-id': 'update-restart-btn',
					onClick: () => restartToUpdate(),
				}, () => 'Restart to update')];
			case 'installing':
				return [h(NButton, {size: 'small', type: 'primary', disabled: true, 'test-id': 'update-installing-btn'}, () => 'Installing…')];
			case 'failed':
				return [
					notesButton,
					downloadButton(update, close),
					h(NButton, {
						size: 'small',
						type: 'primary',
						'test-id': 'update-retry-btn',
						onClick: () => startUpdate(update),
					}, () => 'Retry'),
				];
		}
	}

	/** The startup check: silent unless there is something to install. */
	async function checkOnStartup(): Promise<void> {
		if (!autoCheck.value) {
			return;
		}

		const update = await checkForUpdates();

		if (update) {
			notify(update);
		}
	}

	return {checkOnStartup, notify};
}
