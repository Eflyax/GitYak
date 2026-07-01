<template>
	<Teleport to="body">
		<div
			test-id="repository-graph"
			class="repository-graph"
		>
			<div class="graph-header">
				<span class="title">Repository graph</span>
				<button
					test-id="repository-graph-close"
					class="close-btn"
					@click="close"
				>
					<Icon name="mdi-close" />
				</button>
			</div>

			<div
				v-if="isEmpty"
				class="empty"
			>
				No saved repositories yet.
			</div>

			<svg
				v-else
				ref="svgRef"
				test-id="repository-graph-canvas"
				class="canvas"
				:width="width"
				:height="height"
				@wheel="onWheel"
				@pointerdown="onBackgroundPointerDown"
			>
				<g :transform="transform">
					<line
						v-for="(edge, i) in viewLinks"
						:key="'edge-' + i"
						class="edge"
						:x1="edge.x1"
						:y1="edge.y1"
						:x2="edge.x2"
						:y2="edge.y2"
					/>

					<g
						v-for="item in viewNodes"
						:key="item.node.id"
						class="node"
						:class="'node--' + item.node.kind"
						:transform="`translate(${item.x},${item.y})`"
						@pointerdown="onNodePointerDown($event, item.node)"
					>
						<circle
							:r="item.node.radius"
							:fill="item.node.color"
						/>
						<text
							class="label"
							text-anchor="middle"
							:y="item.node.radius + 15"
						>
							{{ item.node.label }}
						</text>
					</g>
				</g>
			</svg>

			<div
				v-if="!isEmpty"
				test-id="repository-graph-controls"
				class="controls"
			>
				<label class="control">
					<span class="control-label">Repulsion</span>
					<input
						v-model.number="repulsion"
						type="range"
						min="50"
						max="2000"
						step="50"
					/>
				</label>
				<label class="control">
					<span class="control-label">Gather</span>
					<input
						v-model.number="gather"
						type="range"
						min="0"
						max="0.4"
						step="0.01"
					/>
				</label>
				<button
					test-id="repository-graph-reset"
					class="reset-btn"
					@click="resetLayout"
				>
					Reset layout
				</button>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {ref, shallowRef, computed, watch, onMounted, onUnmounted, markRaw} from 'vue';
import {forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY} from 'd3-force';
import type {Simulation, SimulationNodeDatum, SimulationLinkDatum} from 'd3-force';
import {useProject} from '@/composables/useProject';
import {useGraphSettings} from '@/composables/useGraphSettings';
import type {INodeLayout} from '@/composables/useGraphSettings';
import {EServerType} from '@/domain';
import type {IProject} from '@/domain';
import Icon from '../Icon.vue';

type NodeKind = 'server' | 'group' | 'repo';

interface IGraphNode extends SimulationNodeDatum {
	id: string;
	kind: NodeKind;
	label: string;
	color: string;
	radius: number;
	projectId?: string;
	groupId?: string;
}

interface IGraphLink extends SimulationLinkDatum<IGraphNode> {}

const SERVER_COLOR = '#8a8f98';
const GROUP_COLOR = '#c98a3a';
const REPO_COLOR = '#6f9ef8';

const emit = defineEmits<{(e: 'close'): void}>();

const {projects, groups, openProject, selectedGroupFilter} = useProject();
const {repulsion, gather, loadView, loadLayout, saveState, clearLayout} = useGraphSettings();

// d3 mutates node objects in place every tick, so the arrays hold plain
// (markRaw) objects and a single incrementing `tick` drives re-render.
const nodes = shallowRef<Array<IGraphNode>>([]);
const links = shallowRef<Array<IGraphLink>>([]);
const tick = ref(0);
const width = ref(1200);
const height = ref(800);
const scale = ref(1);
const panX = ref(0);
const panY = ref(0);
const svgRef = ref<SVGSVGElement | null>(null);

