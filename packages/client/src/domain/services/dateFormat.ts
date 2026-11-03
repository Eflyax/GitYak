export type TDateFormat = 'cs' | 'en' | 'iso';

export const DATE_FORMATS: ReadonlyArray<{value: TDateFormat; label: string}> = [
	{value: 'cs', label: 'Czech'},
	{value: 'en', label: 'English'},
	{value: 'iso', label: 'ISO'},
];

export const DEFAULT_DATE_FORMAT: TDateFormat = 'en';

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Git prints dates with `--date=format-local:%Y-%m-%d %H:%M` (the user's local time).
const GIT_DATE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

interface IDateParts {
	year: number
	month: number
	day: number
	hour: number
	minute: number
}

function parseGitDate(raw: string): IDateParts | null {
	const match = GIT_DATE.exec(raw.trim());

	if (!match) return null;

	const [, year, month, day, hour, minute] = match.map(Number) as [number, number, number, number, number, number];

	return {year, month, day, hour, minute};
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

export function isDateFormat(value: unknown): value is TDateFormat {
	return DATE_FORMATS.some(f => f.value === value);
}

/**
 * Formats a `YYYY-MM-DD HH:MM` date from git for display. Anything else (an empty date of the
 * working-tree row, an unexpected format) is returned unchanged.
 */
export function formatGitDate(raw: string, format: TDateFormat): string {
	const d = parseGitDate(raw);

	if (!d) return raw;

	switch (format) {
		case 'cs':
			return `${d.day}. ${d.month}. ${d.year} ${d.hour}:${pad(d.minute)}`;

		case 'en': {
			const hour12 = d.hour % 12 || 12;
			const period = d.hour < 12 ? 'AM' : 'PM';

			return `${MONTHS_EN[d.month - 1]} ${d.day}, ${d.year} ${hour12}:${pad(d.minute)} ${period}`;
		}

		case 'iso':
			return `${d.year}-${pad(d.month)}-${pad(d.day)} ${pad(d.hour)}:${pad(d.minute)}`;
	}
}
