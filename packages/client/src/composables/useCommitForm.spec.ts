import {describe, it, expect, beforeEach, vi} from 'vitest';
import {nextTick, ref} from 'vue';
import type {IProject} from '@/domain';

const store = new Map<string, string>();

vi.stubGlobal('localStorage', {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => store.set(key, value),
});

store.set('git-yak:commitTemplate', '[IMP] ');

const currentProject = ref<Partial<IProject> | null>(null);

vi.mock('./useProject', () => ({
	useProject: () => ({currentProject}),
}));

const {useCommitForm} = await import('./useCommitForm');
const {useTemplates} = await import('./useTemplates');

describe('useCommitForm with a commit template', () => {
	const form = useCommitForm();
	const {globalCommitTemplate: commitTemplate} = useTemplates();

	beforeEach(async () => {
		currentProject.value = null;
		commitTemplate.value = '[IMP] ';
		await nextTick();
		form.resetForm();
	});

	it('starts the summary with the template', () => {
		expect(form.commitSummary.value).toBe('[IMP] ');
	});

	it('treats a summary holding only the template as empty', () => {
		expect(form.isSummaryEmpty.value).toBe(true);
		form.commitSummary.value = '[IMP] fix login';
		expect(form.isSummaryEmpty.value).toBe(false);
	});

	it('allows amending a commit whose subject equals the template', () => {
		form.amendMode.value = true;
		form.prefill('[IMP]', '');
		expect(form.isSummaryEmpty.value).toBe(false);
	});

	it('restores the template after a commit resets the form', () => {
		form.commitSummary.value = '[IMP] fix login';
		form.commitDescription.value = 'details';
		form.resetForm();
		expect(form.commitSummary.value).toBe('[IMP] ');
		expect(form.commitDescription.value).toBe('');
	});

	it('follows a template change while the summary is untouched', async () => {
		commitTemplate.value = '[FIX] ';
		await nextTick();
		expect(form.commitSummary.value).toBe('[FIX] ');
	});

	it('keeps a typed summary when the template changes', async () => {
		form.commitSummary.value = '[IMP] fix login';
		commitTemplate.value = '[FIX] ';
		await nextTick();
		expect(form.commitSummary.value).toBe('[IMP] fix login');
	});

	it('persists the template', async () => {
		commitTemplate.value = '[ADD] ';
		await nextTick();
		expect(store.get('git-yak:commitTemplate')).toBe('[ADD] ');
	});

	it('uses the project template over the global one', async () => {
		currentProject.value = {commitTemplate: '[ODOO] '};
		await nextTick();
		expect(form.commitSummary.value).toBe('[ODOO] ');
		expect(form.isSummaryEmpty.value).toBe(true);

		currentProject.value = {commitTemplate: ''};
		await nextTick();
		expect(form.commitSummary.value).toBe('[IMP] ');
	});
});
