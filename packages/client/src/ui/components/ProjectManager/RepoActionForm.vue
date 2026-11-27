<template>
	<div
		test-id="repo-action-form"
		class="repo-action-form"
	>
		<div class="repo-action-form__header">
			<Icon
				:name="action.icon"
				class="repo-action-form__icon"
			/>
			<h2 class="repo-action-form__title">
				{{ copy.title }}
			</h2>
		</div>

		<div class="repo-action-form__body">
			<n-form
				label-placement="left"
				label-width="130"
				:disabled="busy"
				@submit.prevent="submit"
			>
				<n-form-item
					v-if="mode === 'clone'"
					label="Repository URL"
					feedback="SSH or HTTPS. On a server, the keys loaded in your local ssh-agent are used."
				>
					<n-input
						v-model:value="url"
						test-id="clone-url-input"
						placeholder="git@github.com:user/repo.git"
						:input-props="{spellcheck: false, autocomplete: 'off'}"
					/>
				</n-form-item>

				<ConnectionFields
					:model-value="connection"
					:hide-details="serverChoice !== NEW_SERVER"
					@update:model-value="onConnectionUpdate"
				>
					<template #server>
						<n-form-item
							v-if="servers.length"
							label="Server"
						>
							<n-select
								:value="serverChoice"
								test-id="server-select"
								:options="serverOptions"
								@update:value="chooseServer"
							/>
						</n-form-item>
					</template>
				</ConnectionFields>

				<n-form-item
					v-if="mode === 'open'"
					label="Folder"
					feedback="Must be a git repository; for a subfolder, the repository it belongs to is added."
				>
					<n-input-group>
						<n-input
							v-model:value="folder"
							test-id="folder-input"
							placeholder="/path/to/repo"
							style="flex: 1;"
						/>
						<n-button
							test-id="browse-folder-btn"
							type="info"
							ghost
							:disabled="!connectionReady"
							@click="showBrowser = true"
						>
							Browse…
						</n-button>
					</n-input-group>
				</n-form-item>

				<template v-else>
					<n-form-item label="Parent folder">
						<n-input-group>
							<n-input
								:value="parent"
								test-id="parent-folder-input"
								placeholder="/path/to/projects"
								style="flex: 1;"
								@update:value="setParent"
							/>
							<n-button
								test-id="browse-folder-btn"
								type="info"
								ghost
								:disabled="!connectionReady"
								@click="showBrowser = true"
							>
								Browse…
							</n-button>
						</n-input-group>
					</n-form-item>

					<n-form-item :label="mode === 'clone' ? 'Folder name' : 'Name'">
						<n-input
							v-model:value="name"
							test-id="folder-name-input"
							:placeholder="mode === 'clone' ? 'From the URL' : 'new-project'"
							:input-props="{spellcheck: false, autocomplete: 'off'}"
						/>
						<template #feedback>
							<span
								v-if="targetPath"
								test-id="target-path-preview"
								class="repo-action-form__preview"
							>
								Creates {{ targetPath }}
							</span>
						</template>
					</n-form-item>

					<n-form-item
						v-if="mode === 'create'"
						label="Initial branch"
						:validation-status="branchValid ? undefined : 'error'"
						:feedback="branchValid ? undefined : 'Not a valid branch name'"
					>
						<n-input
							v-model:value="branch"
							test-id="initial-branch-input"
							placeholder="main"
							:input-props="{spellcheck: false, autocomplete: 'off'}"
						/>
					</n-form-item>
				</template>

				<n-form-item label="Alias">
					<n-input
						v-model:value="alias"
						test-id="alias-input"
						:placeholder="derivedAlias || 'My project'"
						:maxlength="MAX_ALIAS_LENGTH"
					/>
				</n-form-item>
			</n-form>

			<div
				v-if="busy && statusLine"
				:test-id="mode === 'clone' ? 'clone-output' : 'repo-action-status'"
				class="repo-action-form__output"
			>
				<span class="repo-action-form__output-line">{{ statusLine }}</span>
				<span
					v-if="elapsed"
					test-id="repo-action-elapsed"
					class="repo-action-form__elapsed"
				>{{ elapsed }}</span>
			</div>

			<n-alert
				v-if="error"
				test-id="repo-action-error"
				type="error"
				class="repo-action-form__error"
			>
				{{ error }}
			</n-alert>
		</div>

		<div class="repo-action-form__actions">
			<span
				v-if="mode === 'create'"
				test-id="create-commit-note"
				class="repo-action-form__note"
			>
				README.md and an 'Initial commit' will be created on {{ branch.trim() || DEFAULT_BRANCH }}.
			</span>
			<span class="repo-action-form__spacer" />
			<n-button
				v-if="!busy || cancellable"
				test-id="repo-action-cancel"
				@click="cancel"
			>
				Cancel
			</n-button>
			<n-button
				test-id="repo-action-submit"
				type="primary"
				:disabled="!canSubmit"
				:loading="busy"
				@click="submit"
			>
				{{ copy.submit }}
			</n-button>
		</div>
	</div>

	<n-modal
		v-model:show="showBrowser"
		:title="mode === 'open' ? 'Select repository folder' : 'Select parent folder'"
		preset="card"
		style="width: 720px;"
	>
		<FileBrowser
			:connection="connection"
			:initial-path="(mode === 'open' ? folder : parent) || undefined"
			@select="onFolderSelected"
		/>
	</n-modal>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue';
