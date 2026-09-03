<template>
	<n-card
		:title="isEdit ? 'Edit Project' : 'Add Project'"
		:bordered="false"
		size="huge"
		class="project-form"
	>
		<n-form
			label-placement="left"
			label-width="120"
		>
			<n-form-item label="Alias">
				<n-input
					v-model:value="form.alias"
					test-id="alias-input"
					placeholder="My project"
					:maxlength="40"
				/>
			</n-form-item>

			<n-form-item label="Location">
				<n-radio-group v-model:value="isLocal">
					<n-radio-button
						test-id="location-this-pc-radio"
						:value="true"
					>
						<Icon name="mdi-laptop" />
						This PC
					</n-radio-button>
					<n-radio-button
						test-id="location-remote-server-radio"
						:value="false"
					>
						<Icon name="mdi-server" />
						Remote server
					</n-radio-button>
				</n-radio-group>
			</n-form-item>

			<template v-if="!isLocal">
				<n-form-item
					v-if="isTauri"
					label="Connection"
				>
					<n-radio-group v-model:value="form.serverType">
						<n-radio-button :value="EServerType.Bun">
							Bun server
						</n-radio-button>
						<n-radio-button :value="EServerType.SSH">
							SSH
						</n-radio-button>
					</n-radio-group>
				</n-form-item>

				<template v-if="form.serverType === EServerType.Bun">
					<n-form-item label="Server">
						<n-input-group>
							<n-input
								v-model:value="form.server"
								test-id="server-input"
								placeholder="192.168.1.100"
								style="flex: 1;"
							/>
							<n-input-number
								v-model:value="form.port"
								test-id="port-input"
								placeholder="3000"
								:min="1"
								:max="65535"
								style="width: 120px;"
							/>
						</n-input-group>
					</n-form-item>

					<n-form-item
						label="Server token"
						feedback="Only needed for a server exposed beyond localhost."
					>
						<n-input
							v-model:value="form.token"
							test-id="token-input"
							type="password"
							show-password-on="click"
							placeholder="Server token"
							:input-props="{spellcheck: false, autocomplete: 'off'}"
						/>
					</n-form-item>

					<n-form-item label="SSH Private Key">
						<n-input
							v-model:value="form.sshPrivateKey"
							test-id="ssh-key-input"
							type="textarea"
							placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
							:autosize="{minRows: 3, maxRows: 8}"
							:input-props="{spellcheck: false, autocomplete: 'off'}"
						/>
					</n-form-item>
				</template>

				<template v-else>
					<n-form-item label="SSH Host">
						<n-input-group>
							<n-input
								v-model:value="form.server"
								test-id="server-input"
								placeholder="192.168.1.100"
								style="flex: 1;"
							/>
							<n-input-number
								v-model:value="form.port"
								test-id="port-input"
								placeholder="22"
								:min="1"
								:max="65535"
								style="width: 120px;"
							/>
						</n-input-group>
					</n-form-item>

					<n-form-item label="SSH User">
						<n-input
							v-model:value="form.sshUser"
							test-id="ssh-user-input"
							placeholder="root"
						/>
					</n-form-item>

					<n-form-item label="SSH Key Path">
						<n-input-group>
							<n-input
								v-model:value="form.sshKeyPath"
								test-id="ssh-key-path-input"
								placeholder="~/.ssh/id_ed25519"
								style="flex: 1;"
							/>
							<n-button
								v-if="detectedKeys.length > 0"
								ghost
								@click="showKeySelect = true"
							>
								Detected keys
							</n-button>
							<n-button
								ghost
								:loading="detectingKeys"
								@click="detectKeys"
							>
								Detect
							</n-button>
						</n-input-group>
					</n-form-item>

					<n-modal
						v-model:show="showKeySelect"
						title="Select SSH key"
						preset="card"
						style="width: 480px;"
					>
						<n-list bordered>
							<n-list-item
								v-for="key in detectedKeys"
								:key="key"
								style="cursor: pointer;"
								@click="selectKey(key)"
							>
								{{ key }}
							</n-list-item>
						</n-list>
					</n-modal>
				</template>
			</template>

			<n-form-item label="Path">
				<n-input-group>
					<n-input
						test-id="path-input"
						:value="form.path"
						placeholder="/path/to/repo"
						:disabled="form.serverType !== EServerType.SSH"
						style="flex: 1;"
						@update:value="form.path = $event"
					/>
					<n-button
						v-if="form.serverType !== EServerType.SSH"
						test-id="browse-folder-btn"
						type="info"
						ghost
						@click="showBrowser = true"
					>
						Browse…
					</n-button>
				</n-input-group>
			</n-form-item>

			<n-form-item label="Group">
				<n-select
					v-model:value="form.groupId"
					test-id="group-select"
					:options="groupOptions"
					placeholder="No group"
					clearable
				/>
			</n-form-item>

			<n-form-item label="Color">
				<div class="color-picker">
					<button
						v-for="color in PRESET_COLORS"
						:key="color"
						class="color-dot"
						:class="{'color-dot--active': form.color === color}"
						:style="{background: color}"
						@click="form.color = color"
					/>
				</div>
			</n-form-item>
		</n-form>

		<template #footer>
			<div class="form-actions">
				<n-button
					test-id="project-form-cancel-btn"
					@click="emit('cancel')"
				>
					Cancel
				</n-button>
				<n-button
					test-id="project-form-save-btn"
					type="primary"
					:disabled="!form.alias || !form.path"
					@click="handleSave"
				>
					{{ isEdit ? 'Save Changes' : 'Add Project' }}
				</n-button>
			</div>
		</template>
	</n-card>

	<n-modal
		v-model:show="showBrowser"
		title="Select repository folder"
		preset="card"
		style="width: 720px;"
	>
		<FileBrowser
			:server="form.server"
			:port="form.port"
			:initial-path="form.path || '/'"
			@select="onPathSelected"
		/>
	</n-modal>
