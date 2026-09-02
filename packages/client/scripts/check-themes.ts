import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonc, resolveScope} from '../src/infrastructure/themeExpressionEvaluator';

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	themesDir = join(scriptDir, '..', '..', '..', 'themes');

interface IThemeFile {
	meta?: {name?: string; scheme?: string};
	themeValues?: Record<string, Record<string, string>>;
}

// Cross-scope references cannot resolve today: resolveScope() handles each scope in
// isolation, so a toolbar/tabsbar token cannot see a root token. Fixed in phase 3; until
// then these exact references are reported but do not fail the run.
//
// The list is pinned to individual `file|scope|key` entries DELIBERATELY, not to whole
// files: a file-wide exemption would swallow a NEW typo (say `@backgroun`) added to one of
// these same files. Anything not pinned here fails. The list shrinks to empty — and this
// whole block goes away — when phase 3 fixes resolveScope(). Do not add entries to it to
// silence a new failure.
const KNOWN_CROSS_SCOPE_GAPS = new Set([
	'1984-theme.jsonc|toolbar|text-selected',
	'1984-theme.jsonc|toolbar|text-normal',
	'1984-theme.jsonc|toolbar|text-secondary',
	'1984-theme.jsonc|toolbar|text-disabled',
	'1984-theme.jsonc|toolbar|input__bg',
	'1984-theme.jsonc|toolbar|link-color',
	'1984-theme.jsonc|tabsbar|text-selected',
	'1984-theme.jsonc|tabsbar|text-normal',
	'1984-theme.jsonc|tabsbar|text-secondary',
	'1984-theme.jsonc|tabsbar|text-disabled',
	'1984-theme.jsonc|tabsbar|section-border',
	'1984-theme.jsonc|tabsbar|input__bg',
	'1984-theme.jsonc|tabsbar|link-color',
	'light-color-blind.jsonc|toolbar|link-color',
	'light-color-blind.jsonc|tabsbar|link-color',
]);

const
	files = readdirSync(themesDir).filter(f => f.endsWith('.jsonc')),
	parsed = new Map<string, IThemeFile>();

let failures = 0;

function fail(message: string): void {
	console.log(`  FAIL ${message}`);
	failures++;
}

for (const file of files) {
	const raw = readFileSync(join(themesDir, file), 'utf8');

	let theme: IThemeFile;

	try {
		theme = parseJsonc(raw) as IThemeFile;
	}
	catch (e: unknown) {
		fail(`${file}: does not parse — ${e instanceof Error ? e.message : String(e)}`);
		continue;
	}

	if (!theme.meta?.name || !theme.meta?.scheme) {
		fail(`${file}: missing meta.name / meta.scheme`);
	}

	parsed.set(file, theme);
}

for (const [file, theme] of parsed) {
	for (const [scope, tokens] of Object.entries(theme.themeValues ?? {})) {
		const resolved = resolveScope(tokens);

		for (const [key, value] of Object.entries(resolved)) {
			if (value.startsWith('@')) {
				if (scope !== 'root' && KNOWN_CROSS_SCOPE_GAPS.has(`${file}|${scope}|${key}`)) {
					console.log(`  known-gap ${file} [${scope}] ${key}: "${value}"`);
				}
				else {
					fail(`${file} [${scope}] ${key}: unresolved reference "${value}"`);
				}
			}

			if (/^(fade|lighten|darken|mixLess)\(/.test(value)) {
				fail(`${file} [${scope}] ${key}: unevaluated expression "${value}"`);
			}
		}
	}
}

console.log(`\nthemes checked: ${parsed.size}`);
console.log(failures === 0 ? 'OK — all checks passed' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
