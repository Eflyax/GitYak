<template>
	<div class="commit-history">
		<!-- Loading overlay -->
		<div v-if="loading && !commits.length" class="commit-history__loading">
			<n-spin size="small" />
		</div>

		<!-- Empty state – no project -->
		<div v-else-if="!currentProject" class="commit-history__empty">
			<Icon name="mdi-source-repository" />
			<span>No repository open</span>
		</div>

		<!-- Empty state – no commits yet -->
		<div v-else-if="!commits.length && !loading" class="commit-history__empty">
			<Icon name="mdi-git" />
			<span>No commits found</span>
		</div>

		<!-- Graph + rows -->
		<div v-else class="commit-history__scroll" ref="scrollEl">
			<div class="commit-history__content" :style="{height: visibleCommits.length * ROW_HEIGHT + 'px'}">
				<!-- References column (LEFT of graph) -->
				<div class="commit-history__refs-col">
					<CommitRefsRow
						v-for="commit in visibleCommits"
						:key="commit.hash"
						:commit="commit"
					/>
				</div>

				<!-- SVG graph overlay -->
				<div class="commit-history__graph-col" :style="{left: REFS_WIDTH + 'px'}">
					<CommitGraph
						:commits="visibleCommits"
						:selected-hash="selectedHash"
					/>
				</div>

				<!-- Commit rows -->
				<div class="commit-history__rows" :style="{marginLeft: totalLeftMargin + 'px'}">
					<CommitRow
						v-for="commit in visibleCommits"
						:key="commit.hash"
						:commit="commit"
						:is-selected="selectedHash === commit.hash"
						@select="handleSelectCommit(commit)"
						@contextmenu="onContextMenu(commit, $event)"
					/>
				</div>
			</div>
		</div>
	</div>

	<ReferenceModal
		v-model:show="showReferenceModal"
		:type="referenceModalType"
		:mode="referenceModalMode"
		:commit-hash="referenceModalCommitHash"
		:initial-name="referenceModalInitialName"
		:stash-id="referenceModalStashId"
		@done="refresh"
	/>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue';
import {NSpin, useMessage} from 'naive-ui';
import CommitGraph from './CommitGraph.vue';
import CommitRow from './CommitRow.vue';
import CommitRefsRow from './CommitRefsRow.vue';
import Icon from '@/ui/components/Icon.vue';
import ReferenceModal from '@/ui/components/ReferenceModal.vue';
import {useCommits} from '@/composables/useCommits';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useStash} from '@/composables/useStash';
import {useBranches} from '@/composables/useBranches';
import {useProject} from '@/composables/useProject';
import {useLayout} from '@/composables/useLayout';
import {useContextMenu} from '@/composables/useContextMenu';
import type {ICommit} from '@/domain';


const ROW_HEIGHT = 28;
const REFS_WIDTH = 180;

const message = useMessage();
const {commits, selectedHashes, selectCommit, loadCommits} = useCommits();
const {loadStatus, hasChanges, conflictDetected} = useWorkingTree();
const {loadStashes} = useStash();
const {loadBranches} = useBranches();
const {currentProject} = useProject();
const {loading} = useLayout();

const {
	contextMenuCommit,
	showReferenceModal,
	referenceModalType,
	referenceModalMode,
	referenceModalCommitHash,
	referenceModalInitialName,
	referenceModalStashId,
} = useContextMenu();

const scrollEl = ref<HTMLElement | null>(null);

const visibleCommits = computed((): ICommit[] => {
	const showWorkingTree = hasChanges.value || conflictDetected.value;
	const filtered = showWorkingTree
		? commits.value
		: commits.value.filter(c => c.hash !== 'WORKING_TREE');

	return filtered.map((c, i) => ({...c, index: i}));
});

// First selected hash → drives graph highlight and row selection
const selectedHash = computed(() => selectedHashes.value[0]);

const graphWidth = computed(() => {
	if (!visibleCommits.value.length) return 0;
	const maxLevel = Math.max(...visibleCommits.value.map(c => c.level ?? 0));

	return (maxLevel + 1) * 20 + 12 + 16 + 4;
});

const totalLeftMargin = computed(() => REFS_WIDTH + graphWidth.value);

async function refresh(): Promise<void> {
	if (!currentProject.value) {
		return;
	}

	try {
		await Promise.all([
			loadStatus(),
			loadStashes(),
			loadBranches(),
			loadCommits(),
		]);
	}
	catch (e: unknown) {
		message.error(e instanceof Error ? e.message : 'Failed to load repository data');
	}
}

function handleSelectCommit(commit: ICommit): void {
	selectCommit(commit.hash);
}

function onContextMenu(commit: ICommit, event: MouseEvent): void {
	contextMenuCommit({e: event, commit});
}

onMounted(refresh);

watch(() => currentProject.value, refresh);

watch(commits, newCommits => {
	if (!newCommits.length || selectedHashes.value.length) {
		return;
	}

	const firstCommit = newCommits.find(c => c.hash !== 'WORKING_TREE' && !c.isStash);

	selectCommit(firstCommit ? firstCommit.hash : 'WORKING_TREE');
}, {immediate: false});
</script>

<style scoped lang="scss">
.commit-history {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
	background-color: $bg-app;

	&__scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	&__content {
		position: relative;
	}

	&__refs-col {
		position: absolute;
		top: 0;
		left: 0;
		width: 180px;
		z-index: 1;
	}

	&__graph-col {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
	}

	&__rows {
		width: 100%;
	}

	&__loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #555;
	}

	&__empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: #3a3f48;
		font-size: 0.85em;

		svg {
			width: 32px;
			height: 32px;
			opacity: 0.4;
		}
	}
}
</style>
