<template>
	<div class="commit-details">
		<!-- Multi-select aggregation -->
		<template v-if="isMultiSelection">
			<div class="commit-details__hash-row">
				<span class="commit-details__hash-full">
					{{ multiSelectionCount }} commits selected
				</span>
			</div>
			<div
				test-id="commit-details-multi-summary"
				class="commit-details__title"
			>
				{{ multiSelectionCount }} commits · {{ uniqueAuthors.length }} author{{ uniqueAuthors.length === 1 ? '' : 's' }}
			</div>
			<div class="commit-details__author commit-details__author--multi">
				<div
					v-for="author in uniqueAuthors"
					:key="author"
					class="commit-details__author-chip"
				>
					{{ author }}
				</div>
			</div>
			<div class="commit-details__meta-row">
				<CommitFileStats
					:A="filesStatuses[EFileStatus.Added]"
					:M="filesStatuses[EFileStatus.Modified]"
					:D="filesStatuses[EFileStatus.Deleted]"
					:R="filesStatuses[EFileStatus.Renamed]"
				/>
				<span class="commit-details__meta-label">
					Range
				</span>
				<span class="commit-details__parent-hash">
					{{ multiDateRange }}
				</span>
			</div>

			<div class="commit-details__files">
				<ChangedFileItem
					v-for="file in commitFiles ?? []"
					:key="file.path"
					:path="file.path"
					:status="(file.status as EFileStatus)"
					:is-selected="selectedFilePath === file.path"
					@open="handleFileOpen(file)"
				/>
			</div>
		</template>

		<!-- Single commit -->
		<template v-else-if="selectedCommit">
			<!-- Hash -->
			<div class="commit-details__hash-row">
				<span class="commit-details__hash">
					{{ selectedCommit.hashAbbr }}
				</span>
				<span class="commit-details__hash-full">
					parents: {{ selectedCommit.parents.length }}
				</span>
			</div>

			<!-- Title (clickable to edit when HEAD) -->
			<div
				:title="canEdit ? 'Click to edit this commit (amend)' : 'Only the HEAD commit can be edited'"
				test-id="commit-details-subject"
				class="commit-details__title"
				:class="{'commit-details__title--editable': canEdit}"
				@click="canEdit ? handleEditClick() : null"
			>
				{{ selectedCommit.subject }}
			</div>

			<!-- Body / description -->
			<div
				v-if="selectedCommit.body"
				:title="canEdit ? 'Click to edit this commit (amend)' : 'Only the HEAD commit can be edited'"
				test-id="commit-details-body"
				class="commit-details__body"
				:class="{'commit-details__body--editable': canEdit}"
				@click="canEdit ? handleEditClick() : null"
			>
				{{ selectedCommit.body }}
			</div>

			<!-- Author -->
			<div class="commit-details__author">
				<div
					class="commit-details__avatar"
					:style="{background: authorColor}"
				>
					{{ avatarLetter }}
				</div>
				<div class="commit-details__author-info">
					<span class="commit-details__author-name">
						{{ selectedCommit.authorName || 'Working Tree' }}
					</span>
					<span class="commit-details__author-date">
						{{ selectedCommit.authorDate }}
					</span>
				</div>
			</div>

			<!-- Parent hashes -->
			<div
				v-if="selectedCommit.parents.length"
				class="commit-details__meta-row"
			>
				<CommitFileStats
					:A="filesStatuses[EFileStatus.Added]"
					:M="filesStatuses[EFileStatus.Modified]"
					:D="filesStatuses[EFileStatus.Deleted]"
					:R="filesStatuses[EFileStatus.Renamed]"
				/>

				<span class="commit-details__meta-label">
					Parent
				</span>
				<span
					v-for="p in selectedCommit.parents"
					:key="String(p)"
					class="commit-details__parent-hash"
				>
					{{ String(p).slice(0, 7) }}
				</span>
			</div>

			<!-- File list -->
			<div class="commit-details__files">
				<ChangedFileItem
					v-for="file in commitFiles ?? []"
					:key="file.path"
					:path="file.path"
					:status="(file.status as EFileStatus)"
					:is-selected="selectedFilePath === file.path"
					@open="handleFileOpen(file)"
				/>
			</div>
		</template>

		<div
			v-else
			class="commit-details__empty"
		>
			Select a commit to view details
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch, onMounted, onUnmounted} from 'vue';
import {EFileArea, EFileStatus} from '@/domain/enums';
import {getGraphColor} from '@/ui/components/CommitHistory/graphColors';
import {useCommitForm} from '@/composables/useCommitForm';
import {useCommits} from '@/composables/useCommits';
import {useFileDiff} from '@/composables/useFileDiff';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useListNav} from '@/composables/useListNav';
import ChangedFileItem from './ChangedFileItem.vue';
import CommitFileStats from '@/ui/components/CommitFileStats.vue';
import type {ICommitFile} from '@/composables/useCommits';
import type {IFileStatus} from '@/domain';

