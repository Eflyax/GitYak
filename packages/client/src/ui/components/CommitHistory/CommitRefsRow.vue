<template>
	<div class="commit-refs-row" :style="{height: ROW_HEIGHT + 'px'}">
		<!-- Horizontal connector line -->
		<svg
			v-if="mergedRefs.length && !commit.isStash"
			class="row-line-svg"
			width="100%"
			:height="ROW_HEIGHT"
		>
			<line
				class="horizontal-line"
				:x1="PADDING_LEFT"
				:y1="LINE_Y"
				x2="100%"
				:y2="LINE_Y"
				:stroke="lineColor"
				:stroke-width="shownRefs.some(ref => isActive(ref)) ? LINE_WIDTH_THICK : LINE_WIDTH_THIN"
			/>
		</svg>

		<!-- Reference badges -->
		<div
			v-if="mergedRefs.length"
			class="tags-wrapper"
			:class="{'tags-wrapper--expanded': expanded}"
			@mouseenter="expanded = true"
			@mouseleave="expanded = false"
		>
			<div
				v-for="ref in shownRefs"
				:key="ref.id"
				class="ref-tag"
				:class="{'ref-tag--active': isActive(ref)}"
				:style="{backgroundColor: tagColor}"
				:title="getTitle(ref)"
				:test-id="`ref-${ref.id}`"
				@dblclick.stop="handleDblClick(ref)"
				@contextmenu.prevent="contextMenuRef($event, refContextTarget(ref))"
			>
				<!-- Branch: ikony local + remote -->
				<template v-if="ref.isBranch">
					<div class="ref-icons">
						<Icon name="mdi-source-branch" class="ref-icon" />
						<Icon
							v-if="ref.isLocal"
							name="mdi-laptop"
							class="ref-icon"
							title="Local"
						/>
						<Icon
							v-if="ref.remotes.length"
							name="mdi-cloud-outline"
							class="ref-icon"
							:title="`Remotes: ${ref.remotes.join(', ')}`"
						/>
					</div>
				</template>

				<!-- Tag a ostatní -->
				<template v-else>
					<div class="ref-icons">
						<Icon name="mdi-tag-outline" class="ref-icon" />
						<Icon
							v-if="ref.isLocal"
							name="mdi-laptop"
							class="ref-icon"
							title="Local"
						/>
						<Icon
							v-if="ref.remotes.length"
							name="mdi-cloud-outline"
							class="ref-icon"
							:title="`Remotes: ${ref.remotes.join(', ')}`"
						/>
					</div>
				</template>

				<span class="ref-name">{{ ref.name }}</span>
			</div>

			<!-- Overflow badge -->
			<div
				v-if="!expanded && overflowCount > 0"
				class="ref-tag ref-tag--overflow"
				:style="{backgroundColor: tagColor}"
				:title="`${overflowCount} more`"
			>
				<span class="ref-name">+{{ overflowCount }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import type {IReference} from '@/domain';
import {EReferenceType} from '@/domain';
import Icon from '@/ui/components/Icon.vue';
import {getGraphColor} from './graphColors';
import type {ICommit} from '@/domain';
import {useBranches} from '@/composables/useBranches';
import {useContextMenu} from '@/composables/useContextMenu';
import {useTags} from '@/composables/useTags';
import {useGit} from '@/composables/useGit';
import {useCommits} from '@/composables/useCommits';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useStash} from '@/composables/useStash';

const {currentBranch, branches, switchBranch, createBranch, loadBranches} = useBranches();
const {checkout} = useGit();
const {loadCommits} = useCommits();
const {hasChanges, loadStatus} = useWorkingTree();
const {stashSave} = useStash();
const {remoteTags} = useTags();
const {contextMenuRef} = useContextMenu();

function refContextTarget(mergedRef: IMergedRef) {
	if (!mergedRef.isBranch) {
		return {
			name: mergedRef.name,
			isLocal: mergedRef.isLocal,
			remotes: mergedRef.remotes,
			isTag: true,
		};
	}

	const remoteNames = mergedRef.remotes.length
		? mergedRef.remotes
		: branches.value
			.filter(b => b.isRemote && b.name.split('/').slice(1).join('/') === mergedRef.name)
			.map(b => b.name.split('/')[0] ?? 'origin');

	return {
		name: mergedRef.name,
		isLocal: mergedRef.isLocal,
		remotes: remoteNames,
		isTag: false,
	};
}

interface IMergedRef {
	id: string;
	name: string;
	isBranch: boolean;
	isLocal: boolean;
	remotes: Array<string>;
}

const ROW_HEIGHT = 28;
const LINE_Y = 13;
const PADDING_LEFT = 12;
const LINE_WIDTH_THICK = 4;
const LINE_WIDTH_THIN = 1.5;

const props = defineProps<{
	commit: ICommit;
}>();

const expanded = ref(false);

