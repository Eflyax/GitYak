<template>
	<div class="toolbar">
		<span class="toolbar__branch-path">
			<template v-if="currentProject && !hideActions">
				<span
					test-id="repo-location"
					class="toolbar__location"
					:class="{'toolbar__location--remote': location.isRemote}"
					:title="location.title"
				>
					<Icon :name="location.icon" />
					{{ location.label }}
				</span>
				<span
					v-if="isReconnecting"
					test-id="reconnecting-indicator"
					class="toolbar__reconnecting"
					title="Connection dropped — reconnecting…"
				>
					<Icon
						name="mdi-loading"
						class="toolbar__reconnecting-icon"
					/>
					Reconnecting…
				</span>
				<span class="toolbar__sep">›</span>
				<span class="toolbar__project">
					{{ currentProject.alias }}
				</span>
				<span class="toolbar__sep">›</span>
				<span class="toolbar__branch">{{ currentBranch?.name }}</span>
			</template>
		</span>

		<div class="toolbar__actions">
			<template v-if="currentProject && !isConnecting && !hideActions">
				<NButton
					v-for="action of actions"
					:key="action.label"
					:test-id="`toolbar-${action.label.toLowerCase()}-btn`"
					class="toolbar__action-btn"
					:title="action.label"
					:disabled="action.disabled || action.loading"
					:loading="action.loading"
					secondary
					size="small"
					@click="action.onClick?.()"
				>
					<div class="content">
						<p>{{ action.label }}</p>
						<Icon :name="action.icon" />
					</div>
				</NButton>
			</template>
		</div>

		<div class="profile">
			<NButton
				text
				title="Activity Log"
				@click="toggleActivityLog"
			>
				<Icon name="mdi-text-box-outline" />
			</NButton>
			<NButton
				text
				test-id="settings"
				title="Settings"
				@click="toggleSettings"
			>
				<Icon name="mdi-cog-outline" />
			</NButton>
			<Icon name="mdi-account" />
		</div>

		<ReferenceModal
			v-model:show="showBranchModal"
			:type="EReferenceModalType.Branch"
			mode="create"
			:commit-hash="selectedHashes[0]"
			@done="loadCommits()"
		/>

		<PushRejectedDialog
			v-model:show="showPushRejectedDialog"
			:error-message="pushRejectedStderr"
			@choose="handlePushRejectedChoice"
		/>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted} from 'vue';
import {NButton} from 'naive-ui';
import {useNotify} from '@/composables/useNotify';
import {useProject} from '@/composables/useProject';
import {useBranches} from '@/composables/useBranches';
import {useGit} from '@/composables/useGit';
import {useCommits} from '@/composables/useCommits';
import {useStash} from '@/composables/useStash';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useLayout} from '@/composables/useLayout';
import {useConnectionStatus} from '@/composables/useConnectionStatus';
import {useCommands} from '@/composables/useCommands';
import ReferenceModal from './ReferenceModal.vue';
import PushRejectedDialog from './PushRejectedDialog.vue';
import {EReferenceModalType, EGitErrorCode, EServerType, GitError} from '@/domain';

const
	{currentProject} = useProject(),
	{currentBranch, loadBranches} = useBranches(),
	{fetch, pull, push, callGit} = useGit(),
	{selectedHashes, loadCommits} = useCommits(),
	{stashes, stashSave, stashPop} = useStash(),
	{loadStatus} = useWorkingTree(),
	{toggleActivityLog, toggleSettings} = useLayout(),
	{isConnecting, isReconnecting} = useConnectionStatus(),
	{registerCommand, unregisterCommand} = useCommands();

const notify = useNotify();
const showBranchModal = ref(false);
const showPushRejectedDialog = ref(false);
const pushRejectedStderr = ref('');
const isFetching = ref(false);
const isPulling = ref(false);
const isPushing = ref(false);

defineProps<{
	hideActions: boolean
}>();

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];

interface IRepoLocation {
	isRemote: boolean;
	icon: string;
	label: string;
	title: string;
}

// Describes where the open repository physically lives — the project record is the
// source of truth, so in web mode "local" means the host running the Bun server.
const location = computed<IRepoLocation>(() => {
	const project = currentProject.value;

	if (!project) {
		return {isRemote: false, icon: 'mdi-laptop', label: 'Local', title: 'Repository on this machine'};
	}

	if (project.serverType === EServerType.SSH) {
		const host = project.sshUser ? `${project.sshUser}@${project.server}` : project.server;
		const label = project.port === 22 ? host : `${host}:${project.port}`;

		return {
			isRemote: true,
			icon: 'mdi-cloud-outline',
			label,
			title: `Repository on remote server over SSH (${project.sshUser ?? ''}@${project.server}:${project.port})`,
		};
	}

	if (LOCAL_HOSTS.includes(project.server)) {
		return {
			isRemote: false,
			icon: 'mdi-laptop',
			label: 'Local',
			title: 'Repository on this machine',
		};
	}

	return {
		isRemote: true,
		icon: 'mdi-server-network',
		label: `${project.server}:${project.port}`,
		title: `Repository on remote server ${project.server}:${project.port}`,
	};
});

async function handleFetch(): Promise<void> {
	isFetching.value = true;

	try {
		await fetch();
		await Promise.all([loadCommits(), loadBranches()]);
		notify.success('Fetch successful');
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}
	finally {
		isFetching.value = false;
	}
}

async function handlePull(): Promise<void> {
	isPulling.value = true;

	try {
		await pull();
		await Promise.all([loadCommits(), loadBranches()]);
		notify.success('Pull successful');
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}
	finally {
		isPulling.value = false;
	}
}

