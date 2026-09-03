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

	it('treats a leading @ as a reference even when the rest looks like a function', () => {
		// This exact value shipped in a theme: the author meant rgba(0,0,0,.2) and the stray
		// @ made it a reference to a token that does not exist, so it reached the CSS as
		// literal text.
		expect(resolveScope({x: '@rgba(0,0,0,.2)'}).x).toBe('@rgba(0,0,0,.2)');
	});

	it('does not hang on a reference cycle, and resolves it deterministically', () => {
		// A cycle cannot produce a colour, so the reference is left in place rather than
		// looping. Pinned exactly: a regression that turned this into garbage would
		// otherwise pass a test that only checked the keys existed.
		expect(resolveScope({a: '@b', b: '@a'})).toEqual({a: '@a', b: '@a'});
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

		// Assert the direction, not just that the two differ — otherwise a swapped
		// implementation, or two unrelated colours, would still pass.
		const lighterRed = parseInt(lighter.slice(1, 3), 16);
		const darkerRed = parseInt(darker.slice(1, 3), 16);

		expect(lighterRed).toBeGreaterThan(0x80);
		expect(0x80).toBeGreaterThan(darkerRed);
	});

	it('evaluates mixLess() to a colour between its two endpoints', () => {
		const mixed = resolveScope({x: 'mixLess(#000000, #FFFFFF, 50%)'}).x;

		// A 50% mix of black and white must be a mid grey: all three channels equal, and
		// none of them at either extreme.
		const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(mixed);

		expect(match).not.toBeNull();

		const [r, g, b] = match!.slice(1).map(h => parseInt(h, 16));

		expect(r).toBe(g);
		expect(g).toBe(b);
		expect(r).toBeGreaterThan(0x10);
		expect(r).toBeLessThan(0xF0);
	});

	it('evaluates a function whose argument is a reference', () => {
		expect(resolveScope({red: '#FF0000', x: 'fade(@red, 50%)'}).x).toMatch(/^rgb\(255 0 0 \//);
	});

	it('passes rgba() through', () => {
		// This short-circuits at the `startsWith('rgb')` guard earlier in resolveExpression
		// (themeExpressionEvaluator.ts:93), which returns the value unchanged before the
		// function-call parsing runs. The `fn === 'rgba'` branch further down (line 116) is
		// unreachable for that reason — this test covers the guard, not that branch.
		expect(resolveScope({x: 'rgba(0,0,0,.5)'}).x).toBe('rgba(0,0,0,.5)');
	});

	it('passes a var() reference through untouched', () => {
		expect(resolveScope({x: 'var(--something)'}).x).toBe('var(--something)');
	});

	it('leaves an unknown function name alone rather than throwing', () => {
		expect(resolveScope({x: 'wobble(#FF0000, 3)'}).x).toBe('wobble(#FF0000, 3)');
	});
});
