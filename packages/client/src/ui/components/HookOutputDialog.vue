<template>
	<NModal
		v-model:show="showModel"
		preset="card"
		:title="title"
		style="width: 560px;"
	>
		<div
			test-id="hook-output-dialog"
			class="hook-output__body"
		>
			<p class="hook-output__message">
				{{ success ? 'Commit succeeded. Hook output:' : 'Commit failed — the pre-commit hook reported:' }}
			</p>
			<pre
				test-id="hook-output-text"
				class="hook-output__text"
			>{{ output }}</pre>
		</div>

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
	success: boolean;
	output: string;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
}>();

const showModel = computed({
	get: () => props.show,
	set: value => emit('update:show', value),
});

const title = computed<string>(() => (props.success ? 'Commit complete' : 'Commit failed'));

function close(): void {
	emit('update:show', false);
}

const actions = computed<Array<IDialogAction>>(() => [
	{key: 'c', label: 'Close', testId: 'hook-output-close-btn', onSelect: close},
]);
</script>

<style scoped lang="scss">
.hook-output {
	&__body {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	&__message {
		margin: 0;
		font-size: 13px;
		color: $text-muted;
	}

	&__text {
		margin: 0;
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 4px;
		color: $text-muted;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		max-height: 320px;
		overflow-y: auto;
	}

}
</style>
