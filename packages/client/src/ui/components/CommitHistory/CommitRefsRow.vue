<template>
	<div
		class="commit-refs-row"
		:style="{height: ROW_HEIGHT + 'px'}"
	>
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
				:style="{stroke: shadeColor}"
				:stroke-width="shownRefs.some(ref => isActive(ref)) ? LINE_WIDTH_THICK : LINE_WIDTH_THIN"
			/>
		</svg>

		<!-- Reference badges -->
		<div
			v-if="mergedRefs.length"
			class="tags-wrapper"
			:class="{'tags-wrapper--expanded': expanded}"
			:style="{paddingTop: TAG_TOP + 'px'}"
			@mouseenter="expanded = true"
			@mouseleave="expanded = false"
		>
			<div
				v-for="ref in shownRefs"
				:key="ref.id"
				class="ref-tag"
				:class="{'ref-tag--active': isActive(ref)}"
				:style="{backgroundColor: isActive(ref) ? activeColor : shadeColor}"
				:title="getTitle(ref)"
				:test-id="`ref-${ref.id}`"
				draggable="true"
				@click.stop="handleClick"
				@dblclick.stop="handleDblClick(ref)"
				@dragstart.stop="onRefDragStart($event, ref)"
				@dragover.prevent="onRefDragOver($event)"
				@dragleave="onRefDragLeave"
				@drop.stop.prevent="onRefDrop($event, ref)"
				@contextmenu.prevent="contextMenuRef($event, refContextTarget(ref))"
			>
				<!-- Branch: ikony local + remote -->
				<template v-if="ref.isBranch">
					<div class="ref-icons">
						<Icon
							name="mdi-source-branch"
							class="ref-icon"
						/>
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
						<Icon
							name="mdi-tag-outline"
							class="ref-icon"
						/>
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

				<span class="ref-name">
					<span class="ref-name__head">{{ splitRefName(ref.name).head }}</span>
					<span class="ref-name__tail">{{ splitRefName(ref.name).tail }}</span>
				</span>
			</div>

			<!-- Overflow badge -->
			<div
				v-if="!expanded && overflowCount > 0"
				class="ref-tag ref-tag--overflow"
				:style="{backgroundColor: shadeColor}"
				:title="`${overflowCount} more`"
			>
				<span class="ref-name">+{{ overflowCount }}</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue';
import {useDialog} from 'naive-ui';
import type {IReference} from '@/domain';
import {EReferenceType} from '@/domain';
import Icon from '@/ui/components/Icon.vue';
import {getGraphColor, getGraphShadeColor} from './graphColors';
import type {ICommit} from '@/domain';
import {useBranches} from '@/composables/useBranches';
import {useContextMenu} from '@/composables/useContextMenu';
import {useTags} from '@/composables/useTags';
import {useGit} from '@/composables/useGit';
import {useCommits} from '@/composables/useCommits';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useStash} from '@/composables/useStash';
import {useDragRef} from '@/composables/useDragRef';
import {useNotify} from '@/composables/useNotify';

const {currentBranch, branches, switchBranch, createBranch, loadBranches} = useBranches();
const {checkout, callGit} = useGit();
const {loadCommits, selectCommit} = useCommits();
const {hasChanges, loadStatus} = useWorkingTree();
const {stashSave} = useStash();
const {remoteTagSet} = useTags();
const {contextMenuRef, contextMenuRefDrop} = useContextMenu();
const {dragSource, startDrag, endDrag} = useDragRef();
const dialog = useDialog();
const notify = useNotify();

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
	// Full name git understands: the branch name for local chips,
	// `<remote>/<branch>` for remote-only chips. Used for drag & drop so a
	// diverged local/remote pair isn't mistaken for the same ref.
	refName: string;
	isBranch: boolean;
	isLocal: boolean;
	remotes: Array<string>;
}

const ROW_HEIGHT = 28;
const LINE_Y = 13;
const PADDING_LEFT = 12;
const LINE_WIDTH_THICK = 4;
const LINE_WIDTH_THIN = 1.5;
// Must match `.ref-tag` height in the styles below.
const TAG_HEIGHT = 18;
// Centres the chips on the horizontal line (and thus on the graph node).
const TAG_TOP = LINE_Y - TAG_HEIGHT / 2;

// A truncated name keeps its last REF_TAIL_CHARS characters visible; the ellipsis goes into the
// head, which never shrinks below its first few characters (`.ref-name__head` min-width).
const REF_TAIL_CHARS = 5;
const REF_HEAD_MIN_CHARS = 3;

function splitRefName(name: string): {head: string; tail: string} {
	if (name.length <= REF_HEAD_MIN_CHARS + REF_TAIL_CHARS) {
		return {head: name, tail: ''};
	}

	return {head: name.slice(0, -REF_TAIL_CHARS), tail: name.slice(-REF_TAIL_CHARS)};
}

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
			refName: g.local ? key : g.remotes[0]!.name,
			isBranch: true,
			isLocal: g.local !== null,
			remotes: g.remotes.map(r => r.name.split('/')[0]!),
		});
	}

	const otherMerged: IMergedRef[] = otherRefs.map(r => ({
		id: r.id,
		name: r.name,
		refName: r.name,
		isBranch: false,
		isLocal: true,
		remotes: remoteTagSet.value.has(r.name) ? ['origin'] : [],
	}));

	return [...mergedBranches, ...otherMerged];
});

// The line and the chips share the darker shade of the node border; only the chip of the
// checked-out branch keeps the full lane colour as its highlight.
const shadeColor = computed(() => getGraphShadeColor(props.commit.level ?? 0));
const activeColor = computed(() => getGraphColor(props.commit.level ?? 0));

