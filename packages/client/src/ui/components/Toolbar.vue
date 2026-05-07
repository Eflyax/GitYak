<template>
<div class="toolbar">
	<span class="toolbar__branch-path">
		<template v-if="currentProject && !hideActions">
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
		<NButton text title="Activity Log" @click="toggleActivityLog">
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
</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {NButton, useNotification} from 'naive-ui';
import {useProject} from '@/composables/useProject';
import {useBranches} from '@/composables/useBranches';
import {useGit} from '@/composables/useGit';
import {useCommits} from '@/composables/useCommits';
import {useStash} from '@/composables/useStash';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useLayout} from '@/composables/useLayout';
import {useConnectionStatus} from '@/composables/useConnectionStatus';
import ReferenceModal from './ReferenceModal.vue';
import {EReferenceModalType} from '@/domain';

const
	{currentProject} = useProject(),
	{currentBranch, loadBranches} = useBranches(),
	{pull, push} = useGit(),
	{selectedHashes, loadCommits} = useCommits(),
	{stashes, stashSave, stashPop} = useStash(),
	{loadStatus} = useWorkingTree(),
	{toggleActivityLog, toggleSettings} = useLayout(),
	{isConnecting} = useConnectionStatus();

const notification = useNotification();
const showBranchModal = ref(false);
const isPulling = ref(false);
const isPushing = ref(false);

defineProps<{
	hideActions: Boolean
}>();

async function handlePull(): Promise<void> {
	isPulling.value = true;

	try {
		await pull();
		await Promise.all([loadCommits(), loadBranches()]);
		notification.success({content: 'Pull successful', duration: 3000});
	}
	catch (err: unknown) {
		notification.error({content: err instanceof Error ? err.message : String(err), duration: 5000});
	}
	finally {
		isPulling.value = false;
	}
}

async function handlePush(): Promise<void> {
	isPushing.value = true;

	try {
		await push();
		await Promise.all([loadCommits(), loadBranches()]);
		notification.success({content: 'Push successful', duration: 3000});
	}
	catch (err: unknown) {
		notification.error({content: err instanceof Error ? err.message : String(err), duration: 5000});
	}
	finally {
		isPushing.value = false;
	}
}

async function handleStash(): Promise<void> {
	try {
		await stashSave();
		await Promise.all([loadCommits(), loadStatus()]);
	}
	catch (err: unknown) {
		notification.error({content: err instanceof Error ? err.message : String(err), duration: 5000});
	}
}

async function handlePop(): Promise<void> {
	try {
		await stashPop('stash@{0}');
		await Promise.all([loadCommits(), loadStatus()]);
	}
	catch (err: unknown) {
		notification.error({content: err instanceof Error ? err.message : String(err), duration: 5000});
	}
}

const popDisabled = computed(() => stashes.value.length === 0);

const actions = computed(() => [{
	icon: "mdi-arrow-down-bold",
	label: "Pull",
	loading: isPulling.value,
	onClick: handlePull,
}, {
	icon: "mdi-arrow-up-bold",
	label: "Push",
	loading: isPushing.value,
	onClick: handlePush,
}, {
	icon: "mdi-source-branch",
	label: "Branch",
	onClick: () => { showBranchModal.value = true; },
}, {
	icon: "mdi-archive-arrow-down-outline",
	label: "Stash",
	disabled: false,
	onClick: handleStash,
}, {
	icon: "mdi-archive-arrow-up-outline",
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

	&__project {
		color: $text-muted;
		font-weight: 500;
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
</style>
