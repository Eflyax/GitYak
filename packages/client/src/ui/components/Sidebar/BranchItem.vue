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
		<span
			v-if="trackLabel"
			test-id="branch-track"
			class="branch-item__track"
			:title="trackTitle"
		>{{ trackLabel }}</span>
		<span
			v-else-if="!isRemote && !upstream"
			test-id="branch-no-upstream"
			class="branch-item__track branch-item__track--none"
			title="No upstream branch set"
		>—</span>
		<span
			v-if="isActive"
			class="branch-item__badge"
		>HEAD</span>
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
	upstream?: string
	ahead?: number
	behind?: number
}>();

const emit = defineEmits<{
	select: []
}>();

const {dragSource, startDrag, endDrag} = useDragRef();
const {contextMenuRefDrop} = useContextMenu();

// "↑2 ↓1" — how far the branch has drifted from its upstream. A branch that is level with
// its upstream shows nothing; one without an upstream shows a dash instead.
const trackLabel = computed(() => {
	const
		ahead = props.ahead ?? 0,
		behind = props.behind ?? 0;

	if (!props.upstream || (!ahead && !behind)) {
		return '';
	}

	return [ahead ? `\u2191${ahead}` : '', behind ? `\u2193${behind}` : ''].filter(Boolean).join(' ');
});

const trackTitle = computed(() => {
	const parts = [`Tracking ${props.upstream}`];

	if (props.ahead) parts.push(`${props.ahead} commit(s) to push`);
	if (props.behind) parts.push(`${props.behind} commit(s) to pull`);

	return parts.join(' — ');
});

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

	&__track {
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 600;
		color: $text-muted;
		white-space: nowrap;

		&--none {
			color: $text-ghost;
			font-weight: 400;
		}
	}
}
</style>
