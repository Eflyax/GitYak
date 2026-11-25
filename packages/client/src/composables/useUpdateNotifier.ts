import {h} from 'vue';
import {NButton, useNotification} from 'naive-ui';
import {APP_VERSION, useUpdateCheck} from './useUpdateCheck';
import type {IAvailableUpdate} from '@/domain/services/updates';
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
		{autoCheck, checkForUpdates, skipVersion} = useUpdateCheck();

	function notify(update: IAvailableUpdate): void {
		const notice = notification.create({
			title: `GitYak ${update.version} is available`,
			description: `You are using ${APP_VERSION}.`,
			content: () => h('div', {class: 'gy-notify gy-notify--info gy-update-notice', 'test-id': 'update-notice'}, [
				update.notes ? h('pre', {class: 'gy-update-notice__notes'}, notesPreview(update.notes)) : null,
			]),
			duration: 0,
			action: () => h('div', {class: 'gy-update-notice__actions'}, [
				h(NButton, {
					size: 'small',
					quaternary: true,
					title: 'Do not remind me of this version',
					'test-id': 'update-skip-btn',
					onClick: () => {
						skipVersion(update.version);
						notice.destroy();
					},
				}, () => 'Skip'),
				h(NButton, {
					size: 'small',
					secondary: true,
					'test-id': 'update-notes-btn',
					onClick: () => openExternal(update.releaseNotesUrl),
				}, () => 'Release notes'),
				h(NButton, {
					size: 'small',
					type: 'primary',
					'test-id': 'update-download-btn',
					onClick: () => {
						openExternal(update.downloadUrl);
						notice.destroy();
					},
				}, () => 'Download'),
			]),
		});
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