let sim: Simulation<IGraphNode, IGraphLink> | null = null;
let chargeForce: ReturnType<typeof forceManyBody<IGraphNode>> | null = null;
let xForce: ReturnType<typeof forceX<IGraphNode>> | null = null;
let yForce: ReturnType<typeof forceY<IGraphNode>> | null = null;
let dragNode: IGraphNode | null = null;
let panning = false;
let dragMoved = false;
let lastPointer = {x: 0, y: 0};

const isEmpty = computed<boolean>(() => projects.value.length === 0);

const transform = computed<string>(() => `translate(${panX.value},${panY.value}) scale(${scale.value})`);

const viewNodes = computed(() => {
	void tick.value;

	return nodes.value.map(node => ({
		node,
		x: node.x ?? 0,
		y: node.y ?? 0,
	}));
});

const viewLinks = computed(() => {
	void tick.value;

	return links.value.map(link => {
		const
			source = link.source as IGraphNode,
			target = link.target as IGraphNode;

		return {
			x1: source.x ?? 0,
			y1: source.y ?? 0,
			x2: target.x ?? 0,
			y2: target.y ?? 0,
		};
	});
});

function serverFor(project: IProject): {key: string; label: string} {
	if (project.server === 'localhost') {
		return {key: 'this-pc', label: 'This PC'};
	}

	if (project.serverType === EServerType.SSH) {
		const user = project.sshUser ? `${project.sshUser}@` : '';

		return {key: `ssh:${user}${project.server}:${project.port}`, label: `${user}${project.server}:${project.port}`};
	}

	return {key: `bun:${project.server}:${project.port}`, label: `${project.server}:${project.port}`};
}

function buildGraph(): {nodes: Array<IGraphNode>; links: Array<IGraphLink>} {
	const
		nodeMap = new Map<string, IGraphNode>(),
		linkList: Array<IGraphLink> = [];

	for (const project of projects.value) {
		const server = serverFor(project);

		if (!nodeMap.has(server.key)) {
			nodeMap.set(server.key, {id: server.key, kind: 'server', label: server.label, color: SERVER_COLOR, radius: 26});
		}

		let parentId = server.key;

		if (project.groupId) {
			const group = groups.value.find(g => g.id === project.groupId);

			if (group) {
				const groupKey = `${server.key}::group:${group.id}`;

				if (!nodeMap.has(groupKey)) {
					nodeMap.set(groupKey, {id: groupKey, kind: 'group', label: group.name, color: group.color ?? GROUP_COLOR, radius: 20, groupId: group.id});
					linkList.push({source: server.key, target: groupKey});
				}

				parentId = groupKey;
			}
		}

		const repoKey = `repo:${project.id}`;

		nodeMap.set(repoKey, {id: repoKey, kind: 'repo', label: project.alias, color: project.color ?? REPO_COLOR, radius: 15, projectId: project.id});
		linkList.push({source: parentId, target: repoKey});
	}

	return {nodes: Array.from(nodeMap.values()), links: linkList};
}

function initSimulation(): void {
	const model = buildGraph();

	nodes.value = model.nodes.map(node => markRaw(node));
	links.value = model.links.map(link => markRaw(link));

	// Restore saved positions where available; otherwise seed around the screen
	// centre. Without seeding, d3 lays nodes out in a phyllotaxis pattern near
	// (0,0), so the graph piles into the top-left corner and reads as "empty".
	const
		layout = loadLayout(),
		centreX = width.value / 2,
		centreY = height.value / 2;

	let restoredCount = 0;

	nodes.value.forEach((node, index) => {
		const saved = layout[node.id];

		if (saved) {
			node.x = saved.x;
			node.y = saved.y;

			if (saved.pinned) {
				node.fx = saved.x;
				node.fy = saved.y;
			}

			restoredCount++;

			return;
		}

		const
			angle = index * 2.399963229728653,
			distance = 40 + 14 * Math.sqrt(index);

		node.x = centreX + distance * Math.cos(angle);
		node.y = centreY + distance * Math.sin(angle);
	});

	chargeForce = forceManyBody<IGraphNode>().strength(-repulsion.value);
	xForce = forceX<IGraphNode>(centreX).strength(gather.value);
	yForce = forceY<IGraphNode>(centreY).strength(gather.value);

	sim = forceSimulation<IGraphNode, IGraphLink>(nodes.value)
		.force('charge', chargeForce)
		.force('link', forceLink<IGraphNode, IGraphLink>(links.value).id(node => node.id).distance(95).strength(0.6))
		.force('center', forceCenter<IGraphNode>(centreX, centreY))
		.force('x', xForce)
		.force('y', yForce)
		.force('collide', forceCollide<IGraphNode>().radius(node => node.radius + 10))
		.on('tick', () => {
			tick.value++;
		});

	// A restored layout is already settled — start cool so it barely moves.
	if (restoredCount > 0) {
		sim.alpha(0.2);
	}
}

