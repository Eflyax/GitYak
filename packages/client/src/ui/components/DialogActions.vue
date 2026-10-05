<template>
	<div class="dialog-actions">
		<NButton
			v-for="action in actions"
			:key="action.key"
			:test-id="action.testId"
			:type="action.type"
			:disabled="action.disabled"
			:loading="action.loading"
			@click="action.onSelect"
		>
			{{ action.label }}
			<span class="dialog-actions__key">({{ action.key.toUpperCase() }})</span>
		</NButton>
	</div>
</template>

<script setup lang="ts">
import {toRef} from 'vue';
import {NButton} from 'naive-ui';
import {useDialogKeys} from '@/composables/useDialogKeys';
import type {IDialogAction} from '@/composables/useDialogKeys';

const props = defineProps<{
	actions: Array<IDialogAction>;
	/** Whether the dialog these actions belong to is open — only then do the keys listen. */
	active: boolean;
}>();

useDialogKeys(toRef(props, 'active'), () => props.actions);
</script>

<style scoped lang="scss">
.dialog-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;

	// The hint has to stay legible on a coloured button too, so it dims the button's own
	// text colour rather than reaching for a fixed muted token.
	&__key {
		margin-left: 6px;
		color: inherit;
		opacity: 0.65;
		font-family: monospace;
		font-size: 11px;
	}
}
</style>
