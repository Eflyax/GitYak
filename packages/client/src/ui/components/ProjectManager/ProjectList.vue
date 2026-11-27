<template>
	<div class="project-list">
		<template
			v-for="section in sections"
			:key="section.id"
		>
			<div
				v-if="section.name"
				class="project-list__group"
			>
				<span
					v-if="section.color"
					class="project-list__group-dot"
					:style="{background: section.color}"
				/>
				<span :class="{'project-list__group-name--dim': !section.color}">{{ section.name }}</span>
			</div>

			<ProjectRow
				v-for="project in section.projects"
				:key="project.id"
				:project="project"
				:selected="project.id === selectedId"
				@select="emit('select', project)"
				@open="emit('open', project)"
			/>
		</template>

		<div
			v-if="projects.length === 0"
			class="project-list__empty"
		>
			{{ emptyText }}
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {IProject, IProjectGroup} from '@/domain';
import ProjectRow from './ProjectRow.vue';

interface ISection {
	id: string;
	/** Empty for the ungrouped projects when there are no groups at all. */
	name: string;
	color?: string;
	projects: Array<IProject>;
}

const GROUP_FALLBACK_COLOR = '#888';

const props = defineProps<{
	projects: ReadonlyArray<IProject>;
	groups: ReadonlyArray<IProjectGroup>;
	selectedId: string | null;
	emptyText: string;
}>();

const emit = defineEmits<{
	select: [project: IProject];
	open: [project: IProject];
}>();

// Groups as headings in their own order, then the projects without a (known) group.
const sections = computed<Array<ISection>>(() => {
	const known = new Set(props.groups.map(g => g.id));
	const result: Array<ISection> = props.groups
		.map(g => ({
			id: g.id,
			name: g.name,
			color: g.color ?? GROUP_FALLBACK_COLOR,
			projects: props.projects.filter(p => p.groupId === g.id),
		}))
		.filter(s => s.projects.length > 0);

	const ungrouped = props.projects.filter(p => !p.groupId || !known.has(p.groupId));

	if (ungrouped.length) {
		result.push({id: '__ungrouped__', name: props.groups.length ? 'Ungrouped' : '', projects: ungrouped});
	}

	return result;
});
</script>

<style scoped lang="scss">
.project-list {
	display: flex;
	flex-direction: column;
	gap: 2px;

	&__group {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 10px 2px;
		font-size: 11px;
		font-weight: 600;
		color: $text-muted;
	}

	&__group-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	&__group-name--dim {
		color: $text-dim;
	}

	&__empty {
		padding: 20px;
		text-align: center;
		color: $text-dim;
		font-size: 0.9em;
	}
}
</style>