function reheat(): void {
	sim?.alpha(0.6).restart();
}

watch(repulsion, value => {
	chargeForce?.strength(-value);
	reheat();
});

watch(gather, value => {
	xForce?.strength(value);
	yForce?.strength(value);
	reheat();
});

function clientToGraph(clientX: number, clientY: number): {x: number; y: number} {
	const rect = svgRef.value?.getBoundingClientRect();

	if (!rect) {
		return {x: 0, y: 0};
	}

	return {
		x: (clientX - rect.left - panX.value) / scale.value,
		y: (clientY - rect.top - panY.value) / scale.value,
	};
}

function onNodePointerDown(event: PointerEvent, node: IGraphNode): void {
	event.stopPropagation();

	dragNode = node;
	dragMoved = false;
	lastPointer = {x: event.clientX, y: event.clientY};

	const point = clientToGraph(event.clientX, event.clientY);

	node.fx = point.x;
	node.fy = point.y;
	sim?.alphaTarget(0.3).restart();

	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', onPointerUp);
}

function onBackgroundPointerDown(event: PointerEvent): void {
	panning = true;
	lastPointer = {x: event.clientX, y: event.clientY};

	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(event: PointerEvent): void {
	if (dragNode) {
		if (Math.abs(event.clientX - lastPointer.x) > 3 || Math.abs(event.clientY - lastPointer.y) > 3) {
			dragMoved = true;
		}

		const point = clientToGraph(event.clientX, event.clientY);

		dragNode.fx = point.x;
		dragNode.fy = point.y;

		return;
	}

	if (panning) {
		panX.value += event.clientX - lastPointer.x;
		panY.value += event.clientY - lastPointer.y;
		lastPointer = {x: event.clientX, y: event.clientY};
	}
}

function onPointerUp(): void {
	if (dragNode) {
		const node = dragNode;

		sim?.alphaTarget(0);

		if (dragMoved) {
			// Keep the node pinned where it was dropped (persisted on close).
			node.fx = node.x ?? null;
			node.fy = node.y ?? null;
		}
		else {
			// A plain click: release the temporary pin and navigate.
			node.fx = null;
			node.fy = null;
			navigate(node);
		}

		dragNode = null;
	}

	panning = false;
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('pointerup', onPointerUp);
}

function resetLayout(): void {
	clearLayout();

	nodes.value.forEach(node => {
		node.fx = null;
		node.fy = null;
	});

	reheat();
}

function navigate(node: IGraphNode): void {
	if (node.kind === 'repo' && node.projectId) {
		const project = projects.value.find(p => p.id === node.projectId);

		if (project) {
			void openProject(project);
			close();
		}

		return;
	}

	if (node.kind === 'group' && node.groupId) {
		selectedGroupFilter.value = node.groupId;
		close();
	}
}

function onWheel(event: WheelEvent): void {
	event.preventDefault();

	const rect = svgRef.value?.getBoundingClientRect();

	if (!rect) {
		return;
	}

	const
		cursorX = event.clientX - rect.left,
		cursorY = event.clientY - rect.top,
		graphX = (cursorX - panX.value) / scale.value,
		graphY = (cursorY - panY.value) / scale.value,
		factor = event.deltaY < 0 ? 1.1 : 1 / 1.1,
		nextScale = Math.min(3, Math.max(0.2, scale.value * factor));

	panX.value = cursorX - graphX * nextScale;
	panY.value = cursorY - graphY * nextScale;
	scale.value = nextScale;
}

function onKeyDown(event: KeyboardEvent): void {
	if (event.key === 'Escape') {
		close();
	}
}

function onResize(): void {
	width.value = window.innerWidth;
	height.value = window.innerHeight;
}

function close(): void {
	emit('close');
}

onMounted(() => {
	width.value = window.innerWidth;
	height.value = window.innerHeight;

	const view = loadView();

	if (view) {
		scale.value = view.scale;
		panX.value = view.panX;
		panY.value = view.panY;
	}

	initSimulation();
	document.addEventListener('keydown', onKeyDown);
	window.addEventListener('resize', onResize);
});

onUnmounted(() => {
	persistState();
	sim?.stop();
	document.removeEventListener('keydown', onKeyDown);
	window.removeEventListener('resize', onResize);
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('pointerup', onPointerUp);
});

function persistState(): void {
	const layout: Record<string, INodeLayout> = {};

	nodes.value.forEach(node => {
		layout[node.id] = {x: node.x ?? 0, y: node.y ?? 0, pinned: node.fx != null};
	});

	saveState({scale: scale.value, panX: panX.value, panY: panY.value}, layout);
}
</script>

<style scoped lang="scss">
.repository-graph {
	background: $bg-app;
	inset: 0;
	position: fixed;
	z-index: 4000;

	.graph-header {
		align-items: center;
		display: flex;
		justify-content: space-between;
		left: 0;
		padding: 14px 18px;
		position: absolute;
		right: 0;
		top: 0;
		z-index: 1;

		.title {
			color: $text-white;
			font-size: 1.05em;
			font-weight: 600;
		}

		.close-btn {
			align-items: center;
			background: transparent;
			border: none;
			border-radius: 8px;
			color: $text-muted;
			cursor: pointer;
			display: flex;
			height: 34px;
			justify-content: center;
			transition: background 0.15s, color 0.15s;
			width: 34px;

			svg {
				height: 20px;
				width: 20px;
			}

			&:hover {
				background: $bg-button-hover;
				color: $text-white;
			}
		}
	}

	.empty {
		color: $text-muted;
		left: 50%;
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
	}

	.canvas {
		cursor: grab;
		display: block;
		height: 100%;
		inset: 0;
		position: absolute;
		width: 100%;

		&:active {
			cursor: grabbing;
		}

		.edge {
			stroke: $border-strong;
			stroke-width: 1.5;
		}

		.node {
			cursor: pointer;

			circle {
				stroke: $bg-app;
				stroke-width: 2;
				transition: stroke 0.15s;
			}

			.label {
				fill: $text-white;
				font-size: 12px;
				pointer-events: none;
				user-select: none;
			}

			&:hover circle {
				stroke: $text-white;
			}
		}

		.node--server .label {
			font-weight: 600;
		}
	}

	.controls {
		background: $bg-panel;
		border: 1px solid $border;
		border-radius: 10px;
		bottom: 18px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		left: 18px;
		padding: 14px 16px;
		position: absolute;

		.control {
			align-items: center;
			display: flex;
			gap: 12px;
			justify-content: space-between;

			.control-label {
				color: $text-muted;
				font-size: 0.85em;
				width: 68px;
			}

			input[type='range'] {
				accent-color: $color-accent;
				cursor: pointer;
				width: 150px;
			}
		}

		.reset-btn {
			background: $bg-button;
			border: 1px solid $border;
			border-radius: 6px;
			color: $text-muted;
			cursor: pointer;
			font-size: 0.85em;
			margin-top: 2px;
			padding: 6px 10px;
			transition: background 0.15s, color 0.15s;

			&:hover {
				background: $bg-button-hover;
				color: $text-white;
			}
		}
	}
}
</style>
