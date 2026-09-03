import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonc} from '../src/infrastructure/themeExpressionEvaluator';
import {findThemeProblems} from './themeProblems';
import type {IThemeFile} from './themeProblems';

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	themesDir = join(scriptDir, '..', '..', '..', 'themes');

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
	for (const problem of findThemeProblems(file, theme)) {
		fail(problem);
	}
}

console.log(`\nthemes checked: ${parsed.size}`);
console.log(failures === 0 ? 'OK — all checks passed' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
