import ContextMenu from '@imengyu/vue3-context-menu';
import {useGit} from '@/composables/useGit';
import {useStash} from '@/composables/useStash';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useCommits} from '@/composables/useCommits';
import {useBranches} from '@/composables/useBranches';
import {useCommitForm} from '@/composables/useCommitForm';
import {useStashMenu} from '@/composables/menus/useStashMenu';
import {EReferenceModalType} from '@/domain';
import type {ICommit} from '@/domain';
import type {IMenuDeps} from '@/composables/useContextMenu';

export function useCommitMenu(deps: IMenuDeps) {
	const
		{callGit, cherryPick, revertCommit} = useGit(),
		{loadStashes} = useStash(),
		{loadStatus} = useWorkingTree(),
		{commits, commitMap, selectedHashes, loadCommits} = useCommits(),
		{loadBranches} = useBranches(),
		{prefill, amendMode} = useCommitForm(),
		{buildStashMenuItems} = useStashMenu();

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
		await deps.refreshAll();
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
			items.push(...buildStashMenuItems(commit, deps));
		}
		else {
			const resetAction = async (flag: string) => {
				await callGit('reset', flag, commit.hash);
				await deps.refreshAll();
			};

			const selected = selectedHashes.value;
			const cherryPickEnabled = !deps.isWorkingTreeDirty()
				&& selected.length > 0
				&& !selected.includes('WORKING_TREE');
			const cherryPickLabel = selected.length > 1
				? `Cherry pick ${selected.length} commits`
				: 'Cherry pick';

			const squashEnabled = selectionSquashable(selected);
			// A revert commits on top of HEAD, so it needs a clean tree — and there is nothing
			// to revert on the working-tree row.
			const revertEnabled = !deps.isWorkingTreeDirty() && commit.hash !== 'WORKING_TREE';
			const squashLabel = `Squash ${selected.length} commits`;

			items.push(
				{
					label: cherryPickLabel,
					icon: deps.menuIcon('mdi-fruit-cherries'),
					disabled: !cherryPickEnabled,
					onClick: cherryPickEnabled
						? async () => {
							try {
								await cherryPickSelected(selected);
							}
							finally {
								await deps.refreshAll();
							}
						}
						: undefined,
				},
				{
					label: squashLabel,
					icon: deps.menuIcon('mdi-arrow-collapse-up'),
					disabled: !squashEnabled,
					onClick: squashEnabled
						? async () => squashSelected(selected)
						: undefined,
				},
				{
					label: 'Revert commit',
					icon: deps.menuIcon('mdi-undo-variant'),
					disabled: revertEnabled ? undefined : true,
					onClick: revertEnabled
						? async () => {
							try {
								await revertCommit(commit.hash);
							}
							finally {
								await deps.refreshAll();
							}
						}
						: undefined,
				},
				{
					label: 'Create tag here',
					icon: deps.menuIcon('mdi-tag-plus'),
					onClick: () => {
						deps.referenceModalType.value = EReferenceModalType.Tag;
						deps.referenceModalMode.value = 'create';
						deps.referenceModalCommitHash.value = commit.hash;
						deps.referenceModalInitialName.value = undefined;
						deps.showReferenceModal.value = true;
					},
				},
				{
					label: 'Create branch here',
					icon: deps.menuIcon('mdi-source-branch-plus'),
					onClick: () => {
						deps.referenceModalType.value = EReferenceModalType.Branch;
						deps.referenceModalMode.value = 'create';
						deps.referenceModalCommitHash.value = commit.hash;
						deps.referenceModalInitialName.value = undefined;
						deps.showReferenceModal.value = true;
					},
				},
				{
					label: 'Reset HEAD to this commit',
					icon: deps.menuIcon('mdi-restore'),
					children: [
						{label: 'Soft', icon: deps.menuIcon('mdi-circle-small'), onClick: async () => resetAction('--soft')},
						{label: 'Mixed', icon: deps.menuIcon('mdi-circle-small'), onClick: async () => resetAction('--mixed')},
						{label: 'Hard', icon: deps.menuIcon('mdi-circle-small'), onClick: async () => resetAction('--hard')},
					],
				},
			);
		}

		ContextMenu.showContextMenu({
			x: e.x,
			y: e.y,
			items: deps.withHeader(commit.subject || commit.hashAbbr, items),
			theme: deps.THEME,
		});
	}

	return {contextMenuCommit};
}
