import {describe, expect, it} from 'vitest';
import {findThemeProblems} from './themeProblems';
import type {IThemeFile} from './themeProblems';

describe('findThemeProblems', () => {
	it('reports nothing for a clean theme', () => {
		const theme: IThemeFile = {
			meta: {name: 'Clean', scheme: 'dark'},
			themeValues: {
				root: {background: '#111111', foreground: '#eeeeee'},
				panel: {background: '#222222'},
			},
		};

		expect(findThemeProblems('clean.jsonc', theme)).toEqual([]);
	});

	it('reports a bad @ref in a non-root scope', () => {
		const theme: IThemeFile = {
			meta: {name: 'Bad', scheme: 'dark'},
			themeValues: {
				root: {background: '#111111'},
				panel: {background: '@missing'},
			},
		};

		const problems = findThemeProblems('bad.jsonc', theme);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('[panel] background');
		expect(problems[0]).toContain('@missing');
	});

	it('reports a bad @ref in the root scope', () => {
		const theme: IThemeFile = {
			meta: {name: 'Bad', scheme: 'dark'},
			themeValues: {
				root: {background: '@missing'},
			},
		};

		const problems = findThemeProblems('bad-root.jsonc', theme);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('[root] background');
		expect(problems[0]).toContain('@missing');
	});

	it('does not re-report a root key a scope inherits but does not redeclare', () => {
		const theme: IThemeFile = {
			meta: {name: 'Inherit', scheme: 'dark'},
			themeValues: {
				// root's own key resolves to an unevaluated expression, which must be reported
				// exactly once — for root — and not again for every scope that inherits it
				// without redeclaring it.
				root: {background: 'lighten(#808080)'},
				panel: {foreground: '#eeeeee'},
				sidebar: {foreground: '#dddddd'},
			},
		};

		const problems = findThemeProblems('inherit.jsonc', theme);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('[root] background');
	});
});