</template>

<script setup lang="ts">
import {ref, computed, reactive, watch} from 'vue';
import {
	NCard,
	NForm,
	NFormItem,
	NInput,
	NInputGroup,
	NInputNumber,
	NButton,
	NModal,
	NRadioGroup,
	NRadioButton,
	NSelect,
	NList,
	NListItem,
} from 'naive-ui';
import {invoke} from '@tauri-apps/api/core';
import {useProject} from '@/composables/useProject';
import type {IProject} from '@/domain';
import {EServerType} from '@/domain';
import Icon from '@/ui/components/Icon.vue';
import FileBrowser from './FileBrowser.vue';

const DEFAULT_PORT = 3000;
const DEFAULT_SSH_PORT = 22;

const PRESET_COLORS = [
	'#6f9ef8',
	'#f87171',
	'#4ade80',
	'#fb923c',
	'#a78bfa',
	'#34d399',
	'#fbbf24',
	'#f472b6',
] as const;

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

interface IFormData {
	alias: string;
	path: string;
	server: string;
	port: number;
	serverType: EServerType;
	sshUser: string;
	sshKeyPath: string;
	sshPrivateKey: string;
	token: string;
	groupId: string | null;
	color: string;
}

const props = defineProps<{
	project?: IProject | null;
}>();

const emit = defineEmits<{
	saved: [];
	cancel: [];
}>();

const {groups, addProject, updateProject} = useProject();
const showBrowser = ref(false);
const showKeySelect = ref(false);
const detectedKeys = ref<string[]>([]);
const detectingKeys = ref(false);
const isEdit = computed(() => !!props.project?.id);

const isLocal = computed({
	get: () => form.server === 'localhost',
	set: (value: boolean) => {
		form.server = value ? 'localhost' : '';
		form.port = value ? DEFAULT_PORT : DEFAULT_SSH_PORT;
		form.serverType = EServerType.Bun;
	},
});

const groupOptions = computed(() =>
	groups.value.map(g => ({label: g.name, value: g.id})),
);

function makeForm(project?: IProject | null): IFormData {
	return {
		alias: project?.alias ?? '',
		path: project?.path ?? '',
		server: project?.server ?? 'localhost',
		port: project?.port ?? DEFAULT_PORT,
		serverType: project?.serverType ?? EServerType.Bun,
		sshUser: project?.sshUser ?? 'root',
		sshKeyPath: project?.sshKeyPath ?? '',
		sshPrivateKey: project?.sshPrivateKey ?? '',
		token: project?.token ?? '',
		groupId: project?.groupId ?? null,
		color: project?.color ?? PRESET_COLORS[0],
	};
}

const form = reactive<IFormData>(makeForm(props.project));

watch(() => form.serverType, (type) => {
	if (type === EServerType.SSH && form.port === DEFAULT_PORT) {
		form.port = DEFAULT_SSH_PORT;
	}
	else if (type === EServerType.Bun && form.port === DEFAULT_SSH_PORT) {
		form.port = DEFAULT_PORT;
	}
});

watch(() => props.project, (p) => {
	Object.assign(form, makeForm(p));
});

function onPathSelected(path: string): void {
	form.path = path;
	showBrowser.value = false;
}

async function detectKeys(): Promise<void> {
	if (!isTauri) return;

	detectingKeys.value = true;

	try {
		const keys = await invoke<string[]>('detect_ssh_keys');
		detectedKeys.value = keys;

		if (keys.length === 1) {
			form.sshKeyPath = keys[0];
		}
		else if (keys.length > 1) {
			showKeySelect.value = true;
		}
	}
	catch {
		// Ignore
	}
	finally {
		detectingKeys.value = false;
	}
}

function selectKey(key: string): void {
	form.sshKeyPath = key;
	showKeySelect.value = false;
}

function handleSave(): void {
	if (!form.alias || !form.path) return;

	const isSsh = form.serverType === EServerType.SSH;

	const data = {
		alias: form.alias,
		path: form.path,
		server: form.server,
		port: form.port,
		serverType: isTauri ? form.serverType : EServerType.Bun,
		sshUser: isSsh ? (form.sshUser || undefined) : undefined,
		sshKeyPath: isSsh ? (form.sshKeyPath || undefined) : undefined,
		sshPrivateKey: !isSsh ? (form.sshPrivateKey || undefined) : undefined,
		token: form.token || undefined,
		groupId: form.groupId ?? undefined,
		color: form.color,
	};

	if (isEdit.value && props.project) {
		updateProject(props.project.id, data);
	}
	else {
		addProject(data);
	}

	emit('saved');
}
</script>

<style scoped lang="scss">
.project-form {
	min-width: 560px;
}

.form-actions {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}

.color-picker {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.color-dot {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 2px solid transparent;
	cursor: pointer;
	transition: transform 0.15s, border-color 0.15s;

	&:hover {
		transform: scale(1.2);
	}

	&--active {
		border-color: $text-white;
		transform: scale(1.15);
	}
}
</style>
