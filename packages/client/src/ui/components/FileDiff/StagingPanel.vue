<template>
	<div class="staging-panel">
		<!-- Header -->
		<div class="staging-panel__header">
			<NButton
				test-id="discard-all-btn"
				size="tiny"
				type="error"
				ghost
				title="Discard all changes"
				@click="showDiscardConfirm = true"
			>
				<template #icon><Icon name="mdi-trash-can" /></template>
			</NButton>
			<span class="staging-panel__branch-info">
				<span>{{ totalCount }} file changes<template v-if="currentBranch"> on <strong>{{ currentBranch.name }}</strong></template></span>
			</span>
		</div>

		<!-- File sections (scrollable) -->
		<div class="staging-panel__files">
			<!-- Unstaged files -->
			<div class="staging-panel__section">
				<div
					class="staging-panel__section-header"
				>
					<div test-id="unstaged-section-header" @click="unstagedExpanded = !unstagedExpanded">
						<svg
							class="staging-panel__chevron"
							:class="{'staging-panel__chevron--open': unstagedExpanded}"
							width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
						>
							<path d="M7 10l5 5 5-5z"/>
						</svg>
						<span>{{ conflictDetected ? 'Conflicted Files' : 'Unstaged Files' }} ({{ unstagedFiles.length }})</span>
					</div>
					<NButton
						test-id="stage-all-btn"
						v-if="unstagedFiles.length"
						class="staging-panel__stage-all"
						size="tiny"
						:type="conflictDetected ? 'warning' : 'success'"
						secondary
						@click="handleStageAll"
					>
						{{ conflictDetected ? 'Mark all resolved' : 'Stage all changes' }}
					</NButton>
				</div>

				<div v-if="unstagedExpanded" class="staging-panel__file-list">
					<div
						v-for="file in unstagedFiles"
						:key="file.path"
						test-id="unstaged-file"
						class="staging-panel__file"
						:class="{'staging-panel__file--active': activePath === file.path}"
						@click="handleFileClick(file)"
						@contextmenu.prevent="contextMenuFile($event, file.path)"
					>
						<div>
							<FileStatus :status="conflictDetected ? EFileStatus.Conflicted : file.status" />

							<span class="staging-panel__file-name">{{ fileName(file.path) }}</span>
						</div>

						<NButton
							test-id="stage-file-btn"
							size="tiny"
							class="staging-panel__stage-action"
							:type="conflictDetected ? 'warning' : 'success'"
							secondary
							@click.stop="handleStageFile(file)"
						>
							{{ conflictDetected ? 'Mark resolved' : 'Stage file' }}
						</NButton>
					</div>
				</div>
			</div>

			<!-- Staged files -->
			<div class="staging-panel__section">
				<div
					class="staging-panel__section-header"
				>
					<div test-id="staged-section-header" @click="stagedExpanded = !stagedExpanded">
						<svg
							class="staging-panel__chevron"
							:class="{'staging-panel__chevron--open': stagedExpanded}"
							width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
						>
							<path d="M7 10l5 5 5-5z"/>
						</svg>
						<span>{{ conflictDetected ? 'Resolved Files' : 'Staged Files' }} ({{ stagedFiles.length }})</span>
					</div>
					<NButton
						test-id="unstage-all-btn"
						v-if="stagedFiles.length"
						size="tiny"
						secondary
						type="error"
						class="staging-panel__stage-all"
						@click="unstageAll"
					>
						Unstage all changes
					</NButton>
				</div>

				<div v-if="stagedExpanded" class="staging-panel__file-list">
					<div
						v-for="file in stagedFiles"
						:key="file.path"
						test-id="staged-file"
						class="staging-panel__file"
						:class="{'staging-panel__file--active': activePath === file.path}"
						@click="handleFileClick(file)"
					>
						<div>
							<FileStatus :status="file.status" />

							<span class="staging-panel__file-name">{{ fileName(file.path) }}</span>
						</div>

						<NButton
							test-id="unstage-file-btn"
							size="tiny"
							class="staging-panel__stage-action"
							type="error"
							secondary
							@click.stop="unstageFile(file.path)"
						>
							Unstage file
						</NButton>
					</div>
				</div>
			</div>
		</div>

		<ConfirmDialog
			v-model:show="showDiscardConfirm"
			title="Discard all changes"
			message="This will run permanently discard all uncommitted changes. Are you sure?"
			@confirm="discardAllChanges"
		/>

		<!-- Commit form -->
		<div class="staging-panel__commit-form">
			<div class="staging-panel__commit-header">
				<span class="staging-panel__commit-label">Commit</span>
				<label class="staging-panel__amend-label">
					<input
						test-id="amend-checkbox"
						type="checkbox"
						:checked="amendMode"
						:disabled="amendDisabled"
						@change="handleAmendToggle(($event.target as HTMLInputElement).checked)"
					/>
					<span>Amend previous commit</span>
				</label>
				<label
					class="staging-panel__amend-label"
					title="Bypass pre-commit and commit-msg hooks (--no-verify)"
				>
					<input
						test-id="no-verify-checkbox"
						type="checkbox"
						v-model="noVerify"
					/>
					<span>No verify</span>
				</label>
			</div>

			<n-input
				ref="commitSummaryInput"
				test-id="commit-summary-input"
				v-model:value="commitSummary"
				placeholder="Commit summary"
				size="small"
				class="staging-panel__summary-input"
			/>

			<n-input
				test-id="commit-description-input"
				v-model:value="commitDescription"
				type="textarea"
				placeholder="Description"
				size="small"
				:rows="3"
				class="staging-panel__description-input"
			/>
			<div class="staging-panel__commit-actions">
				<template v-if="operationKind === 'rebase'">
					<NButton
						test-id="rebase-continue-btn"
						class="staging-panel__commit-btn"
						type="success"
						size="large"
						secondary
						:loading="rebaseBusy"
						:disabled="!allConflictsResolved || rebaseBusy"
						@click="handleRebaseContinue"
					>
						Continue rebase
					</NButton>
					<NButton
						test-id="rebase-skip-btn"
						size="large"
						secondary
						:disabled="rebaseBusy"
						@click="handleRebaseSkip"
					>
						Skip
					</NButton>
					<NButton
						test-id="rebase-abort-btn"
						class="staging-panel__abort-btn"
						type="error"
						size="large"
						secondary
						@click="handleAbort"
					>
						Abort rebase
					</NButton>
				</template>
				<template v-else>
					<NButton
						test-id="commit-btn"
						class="staging-panel__commit-btn"
						type="success"
						size="large"
						secondary
						:loading="isCommitting"
						:disabled="commitDisabled || isCommitting"
						@click="runCommit"
					>
						{{ commitButtonLabel }}
					</NButton>
					<NButton
						v-if="conflictDetected"
						test-id="abort-merge-btn"
						class="staging-panel__abort-btn"
						type="error"
						size="large"
						secondary
						@click="handleAbort"
					>
						{{ abortLabel }}
					</NButton>
				</template>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, useTemplateRef, onMounted, onUnmounted} from 'vue';
