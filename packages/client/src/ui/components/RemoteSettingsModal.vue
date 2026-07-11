<template>
<NModal
	v-model:show="showModel"
	preset="card"
	title="Remote settings"
	style="width: 480px;"
	:mask-closable="false"
	@after-enter="onOpen"
>
	<div class="remote-settings">
		<div v-if="remotes.length > 1" class="remote-settings__field">
			<span class="remote-settings__label">Remote</span>
			<NSelect
				v-model:value="selectedName"
				:options="remoteOptions"
				size="small"
				@update:value="selectRemote"
			/>
		</div>

		<div class="remote-settings__field">
			<span class="remote-settings__label">Name</span>
			<NInput
				test-id="remote-name-input"
				v-model:value="name"
				placeholder="origin"
				size="small"
			/>
		</div>

		<div class="remote-settings__field">
			<span class="remote-settings__label">Pull URL</span>
			<NInput
				test-id="remote-pull-url-input"
				v-model:value="fetchUrl"
				placeholder="git@github.com:user/repo.git"
				size="small"
			/>
		</div>

		<div class="remote-settings__field">
			<span class="remote-settings__label">Push URL</span>
			<NInput
				test-id="remote-push-url-input"
				v-model:value="pushUrl"
				placeholder="Same as Pull URL if left empty"
				size="small"
			/>
		</div>
	</div>

	<template #footer>
		<div class="modal-footer">
			<NButton test-id="remote-settings-cancel-btn" @click="cancel">Cancel</NButton>
			<NButton
				test-id="remote-settings-save-btn"
				type="primary"
				:disabled="!canSave || submitting"
				:loading="submitting"
				@click="save"
			>
				Save
			</NButton>
		</div>
	</template>
</NModal>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {NModal, NInput, NButton, NSelect, useMessage} from 'naive-ui';
import {useGit} from '@/composables/useGit';
import type {IRemoteConfig} from '@/composables/useGit';

const props = defineProps<{
	show: boolean;
}>();

const emit = defineEmits<{
	'update:show': [value: boolean];
	'saved': [];
}>();

const message = useMessage();
const {getRemotes, saveRemote} = useGit();

const remotes = ref<Array<IRemoteConfig>>([]);
const selectedName = ref<string | null>(null);
const originalName = ref<string | null>(null);
const name = ref('');
const fetchUrl = ref('');
const pushUrl = ref('');
const submitting = ref(false);

const showModel = computed({
	get: () => props.show,
	set: value => emit('update:show', value),
});

const remoteOptions = computed(() => remotes.value.map(r => ({label: r.name, value: r.name})));

const canSave = computed(() => name.value.trim().length > 0 && fetchUrl.value.trim().length > 0);

function applyRemote(remote: IRemoteConfig | null): void {
	if (remote) {
		originalName.value = remote.name;
		selectedName.value = remote.name;
		name.value = remote.name;
		fetchUrl.value = remote.fetchUrl;
		// git reports the fetch URL for push too when no separate push URL is set;
		// leave the field showing whatever git has so the user sees the effective value.
		pushUrl.value = remote.pushUrl;
	}
	else {
		originalName.value = null;
		selectedName.value = null;
		name.value = 'origin';
		fetchUrl.value = '';
		pushUrl.value = '';
	}
}

function selectRemote(remoteName: string): void {
	applyRemote(remotes.value.find(r => r.name === remoteName) ?? null);
}

async function onOpen(): Promise<void> {
	try {
		remotes.value = await getRemotes();
	}
	catch {
		remotes.value = [];
	}

	const preferred = remotes.value.find(r => r.name === 'origin') ?? remotes.value[0] ?? null;
	applyRemote(preferred);
}

function cancel(): void {
	emit('update:show', false);
}

async function save(): Promise<void> {
	if (!canSave.value || submitting.value) return;

	submitting.value = true;

	try {
		await saveRemote(originalName.value, name.value.trim(), fetchUrl.value.trim(), pushUrl.value.trim());
		emit('saved');
		emit('update:show', false);
	}
	catch (err: unknown) {
		message.error(err instanceof Error ? err.message : String(err));
	}
	finally {
		submitting.value = false;
	}
}
</script>

<style scoped lang="scss">
.remote-settings {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.remote-settings__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.remote-settings__label {
	font-size: 11px;
	font-weight: 600;
	letter-spacing: 0.3px;
	text-transform: uppercase;
	color: $text-faint;
}

.modal-footer {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
