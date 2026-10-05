<template>
	<NModal
		v-model:show="showModel"
		preset="card"
		:title="title"
		style="width: 380px;"
		:mask-closable="false"
	>
		<p class="confirm-dialog__message">
			{{ message }}
		</p>

		<template #footer>
			<DialogActions
				:actions="actions"
				:active="show"
			/>
		</template>
	</NModal>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {NModal} from 'naive-ui';
import DialogActions from '@/ui/components/DialogActions.vue';
import type {IDialogAction} from '@/composables/useDialogKeys';

const props = defineProps<{
	show: boolean;
	title: string;
	message: string;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
	'confirm': [];
}>();

const showModel = computed({
	get: () => props.show,
	set: (val) => emit('update:show', val),
});

function cancel(): void {
	emit('update:show', false);
}

function confirm(): void {
	emit('confirm');
	emit('update:show', false);
}

const actions = computed<Array<IDialogAction>>(() => [
	{key: 'n', label: 'No', testId: 'confirm-dialog-no-btn', onSelect: cancel},
	{key: 'y', label: 'Yes', testId: 'confirm-dialog-yes-btn', type: 'error', onSelect: confirm},
]);
</script>

<style scoped lang="scss">
.confirm-dialog__message {
	color: $text-muted;
	font-size: 13px;
	margin: 0;
}
</style>
