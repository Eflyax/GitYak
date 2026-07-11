<template>
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
		@click="emit('select', $event)"
		@contextmenu.prevent="emit('contextmenu', $event)"
	>
		<!-- Message / Working-tree stats -->
		<div class="commit-row__body">
			<template v-if="commit.hash === 'WORKING_TREE'">
				<template v-if="hasUnresolvedConflicts">
					<Icon name="mdi-alert" class="commit-row__conflict-icon" />
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
			<span v-else class="commit-row__message">{{ commit.subject }}</span>
		</div>

		<!-- Meta -->
		<div class="commit-row__meta">
			<span class="commit-row__date">{{ commit.authorDate }}</span>
			<span class="commit-row__hash">{{ commit.hashAbbr }}</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import type {ICommit} from '@/domain';
import {getGraphColor} from './graphColors';
import CommitFileStats from '@/ui/components/CommitFileStats.vue';
import Icon from '@/ui/components/Icon.vue';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useBranches} from '@/composables/useBranches';

const ROW_HEIGHT = 28;

const AUTHOR_COLORS = [
	'#6f9ef8', '#f89b6f', '#6ff8a0', '#f86f6f',
	'#c46ff8', '#f8e56f', '#6feef8', '#f86fc4',
];

function hashAuthorColor(seed: string): string {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) - hash) + seed.charCodeAt(i);
		hash |= 0;
	}
	return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length]!;
}

const props = defineProps<{
	commit: ICommit
	isSelected?: boolean
}>();

const emit = defineEmits<{
	select: [event: MouseEvent]
	contextmenu: [event: MouseEvent]
}>();

// Reserved for future avatar rendering
const _authorColor = computed(() =>
	hashAuthorColor(props.commit.authorEmail || props.commit.authorName),
);

const _authorInitial = computed(() =>
	props.commit.authorName?.charAt(0)?.toUpperCase() ?? '?',
);

void _authorColor;
void _authorInitial;


const {workingTreeStats, hasUnresolvedConflicts} = useWorkingTree();
const {currentBranch} = useBranches();

</script>

<style scoped lang="scss">
.commit-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 0 8px 0 6px;
	cursor: pointer;
	margin-bottom: 4px;
	background-color: $bg-app;

	&:hover:not(&--selected) {
		box-shadow: inset 0 0 0 999px rgba(black, 0.4);
	}

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

	&__meta {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 1px;
	}

	&__date {
		font-size: 11px;
		color: $text-faint;
		white-space: nowrap;
	}

	&__hash {
		font-size: 10px;
		color: $text-ghost;
		font-family: monospace;
	}
}
</style>
