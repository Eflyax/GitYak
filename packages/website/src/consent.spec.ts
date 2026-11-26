import {describe, expect, it} from 'vitest';
import {parseConsent} from './consent';

describe('parseConsent', () => {
	const now = Date.UTC(2026, 10, 26);
	const day = 24 * 60 * 60 * 1000;

	it('reads a stored choice', () => {
		expect(parseConsent(JSON.stringify({analytics: true, date: now - day}), now)).toEqual({analytics: true, date: now - day});
		expect(parseConsent(JSON.stringify({analytics: false, date: now}), now)?.analytics).toBe(false);
	});

	it('asks again after a year', () => {
		expect(parseConsent(JSON.stringify({analytics: true, date: now - 366 * day}), now)).toBeNull();
	});

	it('asks when nothing valid is stored', () => {
		expect(parseConsent(null, now)).toBeNull();
		expect(parseConsent('not json', now)).toBeNull();
		expect(parseConsent(JSON.stringify({analytics: 'yes', date: now}), now)).toBeNull();
		expect(parseConsent(JSON.stringify({analytics: true}), now)).toBeNull();
	});
});
