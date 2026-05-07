const GRAPH_COLOR_COUNT = 10;

const FALLBACK_COLORS = [
	'#3b82f6',
	'#a78bfa',
	'#c084fc',
	'#f472b6',
	'#f87171',
	'#fb923c',
	'#fbbf24',
	'#4ade80',
	'#22d3ee',
	'#818cf8',
] as const;

export function getGraphColor(level: number): string {
	const index = level % GRAPH_COLOR_COUNT;
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(`--graph-${index}`)
		.trim();
	return value || FALLBACK_COLORS[index]!;
}
