import {describe, it, expect} from 'vitest';
import {computeRowWindow, edgesInWindow, scrollTopToReveal} from './rowWindow';

describe('computeRowWindow', () => {
	it('covers the viewport plus the overscan on both sides', () => {
		expect(computeRowWindow(280, 280, 28, 1000, 5)).toEqual({start: 5, end: 25});
	});

	it('does not start above the first row', () => {
		expect(computeRowWindow(0, 280, 28, 1000, 5)).toEqual({start: 0, end: 15});
	});

	it('does not end below the last row', () => {
		expect(computeRowWindow(27_800, 280, 28, 1000, 5)).toEqual({start: 987, end: 1000});
	});

	it('includes a partially visible row at the bottom', () => {
		expect(computeRowWindow(0, 290, 28, 1000, 0)).toEqual({start: 0, end: 11});
	});

	it('is empty for an empty list', () => {
		expect(computeRowWindow(0, 280, 28, 0, 5)).toEqual({start: 0, end: 0});
	});

	it('treats an elastic overscroll above the top as the top', () => {
		expect(computeRowWindow(-40, 280, 28, 1000, 0)).toEqual({start: 0, end: 10});
	});
});

describe('edgesInWindow', () => {
	const window = {start: 10, end: 20};

	it('keeps an edge with an end inside the window', () => {
		expect(edgesInWindow([{from: 5, to: 12}], window)).toHaveLength(1);
		expect(edgesInWindow([{from: 15, to: 40}], window)).toHaveLength(1);
	});

	it('keeps a long edge that passes through the window', () => {
		expect(edgesInWindow([{from: 2, to: 300}], window)).toHaveLength(1);
	});

	it('drops edges entirely above or below the window', () => {
		expect(edgesInWindow([{from: 0, to: 9}, {from: 20, to: 25}], window)).toEqual([]);
	});

	it('handles an edge drawn upwards', () => {
		expect(edgesInWindow([{from: 30, to: 5}], window)).toHaveLength(1);
	});
});

describe('scrollTopToReveal', () => {
	it('leaves a fully visible row alone', () => {
		expect(scrollTopToReveal(0, 280, 3, 28)).toBeNull();
	});

	it('scrolls up so a row above the viewport sits at its top', () => {
		expect(scrollTopToReveal(280, 280, 5, 28)).toBe(140);
	});

	it('scrolls down so a row below the viewport sits at its bottom', () => {
		expect(scrollTopToReveal(0, 280, 10, 28)).toBe(28);
	});
});
