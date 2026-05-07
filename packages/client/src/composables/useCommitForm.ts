import {ref} from 'vue';

const commitSummary = ref('');
const commitDescription = ref('');

export interface IUseCommitForm {
    commitSummary: typeof commitSummary;
    commitDescription: typeof commitDescription;
    resetForm: () => void;
}

export const useCommitForm: () => IUseCommitForm = () => {
    function resetForm(): void {
        commitSummary.value = '';
        commitDescription.value = '';
    }

    return {commitSummary, commitDescription, resetForm};
};
