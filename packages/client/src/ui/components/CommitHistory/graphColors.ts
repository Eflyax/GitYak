import {ref} from 'vue';

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

// The colours live in CSS custom properties, which Vue cannot observe. Every caller (a
// template, a computed) reads this revision through getGraphColor, so bumping it when a
// theme is applied re-renders all of them with the new palette.
const themeRevision = ref(0);

export function refreshGraphColors(): void {
	themeRevision.value++;
}

export function getGraphColor(level: number): string {
	void themeRevision.value;

	const index = level % GRAPH_COLOR_COUNT;
	const value = getComputedStyle(document.documentElement)
		.getPropertyValue(`--graph-${index}`)
		.trim();
	return value || FALLBACK_COLORS[index]!;
}
