import type {IThemeFile, IThemeScope} from '@/domain/models/Theme';

export type TThemeColorGroup = 'Background' | 'Accent' | 'Text' | 'Graph';

export interface IEditableThemeColor {
	/** Root token the colour is stored in. */
	token: string
	label: string
	group: TThemeColorGroup
}

const TEXT_BASE_TOKEN = '.text-color';

/** The few colours the theme editor exposes; every other token keeps its value or derivation. */
export const EDITABLE_THEME_COLORS: ReadonlyArray<IEditableThemeColor> = [
	{token: 'app__bg0', label: 'App background', group: 'Background'},
	{token: 'panel__bg0', label: 'Panels', group: 'Background'},
	{token: 'toolbar__bg0', label: 'Toolbar', group: 'Background'},
	{token: 'text-accent', label: 'Accent', group: 'Accent'},
	{token: TEXT_BASE_TOKEN, label: 'Text', group: 'Text'},
	...Array.from({length: 10}, (_, i) => ({
		token: `graph-color-${i}`,
		label: `Graph ${i + 1}`,
		group: 'Graph' as const,
	})),
];

// Themes do not agree on where their text colours come from (some derive them from
// `.text-color`, others from their own palette or literals). Once the user picks a text colour,
// the text tokens are re-derived from it the way the bundled dark themes do.
const TEXT_DERIVED: Readonly<Record<string, string>> = {
	'text-selected': `@${TEXT_BASE_TOKEN}`,
	'text-normal': `fade(@${TEXT_BASE_TOKEN}, 85%)`,
	'text-secondary': `fade(@${TEXT_BASE_TOKEN}, 65%)`,
	'text-disabled': `fade(@${TEXT_BASE_TOKEN}, 42%)`,
	'text-bright': `@${TEXT_BASE_TOKEN}`,
	'text-selected-row': `@${TEXT_BASE_TOKEN}`,
};

/**
 * Root token values to write for the colours the user changed (token → colour). A text colour
 * also rewires the text tokens to derive from it; the optional ones are only touched when the
 * theme defines them.
 */
export function rootOverrides(root: IThemeScope, changed: Readonly<Record<string, string>>): Record<string, string> {
	const result: Record<string, string> = {...changed};

	if (TEXT_BASE_TOKEN in changed) {
		for (const [token, expression] of Object.entries(TEXT_DERIVED)) {
			const required = token === 'text-selected' || token === 'text-normal'
				|| token === 'text-secondary' || token === 'text-disabled';

			if (required || token in root) {
				result[token] = expression;
			}
		}
	}

	return result;
}

/** The theme with its name and root tokens replaced; the input is left untouched. */
export function withRootOverrides(theme: IThemeFile, name: string, overrides: Readonly<Record<string, string>>): IThemeFile {
	return {
		...theme,
		meta: {...theme.meta, name},
		themeValues: {
			...theme.themeValues,
			root: {...theme.themeValues.root, ...overrides},
		},
	};
}

/** File name (without directory) for a theme name: `Midnight Grape (copy)` → `midnight-grape-copy.jsonc`. */
export function themeFileName(name: string): string {
	const slug = name
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

	return `${slug || 'theme'}.jsonc`;
}

interface IRange {
	start: number
	end: number
}

/**
 * The span between the braces of the object that `"key": {` opens, searched from `from`.
 * Skips strings and comments, so braces inside them do not count.
 */
function objectBody(source: string, key: string, from = 0): IRange | null {
	const opener = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*\\{`, 'g');

	opener.lastIndex = from;

	const match = opener.exec(source);

	if (!match) return null;

	const start = match.index + match[0].length;
	let depth = 1;
	let i = start;

	while (i < source.length) {
		const ch = source[i];

		if (ch === '"') {
			i++;
			while (i < source.length && source[i] !== '"') {
				i += source[i] === '\\' ? 2 : 1;
			}
		}
		else if (ch === '/' && source[i + 1] === '/') {
			while (i < source.length && source[i] !== '\n') i++;
		}
		else if (ch === '/' && source[i + 1] === '*') {
			const close = source.indexOf('*/', i + 2);

			i = close === -1 ? source.length : close + 1;
		}
		else if (ch === '{') {
			depth++;
		}
		else if (ch === '}') {
			depth--;

			if (depth === 0) {
				return {start, end: i};
			}
		}

		i++;
	}

	return null;
}

function escapeJsonString(value: string): string {
	return JSON.stringify(value).slice(1, -1);
}

function setStringProperty(body: string, key: string, value: string, indent: string): string {
	const property = new RegExp(`("${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);

	if (property.test(body)) {
		return body.replace(property, (_, prefix: string) => `${prefix}"${escapeJsonString(value)}"`);
	}

	// Not in the theme yet: add it as the first property, so no trailing comma is needed.
	return `\n${indent}"${key}": "${escapeJsonString(value)}",${body}`;
}

/**
 * Rewrites a JSONC theme source with a new name and root token values, keeping its comments,
 * formatting and every other value. Only the `meta` and `themeValues.root` objects are edited,
 * so a token of the same name in another scope (toolbar, tabsbar) stays as it is.
 */
export function patchThemeSource(source: string, name: string, rootValues: Readonly<Record<string, string>>): string {
	let result = source;
	const meta = objectBody(result, 'meta');

	if (meta) {
		const body = setStringProperty(result.slice(meta.start, meta.end), 'name', name, '\t\t');

		result = result.slice(0, meta.start) + body + result.slice(meta.end);
	}

	const themeValues = objectBody(result, 'themeValues');
	const root = themeValues ? objectBody(result, 'root', themeValues.start) : null;

	if (!root) {
		throw new Error('The theme has no "themeValues.root" section');
	}

	let body = result.slice(root.start, root.end);

	for (const [token, value] of Object.entries(rootValues)) {
		body = setStringProperty(body, token, value, '\t\t\t');
	}

	return result.slice(0, root.start) + body + result.slice(root.end);
}
