<template>
	<div
		test-id="branch-item-select"
		class="branch-item"
		:class="{
			'branch-item--active': isActive,
			'branch-item--remote': isRemote,
		}"
		draggable="true"
		@click="emit('select')"
		@dragstart.stop="onDragStart"
		@dragover.prevent="onDragOver"
		@dragleave="onDragLeave"
		@drop.stop.prevent="onDrop"
	>
		<Icon :name="isRemote ? 'mdi-cloud-outline' : 'mdi-laptop'" />
		<span class="branch-item__name">{{ displayName }}</span>
		<span v-if="isActive" class="branch-item__badge">HEAD</span>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import Icon from '@/ui/components/Icon.vue';
import {useDragRef} from '@/composables/useDragRef';
import {useContextMenu} from '@/composables/useContextMenu';

const props = defineProps<{
	name: string
	color: string
	isActive?: boolean
	isRemote?: boolean
}>();

const emit = defineEmits<{
	select: []
}>();

const {dragSource, startDrag, endDrag} = useDragRef();
const {contextMenuRefDrop} = useContextMenu();

const displayName = computed(() => {
	if (props.isRemote) {
		return props.name.replace(/^origin\//, '');
	}

	return props.name;
});

function onDragStart(e: DragEvent): void {
	startDrag({type: 'branch', name: props.name});

	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', props.name);
	}
}

function onDragOver(e: DragEvent): void {
	if (!dragSource.value) return;
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	(e.currentTarget as HTMLElement).classList.add('branch-item--drop-target');
}

function onDragLeave(e: DragEvent): void {
	(e.currentTarget as HTMLElement).classList.remove('branch-item--drop-target');
}

function onDrop(e: DragEvent): void {
	(e.currentTarget as HTMLElement).classList.remove('branch-item--drop-target');

	const src = dragSource.value;

	endDrag();

	if (!src) return;

	contextMenuRefDrop(e, src.name, props.name);
}
</script>

<style scoped lang="scss">
.branch-item {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 3px 8px 3px 20px;
	cursor: pointer;
	border-radius: 3px;
	font-size: 12.5px;
	color: $text-muted;
	white-space: nowrap;
	overflow: hidden;

	&:hover {
		background-color: rgba($text-white, 0.05);
		color: $text-secondary;
	}

	&--active {
		color: $text-primary;
		font-weight: 500;
	}

	&--drop-target {
		outline: 2px dashed $color-accent;
		outline-offset: -2px;
	}

	&__name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__badge {
		flex-shrink: 0;
		font-size: 10px;
		padding: 1px 5px;
		border-radius: 3px;
		background: rgba($color-accent, 0.2);
		color: $color-accent;
		font-weight: 600;
		letter-spacing: 0.3px;
	}
}
</style>
