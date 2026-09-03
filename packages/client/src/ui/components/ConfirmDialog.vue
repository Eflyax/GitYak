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
			<div class="confirm-dialog__footer">
				<NButton
					test-id="confirm-dialog-no-btn"
					@click="cancel"
				>
					No
				</NButton>
				<NButton
					test-id="confirm-dialog-yes-btn"
					type="error"
					@click="confirm"
				>
					Yes
				</NButton>
			</div>
		</template>
	</NModal>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {NModal, NButton} from 'naive-ui';

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
</script>

<style scoped lang="scss">
.confirm-dialog__message {
	color: $text-muted;
	font-size: 13px;
	margin: 0;
}

.confirm-dialog__footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
