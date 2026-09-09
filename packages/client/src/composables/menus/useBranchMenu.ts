import ContextMenu from '@imengyu/vue3-context-menu';
import {useGit} from '@/composables/useGit';
import {useBranches} from '@/composables/useBranches';
import {useRebase} from '@/composables/useRebase';
import type {IMenuDeps, IRefContextTarget} from '@/composables/useContextMenu';

export function useBranchMenu(deps: IMenuDeps) {
	const
		{deleteTag, pushBranch, pushTag, merge} = useGit(),
		{deleteBranch, deleteRemoteBranch, deleteBranchBoth, branches, currentBranch, switchBranch, setUpstream} = useBranches(),
		{open: openRebase} = useRebase();

	async function mergeRefs(source: string, target: string): Promise<{success: boolean}> {
		if (source === target) return {success: false};
		if (deps.isWorkingTreeDirty()) return {success: false};

		const targetIsCurrent = currentBranch.value?.name === target;

		if (!targetIsCurrent) {
			await switchBranch(target);
		}

		await merge(source);
		await deps.refreshAll();

		return {success: true};
	}

	function contextMenuRefDrop(e: MouseEvent, source: string, target: string) {
		const sameRef = source === target;
		const dirty = deps.isWorkingTreeDirty();
		const isLocalBranch = (name: string): boolean =>
			branches.value.some(b => !b.isRemote && b.name === name);
		const sourceIsCurrent = currentBranch.value?.name === source;

		// Merge checks out `target`, rebase checks out `source` — each must be a
		// local branch. A dirty tree is fine for rebase when no checkout is
		// needed: `--autostash` covers the rebase itself.
		const mergeEnabled = !sameRef && isLocalBranch(target) && !dirty;
		const rebaseEnabled = !sameRef && isLocalBranch(source) && (!dirty || sourceIsCurrent);

		let mergeLabel = `Merge ${source} into ${target}`;
		let rebaseLabel = `Rebase ${source} onto ${target}…`;

		if (sameRef) {
			mergeLabel = 'Cannot merge a ref into itself';
			rebaseLabel = 'Cannot rebase a ref onto itself';
		}
		else {
			if (!isLocalBranch(target)) mergeLabel = 'Merge target must be a local branch';
			else if (dirty) mergeLabel = 'Working tree has uncommitted changes';

			if (!isLocalBranch(source)) rebaseLabel = 'Only a local branch can be rebased';
			else if (!rebaseEnabled) rebaseLabel = 'Working tree has uncommitted changes';
		}

		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			theme: deps.THEME,
			items: [
				{
					label: mergeLabel,
					icon: deps.menuIcon('mdi-source-merge'),
					disabled: !mergeEnabled,
					customClass: 'merge-context-menu-item',
					onClick: mergeEnabled ? async () => {
						await mergeRefs(source, target);
					} : undefined,
				},
				{
					label: rebaseLabel,
					icon: deps.menuIcon('mdi-source-branch-refresh'),
					disabled: !rebaseEnabled,
					onClick: rebaseEnabled ? async () => {
						await openRebase(source, target);
					} : undefined,
				},
			],
		});
	}

	function contextMenuRef(e: MouseEvent, target: IRefContextTarget) {
		const items = [];

		items.push({
			label: 'Copy name',
			icon: deps.menuIcon('mdi-content-copy'),
			onClick: () => navigator.clipboard.writeText(target.name),
		});

		if (target.isTag) {
			if (target.remotes.length === 0) {
				items.push({
					label: 'Push',
					icon: deps.menuIcon('mdi-cloud-upload'),
					onClick: async () => {
						await pushTag(target.name);
						await deps.refreshAll();
					},
				});
			}

			items.push({
				label: 'Delete',
				icon: deps.menuIcon('mdi-trash-can'),
				onClick: async () => {
					await deleteTag(target.name);
					await deps.refreshAll();
				},
			});
		}
		else {
			if (target.isLocal && target.remotes.length === 0) {
				items.push({
					label: 'Push',
					icon: deps.menuIcon('mdi-cloud-upload'),
					onClick: async () => {
						await pushBranch(target.name);
						await deps.refreshAll();
					},
				});
			}

			// A local branch can be pointed at any remote-tracking branch; until it is, the
			// sidebar has no ahead/behind counts to show for it.
			if (target.isLocal) {
				const upstreamCandidates = branches.value
					.filter(b => b.isRemote)
					.map(b => ({
						label: b.name,
						icon: deps.menuIcon('mdi-cloud-outline'),
						onClick: async () => {
							await setUpstream(target.name, b.name);
							await deps.refreshAll();
						},
					}));

				if (upstreamCandidates.length) {
					items.push({
						label: 'Set upstream',
						icon: deps.menuIcon('mdi-source-branch-sync'),
						children: upstreamCandidates,
					});
				}
			}

			const deleteChildren = [];

			if (target.isLocal) {
				deleteChildren.push({
					label: 'Local',
					icon: deps.menuIcon('mdi-laptop'),
					onClick: async () => {
						await deleteBranch(target.name, true);
						await deps.refreshAll();
					},
				});
			}

			if (target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Remote',
					icon: deps.menuIcon('mdi-cloud-outline'),
					onClick: async () => {
						await deleteRemoteBranch(target.name, target.remotes[0]);
						await deps.refreshAll();
					},
				});
			}

			if (target.isLocal && target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Both',
					icon: deps.menuIcon('mdi-trash-can'),
					onClick: async () => {
						await deleteBranchBoth(target.name, target.remotes[0]);
						await deps.refreshAll();
					},
				});
			}

			if (deleteChildren.length === 1) {
				items.push({
					label: 'Delete',
					icon: deps.menuIcon('mdi-trash-can'),
					onClick: deleteChildren[0]!.onClick,
				});
			}
			else if (deleteChildren.length > 1) {
				items.push({
					label: 'Delete',
					icon: deps.menuIcon('mdi-trash-can'),
					children: deleteChildren,
				});
			}
		}

		ContextMenu.showContextMenu({x: e.x, y: e.y, items: deps.withHeader(target.name, items), theme: deps.THEME});
	}

	return {contextMenuRef, contextMenuRefDrop, mergeRefs};
}
