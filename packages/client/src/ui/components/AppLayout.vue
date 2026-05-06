<template>
	<div class="app-layout">
		<ProjectsSidebar />
		<div class="repository">
			 <Toolbar :hide-actions="isVisible" />

			<ProjectManager
				v-if="!currentProject"
			/>

			<ConnectionStatus v-else-if="isVisible" />

			<Splitpanes v-else class="layout-splitpanes">
				<Pane
					:size="sidebarCollapsed ? 2 : 17"
					:min-size="sidebarCollapsed ? 2 : 12"
					:max-size="sidebarCollapsed ? 2 : 30"
					class="pane-sidebar"
				>
					<Sidebar />
				</Pane>

				<Pane
					:size="sidebarCollapsed ? 75 : 60"
					:min-size="30"
					class="pane-center"
				>
					<FileDiff
						v-if="activePath"
						@close="handleClose"
					/>
					<CommitHistory
						v-else
						@open-diff="openFileDiff($event)"
					/>
				</Pane>

				<Pane :size="24" :min-size="18" :max-size="40" class="pane-right">
					<StagingPanel
						v-if="isWorkingTreeSelected"
						@open-diff="openFileDiff($event)"
					/>
					<CommitDetails
						v-else
						@open-diff="openFileDiff($event)"
					/>
				</Pane>
			</Splitpanes>
		</div>
	</div>

	<NDrawer
		v-model:show="showActivityLog"
		:max-width="1000"
		resizable
		placement="right"
	>
		<NDrawerContent title="Activity Log" closable>
			<ActivityLog />
		</NDrawerContent>
	</NDrawer>
</template>

<script setup lang="ts">
import {computed, onMounted, onUnmounted, watch} from 'vue';
import {useWindowFocus} from '@/composables/useWindowFocus';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {NDrawer, NDrawerContent} from 'naive-ui';
import {Splitpanes, Pane} from 'splitpanes';
import Sidebar from './Sidebar/Sidebar.vue';
import CommitHistory from './CommitHistory/CommitHistory.vue';
import CommitDetails from './CommitDetails/CommitDetails.vue';
import FileDiff from './FileDiff/FileDiff.vue';
import StagingPanel from './FileDiff/StagingPanel.vue';
import ProjectsSidebar from './ProjectsSidebar.vue';
import Toolbar from './Toolbar.vue';
import ActivityLog from './ActivityLog/ActivityLog.vue';
import ConnectionStatus from './ConnectionStatus/ConnectionStatus.vue';
import ProjectManager from './ProjectManager/ProjectManager.vue';
import {useProject} from '@/composables/useProject';
import {useCommits} from '@/composables/useCommits';
import {useLayout} from '@/composables/useLayout';
import {useGit} from '@/composables/useGit';
import {useConnectionStatus} from '@/composables/useConnectionStatus';

const {openFileDiff, closeFileDiff, sidebarCollapsed, showActivityLog} = useLayout();
const {isVisible} = useConnectionStatus();
const {activePath} = useGit();

function handleClose(): void {
	activePath.value = null;
	closeFileDiff();
}

const {currentProject, openLastOpenProject} = useProject();
const {selectedHashes} = useCommits();

const isWorkingTreeSelected = computed(() => selectedHashes.value[0] === 'WORKING_TREE' || !selectedHashes.value.length);

const windowFocus = useWindowFocus();
const {loadStatus, status} = useWorkingTree();

onMounted(() => {
	openLastOpenProject();
	windowFocus.onFocus(() => {
		if (!currentProject.value || isVisible.value) {
			return;
		}
		loadStatus();
	});
});

onUnmounted(() => {
	windowFocus.destroy();
});

watch(
	() => status.value.staged.length + status.value.unstaged.length,
	total => {
		if (total === 0 && isWorkingTreeSelected.value && activePath.value && currentProject.value) {
			activePath.value = null;
			closeFileDiff();
		}
	},
);
</script>

<style scoped lang="scss">
.app-layout {
	display: flex;
	height: 100vh;
	overflow: hidden;
	background-color: $bg-app;

	.repository {
		width: 100%;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
}

.layout-splitpanes {
	width: 100%;
	flex: 1;
	min-height: 0;
}

.pane-sidebar {
	background-color: $bg-panel;
	border-right: 1px solid $border;
	overflow: hidden;
}

.pane-center {
	background-color: $bg-app;
	overflow: hidden;
}

.pane-right {
	background-color: $bg-panel;
	border-left: 1px solid $border;
	overflow: hidden;
}

.project-manager {
	margin: 20px auto;
}
</style>
