<template>
	<div class="project-form">
		<div class="project-form__header">
			<span
				class="project-form__dot"
				:style="{background: form.color}"
			/>
			<h2 class="project-form__title">
				{{ title }}
			</h2>
		</div>

		<div class="project-form__body">
			<n-form
				label-placement="left"
				label-width="130"
			>
				<n-form-item label="Alias">
					<n-input
						v-model:value="form.alias"
						test-id="alias-input"
						placeholder="My project"
						:maxlength="40"
					/>
				</n-form-item>

				<ConnectionFields v-model="connection" />

				<n-form-item label="Path">
					<n-input-group>
						<n-input
							v-model:value="form.path"
							test-id="path-input"
							placeholder="/path/to/repo"
							style="flex: 1;"
						/>
						<n-button
							test-id="browse-folder-btn"
							type="info"
							ghost
							:disabled="!hasServer(connection)"
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

				<n-form-item
					label="Commit template"
					feedback="Replaces the global commit template from Settings. Leave empty to use the global one."
				>
					<n-input
						v-model:value="form.commitTemplate"
						test-id="project-commit-template-input"
						:placeholder="globalCommitTemplate ? `Global: ${globalCommitTemplate}` : 'e.g. [IMP] '"
					/>
				</n-form-item>

				<n-form-item
					label="Branch templates"
					feedback="Offered when naming a branch, before the global templates from Settings."
				>
					<n-dynamic-tags
						v-model:value="form.branchTemplates"
						test-id="project-branch-templates-input"
					/>
				</n-form-item>

				<n-form-item label="Color">
					<div class="color-picker">
						<button
							v-for="color in PRESET_COLORS"
							:key="color"
							type="button"
							class="color-dot"
							:class="{'color-dot--active': form.color === color}"
							:style="{background: color}"
							:title="color"
							@click="form.color = color"
						/>
					</div>
				</n-form-item>
			</n-form>
		</div>

		<div class="project-form__actions">
			<template v-if="project">
				<n-button
					test-id="project-form-remove-btn"
					type="error"
					quaternary
					@click="confirmRemove"
				>
					<template #icon>
						<Icon name="mdi-trash-can-outline" />
					</template>
					Remove
				</n-button>
				<span class="project-form__spacer" />
				<n-button
					test-id="project-form-duplicate-btn"
					@click="emit('duplicate', project)"
				>
					<template #icon>
						<Icon name="mdi-content-copy" />
					</template>
					Duplicate
				</n-button>
				<n-button
					test-id="project-form-save-btn"
					:disabled="!isValid || !isDirty"
					@click="handleSave"
				>
					Save
				</n-button>
				<n-button
					test-id="project-form-open-btn"
					type="primary"
					:disabled="!isValid"
					:loading="opening"
					@click="handleOpen"
				>
					<template #icon>
						<Icon name="mdi-play" />
					</template>
					Open
				</n-button>
			</template>

			<template v-else>
				<span class="project-form__spacer" />
				<n-button
					test-id="project-form-save-btn"
					type="primary"
					:disabled="!isValid"
					@click="handleSave"
				>
					Add project
				</n-button>
			</template>
		</div>
	</div>

	<n-modal
		v-model:show="showBrowser"
		title="Select repository folder"
		preset="card"
		style="width: 720px;"
	>
		<FileBrowser
			:connection="connection"
			:initial-path="form.path"
			@select="onPathSelected"
		/>
	</n-modal>
</template>

<script setup lang="ts">
import {ref, computed, reactive, watch} from 'vue';
import {
	NForm,
	NFormItem,
	NInput,
	NInputGroup,
	NButton,
	NDynamicTags,
	NModal,
	NSelect,
	useDialog,
} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import {useTemplates} from '@/composables/useTemplates';
import {normalizeTemplates} from '@/domain/services/templates';
import {hasServer, toStoredConnection} from '@/domain/services/projectManager';
import type {IProject} from '@/domain';
import {EServerType} from '@/domain';
import {LOCAL_SERVER} from '@/domain/models/Project';
import type {TProjectConnection} from '@/domain/models/Project';
import Icon from '@/ui/components/Icon.vue';
import ConnectionFields from './ConnectionFields.vue';
import FileBrowser from './FileBrowser.vue';
import {PRESET_COLORS} from './projectColors';

const DEFAULT_PORT = 3000;

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
	commitTemplate: string;
	branchTemplates: Array<string>;
}

type TProjectData = Omit<IProject, 'id' | 'order' | 'dateCreated' | 'dateLastOpen'>;

const props = defineProps<{
	/** The project being edited; null while a copy of `duplicateOf` is being prepared. */
	project: IProject | null;
	duplicateOf?: IProject;
	/** A project opened from the manager is still connecting. */
	opening?: boolean;
}>();