import {NButton, NInput} from 'naive-ui';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useBranches} from '@/composables/useBranches';
import {useCommits} from '@/composables/useCommits';
import {useGit} from '@/composables/useGit';
import {useFileDiff} from '@/composables/useFileDiff';
import {useContextMenu} from '@/composables/useContextMenu';
import {useCommitForm} from '@/composables/useCommitForm';
import {useCommitAction} from '@/composables/useCommitAction';
import {useListNav} from '@/composables/useListNav';
import type {IFileStatus} from '@/domain';
import FileStatus from '../FileStatus.vue';
import Icon from '../Icon.vue';
import {EFileStatus} from '@/domain/enums';
import ConfirmDialog from '../ConfirmDialog.vue';

const emit = defineEmits<{
	openDiff: [filePath: string]
}>();

const {status, loadStatus, stageFile, stageAll, unstageAll, unstageFile, discardAllChanges, conflictDetected, operationKind} = useWorkingTree();
const {currentBranch, loadBranches} = useBranches();
const {commits, loadCommits} = useCommits();
const {mergeAbort, activePath, getCommitMessage, callGit, cherryPickAbort, rebaseContinue, rebaseSkip, rebaseAbort} = useGit();
const {loadDiff} = useFileDiff();
const {contextMenuFile} = useContextMenu();
const {commitSummary, commitDescription, amendMode, noVerify, prefill} = useCommitForm();
const {runCommit, isCommitting} = useCommitAction();
const {register, unregister, setActive} = useListNav();
const commitSummaryInput = useTemplateRef<InstanceType<typeof NInput>>('commitSummaryInput');
const showDiscardConfirm = ref(false);
const unstagedExpanded = ref(true);
const stagedExpanded = ref(true);