import {NAlert, NButton, NForm, NFormItem, NInput, NInputGroup, NModal, NSelect, useDialog} from 'naive-ui';
import type {DialogReactive} from 'naive-ui';
import {useActivityLog} from '@/composables/useActivityLog';
import {useBrowseHistory} from '@/composables/useBrowseHistory';
import {useProject} from '@/composables/useProject';
import {useProjectManager} from '@/composables/useProjectManager';
import {EServerType} from '@/domain';
import type {IProject} from '@/domain';
import {LOCAL_SERVER} from '@/domain/models/Project';
import type {TProjectConnection} from '@/domain/models/Project';
import {
	connectionKey,
	connectionLabel,
	findProject,
	hasServer,
	isLocal,
	remoteConnections,
	toStoredConnection,
} from '@/domain/services/projectManager';
import {formatElapsed} from '@/domain/services/elapsed';
import {isValidBranchName, joinRepoPath, repoNameFromUrl} from '@/domain/services/repoArgs';
import {
	canCancelClone,
	cloneRepository,
	createRepository,
	resolveRepositoryRoot,
} from '@/application/useCases/repoActions';
import type {IGitProcess, ITransportClient} from '@/infrastructure/ITransportClient';
import {splitOutputLines} from '@/infrastructure/spawnedGit';
import {createTransport, releaseTransport} from '@/infrastructure/transport';
import Icon from '@/ui/components/Icon.vue';
import ConnectionFields from './ConnectionFields.vue';
import FileBrowser from './FileBrowser.vue';
import {REPO_ACTIONS} from './managerPanel';
import type {TRepoActionKind} from './managerPanel';
import {nextPresetColor} from './projectColors';

const NEW_SERVER = 'new';
const MAX_ALIAS_LENGTH = 40;
const DEFAULT_BRANCH = 'main';
const DEFAULT_BUN_PORT = 3000;
const CANCELLED = 'Cancelled';

const COPY: Record<TRepoActionKind, {title: string; submit: string}> = {
	open: {title: 'Open existing repository', submit: 'Add & open'},
	clone: {title: 'Clone repository', submit: 'Clone & open'},
	create: {title: 'Create new repository', submit: 'Create & open'},
};

type TProjectData = Omit<IProject, 'id' | 'order' | 'dateCreated' | 'dateLastOpen'>;

const props = defineProps<{
	mode: TRepoActionKind;
}>();

