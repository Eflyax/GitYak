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
	const scopes = theme.themeValues ?? {};
	// Mirror useTheme(): the root scope resolves alone, and every other scope resolves with
	// root's values inherited. Checking a scope in isolation reports references that the
	// application resolves perfectly well.
	const rootResolved = resolveScope(scopes.root ?? {});

	for (const [scope, tokens] of Object.entries(scopes)) {
		const resolved = scope === 'root' ? rootResolved : resolveScope(tokens, rootResolved);

		for (const [key, value] of Object.entries(resolved)) {
			// A non-root scope inherits every root key; only report the ones this scope declares.
			if (scope !== 'root' && !(key in tokens)) {
				continue;
			}

			if (value.startsWith('@')) {
				fail(`${file} [${scope}] ${key}: unresolved reference "${value}"`);
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