async function handlePush(force = false): Promise<void> {
	isPushing.value = true;

	try {
		await push(undefined, currentBranch.value?.name, force);
		await Promise.all([loadCommits(), loadBranches()]);
		notify.success('Push successful');
	}
	catch (err: unknown) {
		// Authentication or network errors → toast only; force/pull won't help.
		if (
			err instanceof GitError
			&& (err.code === EGitErrorCode.AuthenticationFailed
				|| err.code === EGitErrorCode.NetworkError
				|| err.code === EGitErrorCode.PermissionDenied)
		) {
			notify.error(err.stderr.trim() || err.message);

			return;
		}

		// Push rejected (or unknown failure during push) → show dialog with
		// real stderr so the user can decide whether to force / pull / cancel.
		const stderr = err instanceof GitError
			? err.stderr.trim() || err.message
			: err instanceof Error ? err.message : String(err);

		pushRejectedStderr.value = stderr;
		showPushRejectedDialog.value = true;
	}
	finally {
		isPushing.value = false;
	}
}

async function handlePushRejectedChoice(action: 'force' | 'pull'): Promise<void> {
	if (action === 'force') {
		await handlePush(true);

		return;
	}

	// action === 'pull' → fast-forward only, then retry push
	isPulling.value = true;

	try {
		await callGit('pull', '--ff-only');
		await Promise.all([loadCommits(), loadBranches(), loadStatus()]);
		await handlePush(false);
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}
	finally {
		isPulling.value = false;
	}
}

async function handleStash(): Promise<void> {
	try {
		await stashSave();
		await Promise.all([loadCommits(), loadStatus()]);
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}
}

async function handlePop(): Promise<void> {
	try {
		await stashPop('stash@{0}');
		await Promise.all([loadCommits(), loadStatus()]);
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}
}

const popDisabled = computed(() => stashes.value.length === 0);

const TOOLBAR_COMMAND_IDS = ['fetch', 'pull', 'push', 'stash', 'pop', 'branch'];

onMounted(() => {
	registerCommand({
		id: 'fetch',
		label: 'Fetch',
		action: handleFetch,
		isEnabled: () => !!currentProject.value && !isConnecting.value,
	});
	registerCommand({
		id: 'pull',
		label: 'Pull',
		action: handlePull,
		isEnabled: () => !!currentProject.value && !isConnecting.value,
	});
	registerCommand({
		id: 'push',
		label: 'Push',
		action: handlePush,
		isEnabled: () => !!currentProject.value && !isConnecting.value,
		priority: 1,
	});
	registerCommand({
		id: 'stash',
		label: 'Stash',
		action: handleStash,
		isEnabled: () => !!currentProject.value,
	});
	registerCommand({
		id: 'pop',
		label: 'Pop',
		action: handlePop,
		isEnabled: () => !popDisabled.value,
	});
	registerCommand({
		id: 'branch',
		label: 'New Branch',
		action: () => { showBranchModal.value = true; },
		isEnabled: () => !!currentProject.value,
	});
});

onUnmounted(() => {
	TOOLBAR_COMMAND_IDS.forEach(id => { unregisterCommand(id); });
});

const actions = computed(() => [{
	icon: 'mdi-cloud-download-outline',
	label: 'Fetch',
	loading: isFetching.value,
	onClick: handleFetch,
}, {
	icon: 'mdi-arrow-down-bold',
	label: 'Pull',
	loading: isPulling.value,
	onClick: handlePull,
}, {
	icon: 'mdi-arrow-up-bold',
	label: 'Push',
	loading: isPushing.value,
	onClick: handlePush,
}, {
	icon: 'mdi-source-branch',
	label: 'Branch',
	onClick: () => { showBranchModal.value = true; },
}, {
	icon: 'mdi-archive-arrow-down-outline',
	label: 'Stash',
	disabled: false,
	onClick: handleStash,
}, {
	icon: 'mdi-archive-arrow-up-outline',
	label: 'Pop',
	disabled: popDisabled.value,
	onClick: handlePop,
}]);
</script>

<style scoped lang="scss">
.toolbar {
	display: flex;
	align-items: center;
	position: relative;
	padding: 0 10px;
	height: 50px;
	border-bottom: 1px solid $border;
	flex-shrink: 0;
	background-color: $bg-toolbar;

	.profile {
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-left: auto;
	}

	&__branch-path {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 14px;
	}

	&__location {
		display: flex;
		align-items: center;
		gap: 4px;
		color: $text-muted;
		font-weight: 500;
		white-space: nowrap;

		svg {
			width: 15px;
			height: 15px;
		}

		&--remote {
			color: $color-accent;
		}
	}

	&__project {
		color: $text-muted;
		font-weight: 500;
	}

	&__reconnecting {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 8px;
		color: $color-danger;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
	}

	&__reconnecting-icon {
		width: 13px;
		height: 13px;
		animation: toolbar-spin 1s linear infinite;
	}

	&__sep {
		color: $text-white;
		font-size: 14px;
	}

	&__branch {
		color: $text-primary;
		font-weight: 600;
	}

	&__actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		position: absolute;
		left: 50%;
		transform: translateX(-50%);

		.toolbar__action-btn {
			height: 48px;
			width: 48px;
			background-color: $bg-toolbar;

			&:hover {
				box-shadow: inset 0 0 0 999px rgba(black, 0.3);
			}
		}
	}

	&__action-btn {
		padding: 0 4px;
		color: $text-muted;
		height: 40px;
		width: 40px;

		.content {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			width: 100%;
			gap: 5px;

			p {
				font-size: 11px;
			}

			svg {
				height: 20px;
				width: 20px;
			}
		}

		&:hover {
			color: $text-white;
		}
	}
}

@keyframes toolbar-spin {
	from { transform: rotate(0deg); }
	to { transform: rotate(360deg); }
}
</style>