const emit = defineEmits<{
	done: [project: IProject];
	cancel: [];
}>();

const {projects, addProject} = useProject();
const {opening, openFromManager, setLeaveGuard} = useProjectManager();
const browseHistory = useBrowseHistory();
const dialog = useDialog();
const {addLog} = useActivityLog();

const action = computed(() => REPO_ACTIONS.find(a => a.kind === props.mode) ?? REPO_ACTIONS[0]);
const copy = computed(() => COPY[props.mode]);

// --- Where ---------------------------------------------------------------------------------

const connection = ref<TProjectConnection>({server: LOCAL_SERVER, port: DEFAULT_BUN_PORT, serverType: EServerType.Bun});
const servers = computed(() => remoteConnections(projects.value));
const serverChoice = ref(NEW_SERVER);
// What Location → Remote server gave a new server, restored when "New server…" is chosen again.
let freshRemote: TProjectConnection | null = null;

function serverId(c: TProjectConnection): string {
	return `${connectionKey(c)}|${c.sshKeyPath ?? ''}`;
}

const serverOptions = computed(() => [
	...servers.value.map(c => ({
		label: c.sshKeyPath ? `${connectionLabel(c)} (${c.sshKeyPath})` : connectionLabel(c),
		value: serverId(c),
	})),
	{label: 'New server…', value: NEW_SERVER},
]);

// Switching to a remote server starts on the most recently used one, if any.
function onConnectionUpdate(c: TProjectConnection): void {
	const wasLocal = isLocal(connection.value);

	connection.value = c;

	if (isLocal(c)) {
		serverChoice.value = NEW_SERVER;
	}
	else if (wasLocal) {
		freshRemote = c;
		chooseServer(servers.value[0] ? serverId(servers.value[0]) : NEW_SERVER);
	}
}

function chooseServer(id: string): void {
	serverChoice.value = id;

	if (id === NEW_SERVER) {
		if (freshRemote) connection.value = {...freshRemote};
		return;
	}

	const known = servers.value.find(c => serverId(c) === id);

	if (known) connection.value = {...known};
}

const connectionReady = computed(() => hasServer(connection.value));
// What a project made here would store, and so what lists and the browse history key on.
const storedConnection = computed(() => toStoredConnection(connection.value));

// --- What ----------------------------------------------------------------------------------

const url = ref('');
const folder = ref('');
const branch = ref(DEFAULT_BRANCH);
const showBrowser = ref(false);

// The parent folder starts at the one last used on the connection, until the user picks one.
const parent = ref('');
const parentTouched = ref(false);

function rememberedFolder(): string {
	const start = browseHistory.start(connectionKey(storedConnection.value));

	// With nothing remembered the browser starts at the root; as a target that is no default.
	return start === '/' ? '' : start;
}

watch(() => connectionKey(storedConnection.value), () => {
	if (!parentTouched.value) parent.value = rememberedFolder();
}, {immediate: true});

function setParent(value: string): void {
	parent.value = value;
	parentTouched.value = true;
}

/** A value that follows another field until the user types their own (kept in `custom`). */
function derivedField(derive: () => string) {
	const custom = ref<string | null>(null);
	const value = computed<string>({
		get: () => custom.value ?? derive(),
		set: typed => {
			custom.value = typed;
		},
	});

	return {value, custom};
}

