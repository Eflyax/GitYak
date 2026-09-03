import {resolveScope} from '../src/infrastructure/themeExpressionEvaluator';

export interface IThemeFile {
	meta?: {name?: string; scheme?: string};
	themeValues?: Record<string, Record<string, string>>;
}

// Mirrors useTheme(): the root scope resolves alone, and every other scope resolves with
// root's values inherited. Checking a scope in isolation reports references that the
// application resolves perfectly well.
export function findThemeProblems(file: string, theme: IThemeFile): Array<string> {
	const problems: Array<string> = [];
	const scopes = theme.themeValues ?? {};
	const rootResolved = resolveScope(scopes.root ?? {});

	for (const [scope, tokens] of Object.entries(scopes)) {
		const resolved = scope === 'root' ? rootResolved : resolveScope(tokens, rootResolved);

		for (const [key, value] of Object.entries(resolved)) {
			// A non-root scope inherits every root key; only report the ones this scope declares.
			if (scope !== 'root' && !(key in tokens)) {
				continue;
			}

			if (value.startsWith('@')) {
				problems.push(`${file} [${scope}] ${key}: unresolved reference "${value}"`);
			}

			if (/^(fade|lighten|darken|mixLess)\(/.test(value)) {
				problems.push(`${file} [${scope}] ${key}: unevaluated expression "${value}"`);
			}
		}
	}

	return problems;
}
