import {computed, ref, watch} from 'vue';
import type {ComputedRef, Ref} from 'vue';
import {useProject} from '@/composables/useProject';
import {normalizeTemplates, resolveBranchTemplates, resolveCommitTemplate} from '@/domain/services/templates';

const
	COMMIT_TEMPLATE_KEY = 'git-yak:commitTemplate',
	BRANCH_TEMPLATES_KEY = 'git-yak:branchTemplates';

function readCommitTemplate(): string {
	try {
		return localStorage.getItem(COMMIT_TEMPLATE_KEY) ?? '';
	}
	catch {
		return '';
	}
}

function readBranchTemplates(): Array<string> {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(BRANCH_TEMPLATES_KEY) ?? '[]');

		return Array.isArray(parsed) ? normalizeTemplates(parsed.filter(t => typeof t === 'string')) : [];
	}
	catch {
		return [];
	}
}

function write(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	}
	catch {
		console.error('localStorage is not available');
	}
}

const
	globalCommitTemplate = ref(readCommitTemplate()),
	globalBranchTemplates = ref(readBranchTemplates());

watch(globalCommitTemplate, value => write(COMMIT_TEMPLATE_KEY, value));
watch(globalBranchTemplates, value => write(BRANCH_TEMPLATES_KEY, JSON.stringify(value)), {deep: true});

export interface IUseTemplates {
	/** Global text a new commit summary starts with (e.g. "[IMP] "); empty means none. */
	globalCommitTemplate: Ref<string>;
	/** Global branch name prefixes offered when naming a branch (e.g. "feature/"). */
	globalBranchTemplates: Ref<Array<string>>;
	/** Commit template of the open project, or the global one when the project sets none. */
	commitTemplate: ComputedRef<string>;
	/** Branch templates of the open project followed by the global ones. */
	branchTemplates: ComputedRef<Array<string>>;
}

export const useTemplates: () => IUseTemplates = () => {
	const {currentProject} = useProject();

	return {
		globalCommitTemplate,
		globalBranchTemplates,
		commitTemplate: computed(() => resolveCommitTemplate(currentProject.value?.commitTemplate, globalCommitTemplate.value)),
		branchTemplates: computed(() => resolveBranchTemplates(currentProject.value?.branchTemplates, globalBranchTemplates.value)),
	};
};
