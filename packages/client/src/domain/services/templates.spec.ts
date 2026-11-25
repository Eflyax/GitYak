import {describe, it, expect} from 'vitest';
import {applyBranchTemplate, normalizeTemplates, resolveBranchTemplates, resolveCommitTemplate} from './templates';

describe('normalizeTemplates', () => {
	it('trims, drops blanks and duplicates', () => {
		expect(normalizeTemplates([' feature/ ', '', 'bugfix/', 'feature/'])).toEqual(['feature/', 'bugfix/']);
	});
});

describe('resolveCommitTemplate', () => {
	it('prefers the project template', () => {
		expect(resolveCommitTemplate('[FIX] ', '[IMP] ')).toBe('[FIX] ');
	});

	it('falls back to the global template', () => {
		expect(resolveCommitTemplate(undefined, '[IMP] ')).toBe('[IMP] ');
		expect(resolveCommitTemplate('', '[IMP] ')).toBe('[IMP] ');
	});
});

describe('resolveBranchTemplates', () => {
	it('lists project templates first without repeating global ones', () => {
		expect(resolveBranchTemplates(['release/', 'feature/'], ['feature/', 'bugfix/']))
			.toEqual(['release/', 'feature/', 'bugfix/']);
	});

	it('uses the global list when the project has none', () => {
		expect(resolveBranchTemplates(undefined, ['feature/'])).toEqual(['feature/']);
	});
});

describe('applyBranchTemplate', () => {
	const templates = ['feature/', 'bugfix/', 'feature/ui/'];

	it('fills an empty name with the template', () => {
		expect(applyBranchTemplate('', 'feature/', templates)).toBe('feature/');
	});

	it('prefixes a name without a template', () => {
		expect(applyBranchTemplate('login', 'feature/', templates)).toBe('feature/login');
	});

	it('replaces the template the name already starts with', () => {
		expect(applyBranchTemplate('feature/login', 'bugfix/', templates)).toBe('bugfix/login');
	});

	it('replaces the longest matching template', () => {
		expect(applyBranchTemplate('feature/ui/menu', 'bugfix/', templates)).toBe('bugfix/menu');
	});

	it('leaves the name alone when the same template is picked again', () => {
		expect(applyBranchTemplate('feature/login', 'feature/', templates)).toBe('feature/login');
	});
});
