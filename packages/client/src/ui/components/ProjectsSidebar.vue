<template>
	<div class="projects-sidebar">
		<!-- Open project manager -->
		<n-tooltip
			placement="right"
			:delay="600"
		>
			<template #trigger>
				<n-button
					title="Manage repositories"
					:type="!currentProject ? 'info' : 'default'"
					secondary
					test-id="open-repo-manager-btn"
					class="open-repo-manager"
					@click="showManager = true"
				>
					<Icon name="mdi-source-repository" />
				</n-button>
			</template>
			Manage repositories
		</n-tooltip>

		<!-- Divider -->
		<div
			v-if="projects.length"
			class="divider"
		/>

		<!-- Group filter -->
		<n-tooltip
			placement="right"
			:delay="600"
		>
			<template #trigger>
				<button
					test-id="group-filter-btn"
					class="filter-btn"
					:class="{'filter-btn--active': selectedGroupFilter !== null}"
					@click="showGroupFilter = true"
				>
					<Icon name="mdi-filter-outline" />
				</button>
			</template>
			{{ selectedGroupFilter === null ? 'Filter by group' : 'Group filter active' }}
		</n-tooltip>

		<!-- Project list -->
		<div
			test-id="project-list-sidebar"
			class="project-list"
		>
			<n-tooltip
				v-for="project in filteredProjects"
				:key="project.id"
				placement="right"
				:delay="400"
				:show="tooltipsPinned || undefined"
				:content-style="tooltipContentStyle(project)"
			>
				<template #trigger>
					<button
						test-id="project-btn"
						class="project-btn"
						:class="{'project-btn--active': currentProject?.id === project.id}"
						:style="{'--project-color': project.color ?? '#6f9ef8'}"
						@click="openProject(project)"
					>
						{{ initials(project.alias) }}
					</button>
				</template>
				{{ project.alias }}<br />
				<span style="opacity: 0.6; font-size: 0.85em;">
					{{ project.path }}
				</span>
			</n-tooltip>
		</div>

		<!-- Project Manager modal -->
		<n-modal
			v-model:show="showManager"
			preset="card"
			title="Repositories"
			style="width: 720px;"
		>
			<ProjectManager @project-opened="showManager = false" />
		</n-modal>

		<!-- Group filter modal -->
		<n-modal
			v-model:show="showGroupFilter"
			preset="card"
			title="Filter by group"
			style="width: 320px;"
		>
			<div class="group-filter-list">
				<button
					class="group-filter-item"
					:class="{'group-filter-item--active': selectedGroupFilter === null}"
					@click="selectGroup(null)"
				>
					<span
						class="group-filter-dot"
						style="background: #555"
					/>
					All groups
				</button>
				<button
					v-for="group in groups"
					:key="group.id"
					class="group-filter-item"
					:class="{'group-filter-item--active': selectedGroupFilter === group.id}"
					@click="selectGroup(group.id)"
				>
					<span
						class="group-filter-dot"
						:style="{background: group.color ?? '#888'}"
					/>
					{{ group.name }}
				</button>
				<button
					class="group-filter-item"
					:class="{'group-filter-item--active': selectedGroupFilter === '__ungrouped__'}"
					@click="selectGroup('__ungrouped__')"
				>
					<span
						class="group-filter-dot"
						style="background: #555"
					/>
					Ungrouped
				</button>
			</div>
		</n-modal>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {CSSProperties} from 'vue';
import {NButton, NModal, NTooltip} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import {useLayout} from '@/composables/useLayout';
import Icon from './Icon.vue';
import ProjectManager from './ProjectManager/ProjectManager.vue';

const {projects, groups, currentProject, openProject, selectedGroupFilter} = useProject();
// Alt+T toggles all project tooltips on at once (state lives in useLayout).
const {tooltipsPinned} = useLayout();
const showManager = ref(false);
const showGroupFilter = ref(false);

const PROJECT_FALLBACK_COLOR = '#6f9ef8';

