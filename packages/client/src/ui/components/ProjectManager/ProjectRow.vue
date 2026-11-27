<template>
	<div
		test-id="project-row"
		class="project-row"
		:class="{'project-row--selected': selected}"
		role="button"
		tabindex="0"
		:aria-pressed="selected"
		:title="`${project.alias} - double-click to open`"
		@click="emit('select', project)"
		@dblclick="emit('open', project)"
		@keydown.enter.prevent="emit('open', project)"
		@keydown.space.prevent="emit('select', project)"
	>
		<span
			class="project-row__dot"
			:style="{background: project.color ?? DEFAULT_COLOR}"
		/>
		<div class="project-row__text">
			<div class="project-row__alias">
				{{ project.alias }}
			</div>
			<div class="project-row__path">
				{{ project.path }}
			</div>
		</div>
		<span
			test-id="project-location-badge"
			class="project-row__badge"
			:class="local ? 'project-row__badge--local' : 'project-row__badge--remote'"
		>
			<Icon :name="local ? 'mdi-laptop' : 'mdi-server'" />
			<span class="project-row__badge-label">{{ connectionLabel(project) }}</span>
		</span>
	</div>
</template>

<script lang="ts" setup>
import {computed} from 'vue';
import type {IProject} from '@/domain';
import {connectionLabel, isLocal} from '@/domain/services/projectManager';
import Icon from '@/ui/components/Icon.vue';

const DEFAULT_COLOR = '#6f9ef8';

const props = defineProps<{
	project: IProject;
	selected: boolean;
}>();

const emit = defineEmits<{
	select: [project: IProject];
	open: [project: IProject];
}>();

const local = computed(() => isLocal(props.project));
</script>

<style lang="scss" scoped>
.project-row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 7px 10px;
	border-radius: 6px;
	border: 1px solid transparent;
	cursor: pointer;
	user-select: none;
	transition: background-color 0.12s, border-color 0.12s;

	&:hover {
		background: $bg-section;
	}

	&:focus-visible {
		outline: none;
		border-color: $border-strong;
	}

	&--selected {
		background: $bg-section;
		border-color: $color-accent;

		&:focus-visible {
			border-color: $color-accent;
		}
	}

	&__dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	&__text {
		flex: 1;
		min-width: 0;
	}

	&__alias {
		font-size: 13px;
		font-weight: 600;
		color: $text-primary;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__path {
		font-size: 11px;
		color: $text-dim;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 1;
		min-width: 0;
		max-width: 45%;
		padding: 2px 7px;
		border-radius: 4px;
		font-size: 11px;

		svg {
			width: 12px;
			height: 12px;
			flex-shrink: 0;
			fill: currentColor;
		}

		&-label {
			min-width: 0;
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		&--local {
			color: $color-success;
			background: color-mix(in srgb, #{$color-success} 14%, transparent);
		}

		&--remote {
			color: $color-accent;
			background: color-mix(in srgb, #{$color-accent} 14%, transparent);
		}
	}
}
</style>