function folderName(path: string): string {
	const trimmed = path.trim().replace(/\/+$/, '');

	return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

const {value: name} = derivedField(() => props.mode === 'clone' ? repoNameFromUrl(url.value) : '');

const derivedAlias = computed(() => (props.mode === 'open' ? folderName(folder.value) : name.value.trim())
	.slice(0, MAX_ALIAS_LENGTH));
const {value: alias, custom: customAlias} = derivedField(() => derivedAlias.value);

const targetPath = computed(() => parent.value.trim() && name.value.trim()
	? joinRepoPath(parent.value.trim(), name.value.trim())
	: '');

const branchValid = computed(() => isValidBranchName(branch.value.trim()));

function onFolderSelected(path: string): void {
	if (props.mode === 'open') {
		folder.value = path;
	}
	else {
		setParent(path);
	}

	showBrowser.value = false;
}

// --- Run -----------------------------------------------------------------------------------

const busy = ref(false);
const error = ref('');
const output = ref('');
const cancellable = ref(false);
// The transport is being made - for a server not connected yet, the SSH provisioning.
const connecting = ref(false);
let running: IGitProcess | null = null;
let unmounted = false;

const statusLine = computed(() => {
	if (connecting.value) return 'Connecting to server…';
	if (props.mode === 'clone') return output.value || 'Cloning…';

	return '';
});

// How long the clone has run, so a long phase without progress never looks frozen.
const startedAt = ref(0);
const now = ref(0);
let ticker: ReturnType<typeof setInterval> | null = null;
const elapsed = computed(() => startedAt.value ? formatElapsed(now.value - startedAt.value) : '');

function startTicker(): void {
	startedAt.value = now.value = Date.now();
	ticker = setInterval(() => {
		now.value = Date.now();
	}, 1000);
}

function stopTicker(): void {
	if (ticker) clearInterval(ticker);
	ticker = null;
	startedAt.value = 0;
}

// While a clone runs, leaving the form (Esc, Back, the rail, another panel or project) asks
// first: unasked, the unmount would cancel it silently.
let leaveDialog: DialogReactive | null = null;

function confirmLeaveClone(): Promise<boolean> {
	const canStop = cancellable.value;

	return new Promise(resolve => {
		leaveDialog = dialog.warning({
			title: 'A clone is running',
			content: canStop
				? 'Cancel it?'
				: 'It cannot be stopped from here: it finishes in the background and the project is added to the list, but not opened. Leave anyway?',
			positiveText: canStop ? 'Cancel clone' : 'Leave',
			negativeText: canStop ? 'Keep cloning' : 'Stay',
			onPositiveClick: () => {
				if (canStop) running?.cancel();
				resolve(true);
			},
			onNegativeClick: () => resolve(false),
			onClose: () => resolve(false),
			onEsc: () => resolve(false),
			onMaskClick: () => resolve(false),
			onAfterLeave: () => {
				leaveDialog = null;
				resolve(false);
			},
		});
	});
}

function releaseLeaveGuard(): void {
	setLeaveGuard(null);
	// The clone is over: a question about leaving it no longer applies.
	leaveDialog?.destroy();
	leaveDialog = null;
}

const fieldsComplete = computed(() => {
	if (props.mode === 'open') return !!folder.value.trim();
	if (props.mode === 'clone') return !!url.value.trim() && !!targetPath.value;

	return !!targetPath.value && branchValid.value;
});

const canSubmit = computed(() => connectionReady.value && fieldsComplete.value && !busy.value && !opening.value);

// Git redraws its progress with `\r`; only the latest non-empty update is worth showing.
function onOutput(text: string): void {
	const last = splitOutputLines(text).map(line => line.trim()).filter(Boolean).pop();

	if (last) output.value = last;
}

// `c` is already the stored connection (`toStoredConnection`). An alias the user did not type
// follows the folder actually added - for Open, the repository root rather than the subfolder.
function toProjectData(c: TProjectConnection, path: string, folderAlias: string): TProjectData {
	return {
		alias: (customAlias.value?.trim() || folderAlias).slice(0, MAX_ALIAS_LENGTH),
		path,
		...c,
		color: nextPresetColor(projects.value.length),
	};
}

// A folder (or the repository it belongs to) that is already in the list is opened, not added twice.
async function openExisting(t: ITransportClient, c: TProjectConnection): Promise<IProject> {
	const typed = folder.value.trim();
	const known = findProject(projects.value, c, typed);

	if (known) return known;

	const root = await resolveRepositoryRoot(t, typed);

	return findProject(projects.value, c, root) ?? addProject(toProjectData(c, root, folderName(root)));
}

// Not fatal for the clone, but worth knowing: the activity log keeps it.
function onCloneWarning(message: string): void {
	addLog({type: 'git', status: 'error', direction: 'response', message});
}

async function cloneNew(t: ITransportClient, c: TProjectConnection): Promise<IProject> {
	const o = {parent: parent.value.trim(), name: name.value.trim(), url: url.value.trim()};

	cancellable.value = canCancelClone(t);
	running = cloneRepository(t, o, onOutput, onCloneWarning);
	setLeaveGuard(confirmLeaveClone);
	startTicker();
	await running.done;
	browseHistory.remember(connectionKey(c), o.parent);

	return addProject(toProjectData(c, joinRepoPath(o.parent, o.name), o.name));
}

async function createNew(t: ITransportClient, c: TProjectConnection): Promise<IProject> {
	const o = {parent: parent.value.trim(), name: name.value.trim(), branch: branch.value.trim()};
	const path = await createRepository(t, o);

	browseHistory.remember(connectionKey(c), o.parent);

	return addProject(toProjectData(c, path, o.name));
}

const RUN: Record<TRepoActionKind, (t: ITransportClient, c: TProjectConnection) => Promise<IProject>> = {
	open: openExisting,
	clone: cloneNew,
	create: createNew,
};

async function submit(): Promise<void> {
	if (!canSubmit.value) return;

	const c = storedConnection.value;
	let transport: ITransportClient | null = null;
	let project: IProject | null = null;

	busy.value = true;
	error.value = '';
	output.value = '';

	try {
		connecting.value = true;
		transport = await createTransport(c);
		connecting.value = false;

		// The form was left while the server was still connecting (an SSH provisioning can take
		// a while). Nothing has happened yet, so nothing happens at all: no clone running unseen,
		// no leave guard left behind by a form that is gone.
		if (unmounted) return;

		project = await RUN[props.mode](transport, c);
	}
	catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);

		if (message !== CANCELLED) error.value = message;
	}
	finally {
		running = null;
		cancellable.value = false;
		connecting.value = false;
		releaseLeaveGuard();
		stopTicker();

		if (transport) releaseTransport(transport);

		busy.value = false;
	}

	// The project stays in the list either way; it is opened only if the form is still showing.
	if (!project || unmounted) return;

	await openFromManager(project);
	emit('done', project);
}

