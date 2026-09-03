import {ref, h} from 'vue';
import type {Ref, VNode} from 'vue';
import * as mdiIcons from '@mdi/js';
import {useStash} from '@/composables/useStash';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useCommits} from '@/composables/useCommits';
import {useBranches} from '@/composables/useBranches';
import {useTags} from '@/composables/useTags';
import {useBranchMenu} from '@/composables/menus/useBranchMenu';
import {useCommitMenu} from '@/composables/menus/useCommitMenu';
import {useFileMenu} from '@/composables/menus/useFileMenu';
import {EReferenceModalType} from '@/domain';

const
	THEME = 'win10 dark';

const showReferenceModal = ref(false);
const referenceModalType = ref<EReferenceModalType>(EReferenceModalType.Branch);
const referenceModalMode = ref<'create' | 'rename'>('create');
const referenceModalCommitHash = ref<string | undefined>();
const referenceModalInitialName = ref<string | undefined>();
const referenceModalStashId = ref<string | undefined>();

const showDeleteStashConfirm = ref(false);
const deleteStashId = ref<string | undefined>();
const deleteStashSubject = ref<string>('');

function menuIcon(mdiName: string): VNode {
	const key = mdiName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
	const path = (mdiIcons as Record<string, string>)[key] ?? '';
	return h('svg', {viewBox: '0 0 24 24', width: 14, height: 14, fill: 'currentColor'}, [
		h('path', {d: path}),
	]);
}

export type TMenuItem = {label?: string; divided?: boolean; [key: string]: unknown};

// A non-interactive title row naming the source (branch / tag / commit) the
// menu acts on. Styled via `.ctx-menu-header` in global.scss.
function headerItem(label: string): TMenuItem {
	return {label, customClass: 'ctx-menu-header', disabled: true};
}

// Prepends a header row and draws a divider between it and the first action.
function withHeader(label: string, items: Array<TMenuItem>): Array<TMenuItem> {
	if (items[0]) items[0].divided = true;

	return [headerItem(label), ...items];
}

export interface IRefContextTarget {
	name: string;
	isLocal: boolean;
	remotes: string[];
	isTag: boolean;
}

// Helpers and singleton state shared by more than one menu domain. Passed
// into the per-domain menu composables rather than duplicated into them.
export interface IMenuDeps {
	menuIcon: (mdiName: string) => VNode;
	withHeader: (label: string, items: Array<TMenuItem>) => Array<TMenuItem>;
	THEME: string;
	refreshAll: () => Promise<void>;
	isWorkingTreeDirty: () => boolean;
	showReferenceModal: Ref<boolean>;
	referenceModalType: Ref<EReferenceModalType>;
	referenceModalMode: Ref<'create' | 'rename'>;
	referenceModalCommitHash: Ref<string | undefined>;
	referenceModalInitialName: Ref<string | undefined>;
	referenceModalStashId: Ref<string | undefined>;
	showDeleteStashConfirm: Ref<boolean>;
	deleteStashId: Ref<string | undefined>;
	deleteStashSubject: Ref<string>;
}

export function useContextMenu() {
	const
		{loadStashes} = useStash(),
		{loadStatus, status} = useWorkingTree(),
		{loadCommits} = useCommits(),
		{loadBranches} = useBranches(),
		{loadTags, loadRemoteTags} = useTags();

	async function refreshAll(): Promise<void> {
		await Promise.all([loadCommits(), loadStashes(), loadStatus(), loadBranches(), loadTags(), loadRemoteTags()]);
	}

	function isWorkingTreeDirty(): boolean {
		return status.value.unstaged.length > 0 || status.value.staged.length > 0;
	}

	const deps: IMenuDeps = {
		menuIcon,
		withHeader,
		THEME,
		refreshAll,
		isWorkingTreeDirty,
		showReferenceModal,
		referenceModalType,
		referenceModalMode,
		referenceModalCommitHash,
		referenceModalInitialName,
		referenceModalStashId,
		showDeleteStashConfirm,
		deleteStashId,
		deleteStashSubject,
	};

	const {contextMenuRef, contextMenuRefDrop, mergeRefs} = useBranchMenu(deps);
	const {contextMenuCommit} = useCommitMenu(deps);
	const {contextMenuFile} = useFileMenu(deps);

	return {
		contextMenuCommit,
		contextMenuFile,
		contextMenuRef,
		contextMenuRefDrop,
		mergeRefs,
		refreshAll,
		showReferenceModal,
		referenceModalType,
		referenceModalMode,
		referenceModalCommitHash,
		referenceModalInitialName,
		referenceModalStashId,
		showDeleteStashConfirm,
		deleteStashId,
		deleteStashSubject,
	};
}