const mergedRefs = computed((): IMergedRef[] => {
	const refs = (props.commit.references ?? []).filter(
		r => r.type !== EReferenceType.Stash && r.type !== EReferenceType.Head,
	);

	const branchRefs = refs.filter(
		r => r.type === EReferenceType.Branch || r.type === EReferenceType.RemoteBranch,
	);
	const otherRefs = refs.filter(
		r => r.type !== EReferenceType.Branch && r.type !== EReferenceType.RemoteBranch,
	);

	const grouped = new Map<string, {local: IReference | null; remotes: IReference[]}>();

	for (const r of branchRefs) {
		const key = r.type === EReferenceType.Branch
			? r.name
			: r.name.split('/').slice(1).join('/');

		if (!grouped.has(key)) {
			grouped.set(key, {local: null, remotes: []});
		}

		const g = grouped.get(key)!;

		if (r.type === EReferenceType.Branch) {
			g.local = r;
		}
		else {
			g.remotes.push(r);
		}
	}

	const mergedBranches: IMergedRef[] = [];

	for (const [key, g] of grouped) {
		mergedBranches.push({
			id: `branch:${key}`,
			name: key,
			isBranch: true,
			isLocal: g.local !== null,
			remotes: g.remotes.map(r => r.name.split('/')[0]!),
		});
	}

	const otherMerged: IMergedRef[] = otherRefs.map(r => ({
		id: r.id,
		name: r.name,
		isBranch: false,
		isLocal: true,
		remotes: remoteTags.value.includes(r.name) ? ['origin'] : [],
	}));

	return [...mergedBranches, ...otherMerged];
});

const lineColor = computed(() => getGraphColor(props.commit.level ?? 0));
const tagColor = computed(() => getGraphColor(props.commit.level ?? 0));

const sortedRefs = computed((): IMergedRef[] => {
	const all = mergedRefs.value;
	const activeIdx = all.findIndex(r => isActive(r));

	if (activeIdx <= 0) return all;

	return [all[activeIdx]!, ...all.slice(0, activeIdx), ...all.slice(activeIdx + 1)];
});

const shownRefs = computed(() =>
	expanded.value ? sortedRefs.value : sortedRefs.value.slice(0, 1),
);

async function handleDblClick(ref: IMergedRef): Promise<void> {
	if (ref.isBranch) {
		if (hasChanges.value) {
			try {
				await stashSave();
			}
			catch {
				return;
			}
		}

		if (ref.isLocal) {
			await switchBranch(ref.name);
		}
		else {
			const remote = ref.remotes[0] ?? 'origin';
			const localExists = branches.value.some(b => !b.isRemote && b.name === ref.name);

			if (localExists) {
				await switchBranch(ref.name);
			}
			else {
				await createBranch(ref.name, `${remote}/${ref.name}`);
			}
		}

		await Promise.all([loadCommits(), loadStatus()]);
	}
	else {
		await checkout(ref.name);
		await Promise.all([loadBranches(), loadCommits(), loadStatus()]);
	}
}

const overflowCount = computed(() => mergedRefs.value.length - 1);

function isActive(ref: IMergedRef): boolean {
	return ref.isBranch && ref.isLocal && currentBranch.value?.name === ref.name;
}

function getTitle(ref: IMergedRef): string {
	if (!ref.isBranch) {
		return ref.name;
	}

	const parts: string[] = ['Branch'];

	if (ref.isLocal) {
		parts.push('local');
	}

	if (ref.remotes.length) {
		parts.push(`remotes: ${ref.remotes.join(', ')}`);
	}

	return `${ref.name} (${parts.slice(1).join(', ')})`;
}
</script>

<style scoped lang="scss">
.commit-refs-row {
	position: relative;
	display: flex;
	align-items: center;
	box-sizing: border-box;
}

.row-line-svg {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	pointer-events: none;
}

.tags-wrapper {
	position: relative;
	z-index: 1;
	display: flex;
	align-items: center;
	gap: 3px;
	padding: 0 6px;
	width: 100%;
	overflow: hidden;
	cursor: pointer;
	margin-top: -5px;

	&--expanded {
		flex-direction: column;
		align-items: flex-start;
		overflow: visible;
		z-index: 10;
	}
}

.ref-tag {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 12px;
	font-weight: 600;
	color: $text-default;
	white-space: nowrap;
	flex-shrink: 0;
	cursor: pointer;
	box-shadow: inset 0 0 0 999px rgba(black, 0.55);

	&--active {
		box-shadow: none;
		color: $text-white;

		svg {
			fill: $text-white;
		}
	}

	&--overflow {
		box-shadow: inset 0 0 0 999px rgba(black, 0.55);
		color: $text-white;
	}

	svg {
		width: 15px;
		height: 15px;
	}
}

.ref-icons {
	display: flex;
	align-items: center;
	gap: 2px;
	flex-shrink: 0;
}

.ref-icon {
	width: 10px;
	height: 10px;
	flex-shrink: 0;
}

.ref-name {
	max-width: 110px;
	overflow: hidden;
	text-overflow: ellipsis;
}
</style>
