<template>
	<svg
		class="commit-graph"
		:width="svgWidth"
		:height="svgHeight"
	>
		<!-- Connection paths -->
		<path
			v-for="edge in windowEdges"
			:key="edge.key"
			:d="getPath(edge)"
			:stroke="getPathColor(edge)"
			:stroke-width="LINE_WIDTH"
			fill="none"
			opacity="0.85"
			:stroke-dasharray="edge.commit.isStash || edge.commit.hash === 'WORKING_TREE' ? '3 2' : undefined"
		/>

		<!-- Commit nodes -->
		<g
			v-for="commit in windowCommits"
			:key="'node-' + commit.hash"
		>
			<rect
				:x="PADDING_LEFT + (commit.level ?? 0) * X_STEP - 1"
				:y="row(commit) * Y_STEP"
				:width="svgWidth - (commit.level ?? 0) * X_STEP - 1"
				:height="Y_STEP - ROW_MARGIN"
				:fill="getColor(commit.level ?? 0)"
				:fill-opacity="selectedHash === commit.hash ? 0.30 : 0.06"
			/>

			<g v-if="commit.isStash">
				<rect
					:x="PADDING_LEFT + (commit.level ?? 0) * X_STEP - CIRCLE_R"
					:y="PADDING_TOP + row(commit) * Y_STEP - ROW_MARGIN - CIRCLE_R"
					:width="CIRCLE_R * 2"
					:height="CIRCLE_R * 2"
					fill="none"
					:stroke="getColor(commit.level ?? 0)"
					:stroke-width="LINE_WIDTH"
					stroke-dasharray="3 2"
				/>
				<ArchiveIcon
					:x="PADDING_LEFT + (commit.level ?? 0) * X_STEP - CIRCLE_R"
					:y="PADDING_TOP + row(commit) * Y_STEP - ROW_MARGIN - CIRCLE_R"
					:width="CIRCLE_R * 2"
					:height="CIRCLE_R * 2"
					:fill="getColor(commit.level ?? 0)"
				/>
			</g>

			<!-- WORKING_TREE: outline circle, dashed; regular commit: filled circle -->
			<circle
				v-else
				:cx="PADDING_LEFT + (commit.level ?? 0) * X_STEP"
				:cy="PADDING_TOP + row(commit) * Y_STEP - ROW_MARGIN"
				:r="commit.parents.length > 1 ? CIRCLE_R / 2 : CIRCLE_R"
				:fill="commit.hash === 'WORKING_TREE' ? 'none' : getColor(commit.level ?? 0)"
				:style="hasInitials(commit) ? {stroke: getBorderColor(commit.level ?? 0)} : undefined"
				:stroke="commit.hash === 'WORKING_TREE' ? getColor(commit.level ?? 0) : '#0d0f11'"
				:stroke-dasharray="commit.hash === 'WORKING_TREE' ? '3 2' : undefined"
				:stroke-width="commit.hash === 'WORKING_TREE' ? 2 : hasInitials(commit) ? NODE_BORDER_WIDTH : 0"
			/>
			<line
				v-if="commit.references?.length && !commit.isStash"
				:x1="PADDING_LEFT + (commit.level ?? 0) * X_STEP"
				:y1="(PADDING_TOP + row(commit) * Y_STEP)- ROW_MARGIN"
				:x2="PADDING_LEFT + (commit.level ?? 0) * X_STEP - (CIRCLE_R * 3 * (commit.level ?? 1))"
				:y2="(PADDING_TOP + row(commit) * Y_STEP) - ROW_MARGIN"
				:stroke="getColor(commit.level ?? 0)"
				:stroke-width="2"
			/>

			<text
				v-if="hasInitials(commit)"
				:x="PADDING_LEFT + (commit.level ?? 0) * X_STEP"
				:y="PADDING_TOP + row(commit) * Y_STEP - ROW_MARGIN"
				text-anchor="middle"
				dominant-baseline="central"
				font-size="10"
				font-weight="bold"
				font-family="sans-serif"
				fill="#0d0f11"
				style="pointer-events: none; user-select: none;"
			>{{ getInitials(commit.authorName) }}</text>
		</g>
	</svg>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {ICommit} from '@/domain';
import {edgesInWindow} from '@/domain/services/rowWindow';
import type {IGraphEdge} from '@/domain/services/rowWindow';
import {getGraphColor} from './graphColors';
import ArchiveIcon from '@/assets/svg/archive-outline.svg?component';

const X_STEP = 20;
const Y_STEP = 28;
const PADDING_LEFT = 12;
const PADDING_TOP = 18;
const CIRCLE_R = 11;
const LINE_WIDTH = 3;
const ROW_MARGIN = 5;
const CORNER_R = 8;
const NODE_BORDER_WIDTH = 2;
/** Share of the node colour in its border; the rest is black. */
const NODE_BORDER_MIX = 60;

