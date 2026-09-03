import {afterEach, describe, expect, it, vi} from 'vitest';
import {getGraphColor} from './graphColors';

// getGraphColor reads a CSS custom property off the document. Vitest runs in the node
// environment, so both globals are stubbed rather than pulling in jsdom.
function stubCss(values: Record<string, string>): void {
	vi.stubGlobal('document', {documentElement: {}});
	vi.stubGlobal('getComputedStyle', () => ({
		getPropertyValue: (name: string) => values[name] ?? '',
	}));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('getGraphColor', () => {
	it('uses the theme custom property when one is set', () => {
		stubCss({'--graph-3': '#abcdef'});

		expect(getGraphColor(3)).toBe('#abcdef');
	});

	it('trims whitespace around the custom property', () => {
		stubCss({'--graph-0': '  #123456  '});

		expect(getGraphColor(0)).toBe('#123456');
	});

	it('falls back to the built-in palette when the property is empty', () => {
		stubCss({});

		expect(getGraphColor(0)).toMatch(/^#[0-9a-f]{6}$/i);
	});

	it('is stable for the same lane', () => {
		stubCss({});

		expect(getGraphColor(4)).toBe(getGraphColor(4));
	});

	it('gives different lanes different fallback colours', () => {
		stubCss({});

		expect(getGraphColor(0)).not.toBe(getGraphColor(1));
	});

	it('wraps a lane index beyond the palette instead of returning undefined', () => {
		stubCss({});

		expect(getGraphColor(10)).toBe(getGraphColor(0));
		expect(getGraphColor(25)).toBe(getGraphColor(5));
	});
});
