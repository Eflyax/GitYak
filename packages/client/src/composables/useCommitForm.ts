import {ref} from 'vue';

const commitSummary = ref('');
const commitDescription = ref('');
const amendMode = ref(false);
const noVerify = ref(false);

export interface IUseCommitForm {
	commitSummary: typeof commitSummary;
	commitDescription: typeof commitDescription;
	amendMode: typeof amendMode;
	noVerify: typeof noVerify;
	resetForm: () => void;
	prefill: (subject: string, body: string) => void;
}

export const useCommitForm: () => IUseCommitForm = () => {
	function resetForm(): void {
		commitSummary.value = '';
		commitDescription.value = '';
		amendMode.value = false;
		noVerify.value = false;
	}

	function prefill(subject: string, body: string): void {
		commitSummary.value = subject;
		commitDescription.value = body;
	}

	return {commitSummary, commitDescription, amendMode, noVerify, resetForm, prefill};
};
