import {ref, readonly} from 'vue';
import type {IBranch} from '@/domain';
import {BRANCH_REF_FORMAT, parseBranchRefs} from '@/domain/services/branchRefs';
import {singleFlight} from '@/domain/services/singleFlight';
import {useGit} from './useGit';

const branches = ref<IBranch[]>([]);
const currentBranch = ref<IBranch | null>(null);

// The ref list the branches were last parsed from; an identical reload is skipped.
let lastOutput: string | null = null;
// Shared by every caller, so loads requested from several components never run side by side.
let loadBranchesOnce: (() => Promise<void>) | null = null;

export function useBranches() {
	const {
		callGit,
		checkout,
		checkoutNewBranch,
		deleteBranch: gitDeleteBranch,
		deleteRemoteBranch: gitDeleteRemoteBranch,
		renameBranch: gitRenameBranch,
		pushBranch: gitPushBranch,
		setUpstream: gitSetUpstream,
	} = useGit();

	async function doLoadBranches(): Promise<void> {
		const output = await callGit(
			'for-each-ref',
			`--format=${BRANCH_REF_FORMAT}`,
			'refs/heads',
			'refs/remotes',
		);

		if (output === lastOutput) {
			return;
		}

		lastOutput = output;

		const result = parseBranchRefs(output);

		branches.value = result.branches;
		currentBranch.value = result.current;
	}

	loadBranchesOnce ??= singleFlight(doLoadBranches);

	const loadBranches = loadBranchesOnce;

	/** Points a local branch at a remote-tracking branch, so it gains ahead/behind counts. */
	async function setUpstream(branchName: string, upstream: string): Promise<void> {
		await gitSetUpstream(branchName, upstream);
		await loadBranches();
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
		setUpstream,
	};
}
