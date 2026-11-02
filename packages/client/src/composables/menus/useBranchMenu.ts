import ContextMenu from '@imengyu/vue3-context-menu';
import {useGit} from '@/composables/useGit';
import {useBranches} from '@/composables/useBranches';
import {useRebase} from '@/composables/useRebase';
import {useNotify} from '@/composables/useNotify';
import type {IMenuDeps, IRefContextTarget} from '@/composables/useContextMenu';

export function useBranchMenu(deps: IMenuDeps) {
	const
		{deleteTag, pushBranch, pushTag, merge} = useGit(),
		{deleteBranch, deleteRemoteBranch, deleteBranchBoth, branches, currentBranch, switchBranch, setUpstream} = useBranches(),
		{open: openRebase} = useRebase(),
		notify = useNotify();

	// A context-menu action has no button to show a spinner on, and the menu swallows a
	// rejected handler silently — so every action reports its outcome itself, success or failure.
	async function runAction(successMessage: string, action: () => Promise<void>): Promise<void> {
		try {
			await action();
			notify.success(successMessage);
		}
		catch (err: unknown) {
			notify.error(err instanceof Error ? err.message : String(err));
		}

		// Refreshed after a failure too: an action can fail halfway (Delete → Both removes the
		// local branch before the remote one), and the sidebar must show what actually changed.
		await deps.refreshAll();
	}

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
					onClick: () => runAction(`Tag ${target.name} pushed`, () => pushTag(target.name)),
				});
			}

			items.push({
				label: 'Delete',
				icon: deps.menuIcon('mdi-trash-can'),
				onClick: () => runAction(`Tag ${target.name} deleted`, () => deleteTag(target.name)),
			});
		}
		else {
			if (target.isLocal && target.remotes.length === 0) {
				items.push({
					label: 'Push',
					icon: deps.menuIcon('mdi-cloud-upload'),
					onClick: () => runAction(`Branch ${target.name} pushed`, () => pushBranch(target.name)),
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
						onClick: () => runAction(
							`Upstream of ${target.name} set to ${b.name}`,
							() => setUpstream(target.name, b.name),
						),
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
					onClick: () => runAction(
						`Branch ${target.name} deleted`,
						() => deleteBranch(target.name, true),
					),
				});
			}

			if (target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Remote',
					icon: deps.menuIcon('mdi-cloud-outline'),
					onClick: () => runAction(
						`Remote branch ${target.name} deleted`,
						() => deleteRemoteBranch(target.name, target.remotes[0]),
					),
				});
			}

			if (target.isLocal && target.remotes.length > 0) {
				deleteChildren.push({
					label: 'Both',
					icon: deps.menuIcon('mdi-trash-can'),
					onClick: () => runAction(
						`Branch ${target.name} deleted locally and on the remote`,
						() => deleteBranchBoth(target.name, target.remotes[0]),
					),
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
