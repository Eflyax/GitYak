import {describe, expect, it} from 'vitest';
import {formatProgress} from './updateProgress';

const MB = 1024 * 1024;

describe('formatProgress', () => {
	it('shows the downloaded and the total size', () => {
		expect(formatProgress(12.4 * MB, 40.1 * MB)).toBe('12.4 / 40.1 MB');
	});

	it('shows only the downloaded size without a total', () => {
		expect(formatProgress(12.4 * MB, null)).toBe('12.4 MB');
	});

	it('starts at zero', () => {
		expect(formatProgress(0, 40.1 * MB)).toBe('0.0 / 40.1 MB');
		expect(formatProgress(0, null)).toBe('0.0 MB');
	});
});
