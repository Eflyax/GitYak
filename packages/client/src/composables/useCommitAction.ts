import {ref, readonly} from 'vue';
import type {Ref} from 'vue';
import {useGit} from '@/composables/useGit';
import {useCommitForm} from '@/composables/useCommitForm';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useCommits} from '@/composables/useCommits';
import {GitError} from '@/domain';

const isCommitting = ref(false);
const showHookOutput = ref(false);
const hookOutput = ref('');
const hookOutputSuccess = ref(true);

export interface IUseCommitAction {
	isCommitting: Readonly<Ref<boolean>>;
	showHookOutput: Ref<boolean>;
	hookOutput: Readonly<Ref<string>>;
	hookOutputSuccess: Readonly<Ref<boolean>>;
	runCommit: () => Promise<void>;
}

export const useCommitAction: () => IUseCommitAction = () => {
	const
		{commit} = useGit(),
		{commitSummary, commitDescription, amendMode, noVerify, resetForm} = useCommitForm(),
		{loadStatus} = useWorkingTree(),
		{loadCommits} = useCommits();

	function buildMessage(): string {
		const
			summary = commitSummary.value.trim(),
			description = commitDescription.value.trim();

		return description ? `${summary}\n\n${description}` : summary;
	}

	async function runCommit(): Promise<void> {
		if (isCommitting.value) {
			return;
		}

		isCommitting.value = true;

		try {
			const output = await commit(buildMessage(), {amend: amendMode.value, noVerify: noVerify.value});

			resetForm();
			await Promise.all([loadStatus(), loadCommits()]);

			const trimmed = output.trim();

			// Only surface the dialog when a hook actually printed something; a
			// silent passing hook shouldn't interrupt the user.
			if (trimmed) {
				hookOutput.value = trimmed;
				hookOutputSuccess.value = true;
				showHookOutput.value = true;
			}
		}
		catch (err: unknown) {
			hookOutput.value = err instanceof GitError
				? (err.stderr.trim() || err.message)
				: (err instanceof Error ? err.message : String(err));
			hookOutputSuccess.value = false;
			showHookOutput.value = true;
		}
		finally {
			isCommitting.value = false;
		}
	}

	const instance: IUseCommitAction = {
		isCommitting: readonly(isCommitting),
		showHookOutput,
		hookOutput: readonly(hookOutput),
		hookOutputSuccess: readonly(hookOutputSuccess),
		runCommit,
	};

	return instance;
};
