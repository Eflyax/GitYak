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

/** Share of the lane colour in its darker shade; the rest is black. */
const SHADE_MIX = 60;

/**
 * Darker shade of a lane colour: the border of the commit nodes, the horizontal line to the
 * refs and the ref chips (except the checked-out one). Theme colours may be hex or rgb();
 * color-mix darkens either. In SVG, set it as the CSS `stroke` property rather than the
 * attribute so WebKit resolves color-mix too.
 */
export function getGraphShadeColor(level: number): string {
	return `color-mix(in srgb, ${getGraphColor(level)} ${SHADE_MIX}%, black)`;
}