const unstagedFiles = computed(() => status.value.unstaged);
const stagedFiles = computed(() => status.value.staged);
const allConflictsResolved = computed(() => conflictDetected.value && unstagedFiles.value.length === 0);

const hasRegularHead = computed(() =>
	commits.value.some(c => c.hash !== 'WORKING_TREE' && !c.isStash),
);

const amendDisabled = computed(() => conflictDetected.value || !hasRegularHead.value);

const commitDisabled = computed(() => {
	if (conflictDetected.value && unstagedFiles.value.length > 0) return true;
	if (!commitSummary.value.trim()) return true;
	if (amendMode.value) return false;

	return !stagedFiles.value.length;
});

const commitButtonLabel = computed(() => {
	if (allConflictsResolved.value) return 'Commit & Merge';
	if (amendMode.value) return 'Amend commit';

	return 'Commit';
});

async function handleAmendToggle(checked: boolean): Promise<void> {
	if (checked) {
		try {
			const {subject, body} = await getCommitMessage('HEAD');
			amendMode.value = true;
			prefill(subject, body);
		}
		catch {
			amendMode.value = false;
		}
	}
	else {
		amendMode.value = false;
		prefill('', '');
	}
}

const totalCount = computed(() => {
	const paths = new Set([
		...unstagedFiles.value.map(f => f.path),
		...stagedFiles.value.map(f => f.path),
	]);

	return paths.size;
});

function fileName(path: string): string {
	const parts = path.split('/');

	return parts[parts.length - 1] ?? path;
}

async function handleFileClick(file: IFileStatus): Promise<void> {
	setActive('staging');
	await loadDiff(file);
	emit('openDiff', file.path);
}

// Stage a file, then move the active selection to the next unstaged file so the
// user can keep reviewing top-to-bottom without re-clicking.
async function handleStageFile(file: IFileStatus): Promise<void> {
	const list = unstagedFiles.value;
	const idx = list.findIndex(f => f.path === file.path);
	const neighbour = list[idx + 1] ?? list[idx - 1];

	await stageFile(file.path);

	const target = neighbour && unstagedFiles.value.find(f => f.path === neighbour.path);

	if (target) await handleFileClick(target);
}

const navFiles = computed(() => [...unstagedFiles.value, ...stagedFiles.value]);

function moveFile(delta: number): void {
	const list = navFiles.value;

	if (!list.length) return;

	const current = list.findIndex(f => f.path === activePath.value);
	const next = current === -1
		? 0
		: Math.max(0, Math.min(list.length - 1, current + delta));
	const target = list[next];

	if (target) void handleFileClick(target);
}

onMounted(() => register('staging', {moveUp: () => moveFile(-1), moveDown: () => moveFile(1)}));
onUnmounted(() => unregister('staging'));

async function handleStageAll(): Promise<void> {
	await stageAll();
	commitSummaryInput.value?.focus();
}

const rebaseBusy = ref(false);

const abortLabel = computed(() => {
	switch (operationKind.value) {
		case 'rebase': return 'Abort rebase';
		case 'cherry-pick': return 'Abort cherry-pick';
		case 'revert': return 'Abort revert';
		default: return 'Abort merge';
	}
});

