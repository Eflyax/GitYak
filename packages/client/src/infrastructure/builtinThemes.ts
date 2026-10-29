// Themes shipped with the app, inlined at build time from the repo-root `themes/` directory
// so they are available in every deployment mode (Tauri, browser) without touching the filesystem.
const
	BUILTIN_THEME_PREFIX = 'builtin:',
	rawByPath = import.meta.glob<string>('../../../../themes/*.jsonc', {
		query: '?raw',
		import: 'default',
		eager: true,
	}),
	builtinThemes = new Map<string, string>(
		Object.entries(rawByPath).map(([path, raw]) => [
			`${BUILTIN_THEME_PREFIX}${path.split('/').pop() ?? path}`,
			raw,
		]),
	);

export function isBuiltinThemeId(themeId: string): boolean {
	return themeId.startsWith(BUILTIN_THEME_PREFIX);
}

export {builtinThemes};
