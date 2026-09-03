import {describe, expect, it} from 'vitest';
import {parseJsonc, resolveScope} from './themeExpressionEvaluator';

describe('parseJsonc', () => {
	it('strips line comments', () => {
		expect(parseJsonc('{\n\t// a comment\n\t"a": 1\n}')).toEqual({a: 1});
	});

	it('keeps a comment marker that sits inside a string', () => {
		expect(parseJsonc('{"url": "http://x/y"}')).toEqual({url: 'http://x/y'});
	});

	it('throws on a trailing comma, which it does not strip', () => {
		// Documents real behaviour: a trailing comma is NOT handled, which is why every
		// theme file must be strict JSON. A shipped theme once broke on exactly this.
		expect(() => parseJsonc('{"a": 1,}')).toThrow();
	});
});

describe('resolveScope', () => {
	it('resolves a plain hex value unchanged', () => {
		expect(resolveScope({red: '#FF0000'})).toEqual({red: '#FF0000'});
	});

	it('resolves an @reference to another key', () => {
		expect(resolveScope({red: '#FF0000', danger: '@red'}).danger).toBe('#FF0000');
	});

	it('resolves a chain of references regardless of declaration order', () => {
		const out = resolveScope({c: '@b', b: '@a', a: '#0000FF'});

		expect(out.c).toBe('#0000FF');
	});

	it('leaves an unknown reference intact so a checker can spot it', () => {
		expect(resolveScope({x: '@nope'}).x).toBe('@nope');
	});

	it('does not hang on a reference cycle', () => {
		const out = resolveScope({a: '@b', b: '@a'});

		expect(out).toHaveProperty('a');
		expect(out).toHaveProperty('b');
	});

	it('inherits values from the inherited scope', () => {
		expect(resolveScope({fg: '@brand'}, {brand: '#123456'}).fg).toBe('#123456');
	});

	it('lets a scope override an inherited key', () => {
		expect(resolveScope({brand: '#000000'}, {brand: '#FFFFFF'}).brand).toBe('#000000');
	});

	it('evaluates fade() to an rgb value with an alpha channel', () => {
		// chroma-js's css() emits the modern CSS Color 4 syntax, not the legacy
		// comma-separated rgba(...) form.
		expect(resolveScope({x: 'fade(#FF0000, 50%)'}).x).toMatch(/^rgb\(255 0 0 \/ 0?\.5\)$/);
	});

	it('evaluates lighten() and darken() in opposite directions', () => {
		const lighter = resolveScope({x: 'lighten(#808080, 20%)'}).x;
		const darker = resolveScope({x: 'darken(#808080, 20%)'}).x;

		expect(lighter).not.toBe('#808080');
		expect(darker).not.toBe('#808080');
		expect(lighter.toLowerCase()).not.toBe(darker.toLowerCase());
	});

	it('evaluates mixLess() to something between its two colours', () => {
		const mixed = resolveScope({x: 'mixLess(#000000, #FFFFFF, 50%)'}).x;

		expect(mixed).not.toBe('#000000');
		expect(mixed).not.toBe('#ffffff');
	});

	it('evaluates a function whose argument is a reference', () => {
		expect(resolveScope({red: '#FF0000', x: 'fade(@red, 50%)'}).x).toMatch(/^rgb\(255 0 0 \//);
	});

	it('passes rgba() through', () => {
		expect(resolveScope({x: 'rgba(0,0,0,.5)'}).x).toBe('rgba(0,0,0,.5)');
	});

	it('passes a var() reference through untouched', () => {
		expect(resolveScope({x: 'var(--something)'}).x).toBe('var(--something)');
	});

	it('leaves an unknown function name alone rather than throwing', () => {
		expect(resolveScope({x: 'wobble(#FF0000, 3)'}).x).toBe('wobble(#FF0000, 3)');
	});
});
