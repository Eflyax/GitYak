<template>
	<div class="commit-details">
		<!-- Multi-select aggregation -->
		<template v-if="isMultiSelection">
			<div class="commit-details__hash-row">
				<span class="commit-details__hash-full">
					{{ multiSelectionCount }} commits selected
				</span>
			</div>
			<div test-id="commit-details-multi-summary" class="commit-details__title">
				{{ multiSelectionCount }} commits · {{ uniqueAuthors.length }} author{{ uniqueAuthors.length === 1 ? '' : 's' }}
			</div>
			<div class="commit-details__author commit-details__author--multi">
				<div
					v-for="author in uniqueAuthors"
					:key="author"
					class="commit-details__author-chip"
				>{{ author }}</div>
			</div>
			<div class="commit-details__meta-row">
				<CommitFileStats
					:A="filesStatuses[EFileStatus.Added]"
					:M="filesStatuses[EFileStatus.Modified]"
					:D="filesStatuses[EFileStatus.Deleted]"
					:R="filesStatuses[EFileStatus.Renamed]"
				/>
				<span class="commit-details__meta-label">Range</span>
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
				<span class="commit-details__hash">{{ selectedCommit.hashAbbr }}</span>
				<span class="commit-details__hash-full">parents: {{ selectedCommit.parents.length }}</span>
			</div>

			<!-- Title (clickable to edit when HEAD) -->
			<div
				test-id="commit-details-subject"
				class="commit-details__title"
				:class="{'commit-details__title--editable': canEdit}"
				:title="canEdit ? 'Click to edit this commit (amend)' : 'Only the HEAD commit can be edited'"
				@click="canEdit ? handleEditClick() : null"
			>
				{{ selectedCommit.subject }}
			</div>

			<!-- Body / description -->
			<div
				v-if="selectedCommit.body"
				test-id="commit-details-body"
				class="commit-details__body"
				:class="{'commit-details__body--editable': canEdit}"
				:title="canEdit ? 'Click to edit this commit (amend)' : 'Only the HEAD commit can be edited'"
				@click="canEdit ? handleEditClick() : null"
			>{{ selectedCommit.body }}</div>

			<!-- Author -->
			<div class="commit-details__author">
				<div
					class="commit-details__avatar"
					:style="{background: authorColor}"
				>
					{{ avatarLetter }}
				</div>
				<div class="commit-details__author-info">
					<span class="commit-details__author-name">{{ selectedCommit.authorName || 'Working Tree' }}</span>
					<span class="commit-details__author-date">{{ selectedCommit.authorDate }}</span>
				</div>
			</div>

			<!-- Parent hashes -->
			<div class="commit-details__meta-row" v-if="selectedCommit.parents.length">
				<CommitFileStats
					:A="filesStatuses[EFileStatus.Added]"
					:M="filesStatuses[EFileStatus.Modified]"
					:D="filesStatuses[EFileStatus.Deleted]"
					:R="filesStatuses[EFileStatus.Renamed]"
				/>

				<span class="commit-details__meta-label">Parent</span>
				<span
					v-for="p in selectedCommit.parents"
					:key="String(p)"
					class="commit-details__parent-hash"
				>{{ String(p).slice(0, 7) }}</span>
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

		<div v-else class="commit-details__empty">
			Select a commit to view details
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import ChangedFileItem from './ChangedFileItem.vue';
import CommitFileStats from '@/ui/components/CommitFileStats.vue';
import {useCommits} from '@/composables/useCommits';
import type {ICommitFile} from '@/composables/useCommits';
import {useFileDiff} from '@/composables/useFileDiff';
import {useCommitForm} from '@/composables/useCommitForm';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {getGraphColor} from '@/ui/components/CommitHistory/graphColors';
import {EFileStatus, EFileArea} from '@/domain/enums';
import type {IFileStatus} from '@/domain';

const emit = defineEmits<{
	openDiff: [filePath: string]
}>();

const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const {commits, selectedHashes, commitMap, commitFiles, loadCommitDetails} = useCommits();
const {loadDiff} = useFileDiff();
const {prefill, amendMode} = useCommitForm();
const {status} = useWorkingTree();

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
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: $bg-panel;
	overflow: hidden;

	&__empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: $text-faint;
		font-size: 13px;
	}

	&__hash-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding: 8px 12px 4px;
	}

	&__hash {
		font-family: monospace;
		font-size: 11px;
		color: $text-ghost;
	}

	&__hash-full {
		font-size: 10.5px;
		color: $text-faint;
	}

	&__title {
		padding: 4px 12px 12px;
		font-size: 14px;
		font-weight: 600;
		color: $text-primary;
		line-height: 1.4;
		border-bottom: 1px solid $border;
		cursor: default;

		&--editable {
			cursor: pointer;

			&:hover {
				background: rgba($color-accent, 0.08);
			}
		}
	}

	&__body {
		padding: 8px 12px;
		font-size: 12px;
		color: $text-muted;
		white-space: pre-wrap;
		line-height: 1.5;
		border-bottom: 1px solid $border;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		cursor: default;

		&--editable {
			cursor: pointer;

			&:hover {
				background: rgba($color-accent, 0.08);
			}
		}
	}

	&__author {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-bottom: 1px solid $border;

		&--multi {
			flex-wrap: wrap;
			gap: 4px;
		}
	}

	&__author-chip {
		display: inline-block;
		padding: 2px 8px;
		font-size: 11px;
		background: rgba($text-white, 0.06);
		color: $text-muted;
		border-radius: 10px;
	}

	&__avatar {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 700;
		color: $bg-app;
		flex-shrink: 0;
	}

	&__author-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	&__author-name {
		font-size: 12.5px;
		font-weight: 600;
		color: $text-primary;
	}

	&__author-date {
		font-size: 11px;
		color: $text-dim;
	}

	&__meta-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-bottom: 1px solid $border;
	}

	&__meta-label {
		font-size: 11px;
		color: $text-faint;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		font-weight: 600;
	}

	&__parent-hash {
		font-family: monospace;
		font-size: 11px;
		padding: 1px 6px;
		background: rgba($text-white, 0.06);
		border-radius: 3px;
		color: $text-muted;
		cursor: pointer;

		&:hover {
			background: rgba($color-accent, 0.15);
			color: $color-accent;
		}
	}

	&__stats {
		padding: 8px 12px;
		border-bottom: 1px solid $border;
	}

	&__stat {
		font-size: 12px;
		color: $text-dim;
	}

	&__tabs {
		display: flex;
		gap: 2px;
		padding: 6px 12px 4px;
		border-bottom: 1px solid $border;
	}

	&__tab {
		padding: 3px 12px;
		border: none;
		border-radius: 4px;
		font-size: 12px;
		cursor: pointer;
		background: transparent;
		color: $text-dim;
		transition: all 0.1s;

		&:hover {
			color: $text-default;
			background: rgba($text-white, 0.05);
		}

		&--active {
			background: rgba($color-accent, 0.15);
			color: $color-accent;
			font-weight: 500;
		}
	}

	&__files {
		flex: 1;
		overflow-y: auto;
		padding: 4px 0;
	}
}
</style>
