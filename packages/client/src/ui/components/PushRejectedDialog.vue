<template>
<NModal
	v-model:show="showModel"
	preset="card"
	title="Push rejected"
	style="width: 520px;"
	:mask-closable="false"
>
	<div test-id="push-rejected-dialog" class="push-rejected__body">
		<p class="push-rejected__message">
			The remote branch has changes that you don't have locally. Choose how to proceed:
		</p>
		<ul class="push-rejected__list">
			<li><strong>Force push</strong> — overwrite the remote branch (uses <code>--force-with-lease</code>).</li>
			<li><strong>Pull</strong> — fast-forward only; aborts if a merge would be needed.</li>
			<li><strong>Cancel</strong> — do nothing.</li>
		</ul>
		<pre
			v-if="errorMessage"
			test-id="push-rejected-stderr"
			class="push-rejected__stderr"
		>{{ errorMessage }}</pre>
	</div>

	<template #footer>
		<div class="push-rejected__footer">
			<NButton test-id="push-cancel-btn" @click="cancel">Cancel</NButton>
			<NButton test-id="push-pull-btn" type="info" @click="choose('pull')">Pull (ff-only)</NButton>
			<NButton test-id="push-force-btn" type="error" @click="choose('force')">Force push</NButton>
		</div>
	</template>
</NModal>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {NModal, NButton} from 'naive-ui';

const props = defineProps<{
	show: boolean;
	errorMessage?: string;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
	'choose': [action: 'force' | 'pull'];
}>();

const showModel = computed({
	get: () => props.show,
	set: val => emit('update:show', val),
});

function cancel(): void {
	emit('update:show', false);
}

function choose(action: 'force' | 'pull'): void {
	emit('choose', action);
	emit('update:show', false);
}
</script>

<style scoped lang="scss">
.push-rejected {
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

	&__list {
		margin: 0;
		padding-left: 18px;
		font-size: 12px;
		color: $text-dim;
		line-height: 1.6;

		strong {
			color: $text-primary;
			font-weight: 600;
		}

		code {
			font-family: monospace;
			font-size: 11px;
			color: $text-muted;
		}
	}

	&__stderr {
		margin: 0;
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 4px;
		color: $text-muted;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		max-height: 200px;
		overflow-y: auto;
	}

	&__footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
}
</style>