const emit = defineEmits<{
	openDiff: [filePath: string]
}>();

const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const {commits, selectedHashes, commitMap, commitFiles, loadCommitDetails, selectCommit} = useCommits();
const {loadDiff} = useFileDiff();
const {prefill, amendMode} = useCommitForm();
const {status} = useWorkingTree();
const {register, unregister, setActive} = useListNav();

const selectedFilePath = ref<string | null>(null);

const selectedCommit = computed(() => {
	const hash = selectedHashes.value[0];

	return hash ? commitMap.value.get(hash) : undefined;
});

const isMultiSelection = computed(() => selectedHashes.value.length > 1);
const multiSelectionCount = computed(() => selectedHashes.value.length);

const selectedCommitObjects = computed(() =>
	selectedHashes.value.map(h => commitMap.value.get(h)).filter(Boolean) as Array<NonNullable<ReturnType<typeof commitMap.value.get>>>,
);

const uniqueAuthors = computed(() => {
	const set = new Set<string>();

	for (const c of selectedCommitObjects.value) {
		if (c.authorName) set.add(c.authorName);
	}

	return [...set];
});

const multiDateRange = computed(() => {
	const dates = selectedCommitObjects.value
		.map(c => c.authorDate)
		.filter(Boolean)
		.sort();

	if (dates.length === 0) return '';
	if (dates.length === 1) return dates[0]!;

	return `${dates[0]} → ${dates[dates.length - 1]}`;
});

const headHash = computed(() => {
	const wt = commits.value.find(c => c.hash === 'WORKING_TREE');

	return (wt?.parents as Array<string> | undefined)?.[0]
		?? commits.value.find(c => c.hash !== 'WORKING_TREE' && !c.isStash)?.hash;
});

const canEdit = computed(() => {
	if (isMultiSelection.value) return false;

	const commit = selectedCommit.value;

	if (!commit) return false;
	if (commit.hash === 'WORKING_TREE') return false;
	if (commit.isStash) return false;

	const dirty = status.value.unstaged.length > 0 || status.value.staged.length > 0;

	if (dirty) return false;

	return commit.hash === headHash.value;
});

function handleEditClick(): void {
	const commit = selectedCommit.value;

	if (!commit) return;

	amendMode.value = true;
	prefill(commit.subject, commit.body ?? '');
	// Switch to working-tree selection so the StagingPanel (which hosts the
	// commit form) mounts and exposes the prefilled summary/description.
	selectCommit('WORKING_TREE');
}

const filesStatuses = computed(() => {
	return {
		[EFileStatus.Modified]: commitFiles.value?.filter(file => file.status === EFileStatus.Modified).length ?? 0,
		[EFileStatus.Added]: commitFiles.value?.filter(file => file.status === EFileStatus.Added).length ?? 0,
		[EFileStatus.Deleted]: commitFiles.value?.filter(file => file.status === EFileStatus.Deleted).length ?? 0,
		[EFileStatus.Renamed]: commitFiles.value?.filter(file => file.status === EFileStatus.Renamed).length ?? 0,
	};
});

const authorColor = computed(() => getGraphColor(selectedCommit.value?.level ?? 0));

const avatarLetter = computed(() => {
	const name = selectedCommit.value?.authorName ?? '';

	return name ? name.charAt(0).toUpperCase() : '?';
});

const selectedRevisions = computed((): [string, string] => {
	const commit = selectedCommit.value;
	if (!commit) return ['WORKING_TREE', 'HEAD'];
	const parents = commit.parents as string[];
	const parentHash = parents[0] ?? EMPTY_TREE_HASH;
	return [commit.hash, parentHash];
});

async function handleFileOpen(file: ICommitFile): Promise<void> {
	setActive('commitFiles');

	const fileStatus: IFileStatus = {
		path: file.path,
		status: file.status as EFileStatus,
		oldPath: file.oldPath,
		area: EFileArea.Committed,
	};
	selectedFilePath.value = file.path;
	await loadDiff(fileStatus, selectedRevisions.value);
	emit('openDiff', file.path);
}

