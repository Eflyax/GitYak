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

		<!-- Empty state – needs init -->
		<div v-else-if="needsInit && !loading" class="commit-history__empty">
			<Icon name="mdi-source-repository" />
			<span>This folder is not a git repository.</span>
			<NButton
				test-id="init-repo-btn"
				type="primary"
				size="small"
				@click="showInitDialog = true"
			>
				Initialize repository
			</NButton>
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
						:is-selected="selectedHashes.includes(commit.hash)"
						@select="handleSelectCommit(commit, $event)"
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

	<ConfirmDialog
		v-model:show="showDeleteStashConfirm"
		title="Delete stash"
		:message="`Delete ${deleteStashId ?? 'stash'}: ${deleteStashSubject}. This cannot be undone.`"
		@confirm="handleConfirmDeleteStash"
	/>

	<ConfirmDialog
		v-model:show="showInitDialog"
		title="Initialize repository"
		message="Default branch: master · README.md will be created · 'Initial commit' will be made."
		@confirm="handleInitRepo"
	/>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, watch, nextTick} from 'vue';
import {NSpin, NButton, useMessage} from 'naive-ui';
import CommitGraph from './CommitGraph.vue';
import CommitRow from './CommitRow.vue';
import CommitRefsRow from './CommitRefsRow.vue';
import Icon from '@/ui/components/Icon.vue';
import ReferenceModal from '@/ui/components/ReferenceModal.vue';
import ConfirmDialog from '@/ui/components/ConfirmDialog.vue';
import {useCommits} from '@/composables/useCommits';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useStash} from '@/composables/useStash';
import {useBranches} from '@/composables/useBranches';
import {useProject} from '@/composables/useProject';
import {useLayout} from '@/composables/useLayout';
import {useContextMenu} from '@/composables/useContextMenu';
import {useGit} from '@/composables/useGit';
import {useListNav} from '@/composables/useListNav';
import type {ICommit} from '@/domain';


const ROW_HEIGHT = 28;
const REFS_WIDTH = 180;

const message = useMessage();
const {commits, selectedHashes, selectCommit, toggleCommitSelection, loadCommits} = useCommits();
const {loadStatus, hasChanges, conflictDetected} = useWorkingTree();
const {loadStashes} = useStash();
const {loadBranches} = useBranches();
const {currentProject} = useProject();
const {loading} = useLayout();
const {stashDrop, isGitRepo, initRepo, writeFile, callGit, commit} = useGit();
const {register, unregister, setActive} = useListNav();

const {
	contextMenuCommit,
	showReferenceModal,
	referenceModalType,
	referenceModalMode,
	referenceModalCommitHash,
	referenceModalInitialName,
	referenceModalStashId,
	showDeleteStashConfirm,
	deleteStashId,
	deleteStashSubject,
} = useContextMenu();

const needsInit = ref(false);
const showInitDialog = ref(false);

async function handleConfirmDeleteStash(): Promise<void> {
	const id = deleteStashId.value;

	if (!id) return;

	await stashDrop(id);
	await Promise.all([loadStashes(), loadCommits()]);
}

async function handleInitRepo(): Promise<void> {
	try {
		await initRepo('master');
		needsInit.value = false;
		await refresh();
	}
	catch (e: unknown) {
		message.error(e instanceof Error ? e.message : 'Failed to initialize repository');
	}
}

// Create the first commit (README named after the project folder) for a repo
// that has none yet — whether freshly `git init`ed here or opened from outside.
async function bootstrapInitialCommit(): Promise<void> {
	const path = currentProject.value?.path ?? '';
	const folderName = path.split('/').filter(Boolean).pop()
		?? currentProject.value?.alias
		?? 'Repository';

	await writeFile('README.md', `# ${folderName}\n`);
	await callGit('add', 'README.md');
	await commit('Initial commit');
}

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

	const repoExists = await isGitRepo();

	if (!repoExists) {
		needsInit.value = true;

		return;
	}

	needsInit.value = false;

	try {
		// A git repo with no commits yet (fresh `git init`) has no HEAD and `git log`
		// would fail → seed it with the initial commit before loading.
		const hasHead = await callGit('rev-parse', '--verify', 'HEAD').then(() => true).catch(() => false);

		if (!hasHead) {
			await bootstrapInitialCommit();
		}

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

function handleSelectCommit(commit: ICommit, event: MouseEvent): void {
	setActive('commits');

	if (event.metaKey || event.ctrlKey) {
		toggleCommitSelection(commit.hash);
	}
	else {
		selectCommit(commit.hash);
	}
}

function scrollCommitIntoView(index: number): void {
	const el = scrollEl.value;

	if (!el) return;

	const top = index * ROW_HEIGHT;
	const bottom = top + ROW_HEIGHT;

	if (top < el.scrollTop) {
		el.scrollTop = top;
	}
	else if (bottom > el.scrollTop + el.clientHeight) {
		el.scrollTop = bottom - el.clientHeight;
	}
}

function moveCommit(delta: number): void {
	const list = visibleCommits.value;

	if (!list.length) return;

	const current = list.findIndex(c => c.hash === selectedHash.value);
	const next = current === -1
		? 0
		: Math.max(0, Math.min(list.length - 1, current + delta));
	const target = list[next];

	if (!target) return;

	selectCommit(target.hash);
	void nextTick(() => scrollCommitIntoView(next));
}

function onContextMenu(commit: ICommit, event: MouseEvent): void {
	if (!selectedHashes.value.includes(commit.hash)) {
		selectCommit(commit.hash);
	}
	contextMenuCommit({e: event, commit});
}

onMounted(() => {
	refresh();
	register('commits', {moveUp: () => moveCommit(-1), moveDown: () => moveCommit(1)});
	setActive('commits');
});

onUnmounted(() => unregister('commits'));

watch(() => currentProject.value, refresh);

watch(commits, newCommits => {
	if (!newCommits.length) {
		return;
	}

	const selectionValid = selectedHashes.value.length > 0 &&
		newCommits.some(c => c.hash === selectedHashes.value[0]);

	if (selectionValid) {
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