async function refreshAfterOp(): Promise<void> {
	await Promise.all([loadStatus(), loadCommits(), loadBranches()]);
}

async function handleAbort(): Promise<void> {
	switch (operationKind.value) {
		case 'rebase': await rebaseAbort(); break;
		case 'cherry-pick': await cherryPickAbort(); break;
		case 'revert': await callGit('revert', '--abort'); break;
		default: await mergeAbort();
	}

	await refreshAfterOp();
}

async function handleRebaseContinue(): Promise<void> {
	rebaseBusy.value = true;

	try {
		await rebaseContinue();
		await refreshAfterOp();
	}
	catch {
		// A later commit may conflict again — status keeps the panel in rebase mode.
		await loadStatus();
	}
	finally {
		rebaseBusy.value = false;
	}
}

async function handleRebaseSkip(): Promise<void> {
	rebaseBusy.value = true;

	try {
		await rebaseSkip();
		await refreshAfterOp();
	}
	catch {
		await loadStatus();
	}
	finally {
		rebaseBusy.value = false;
	}
}

loadStatus();
</script>

<style scoped lang="scss">
.staging-panel {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: $bg-panel;
	overflow: hidden;
	font-size: 12.5px;

	&__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		border-bottom: 1px solid $border;
		flex-shrink: 0;
		gap: 8px;
	}

	&__branch-info {
		display: flex;
		align-items: center;
		gap: 6px;
		color: $text-muted;
		font-size: 12px;
		overflow: hidden;

		strong {
			color: $text-primary;
		}
	}

	&__files {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	&__section {
		border-bottom: 1px solid $border;
	}

	&__section-header {
		display: flex;
		justify-content: space-between;
		padding: 6px 10px;
		font-size: 13px;
		border-bottom: 1px solid $border;
		color: $text-white;
		cursor: pointer;
		user-select: none;

		&:hover {
			background-color: rgba($text-white, 0.03);
		}
	}

	&__count {
		margin-left: auto;
		font-size: 11px;
		color: $text-white;
		background: rgba($text-white, 0.06);
		padding: 1px 6px;
		border-radius: 8px;
	}

	&__chevron {
		transition: transform 0.15s;
		opacity: 0.6;

		&--open {
			transform: rotate(0deg);
		}

		&:not(&--open) {
			transform: rotate(-90deg);
		}
	}

	&__file-list {
		padding: 2px 0;
		min-height: 250px;
	}

	&__file {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		padding: 3px 10px 3px 20px;
		height: 30px;
		cursor: pointer;
		border-radius: 2px;

		&:hover {
			background-color: rgba($text-white, 0.04);

			.staging-panel__stage-action {
				display: inline-flex;
			}
		}

		&--active {
			box-shadow: inset 0 0 0 999px rgba(48, 160, 191, 0.35);
		}
	}

	&__stage-action {
		display: none;
	}

	&__panel__checkbox {
		border: 2px solid red;
	}

	&__file-name {
		font-size: 12px;
		color: $text-default;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__commit-form {
		border-top: 1px solid $border;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
	}

	&__commit-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	&__commit-label {
		font-size: 15px;
		font-weight: 600;
		color: $text-primary;
		flex: 1;
	}

	&__amend-label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		color: $text-muted;
		cursor: pointer;
		user-select: none;

		input {
			accent-color: $color-accent;
			cursor: pointer;

			&:disabled {
				cursor: not-allowed;
			}
		}

		&:has(input:disabled) {
			opacity: 0.45;
			cursor: not-allowed;
		}
	}

	&__reset-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: none;
		background: transparent;
		color: $text-dim;
		border-radius: 4px;
		cursor: pointer;

		&:hover {
			background: rgba($text-white, 0.06);
			color: $text-default;
		}
	}

	&__commit-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	&__abort-btn {
		width: 100%;
	}

	&__summary-input,
	&__description-input {
		width: 100%;
	}

	&__option-item {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 3px 4px;
		font-size: 11.5px;
		color: $text-muted;
		cursor: pointer;

		input {
			accent-color: $color-accent;
		}
	}
}
</style>
