import {describe, expect, it} from 'vitest';
import {nextBackoffDelay} from './backoff';

describe('nextBackoffDelay', () => {
	// random() is injected so the schedule is assertable; 0.5 means "no jitter offset".
	const noJitter = () => 0.5;

	it('starts at 500ms', () => {
		expect(nextBackoffDelay(0, noJitter)).toBe(500);
	});

	it('doubles each attempt', () => {
		expect(nextBackoffDelay(1, noJitter)).toBe(1_000);
		expect(nextBackoffDelay(2, noJitter)).toBe(2_000);
		expect(nextBackoffDelay(3, noJitter)).toBe(4_000);
	});

	it('caps at 8s', () => {
		expect(nextBackoffDelay(4, noJitter)).toBe(8_000);
		expect(nextBackoffDelay(10, noJitter)).toBe(8_000);
		expect(nextBackoffDelay(100, noJitter)).toBe(8_000);
	});

	it('applies jitter within +/-25% of the base delay', () => {
		expect(nextBackoffDelay(0, () => 0)).toBe(375);
		expect(nextBackoffDelay(0, () => 1)).toBe(625);
	});

	it('never returns a negative delay', () => {
		expect(nextBackoffDelay(0, () => 0)).toBeGreaterThan(0);
	});
});
