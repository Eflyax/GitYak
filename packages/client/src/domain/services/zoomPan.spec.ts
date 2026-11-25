import {describe, it, expect} from 'vitest';
import {INITIAL_VIEW, ZOOM_MAX, ZOOM_MIN, clampScale, panBy, wheelZoomFactor, zoomAt} from './zoomPan';

describe('zoomAt', () => {
	it('zooms around the viewport centre by default', () => {
		expect(zoomAt(INITIAL_VIEW, 2)).toEqual({scale: 2, x: 0, y: 0});
	});

	it('keeps the point under the anchor in place', () => {
		const view = zoomAt({scale: 1, x: 10, y: -20}, 2, {x: 50, y: 30});

		// Image point under the anchor before: (50 - 10) / 1 = 40, (30 + 20) / 1 = 50.
		expect((50 - view.x) / view.scale).toBe(40);
		expect((30 - view.y) / view.scale).toBe(50);
	});

	it('clamps the scale and keeps the view still at a limit', () => {
		const atMax = {scale: ZOOM_MAX, x: 5, y: 5};

		expect(zoomAt(atMax, 2, {x: 100, y: 100})).toEqual(atMax);
		expect(zoomAt(INITIAL_VIEW, 0.0001).scale).toBe(ZOOM_MIN);
	});
});

describe('panBy', () => {
	it('shifts the view without changing the scale', () => {
		expect(panBy({scale: 3, x: 1, y: 2}, 10, -5)).toEqual({scale: 3, x: 11, y: -3});
	});
});

describe('clampScale', () => {
	it('limits the scale to the allowed range', () => {
		expect(clampScale(100)).toBe(ZOOM_MAX);
		expect(clampScale(0)).toBe(ZOOM_MIN);
		expect(clampScale(1.5)).toBe(1.5);
	});
});

describe('wheelZoomFactor', () => {
	it('zooms in on wheel up, out on wheel down, symmetrically', () => {
		expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
		expect(wheelZoomFactor(100)).toBeLessThan(1);
		expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1);
	});
});