interface IEdge extends IGraphEdge {
	key: string
	commit: Readonly<ICommit>
	parent: Readonly<ICommit>
}

const props = defineProps<{
	commits: readonly ICommit[]
	selectedHash?: string
	/** Rows hidden above the list (the working-tree row): subtracted from each commit's index. */
	rowOffset: number
	/** Rendered rows, `start` inclusive and `end` exclusive; the rest of the SVG stays empty. */
	startIndex: number
	endIndex: number
	maxLevel: number
}>();

const commitMap = computed(() => {
	const map = new Map<string, Readonly<ICommit>>();

	props.commits.forEach(c => map.set(c.hash, c));

	return map;
});

// Every parent link of the loaded history. Rebuilt only when the history changes; scrolling
// just filters it down to the links that cross the rendered rows.
const edges = computed((): IEdge[] => {
	const result: IEdge[] = [];

	for (const commit of props.commits) {
		for (const parentHash of commit.parents) {
			const parent = commitMap.value.get(parentHash);

			if (parent) {
				result.push({key: commit.hash + parentHash, commit, parent, from: row(commit), to: row(parent)});
			}
		}
	}

	return result;
});

const windowEdges = computed(() => edgesInWindow(edges.value, {start: props.startIndex, end: props.endIndex}));

const windowCommits = computed(() => props.commits.slice(props.startIndex, props.endIndex));

const svgWidth = computed(() => (props.maxLevel + 1) * X_STEP + PADDING_LEFT + 16);

const svgHeight = computed(() => props.commits.length * Y_STEP + 10);

function row(commit: Readonly<ICommit>): number {
	return (commit.index ?? 0) - props.rowOffset;
}

function getInitials(authorName: string): string {
	const parts = (authorName ?? '').trim().split(/\s+/);
	if (parts.length >= 2) {
		return ((parts[0]![0] ?? '') + (parts[parts.length - 1]![0] ?? '')).toUpperCase();
	}
	return (authorName ?? '').slice(0, 2).toUpperCase();
}

function getColor(level: number): string {
	return getGraphColor(level);
}

function hasInitials(commit: Readonly<ICommit>): boolean {
	return commit.hash !== 'WORKING_TREE' && !commit.isStash && commit.parents.length <= 1;
}

// Theme colours may be hex or rgb(); color-mix darkens any of them. Applied as a CSS
// property (not the stroke attribute) so WebKit resolves color-mix too.
function getBorderColor(level: number): string {
	return `color-mix(in srgb, ${getColor(level)} ${NODE_BORDER_MIX}%, black)`;
}

function getPathColor(edge: IEdge): string {
	const commitLevel = edge.commit.level ?? 0;
	const parentLevel = edge.parent.level ?? commitLevel;
	const branchLevel = Math.max(commitLevel, parentLevel);

	return getColor(branchLevel);
}

function getPath(edge: IEdge): string {
	const cLevel = edge.commit.level ?? 0;
	const cIndex = edge.from;
	const pLevel = edge.parent.level ?? 0;
	const pIndex = edge.to;

	const sx = PADDING_LEFT + cLevel * X_STEP;
	const sy = PADDING_TOP + cIndex * Y_STEP - ROW_MARGIN;
	const ex = PADDING_LEFT + pLevel * X_STEP;
	const ey = PADDING_TOP + pIndex * Y_STEP - ROW_MARGIN;

	if (cLevel === pLevel) {
		return `M ${sx} ${sy + CIRCLE_R} L ${ex} ${ey - CIRCLE_R}`;
	}

	const xDir = ex > sx ? 1 : -1;
	const delta = cLevel - pLevel;

	if (delta < 0) {
		const w = Math.abs(ex - sx);
		const h = Math.abs(ey - sy);
		const r = Math.min(CORNER_R, w / 2, h / 2);

		return `
			M ${sx + CIRCLE_R * xDir} ${sy}
			L ${ex - r * xDir} ${sy}
			Q ${ex} ${sy} ${ex} ${sy + r}
			L ${ex} ${ey - CIRCLE_R}
		`;
	}
	else {
		const h = Math.abs(ey - sy);
		const r = Math.min(CORNER_R, h / 2);

		return `
			M ${sx} ${sy + CIRCLE_R}
			L ${sx} ${ey - r}
			Q ${sx} ${ey} ${sx + r * xDir} ${ey}
			L ${ex - CIRCLE_R * xDir} ${ey}
		`;
	}
}
</script>

<style scoped lang="scss">
.commit-graph {
	display: block;
	flex-shrink: 0;
	pointer-events: none;
	height: 100%;
	width: 200px;
}
</style>