const emit = defineEmits<{
	saved: [project: IProject];
	duplicate: [project: IProject];
	open: [project: IProject];
	removed: [];
}>();

const dialog = useDialog();
const {groups, addProject, updateProject, removeProject} = useProject();
const {globalCommitTemplate} = useTemplates();
const showBrowser = ref(false);

const groupOptions = computed(() =>
	groups.value.map(g => ({label: g.name, value: g.id})),
);

function makeForm(project?: IProject | null): IFormData {
	return {
		alias: project?.alias ?? '',
		path: project?.path ?? '',
		server: project?.server ?? LOCAL_SERVER,
		port: project?.port ?? DEFAULT_PORT,
		serverType: project?.serverType ?? EServerType.Bun,
		sshUser: project?.sshUser ?? 'root',
		sshKeyPath: project?.sshKeyPath ?? '',
		sshPrivateKey: project?.sshPrivateKey ?? '',
		token: project?.token ?? '',
		groupId: project?.groupId ?? null,
		color: project?.color ?? PRESET_COLORS[0],
		commitTemplate: project?.commitTemplate ?? '',
		branchTemplates: [...(project?.branchTemplates ?? [])],
	};
}

function initialForm(): IFormData {
	if (props.project) {
		return makeForm(props.project);
	}

	const form = makeForm(props.duplicateOf);

	if (props.duplicateOf) {
		form.alias = `${props.duplicateOf.alias} (copy)`.slice(0, 40);
	}

	return form;
}

function formConnection(f: IFormData): TProjectConnection {
	return {
		server: f.server,
		port: f.port,
		serverType: f.serverType,
		sshUser: f.sshUser,
		sshKeyPath: f.sshKeyPath,
		sshPrivateKey: f.sshPrivateKey,
		token: f.token,
	};
}

function toProjectData(f: IFormData): TProjectData {
	return {
		alias: f.alias,
		path: f.path,
		...toStoredConnection(formConnection(f)),
		groupId: f.groupId ?? undefined,
		color: f.color,
		commitTemplate: f.commitTemplate || undefined,
		branchTemplates: normalizeTemplates(f.branchTemplates),
	};
}

const form = reactive<IFormData>(initialForm());
// What Save would write if nothing were changed; a form equal to it has nothing to save.
const baseline = ref(JSON.stringify(toProjectData(form)));

watch(() => [props.project, props.duplicateOf], () => {
	Object.assign(form, initialForm());
	baseline.value = JSON.stringify(toProjectData(form));
});

const connection = computed<TProjectConnection>({
	get: () => formConnection(form),
	set: c => {
		form.server = c.server;
		form.port = c.port;
		form.serverType = c.serverType;
		form.sshUser = c.sshUser ?? '';
		form.sshKeyPath = c.sshKeyPath ?? '';
		form.sshPrivateKey = c.sshPrivateKey ?? '';
		form.token = c.token ?? '';
	},
});

const title = computed(() => {
	if (props.project) {
		return props.project.alias;
	}

	return props.duplicateOf ? `Copy of ${props.duplicateOf.alias}` : 'New project';
});

const isValid = computed(() => !!form.alias && !!form.path && hasServer(connection.value));
const isDirty = computed(() => JSON.stringify(toProjectData(form)) !== baseline.value);

function onPathSelected(path: string): void {
	form.path = path;
	showBrowser.value = false;
}

function save(): IProject | null {
	if (!isValid.value) return null;

	const data = toProjectData(form);

	if (props.project) {
		return updateProject(props.project.id, data);
	}

	return addProject(data);
}

function handleSave(): void {
	const saved = save();

	if (saved) {
		emit('saved', saved);
	}
}

// Open takes what the form shows: unsaved changes are saved first rather than dropped.
function handleOpen(): void {
	if (!props.project || props.opening) return;

	const project = isDirty.value ? save() : props.project;

	if (project) {
		emit('open', project);
	}
}

function confirmRemove(): void {
	const project = props.project;

	if (!project) return;

	dialog.warning({
		title: 'Remove Project',
		content: `Remove "${project.alias}" from the list? The repository will not be deleted from disk.`,
		positiveText: 'Remove',
		negativeText: 'Cancel',
		onPositiveClick: () => {
			removeProject(project.id);
			emit('removed');
		},
	});
}
</script>

<style scoped lang="scss">
// About as wide as the old dialog: a wider window gives the list more room, not the fields.
.project-form {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	max-width: 600px;

	&__header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 18px 24px 12px;
	}

	&__dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	&__title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: $text-primary;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 8px 24px;
	}

	&__actions {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border-top: 1px solid $border;
	}

	&__spacer {
		flex: 1;
	}
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
