<template>
	<n-form-item label="Location">
		<n-radio-group
			:value="local"
			@update:value="setLocal"
		>
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

	<template v-if="!local">
		<!-- A form may offer a choice of known servers here, above the server's own fields. -->
		<slot name="server" />
	</template>

	<template v-if="!local && !hideDetails">
		<n-form-item
			v-if="isTauri"
			label="Connection"
		>
			<n-radio-group
				:value="modelValue.serverType"
				@update:value="setServerType"
			>
				<n-radio-button :value="EServerType.SSH">
					SSH
				</n-radio-button>
				<n-radio-button :value="EServerType.Bun">
					Bun server
				</n-radio-button>
			</n-radio-group>
		</n-form-item>

		<n-form-item :label="isSsh ? 'SSH Host' : 'Server'">
			<n-input-group>
				<n-input
					:value="modelValue.server"
					test-id="server-input"
					placeholder="192.168.1.100"
					style="flex: 1;"
					@update:value="set('server', $event)"
				/>
				<n-input-number
					:value="modelValue.port"
					test-id="port-input"
					:placeholder="String(isSsh ? DEFAULT_SSH_PORT : DEFAULT_BUN_PORT)"
					:min="1"
					:max="65535"
					style="width: 120px;"
					@update:value="set('port', $event ?? (isSsh ? DEFAULT_SSH_PORT : DEFAULT_BUN_PORT))"
				/>
			</n-input-group>
		</n-form-item>

		<template v-if="isSsh">
			<n-form-item label="SSH User">
				<n-input
					:value="modelValue.sshUser ?? ''"
					test-id="ssh-user-input"
					placeholder="root"
					@update:value="set('sshUser', $event)"
				/>
			</n-form-item>

			<n-form-item label="SSH Key Path">
				<n-input-group>
					<n-input
						:value="modelValue.sshKeyPath ?? ''"
						test-id="ssh-key-path-input"
						placeholder="~/.ssh/id_ed25519"
						style="flex: 1;"
						@update:value="set('sshKeyPath', $event)"
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

		<template v-else>
			<n-form-item
				label="Server token"
				feedback="Only needed for a server exposed beyond localhost."
			>
				<n-input
					:value="modelValue.token ?? ''"
					test-id="token-input"
					type="password"
					show-password-on="click"
					placeholder="Server token"
					:input-props="{spellcheck: false, autocomplete: 'off'}"
					@update:value="set('token', $event)"
				/>
			</n-form-item>

			<n-form-item label="SSH Private Key">
				<n-input
					:value="modelValue.sshPrivateKey ?? ''"
					test-id="ssh-key-input"
					type="textarea"
					placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
					:autosize="{minRows: 3, maxRows: 8}"
					:input-props="{spellcheck: false, autocomplete: 'off'}"
					@update:value="set('sshPrivateKey', $event)"
				/>
			</n-form-item>
		</template>
	</template>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue';
import {
	NButton,
	NFormItem,
	NInput,
	NInputGroup,
	NInputNumber,
	NList,
	NListItem,
	NModal,
	NRadioButton,
	NRadioGroup,
} from 'naive-ui';
import {invoke} from '@tauri-apps/api/core';
import {EServerType} from '@/domain';
import {LOCAL_SERVER} from '@/domain/models/Project';
import type {TProjectConnection} from '@/domain/models/Project';
import {isLocal} from '@/domain/services/projectManager';
import {isTauri} from '@/infrastructure/tauri/isTauri';
import Icon from '@/ui/components/Icon.vue';

const DEFAULT_BUN_PORT = 3000;
const DEFAULT_SSH_PORT = 22;

const props = defineProps<{
	modelValue: TProjectConnection;
	/** Hides a remote server's fields, e.g. while a known server is picked in the `server` slot. */
	hideDetails?: boolean;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: TProjectConnection];
}>();

const showKeySelect = ref(false);
const detectedKeys = ref<string[]>([]);
const detectingKeys = ref(false);

const local = computed(() => isLocal(props.modelValue));
const isSsh = computed(() => props.modelValue.serverType === EServerType.SSH);

function update(changes: Partial<TProjectConnection>): void {
	emit('update:modelValue', {...props.modelValue, ...changes});
}

function set<K extends keyof TProjectConnection>(key: K, value: TProjectConnection[K]): void {
	update({[key]: value});
}

// A remote server is reached over SSH from the desktop app; the browser can only talk to a
// Bun server.
function setLocal(value: boolean): void {
	if (value) {
		update({server: LOCAL_SERVER, port: DEFAULT_BUN_PORT, serverType: EServerType.Bun});
		return;
	}

	const serverType = isTauri ? EServerType.SSH : EServerType.Bun;

	update({
		server: '',
		port: serverType === EServerType.SSH ? DEFAULT_SSH_PORT : DEFAULT_BUN_PORT,
		serverType,
	});
}

// The port follows the type only while it is still the other type's default.
function setServerType(type: EServerType): void {
	let port = props.modelValue.port;

	if (type === EServerType.SSH && port === DEFAULT_BUN_PORT) {
		port = DEFAULT_SSH_PORT;
	}
	else if (type === EServerType.Bun && port === DEFAULT_SSH_PORT) {
		port = DEFAULT_BUN_PORT;
	}

	update({serverType: type, port});
}

async function detectKeys(): Promise<void> {
	if (!isTauri) return;

	detectingKeys.value = true;

	try {
		const keys = await invoke<string[]>('detect_ssh_keys');
		detectedKeys.value = keys;

		if (keys.length === 1) {
			set('sshKeyPath', keys[0]);
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
	set('sshKeyPath', key);
	showKeySelect.value = false;
}
</script>
