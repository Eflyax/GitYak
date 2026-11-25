import {computed, ref, watch} from 'vue';
import type {ComputedRef} from 'vue';
import {useTemplates} from '@/composables/useTemplates';

const {commitTemplate} = useTemplates();

const commitSummary = ref(commitTemplate.value);
const commitDescription = ref('');
const amendMode = ref(false);
const noVerify = ref(false);

// A summary holding nothing but the template is not a message the user wrote.
const isSummaryEmpty = computed(() => {
	const summary = commitSummary.value.trim();

	return !summary || (!amendMode.value && summary === commitTemplate.value.trim());
});

// A template edited in Settings, or one that changes with the open project, replaces a summary
// the user has not started typing yet.
watch(commitTemplate, (template, previous) => {
	if (!amendMode.value && (commitSummary.value === '' || commitSummary.value === previous)) {
		commitSummary.value = template;
	}
});

export interface IUseCommitForm {
	commitSummary: typeof commitSummary;
	commitDescription: typeof commitDescription;
	amendMode: typeof amendMode;
	noVerify: typeof noVerify;
	/** True when the summary is blank or still only the commit template. */
	isSummaryEmpty: ComputedRef<boolean>;
	resetForm: () => void;
	prefill: (subject: string, body: string) => void;
	/** Empties the form for a new commit, starting the summary with the commit template. */
	clearMessage: () => void;
}

export const useCommitForm: () => IUseCommitForm = () => {
	function clearMessage(): void {
		commitSummary.value = commitTemplate.value;
		commitDescription.value = '';
	}

	function resetForm(): void {
		clearMessage();
		amendMode.value = false;
		noVerify.value = false;
	}

	function prefill(subject: string, body: string): void {
		commitSummary.value = subject;
		commitDescription.value = body;
	}

	return {commitSummary, commitDescription, amendMode, noVerify, isSummaryEmpty, resetForm, prefill, clearMessage};
};
