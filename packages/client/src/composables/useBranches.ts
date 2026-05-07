import {ref, readonly} from 'vue';
import type {IBranch} from '@/domain';
import {useGit} from './useGit';

const branches = ref<IBranch[]>([]);
const currentBranch = ref<IBranch | null>(null);

function parseBranches(output: string): {branches: IBranch[]; current: IBranch | null} {
	const lines = output.trim().split('\n').filter(Boolean);
	const parsed: IBranch[] = [];
	let current: IBranch | null = null;

	for (const line of lines) {
		const isCurrent = line.startsWith('* ');
		const cleaned = line.replace(/^[* ] /, '');
		const parts = cleaned.split(/\s+/);
		const name = parts[0] ?? '';
		const hash = parts[1] ?? '';
		const isRemote = name.startsWith('remotes/');
		const normalizedName = isRemote ? name.replace(/^remotes\//, '') : name;

		if (normalizedName === 'HEAD' || normalizedName.endsWith('/HEAD')) continue;

		const branch: IBranch = {
			name: normalizedName,
			hash,
			isRemote,
			isCurrent: isCurrent && !isRemote,
		};

		parsed.push(branch);

		if (isCurrent) {
			current = branch;
		}
	}

	return {branches: parsed, current};
}

export function useBranches() {
	const {
		callGit,
		checkout,
		checkoutNewBranch,
		deleteBranch: gitDeleteBranch,
		deleteRemoteBranch: gitDeleteRemoteBranch,
	 	renameBranch: gitRenameBranch,
		pushBranch: gitPushBranch
	} = useGit();

	async function loadBranches(): Promise<void> {
		const output = await callGit(
			'branch',
			'--all',
			'-v',
			'--no-abbrev',
		);

		const result = parseBranches(output);

		branches.value = result.branches;
		currentBranch.value = result.current;
	}

	async function switchBranch(name: string): Promise<void> {
		await checkout(name);
		await loadBranches();
	}

	async function createBranch(name: string, from?: string): Promise<void> {
		await checkoutNewBranch(name, from);
		await loadBranches();
	}

	async function deleteBranch(name: string, force = false): Promise<void> {
		await gitDeleteBranch(name, force);
		await loadBranches();
	}

	async function deleteRemoteBranch(name: string, remote?: string): Promise<void> {
		await gitDeleteRemoteBranch(name, remote);
		await loadBranches();
	}

	async function deleteBranchBoth(name: string, remote?: string): Promise<void> {
		await gitDeleteBranch(name, true);
		await gitDeleteRemoteBranch(name, remote);
		await loadBranches();
	}

	async function renameBranch(oldName: string, newName: string): Promise<void> {
		await gitRenameBranch(oldName, newName);
		await loadBranches();
	}

	async function pushCurrentBranch(remote?: string): Promise<void> {
		const name = currentBranch.value?.name;

		if (!name) return;

		await gitPushBranch(name, remote);
	}

	return {
		branches: readonly(branches),
		currentBranch: readonly(currentBranch),
		loadBranches,
		switchBranch,
		createBranch,
		deleteBranch,
		deleteRemoteBranch,
		deleteBranchBoth,
		renameBranch,
		pushCurrentBranch,
	};
}
