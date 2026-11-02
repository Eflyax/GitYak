<template>
	<div class="project-item">
		<div class="project-info">
			<span
				class="project-color-dot"
				:style="{background: project.color ?? '#6f9ef8'}"
			/>
			<div class="project-text">
				<div class="project-alias">
					{{ project.alias }}
				</div>
				<div class="project-path">
					{{ project.path }}
				</div>
			</div>
		</div>
		<div class="project-actions">
			<button
				test-id="project-open-btn"
				class="project-action project-action--open"
				title="Open"
				@click="emit('open', project)"
			>
				<Icon name="mdi-play" />
			</button>
			<button
				test-id="project-edit-btn"
				class="project-action project-action--edit"
				title="Edit"
				@click="emit('edit', project)"
			>
				<Icon name="mdi-pencil" />
			</button>
			<button
				test-id="project-duplicate-btn"
				class="project-action project-action--duplicate"
				title="Duplicate"
				@click="emit('duplicate', project)"
			>
				<Icon name="mdi-content-copy" />
			</button>
			<button
				test-id="project-delete-btn"
				class="project-action project-action--delete"
				title="Delete"
				@click="emit('delete', project)"
			>
				<Icon name="mdi-trash-can" />
			</button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import type {IProject} from '@/domain';
import Icon from '@/ui/components/Icon.vue';

defineProps<{
	project: IProject;
}>();

const emit = defineEmits<{
	open: [project: IProject];
	edit: [project: IProject];
	duplicate: [project: IProject];
	delete: [project: IProject];
}>();
</script>

<style lang="scss" scoped>
// These rules used to live in ProjectManager, where scoped CSS could not reach past this
// component's root — which is why the colour dot never showed up.
.project-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 8px 10px;
	border-radius: 6px;
	background: $bg-section;
	border: 1px solid transparent;
	transition: border-color 0.15s;

	&:hover { border-color: $border-strong; }
}

.project-info {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.project-color-dot {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	flex-shrink: 0;
}

.project-text {
	min-width: 0;
}

.project-alias {
	font-size: 13px;
	font-weight: 600;
	color: $text-primary;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.project-path {
	font-size: 11px;
	color: $text-dim;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 340px;
}

.project-actions {
	display: flex;
	gap: 2px;
	flex-shrink: 0;
}

// Quiet in rest, like the toolbar and sidebar icons: the action's colour appears only
// under the pointer, where it says what the button would do.
.project-action {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border: none;
	border-radius: 4px;
	background: transparent;
	color: $text-muted;
	cursor: pointer;
	transition: background-color 0.15s, color 0.15s;

	// The global `svg { fill: $text-primary }` would otherwise ignore the button's colour.
	:deep(svg) {
		fill: currentColor;
	}

	&:hover {
		background-color: $bg-hover;
	}

	&:focus-visible {
		outline: 1px solid $color-accent;
		outline-offset: -1px;
	}

	&--open:hover { color: $color-success; }
	&--edit:hover { color: $color-accent; }
	&--duplicate:hover { color: $text-primary; }
	&--delete:hover { color: $color-danger; }
}
</style>
