import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, it, expect} from 'vitest';
import {parseJsonc} from '@/infrastructure/themeExpressionEvaluator';
import type {IThemeFile} from '@/domain/models/Theme';
import {EDITABLE_THEME_COLORS, patchThemeSource, rootOverrides, themeFileName, withRootOverrides} from './themeEditor';

const SOURCE = `{
	"meta": {
		"name": "Midnight Grape",
		"scheme": "dark"
	},
	"themeValues": {
		// values applied to the entire app
		"root": {
			"app__bg0": "#1A132B", // main background
			"panel__bg0": "lighten(@app__bg0, 6%)",
			"graph-color-0": "#C084FC",
			"note": "braces { inside } a string"
		},
		"toolbar": {
			"app__bg0": "#000000"
		}
	}
}
`;

describe('patchThemeSource', () => {
	it('replaces the name and root values and keeps comments and other values', () => {
		const patched = patchThemeSource(SOURCE, 'Grape Copy', {'app__bg0': '#112233', 'graph-color-0': '#ff0000'});

		expect(patched).toContain('"name": "Grape Copy"');
		expect(patched).toContain('"app__bg0": "#112233", // main background');
		expect(patched).toContain('"graph-color-0": "#ff0000"');
		expect(patched).toContain('"panel__bg0": "lighten(@app__bg0, 6%)"');
		expect(patched).toContain('// values applied to the entire app');
	});

	it('leaves a token of the same name in another scope alone', () => {
		const patched = patchThemeSource(SOURCE, 'Grape Copy', {'app__bg0': '#112233'});
		const parsed = parseJsonc(patched) as IThemeFile;

		expect(parsed.themeValues.root['app__bg0']).toBe('#112233');
		expect(parsed.themeValues.toolbar?.['app__bg0']).toBe('#000000');
	});

	it('adds a token the theme does not define yet and stays valid JSONC', () => {
		const patched = patchThemeSource(SOURCE, 'Grape Copy', {'.text-color': '#eeeeee'});
		const parsed = parseJsonc(patched) as IThemeFile;

		expect(parsed.themeValues.root['.text-color']).toBe('#eeeeee');
		expect(parsed.themeValues.root['note']).toBe('braces { inside } a string');
		expect(parsed.meta.name).toBe('Grape Copy');
	});

	it('rejects a source without a root scope', () => {
		expect(() => patchThemeSource('{"meta": {"name": "x"}}', 'y', {})).toThrow();
	});
});

describe('patchThemeSource on the bundled themes', () => {
	const themesDir = join(__dirname, '../../../../../themes');
	const files = readdirSync(themesDir).filter(f => f.endsWith('.jsonc'));

	it.each(files)('%s accepts every editable colour and still parses', file => {
		const source = readFileSync(join(themesDir, file), 'utf8');
		const original = parseJsonc(source) as IThemeFile;
		const changed = Object.fromEntries(EDITABLE_THEME_COLORS.map(c => [c.token, '#123456']));
		const values = rootOverrides(original.themeValues.root, changed);
		const parsed = parseJsonc(patchThemeSource(source, 'Edited', values)) as IThemeFile;

		expect(parsed.meta.name).toBe('Edited');
		expect(parsed.meta.scheme).toBe(original.meta.scheme);

		for (const [token, value] of Object.entries(values)) {
			expect(parsed.themeValues.root[token]).toBe(value);
		}

		expect(Object.keys(parsed.themeValues.root).length)
			.toBe(new Set([...Object.keys(original.themeValues.root), ...Object.keys(values)]).size);
	});
});

describe('rootOverrides', () => {
	it('passes changed colours through', () => {
		expect(rootOverrides({}, {'app__bg0': '#000'})).toEqual({'app__bg0': '#000'});
	});

	it('re-derives the text tokens from a changed text colour', () => {
		const overrides = rootOverrides({'text-bright': 'rgba(255,255,255,1)'}, {'.text-color': '#eee'});

		expect(overrides['.text-color']).toBe('#eee');
		expect(overrides['text-normal']).toBe('fade(@.text-color, 85%)');
		expect(overrides['text-bright']).toBe('@.text-color');
		// Optional token the theme does not define stays out.
		expect(overrides).not.toHaveProperty('text-selected-row');
	});
});

describe('withRootOverrides', () => {
	it('returns a renamed copy with the overrides and leaves the input alone', () => {
		const theme = parseJsonc(SOURCE) as IThemeFile;
		const copy = withRootOverrides(theme, 'Copy', {'app__bg0': '#111'});

		expect(copy.meta.name).toBe('Copy');
		expect(copy.themeValues.root['app__bg0']).toBe('#111');
		expect(theme.themeValues.root['app__bg0']).toBe('#1A132B');
		expect(theme.meta.name).toBe('Midnight Grape');
	});
});

describe('themeFileName', () => {
	it('turns a theme name into a file name', () => {
		expect(themeFileName('Midnight Grape (copy)')).toBe('midnight-grape-copy.jsonc');
	});

	it('strips diacritics', () => {
		expect(themeFileName('Žluťoučký kůň')).toBe('zlutoucky-kun.jsonc');
	});

	it('falls back for a name without letters or digits', () => {
		expect(themeFileName('!!!')).toBe('theme.jsonc');
	});
});
