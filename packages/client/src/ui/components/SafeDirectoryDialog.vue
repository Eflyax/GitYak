<template>
	<NModal
		v-model:show="showModel"
		preset="card"
		title="Repository owned by another user"
		style="width: 560px;"
		:mask-closable="false"
	>
		<div
			test-id="safe-directory-dialog"
			class="safe-directory__body"
		>
			<p class="safe-directory__message">
				Git refuses to work in this repository because it belongs to a different user
				than the one running it:
			</p>
			<pre
				test-id="safe-directory-path"
				class="safe-directory__path"
			>{{ path }}</pre>
			<p class="safe-directory__message">
				Adding the exception records the directory as trusted in your global git config
				(<code>safe.directory</code>). Do this only for repositories you trust — on a
				shared machine, anyone who can write there can make git run their code.
			</p>
		</div>

		<template #footer>
			<div class="safe-directory__footer">
				<NButton
					test-id="safe-directory-cancel-btn"
					:disabled="working"
					@click="cancel"
				>
					Cancel
				</NButton>
				<NButton
					test-id="safe-directory-add-btn"
					type="primary"
					:loading="working"
					@click="addException"
				>
					Add exception
				</NButton>
			</div>
		</template>
	</NModal>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {NModal, NButton} from 'naive-ui';
import {useGit} from '@/composables/useGit';
import {useSafeDirectory} from '@/composables/useSafeDirectory';
import {useNotify} from '@/composables/useNotify';

const emit = defineEmits<{
	added: []
}>();

const {show, path, dismiss} = useSafeDirectory();
const {addSafeDirectory} = useGit();
const notify = useNotify();

const working = ref(false);

const showModel = computed({
	get: () => show.value,
	set: value => {
		if (!value) {
			dismiss();
		}
	},
});

function cancel(): void {
	dismiss();
}

async function addException(): Promise<void> {
	const directory = path.value;

	if (!directory) {
		return;
	}

	working.value = true;

	try {
		await addSafeDirectory(directory);
		dismiss();
		notify.success('Repository added to the git safe directories');
		// The commands that were refused are not replayed — one of them may have been a
		// mutation. The repository is simply loaded again now that git will open it.
		emit('added');
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : 'Could not add the exception');
	}
	finally {
		working.value = false;
	}
}
</script>

<style scoped lang="scss">
.safe-directory {
	&__body {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	&__message {
		margin: 0;
		font-size: 13px;
		color: $text-muted;

		code {
			font-family: "JetBrains Mono", "Fira Code", monospace;
			font-size: 11px;
			color: $text-secondary;
		}
	}

	&__path {
		margin: 0;
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 4px;
		color: $text-primary;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		font-size: 11px;
		line-height: 1.5;
		white-space: pre-wrap;
		word-break: break-all;
	}

	&__footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
}
</style>
