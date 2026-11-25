import {describe, it, expect} from 'vitest';
import {formatGitDate, isDateFormat} from './dateFormat';

describe('formatGitDate', () => {
	it('writes the Czech form without leading zeros on day, month and hour', () => {
		expect(formatGitDate('2026-11-03 08:05', 'cs')).toBe('3. 11. 2026 8:05');
	});

	it('writes the English form with a 12-hour clock', () => {
		expect(formatGitDate('2026-11-03 08:05', 'en')).toBe('Nov 3, 2026 8:05 AM');
		expect(formatGitDate('2026-01-15 13:30', 'en')).toBe('Jan 15, 2026 1:30 PM');
	});

	it('shows midnight and noon as 12 in English', () => {
		expect(formatGitDate('2026-06-01 00:10', 'en')).toBe('Jun 1, 2026 12:10 AM');
		expect(formatGitDate('2026-06-01 12:10', 'en')).toBe('Jun 1, 2026 12:10 PM');
	});

	it('keeps the ISO form as git prints it', () => {
		expect(formatGitDate('2026-11-03 08:05', 'iso')).toBe('2026-11-03 08:05');
	});

	it('returns an empty or unexpected date unchanged', () => {
		expect(formatGitDate('', 'cs')).toBe('');
		expect(formatGitDate('yesterday', 'en')).toBe('yesterday');
	});
});

describe('isDateFormat', () => {
	it('accepts only the known formats', () => {
		expect(isDateFormat('cs')).toBe(true);
		expect(isDateFormat('de')).toBe(false);
		expect(isDateFormat(undefined)).toBe(false);
	});
});
