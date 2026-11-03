<template>
	<!-- The whole row is the hit area: the refs and graph columns to the left of the message
		block select the commit and open its context menu too. Only the block is drawn. -->
	<div
		class="commit-row-line"
		:style="{height: ROW_HEIGHT + 'px', paddingLeft: offset + 'px'}"
		@click="emit('select', $event)"
		@contextmenu.prevent="emit('contextmenu', $event)"
	>
		<div
			:test-id="commit.hash === 'WORKING_TREE' ? 'commit-row-working-tree' : `commit-row${commit.isStash ? '-stash' : ''}`"
			class="commit-row"
			:class="{
				'commit-row--selected': isSelected,
				'commit-row--conflict': commit.hash === 'WORKING_TREE' && hasUnresolvedConflicts,
			}"
			:style="{
				height: (ROW_HEIGHT - 4) + 'px',
				borderLeft: '2px solid ' + getGraphColor(commit.level ?? 0),
			}"
		>
			<!-- Message / Working-tree stats -->
			<div class="commit-row__body">
				<template v-if="commit.hash === 'WORKING_TREE'">
					<template v-if="hasUnresolvedConflicts">
						<Icon
							name="mdi-alert"
							class="commit-row__conflict-icon"
						/>
						<span class="commit-row__conflict-message">A file conflict was found when attempting to merge into {{ currentBranch?.name }}</span>
					</template>
					<CommitFileStats
						v-else
						:A="workingTreeStats.A"
						:M="workingTreeStats.M"
						:D="workingTreeStats.D"
						:R="workingTreeStats.R"
					/>
				</template>
				<span
					v-else
					class="commit-row__message"
				>{{ commit.subject }}</span>
			</div>

			<!-- Meta -->
			<div
				v-if="commit.authorDate || commit.hashAbbr"
				class="commit-row__meta"
			>
				<span
					v-if="commit.authorDate"
					class="commit-row__date"
				>{{ formatDate(commit.authorDate) }}</span>
				<span
					v-if="commit.hashAbbr"
					class="commit-row__hash"
				>{{ commit.hashAbbr }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import type {ICommit} from '@/domain';
import {getGraphColor} from './graphColors';
import CommitFileStats from '@/ui/components/CommitFileStats.vue';
import Icon from '@/ui/components/Icon.vue';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useBranches} from '@/composables/useBranches';
import {useDateFormat} from '@/composables/useDateFormat';

const ROW_HEIGHT = 28;

defineProps<{
	commit: ICommit
	isSelected?: boolean
	/** Width of the refs + graph columns; the message block starts after them. */
	offset: number
}>();

const emit = defineEmits<{
	select: [event: MouseEvent]
	contextmenu: [event: MouseEvent]
}>();

const {workingTreeStats, hasUnresolvedConflicts} = useWorkingTree();
const {currentBranch} = useBranches();
const {formatDate} = useDateFormat();

</script>

<style scoped lang="scss">
.commit-row-line {
	box-sizing: border-box;
	cursor: pointer;

	&:hover .commit-row:not(.commit-row--selected) {
		box-shadow: inset 0 0 0 999px rgba(black, 0.4);
	}
}

.commit-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 8px 0 6px;
	background-color: $bg-app;

	&--selected {
		box-shadow: inset 0 0 0 999px rgba(48, 160, 191, 0.4)
	}

	&--conflict {
		background-color: $status-modified;
	}

	&__body {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 0;
		overflow: hidden;
		padding-left: 5px;
	}

	&__message {
		font-size: 12.5px;
		color: $text-default;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__conflict-icon {
		color: $color-warning;
		flex-shrink: 0;
		height: 14px;
		width: 14px;
	}

	&__conflict-message {
		color: $color-warning;
		font-size: 12.5px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	// Date and hash on one line: two stacked lines did not fit the 24px row legibly.
	&__meta {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	&__date {
		font-size: 11.5px;
		color: $text-muted;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}

	&__hash {
		padding: 1px 5px;
		border-radius: 3px;
		background-color: $bg-hover;
		color: $text-muted;
		font-family: monospace;
		font-size: 11px;
		line-height: 15px;
	}
}
</style>
