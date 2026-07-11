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
import {useCommitForm} from '@/composables/useCommitForm';
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

type TMenuItem = {label?: string; divided?: boolean; [key: string]: unknown};

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

export function useContextMenu() {
	const
		{callGit, cherryPick, deleteTag, pushBranch, pushTag, merge} = useGit(),
		{loadStashes} = useStash(),
		{discardFile, loadStatus, status} = useWorkingTree(),
		{commits, commitMap, selectedHashes, loadCommits} = useCommits(),
		{loadBranches, deleteBranch, deleteRemoteBranch, deleteBranchBoth, currentBranch, switchBranch} = useBranches(),
		{loadTags, loadRemoteTags} = useTags(),
		{prefill, amendMode} = useCommitForm();

	async function refreshAll(): Promise<void> {
		await Promise.all([loadCommits(), loadStashes(), loadStatus(), loadBranches(), loadTags(), loadRemoteTags()]);
	}

	function isWorkingTreeDirty(): boolean {
		return status.value.unstaged.length > 0 || status.value.staged.length > 0;
	}

	function firstParentChainFromHead(maxCount: number): Array<string> {
		const wt = commits.value.find(c => c.hash === 'WORKING_TREE');
		let headHash = (wt?.parents as Array<string> | undefined)?.[0];

		if (!headHash) {
			const firstReal = commits.value.find(c => c.hash !== 'WORKING_TREE' && !c.isStash);
			headHash = firstReal?.hash;
		}

		if (!headHash) return [];

		const chain: Array<string> = [];
		let cur: string | undefined = headHash;

		while (cur && chain.length < maxCount) {
			chain.push(cur);
			const c = commitMap.value.get(cur);
			cur = (c?.parents as Array<string> | undefined)?.[0];
		}

		return chain;
	}

	function selectionSquashable(selected: ReadonlyArray<string>): boolean {
		if (selected.length < 2) return false;

		const filtered = selected.filter(h => h !== 'WORKING_TREE');

		if (filtered.length !== selected.length) return false;
		if (filtered.some(h => commitMap.value.get(h)?.isStash)) return false;

		const chain = firstParentChainFromHead(filtered.length);

		if (chain.length !== filtered.length) return false;

		const chainSet = new Set(chain);

		return filtered.every(h => chainSet.has(h));
	}

	async function cherryPickSelected(selected: ReadonlyArray<string>): Promise<void> {
		const chainOrder = new Map<string, number>();
		commits.value.forEach((c, i) => chainOrder.set(c.hash, i));

		const ordered = [...selected].sort(
			(a, b) => (chainOrder.get(b) ?? 0) - (chainOrder.get(a) ?? 0),
		);

		await cherryPick(ordered);
		await refreshAll();
	}

	async function squashSelected(selected: ReadonlyArray<string>): Promise<void> {
		const filtered = selected.filter(h => h !== 'WORKING_TREE');
		const chain = firstParentChainFromHead(filtered.length);
		const oldestSelected = chain[chain.length - 1];

		if (!oldestSelected) return;

		const oldestCommit = commitMap.value.get(oldestSelected);
		const parentHash = (oldestCommit?.parents as Array<string> | undefined)?.[0];

		if (!parentHash) return;

		const orderedHeadFirst = chain;
		const subjects: Array<string> = [];
		const bodies: Array<string> = [];

		for (const hash of orderedHeadFirst) {
			const c = commitMap.value.get(hash);

			if (c) {
				if (c.subject) subjects.push(c.subject);
				if (c.body) bodies.push(c.body);
			}
		}

		await callGit('reset', '--soft', parentHash);

		const summary = subjects[0] ?? 'Squashed commit';
		const restSubjects = subjects.slice(1);
		const description = [...restSubjects, ...bodies].filter(Boolean).join('\n\n');

		amendMode.value = false;
		prefill(summary, description);

		await Promise.all([loadStatus(), loadCommits(), loadStashes(), loadBranches()]);
	}

	function contextMenuCommit(argument: {e: MouseEvent; commit: ICommit}) {
		const
			{e, commit} = argument,
			items = [];

		if (commit.isStash) {
			const stashId = commit.references?.[0]?.id ?? commit.hash;

			const stashAction = async (action: string) => {
				try {
					await callGit('stash', action, stashId);
				}
				catch {
					// Conflict / error — keep going, the working tree state will
					// surface in the staging panel after refresh.
				}
				finally {
					await refreshAll();
				}
			};

			items.push(
				{label: 'Apply stash', icon: menuIcon('mdi-archive-arrow-down'), onClick: async () => stashAction('apply')},
				{label: 'Pop stash', icon: menuIcon('mdi-archive-arrow-up'), onClick: async () => stashAction('pop')},
				{
					label: 'Delete stash',
					icon: menuIcon('mdi-trash-can'),
					onClick: () => {
						deleteStashId.value = stashId;
						deleteStashSubject.value = commit.subject;
						showDeleteStashConfirm.value = true;
					},
				},
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

			const selected = selectedHashes.value;
			const cherryPickEnabled = !isWorkingTreeDirty()
				&& selected.length > 0
				&& !selected.includes('WORKING_TREE');
			const cherryPickLabel = selected.length > 1
				? `Cherry pick ${selected.length} commits`
				: 'Cherry pick';

			const squashEnabled = selectionSquashable(selected);
			const squashLabel = `Squash ${selected.length} commits`;

			items.push(
				{
					label: cherryPickLabel,
					icon: menuIcon('mdi-fruit-cherries'),
					disabled: !cherryPickEnabled,
					onClick: cherryPickEnabled
						? async () => {
							try {
								await cherryPickSelected(selected);
							}
							finally {
								await refreshAll();
							}
						}
						: undefined,
				},
				{
					label: squashLabel,
					icon: menuIcon('mdi-arrow-collapse-up'),
					disabled: !squashEnabled,
					onClick: squashEnabled
						? async () => squashSelected(selected)
						: undefined,
				},
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
			items: withHeader(commit.subject || commit.hashAbbr, items),
			theme: THEME
		});
	}

	async function mergeRefs(source: string, target: string): Promise<{success: boolean}> {
		if (source === target) return {success: false};
		if (isWorkingTreeDirty()) return {success: false};

		const targetIsCurrent = currentBranch.value?.name === target;

		if (!targetIsCurrent) {
			await switchBranch(target);
		}

		await merge(source);
		await refreshAll();

		return {success: true};
	}

	function contextMenuRefDrop(e: MouseEvent, source: string, target: string) {
		const sameRef = source === target;
		const dirty = isWorkingTreeDirty();

		const mergeEnabled = !sameRef && !dirty;
		let label = `Merge ${source} into ${target}`;

		if (sameRef) label = 'Cannot merge a ref into itself';
		else if (dirty) label = 'Working tree has uncommitted changes';

		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			theme: THEME,
			items: [
				{
					label,
					icon: menuIcon('mdi-source-merge'),
					disabled: !mergeEnabled,
					customClass: 'merge-context-menu-item',
					onClick: mergeEnabled ? async () => {
						await mergeRefs(source, target);
					} : undefined,
				},
			],
		});
	}


	function contextMenuFile(e: MouseEvent, filePath: string) {
		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			theme: THEME,
			items: withHeader(filePath.split('/').pop() ?? filePath, [
				{
					label: 'Delete file',
					icon: menuIcon('mdi-trash-can'),
					onClick: async () => {
						await discardFile(filePath);
					},
				},
			]),
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

		ContextMenu.showContextMenu({x: e.x, y: e.y, items: withHeader(target.name, items), theme: THEME});
	}

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