const sortedRefs = computed((): IMergedRef[] => {
	const all = mergedRefs.value;
	const activeIdx = all.findIndex(r => isActive(r));

	if (activeIdx <= 0) return all;

	return [all[activeIdx]!, ...all.slice(0, activeIdx), ...all.slice(activeIdx + 1)];
});

const shownRefs = computed(() =>
	expanded.value ? sortedRefs.value : sortedRefs.value.slice(0, 1),
);

function handleClick(): void {
	selectCommit(props.commit.hash);
}

function onRefDragStart(e: DragEvent, ref: IMergedRef): void {
	startDrag({
		type: ref.isBranch ? 'branch' : 'tag',
		name: ref.refName,
	});

	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', ref.refName);
	}
}

function onRefDragOver(e: DragEvent): void {
	if (!dragSource.value) return;
	if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	(e.currentTarget as HTMLElement).classList.add('ref-tag--drop-target');
}

function onRefDragLeave(e: DragEvent): void {
	(e.currentTarget as HTMLElement).classList.remove('ref-tag--drop-target');
}

function onRefDrop(e: DragEvent, ref: IMergedRef): void {
	(e.currentTarget as HTMLElement).classList.remove('ref-tag--drop-target');

	const src = dragSource.value;

	endDrag();

	if (!src) return;

	contextMenuRefDrop(e, src.name, ref.refName);
}

async function handleDblClick(ref: IMergedRef): Promise<void> {
	if (!ref.isBranch) {
		await checkout(ref.name);
		await Promise.all([loadBranches(), loadCommits(), loadStatus()]);

		return;
	}

	const remote = ref.remotes[0] ?? 'origin';
	const localExists = !ref.isLocal && branches.value.some(b => !b.isRemote && b.name === ref.name);

	// Double click = target: a remote chip whose local branch sits elsewhere moves that local
	// branch onto the clicked commit right away (checking it out if needed) instead of first
	// switching to where the local branch is. Ask only when that would orphan local commits.
	if (localExists && !(await confirmMoveLocal(ref.name, remote))) {
		return;
	}

	if (hasChanges.value) {
		try {
			await stashSave();
		}
		catch {
			return;
		}
	}

	try {
		if (ref.isLocal) {
			await switchBranch(ref.name);
		}
		else if (localExists) {
			await callGit('checkout', '-B', ref.name, props.commit.hash);
		}
		else {
			await createBranch(ref.name, `${remote}/${ref.name}`);
		}
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : String(err));
	}

	await Promise.all([loadBranches(), loadCommits(), loadStatus()]);
}

async function confirmMoveLocal(name: string, remote: string): Promise<boolean> {
	const unpushed = Number((await callGit('rev-list', '--count', `${props.commit.hash}..refs/heads/${name}`)).trim());

	if (!unpushed) {
		return true;
	}

	return new Promise(resolve => {
		dialog.warning({
			title: 'Move local branch',
			content: `Local ${name} has ${unpushed} commit${unpushed === 1 ? '' : 's'} not on ${remote}/${name}. `
				+ `Moving it to ${remote}/${name} drops ${unpushed === 1 ? 'it' : 'them'} from the branch.`,
			positiveText: 'Move',
			negativeText: 'Cancel',
			onPositiveClick: () => resolve(true),
			onNegativeClick: () => resolve(false),
			onClose: () => resolve(false),
			onEsc: () => resolve(false),
			onMaskClick: () => resolve(false),
		});
	});
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
	// Empty space here belongs to the commit row underneath (it selects the commit and opens
	// its context menu); only the chips themselves take the pointer.
	pointer-events: none;
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

// Both states share the same top offset so the first chip does not move
// when the wrapper switches between collapsed and expanded.
.tags-wrapper {
	position: absolute;
	top: 0;
	left: 0;
	z-index: 1;
	display: flex;
	align-items: flex-start;
	gap: 3px;
	padding: 0 6px;
	width: 100%;
	box-sizing: border-box;
	overflow: hidden;
	cursor: pointer;

	// Collapsed: the first chip gives up width (its name ellipsizes) so the
	// "+N" badge next to it always stays fully visible.
	&:not(.tags-wrapper--expanded) .ref-tag:not(.ref-tag--overflow) {
		flex-shrink: 1;
		min-width: 0;
	}

	&--expanded {
		// Keeps the hover across the gaps between stacked chips so the list does not collapse.
		pointer-events: auto;
		flex-direction: column;
		gap: 2px;
		width: auto;
		max-width: 100%;
		overflow: visible;
		z-index: 10;
	}
}

.ref-tag {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 18px;
	box-sizing: border-box;
	padding: 0 5px;
	border-radius: 3px;
	font-size: 12px;
	font-weight: 600;
	color: $text-default;
	white-space: nowrap;
	flex-shrink: 0;
	cursor: pointer;
	pointer-events: auto;

	&--active {
		color: $text-white;

		svg {
			fill: $text-white;
		}
	}

	&--overflow {
		color: $text-white;
	}

	&--drop-target {
		outline: 2px dashed $color-accent;
		outline-offset: 1px;
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

// Middle ellipsis: the head ellipsizes, the tail always stays visible.
.ref-name {
	display: inline-flex;
	min-width: 0;
	max-width: 110px;

	&__head {
		// Roughly REF_HEAD_MIN_CHARS characters plus the ellipsis.
		min-width: 4ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	&__tail {
		flex-shrink: 0;
	}
}

.tags-wrapper--expanded .ref-name {
	max-width: none;

	&__head {
		overflow: visible;
	}
}
</style>
