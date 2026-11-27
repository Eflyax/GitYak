import {describe, expect, it} from 'vitest';
import {formatElapsed} from './elapsed';

describe('formatElapsed', () => {
	it('shows minutes and seconds', () => {
		expect(formatElapsed(0)).toBe('0:00');
		expect(formatElapsed(999)).toBe('0:00');
		expect(formatElapsed(65_000)).toBe('1:05');
		expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
	});

	it('adds hours from an hour on', () => {
		expect(formatElapsed(3_600_000)).toBe('1:00:00');
		expect(formatElapsed(3_600_000 + 5 * 60_000 + 7_000)).toBe('1:05:07');
	});

	it('treats a negative duration as zero', () => {
		expect(formatElapsed(-5_000)).toBe('0:00');
	});
});
