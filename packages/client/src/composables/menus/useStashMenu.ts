import {useGit} from '@/composables/useGit';
import {EReferenceModalType} from '@/domain';
import type {ICommit} from '@/domain';
import type {IMenuDeps, TMenuItem} from '@/composables/useContextMenu';

export function useStashMenu() {
	const {callGit} = useGit();

	function buildStashMenuItems(commit: ICommit, deps: IMenuDeps): Array<TMenuItem> {
		const stashId = commit.references?.[0]?.id ?? commit.hash;
		const items: Array<TMenuItem> = [];

		const stashAction = async (action: string) => {
			try {
				await callGit('stash', action, stashId);
			}
			catch {
				// Conflict / error — keep going, the working tree state will
				// surface in the staging panel after refresh.
			}
			finally {
				await deps.refreshAll();
			}
		};

		items.push(
			{label: 'Apply stash', icon: deps.menuIcon('mdi-archive-arrow-down'), onClick: async () => stashAction('apply')},
			{label: 'Pop stash', icon: deps.menuIcon('mdi-archive-arrow-up'), onClick: async () => stashAction('pop')},
			{
				label: 'Delete stash',
				icon: deps.menuIcon('mdi-trash-can'),
				onClick: () => {
					deps.deleteStashId.value = stashId;
					deps.deleteStashSubject.value = commit.subject;
					deps.showDeleteStashConfirm.value = true;
				},
			},
			{
				label: 'Rename',
				icon: deps.menuIcon('mdi-pencil'),
				onClick: () => {
					deps.referenceModalType.value = EReferenceModalType.Stash;
					deps.referenceModalMode.value = 'rename';
					deps.referenceModalCommitHash.value = commit.hash;
					deps.referenceModalInitialName.value = commit.subject;
					deps.referenceModalStashId.value = stashId;
					deps.showReferenceModal.value = true;
				},
			},
		);

		return items;
	}

	return {buildStashMenuItems};
}