// Style the teleported tooltip content (scoped SCSS can't reach it): center it
// vertically to roughly match the .project-btn height, and border it with the
// project's own color since the button's --project-color var doesn't cascade
// into the teleported node.
function tooltipContentStyle(project: {color?: string}): CSSProperties {
	const color = project.color ?? PROJECT_FALLBACK_COLOR;

	return {
		alignItems: 'flex-start',
		borderLeft: `4px solid ${color}`,
		boxSizing: 'border-box',
		display: 'flex',
		flexDirection: 'column',
		height: '26px',
		justifyContent: 'center',
		lineHeight: '1.1',
		paddingLeft: '7px',
		paddingBottom: '0',
		paddingTop: '0',
	};
}

const filteredProjects = computed(() => {
	const filter = selectedGroupFilter.value;
	if (filter === null) {
		return projects.value;
	}
	if (filter === '__ungrouped__') {
		return projects.value.filter(p => !p.groupId);
	}
	return projects.value.filter(p => p.groupId === filter);
});

watch(selectedGroupFilter, () => {
	const first = filteredProjects.value[0];
	if (first) {
		openProject(first);
	}
});

function selectGroup(value: string | null): void {
	selectedGroupFilter.value = value;
	showGroupFilter.value = false;
}

function initials(alias: string): string {
	const words = alias.trim().split(/\s+/);
	if (words.length >= 2) {
		return (words[0]![0]! + words[1]![0]!).toUpperCase();
	}
	return alias.slice(0, 2).toUpperCase();
}

</script>

<style scoped lang="scss">
.projects-sidebar {
	align-items: center;
	background: $bg-toolbar;
	display: flex;
	flex-direction: column;
	flex-shrink: 0;
	gap: 4px;
	height: 100%;
	max-width: 100%;
	overflow: hidden;
	overflow-x: hidden;
	padding: 4px 0;
	width: 60px;
}

.open-repo-manager {
	flex-shrink: 0;
	height: 50px;
	width: 50px;

	svg {
		height: 22px;
		width: 22px;
	}
}

.divider {
	background: $border-strong;
	height: 1px;
	margin: 2px 0;
	width: 28px;
}

.filter-btn {
	align-items: center;
	background: transparent;
	border: 1px solid transparent;
	border-radius: 8px;
	color: #666;
	cursor: pointer;
	display: flex;
	height: 32px;
	justify-content: center;
	transition: background 0.15s, color 0.15s;
	width: 32px;

	&:hover {
		background: $bg-button-hover;
		color: $text-white;
	}

	&--active {
		border-color: $color-accent;
		color: $color-accent;
	}
}

.group-filter-list {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.group-filter-item {
	align-items: center;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: $text-white;
	cursor: pointer;
	display: flex;
	font-size: 0.9em;
	gap: 10px;
	padding: 8px 12px;
	text-align: left;
	transition: background 0.12s;
	width: 100%;

	&:hover {
		background: $bg-button-hover;
	}

	&--active {
		background: $bg-section;
	}
}

.group-filter-dot {
	border-radius: 50%;
	flex-shrink: 0;
	height: 10px;
	width: 10px;
}

.project-list {
	align-items: center;
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 4px;
	min-height: 0;
	overflow-y: auto;
	padding: 0 4px;
	scrollbar-width: none;
	width: 100%;

	&::-webkit-scrollbar {
		display: none;
	}
}

.project-btn {
	align-items: center;
	background: $bg-button;
	border: 2px solid transparent;
	border-radius: 10px;
	color: var(--project-color, #{$color-accent});
	cursor: pointer;
	display: flex;
	flex-shrink: 0;
	font-size: 1.6em;
	font-weight: 700;
	height: 42px;
	justify-content: center;
	letter-spacing: 0.02em;
	transition: border-radius 0.18s, border-color 0.15s, background 0.15s;
	width: 42px;

	&:hover {
		background: $bg-button-hover;
		border-radius: 14px;
	}

	&--active {
		background: color-mix(in srgb, var(--project-color, #{$color-accent}) 15%, #{$bg-toolbar});
		border-color: var(--project-color, #{$color-accent});
		border-radius: 14px;
	}
}
</style>
