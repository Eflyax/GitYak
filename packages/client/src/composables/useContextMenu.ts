import {ref, h} from 'vue';
import type {VNode} from 'vue';
import ContextMenu from '@imengyu/vue3-context-menu';
import * as mdiIcons from '@mdi/js';
import {useGit} from '@/composables/useGit';
import {useStash} from '@/composables/useStash';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useCommits} from '@/composables/useCommits';
import {useBranches} from '@/composables/useBranches';
import {useTags} from '@/composables/useTags';
import {EReferenceModalType} from '@/domain';
import type {ICommit} from '@/domain';

const
	THEME = 'win10 dark';

const showReferenceModal = ref(false);
const referenceModalType = ref<EReferenceModalType>(EReferenceModalType.Branch);
const referenceModalMode = ref<'create' | 'rename'>('create');
const referenceModalCommitHash = ref<string | undefined>();
const referenceModalInitialName = ref<string | undefined>();
const referenceModalStashId = ref<string | undefined>();

function menuIcon(mdiName: string): VNode {
	const key = mdiName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
	const path = (mdiIcons as Record<string, string>)[key] ?? '';
	return h('svg', {viewBox: '0 0 24 24', width: 14, height: 14, fill: 'currentColor'}, [
		h('path', {d: path}),
	]);
}

export interface IRefContextTarget {
	name: string;
	isLocal: boolean;
	remotes: string[];
	isTag: boolean;
}

export function useContextMenu() {
	const
		{callGit, deleteTag, pushBranch, pushTag} = useGit(),
		{loadStashes} = useStash(),
		{discardFile, loadStatus} = useWorkingTree(),
		{loadCommits} = useCommits(),
		{loadBranches, deleteBranch, deleteRemoteBranch, deleteBranchBoth} = useBranches(),
		{loadTags, loadRemoteTags} = useTags();

	async function refreshAll(): Promise<void> {
		await Promise.all([loadCommits(), loadStashes(), loadStatus(), loadBranches(), loadTags(), loadRemoteTags()]);
	}

	function contextMenuCommit(argument: {e: MouseEvent; commit: ICommit}) {
		const
			{e, commit} = argument,
			items = [];

		if (commit.isStash) {
			const stashId = commit.references?.[0]?.id ?? commit.hash;

			const stashAction = async (action: string) => {
				await callGit('stash', action, stashId);
				await refreshAll();
			};

			items.push(
				{label: 'Apply stash', icon: menuIcon('mdi-archive-arrow-down'), onClick: async () => stashAction('apply')},
				{label: 'Pop stash', icon: menuIcon('mdi-archive-arrow-up'), onClick: async () => stashAction('pop')},
				{label: 'Delete stash', icon: menuIcon('mdi-trash-can'), onClick: async () => stashAction('drop')},
				{
					label: 'Rename',
					icon: menuIcon('mdi-pencil'),
					onClick: () => {
						referenceModalType.value = EReferenceModalType.Stash;
						referenceModalMode.value = 'rename';
						referenceModalCommitHash.value = commit.hash;
						referenceModalInitialName.value = commit.subject;
						referenceModalStashId.value = stashId;
						showReferenceModal.value = true;
					},
				},
			);
		}
		else {
			const resetAction = async (flag: string) => {
				await callGit('reset', flag, commit.hash);
				await refreshAll();
			};

			items.push(
				{
					label: 'Create tag here',
					icon: menuIcon('mdi-tag-plus'),
					onClick: () => {
						referenceModalType.value = EReferenceModalType.Tag;
						referenceModalMode.value = 'create';
						referenceModalCommitHash.value = commit.hash;
						referenceModalInitialName.value = undefined;
						showReferenceModal.value = true;
					},
				},
				{
					label: 'Create branch here',
					icon: menuIcon('mdi-source-branch-plus'),
					onClick: () => {
						referenceModalType.value = EReferenceModalType.Branch;
						referenceModalMode.value = 'create';
						referenceModalCommitHash.value = commit.hash;
						referenceModalInitialName.value = undefined;
						showReferenceModal.value = true;
					},
				},
				{
					label: 'Reset HEAD to this commit',
					icon: menuIcon('mdi-restore'),
					children: [
						{label: 'Soft', icon: menuIcon('mdi-circle-small'), onClick: async () => resetAction('--soft')},
						{label: 'Mixed', icon: menuIcon('mdi-circle-small'), onClick: async () => resetAction('--mixed')},
						{label: 'Hard', icon: menuIcon('mdi-circle-small'), onClick: async () => resetAction('--hard')},
					],
				},
			);
		}

		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			items,
			theme: THEME
		});
	}

	function contextMenuFile(e: MouseEvent, filePath: string) {
		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			theme: THEME,
			items: [
				{
					label: 'Delete file',
					icon: menuIcon('mdi-trash-can'),
					onClick: async () => {
						await discardFile(filePath);
					},
				},
			],
		});
	}

	function contextMenuRef(e: MouseEvent, target: IRefContextTarget) {
		const items = [];

		items.push({
			label: 'Copy name',
			icon: menuIcon('mdi-content-copy'),
			onClick: () => navigator.clipboard.writeText(target.name),
		});

		if (target.isTag) {
			if (target.remotes.length === 0) {
				items.push({
					label: 'Push',
					icon: menuIcon('mdi-cloud-upload'),
					onClick: async () => {
						await pushTag(target.name);
						await refreshAll();
					},
				});
			}

			items.push({
				label: `Delete ${target.name}`,
				icon: menuIcon('mdi-trash-can'),
				onClick: async () => {
					await deleteTag(target.name);
					await refreshAll();
				},
			});
		}
		else {
			if (target.isLocal && target.remotes.length === 0) {
				items.push({
					label: 'Push',
					icon: menuIcon('mdi-cloud-upload'),
					onClick: async () => {
						await pushBranch(target.name);
						await refreshAll();
					},
				});
			}

			const deleteChildren = [];

			if (target.isLocal) {
				deleteChildren.push({
					label: 'Local',
					icon: menuIcon('mdi-laptop'),
					onClick: async () => {
						await deleteBranch(target.name, true);
						await refreshAll();
					},
				});
			}

			if (target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Remote',
					icon: menuIcon('mdi-cloud-outline'),
					onClick: async () => {
						await deleteRemoteBranch(target.name, target.remotes[0]);
						await refreshAll();
					},
				});
			}

			if (target.isLocal && target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Both',
					icon: menuIcon('mdi-trash-can'),
					onClick: async () => {
						await deleteBranchBoth(target.name, target.remotes[0]);
						await refreshAll();
					},
				});
			}

			if (deleteChildren.length === 1) {
				items.push({
					label: `Delete ${target.name}`,
					icon: menuIcon('mdi-trash-can'),
					onClick: deleteChildren[0]!.onClick,
				});
			}
			else if (deleteChildren.length > 1) {
				items.push({
					label: `Delete ${target.name}`,
					icon: menuIcon('mdi-trash-can'),
					children: deleteChildren,
				});
			}
		}

		ContextMenu.showContextMenu({x: e.x, y: e.y, items, theme: THEME});
	}

	return {
		contextMenuCommit,
		contextMenuFile,
		contextMenuRef,
		showReferenceModal,
		referenceModalType,
		referenceModalMode,
		referenceModalCommitHash,
		referenceModalInitialName,
		referenceModalStashId,
	};
}
