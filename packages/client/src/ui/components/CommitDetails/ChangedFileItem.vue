<template>
	<div
		class="changed-file"
		test-id="changed-file"
		:class="[`changed-file--${status}`, {'changed-file--active': isSelected}]"
		@click="handleOpen"
	>
		<FileStatus :status="status" />
		<span class="changed-file__path">
			<span class="changed-file__dir">{{ fileDir }}</span>
			<span class="changed-file__name">{{ fileName }}</span>
		</span>
	</div>
</template>

<script setup lang="ts">
import FileStatus from '../FileStatus.vue';
import {computed} from 'vue';
import {EFileStatus} from '@/domain/enums';

const props = defineProps<{
	path: string
	status: EFileStatus
	isSelected?: boolean
}>();

const emit = defineEmits<{
	open: []
}>();

const parts = computed(() => {
	const idx = props.path.lastIndexOf('/');

	return idx >= 0
		? {dir: props.path.slice(0, idx + 1), name: props.path.slice(idx + 1)}
		: {dir: '', name: props.path};
});

const fileDir = computed(() => parts.value.dir);
const fileName = computed(() => parts.value.name);

function handleOpen(): void {
	emit('open');
}
</script>

<style scoped lang="scss">
.changed-file {
	display: flex;
	align-items: center;
	gap: 7px;
	padding: 4px 12px;
	cursor: pointer;
	border-radius: 3px;
	font-size: 12px;

	&:hover {
		background-color: rgba($text-white, 0.05);
	}

	&--active {
		box-shadow: inset 0 0 0 999px rgba(48, 160, 191, 0.35);
	}

	&__path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__dir {
		color: $text-faint;
		font-size: 11.5px;
	}

	&__name {
		color: $text-default;
		font-size: 12px;
	}
}
</style>
