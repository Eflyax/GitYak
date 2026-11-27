/** The colours a project can be given in the manager. */
export const PRESET_COLORS = [
	'#6f9ef8',
	'#f87171',
	'#4ade80',
	'#fb923c',
	'#a78bfa',
	'#34d399',
	'#fbbf24',
	'#f472b6',
] as const;

/** The colour for the next project added, so new projects do not all look the same. */
export function nextPresetColor(projectCount: number): string {
	return PRESET_COLORS[projectCount % PRESET_COLORS.length];
}