function moveFile(delta: number): void {
	const list = commitFiles.value ?? [];

	if (!list.length) return;

	const current = list.findIndex(f => f.path === selectedFilePath.value);
	const next = current === -1
		? 0
		: Math.max(0, Math.min(list.length - 1, current + delta));
	const target = list[next];

	if (target) void handleFileOpen(target);
}

onMounted(() => register('commitFiles', {moveUp: () => moveFile(-1), moveDown: () => moveFile(1)}));
onUnmounted(() => unregister('commitFiles'));

watch(
	selectedHashes,
	(hashes) => {
		selectedFilePath.value = null;
		loadCommitDetails(hashes);
	},
	{immediate: true},
);
</script>
<style scoped lang="scss">
.commit-details {
	background-color: $bg-panel;
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;

	&__empty {
		align-items: center;
		color: $text-faint;
		display: flex;
		flex: 1;
		font-size: 13px;
		justify-content: center;
	}

	&__hash-row {
		align-items: center;
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		padding: 8px 12px 4px;
	}

	&__hash {
		color: $text-ghost;
		font-family: monospace;
		font-size: 11px;
	}

	&__hash-full {
		color: $text-faint;
		font-size: 10.5px;
	}

	&__title {
		border-bottom: 1px solid $border;
		color: $text-primary;
		cursor: default;
		font-size: 14px;
		font-weight: 600;
		line-height: 1.4;
		padding: 4px 12px 12px;

		&--editable {
			cursor: pointer;

			&:hover {
				background: rgba($color-accent, 0.08);
			}
		}
	}

	&__body {
		border-bottom: 1px solid $border;
		color: $text-muted;
		cursor: default;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		font-size: 12px;
		height: 200px;
		line-height: 1.5;
		overflow: scroll;
		padding: 8px 12px;
		white-space: pre-wrap;

		&--editable {
			cursor: pointer;

			&:hover {
				background: rgba($color-accent, 0.08);
			}
		}
	}

	&__author {
		align-items: center;
		border-bottom: 1px solid $border;
		display: flex;
		gap: 10px;
		padding: 10px 12px;

		&--multi {
			flex-wrap: wrap;
			gap: 4px;
		}
	}

	&__author-chip {
		background: rgba($text-white, 0.06);
		border-radius: 10px;
		color: $text-muted;
		display: inline-block;
		font-size: 11px;
		padding: 2px 8px;
	}

	&__avatar {
		align-items: center;
		border-radius: 50%;
		color: $bg-app;
		display: flex;
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 700;
		height: 28px;
		justify-content: center;
		width: 28px;
	}

	&__author-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	&__author-name {
		color: $text-primary;
		font-size: 12.5px;
		font-weight: 600;
	}

	&__author-date {
		color: $text-dim;
		font-size: 11px;
	}

	&__meta-row {
		align-items: center;
		border-bottom: 1px solid $border;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		min-width: 0;
		padding: 6px 12px;
	}

	&__meta-label {
		color: $text-faint;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.4px;
		text-transform: uppercase;
	}

	&__parent-hash {
		background: rgba($text-white, 0.06);
		border-radius: 3px;
		color: $text-muted;
		cursor: pointer;
		font-family: monospace;
		font-size: 11px;
		padding: 1px 6px;

		&:hover {
			background: rgba($color-accent, 0.15);
			color: $color-accent;
		}
	}

	&__stats {
		border-bottom: 1px solid $border;
		padding: 8px 12px;
	}

	&__stat {
		color: $text-dim;
		font-size: 12px;
	}

	&__tabs {
		border-bottom: 1px solid $border;
		display: flex;
		gap: 2px;
		padding: 6px 12px 4px;
	}

	&__tab {
		background: transparent;
		border: none;
		border-radius: 4px;
		color: $text-dim;
		cursor: pointer;
		font-size: 12px;
		padding: 3px 12px;
		transition: all 0.1s;

		&:hover {
			background: rgba($text-white, 0.05);
			color: $text-default;
		}

		&--active {
			background: rgba($color-accent, 0.15);
			color: $color-accent;
			font-weight: 500;
		}
	}

	&__files {
		flex: 1;
		overflow-x: hidden;
		overflow-y: auto;
		padding: 4px 0;
	}
}
</style>
