<template>
	<div class="project-item">
		<div class="project-info">
			<span class="project-color-dot" :style="{background: project.color ?? '#6f9ef8'}" />
			<div>
				<div class="project-alias">{{ project.alias }}</div>
				<div class="project-path">{{ project.path }}</div>
			</div>
		</div>
		<div class="project-actions">
			<n-button test-id="project-open-btn" size="small" type="success" @click="emit('open', project)">
				<template #icon><Icon name="mdi-play" /></template>
			</n-button>
			<n-button test-id="project-edit-btn" size="small" type="info" @click="emit('edit', project)">
				<template #icon><Icon name="mdi-pencil" /></template>
			</n-button>
			<n-button test-id="project-duplicate-btn" size="small" @click="emit('duplicate', project)">
				<template #icon><Icon name="mdi-content-copy" /></template>
			</n-button>
			<n-button test-id="project-delete-btn" size="small" type="error" @click="emit('delete', project)">
				<template #icon><Icon name="mdi-trash-can" /></template>
			</n-button>
		</div>
	</div>
</template>

<script lang="ts" setup>
import type {IProject} from '@/domain';
import {NButton} from 'naive-ui';
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

.project-actions {
	display: flex;
	gap: 6px;
	flex-shrink: 0;
}
</style>