function cancel(): void {
	if (running) {
		running.cancel();
		return;
	}

	if (!busy.value) emit('cancel');
}

// Leaving the form stops a clone that can be stopped - asked first (`confirmLeaveClone`) on
// every way out the manager offers.
onBeforeUnmount(() => {
	unmounted = true;
	running?.cancel();
	releaseLeaveGuard();
	stopTicker();
});
</script>

<style scoped lang="scss">
.repo-action-form {
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

	&__icon {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		fill: $text-dim;
	}

	&__title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: $text-primary;
	}

	&__body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 8px 24px;
	}

	&__preview {
		color: $text-muted;
		word-break: break-all;
	}

	&__output {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin: 0 0 12px 130px;
		padding: 8px 10px;
		border-radius: 6px;
		background: $bg-app;
		color: $text-muted;
		font-family: monospace;
		font-size: 11px;
	}

	&__output-line {
		flex: 1;
		min-width: 0;
		white-space: pre-wrap;
		word-break: break-all;
	}

	&__elapsed {
		flex-shrink: 0;
		color: $text-dim;
		font-variant-numeric: tabular-nums;
	}

	&__error {
		white-space: pre-wrap;
	}

	&__actions {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		border-top: 1px solid $border;
	}

	&__note {
		min-width: 0;
		font-size: 12px;
		color: $text-muted;
	}

	&__spacer {
		flex: 1;
	}
}
</style>
