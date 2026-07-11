<template>
	<div class="conflict-resolver">
		<!-- Status bar -->
		<div class="conflict-resolver__bar">
			<span class="conflict-resolver__bar-label">Merge conflicts</span>
			<span
				test-id="conflict-counter"
				class="conflict-resolver__bar-count"
			>
				{{ remaining === 0 ? 'All conflicts resolved' : `${remaining} conflict${remaining === 1 ? '' : 's'} remaining` }}
			</span>
			<NButton
				size="tiny"
				secondary
				@click="acceptAllOurs"
			>
				Take all current
			</NButton>
			<NButton
				size="tiny"
				secondary
				@click="acceptAllTheirs"
			>
				Take all incoming
			</NButton>
			<NButton
				test-id="conflict-save-btn"
				size="tiny"
				:type="remaining === 0 ? 'warning' : 'default'"
				:disabled="remaining > 0"
				secondary
				@click="handleSave"
			>
				Save resolution
			</NButton>
		</div>

		<!-- Blocks -->
		<div class="conflict-resolver__body">
			<template v-for="(block, i) in blocks" :key="i">
				<!-- Unchanged context -->
				<pre
					v-if="block.type === 'context'"
					class="conflict-resolver__context"
				>{{ block.lines.join('\n') }}</pre>

				<!-- Conflict hunk: two columns, tick the side(s) to keep -->
				<div
					v-else
					test-id="conflict-widget"
					class="conflict-resolver__hunk"
					:class="{'conflict-resolver__hunk--resolved': isResolved(conflictIndex(i))}"
				>
					<div
						class="conflict-resolver__side conflict-resolver__side--ours"
						:class="{'conflict-resolver__side--picked': selections[conflictIndex(i)]?.ours}"
						test-id="accept-ours-btn"
						@click="toggle(conflictIndex(i), 'ours')"
					>
						<div class="conflict-resolver__side-head">
							<span class="conflict-resolver__checkbox">
								<svg v-if="selections[conflictIndex(i)]?.ours" viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
							</span>
							<span class="conflict-resolver__side-label">Current</span>
							<span class="conflict-resolver__side-sub">{{ block.oursLabel }}</span>
						</div>
						<pre class="conflict-resolver__code">{{ block.ours.length ? block.ours.join('\n') : '(empty)' }}</pre>
					</div>

					<div
						class="conflict-resolver__side conflict-resolver__side--theirs"
						:class="{'conflict-resolver__side--picked': selections[conflictIndex(i)]?.theirs}"
						test-id="accept-theirs-btn"
						@click="toggle(conflictIndex(i), 'theirs')"
					>
						<div class="conflict-resolver__side-head">
							<span class="conflict-resolver__checkbox">
								<svg v-if="selections[conflictIndex(i)]?.theirs" viewBox="0 0 24 24"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
							</span>
							<span class="conflict-resolver__side-label">Incoming</span>
							<span class="conflict-resolver__side-sub">{{ block.theirsLabel }}</span>
						</div>
						<pre class="conflict-resolver__code">{{ block.theirs.length ? block.theirs.join('\n') : '(empty)' }}</pre>
					</div>
				</div>
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue';
import {NButton} from 'naive-ui';
import {useGit} from '@/composables/useGit';
import {useWorkingTree} from '@/composables/useWorkingTree';

interface IContextBlock {
	type: 'context';
	lines: Array<string>;
}

interface IConflictBlock {
	type: 'conflict';
	ours: Array<string>;
	theirs: Array<string>;
	oursLabel: string;
	theirsLabel: string;
}

type TBlock = IContextBlock | IConflictBlock;

interface ISelection {
	ours: boolean;
	theirs: boolean;
}

const props = defineProps<{
	content: string;
	filePath: string;
}>();

const emit = defineEmits<{saved: []}>();

const {writeFile} = useGit();
const {stageFile} = useWorkingTree();

const selections = ref<Array<ISelection>>([]);

function parse(text: string): Array<TBlock> {
	const lines = text.split('\n');
	const blocks: Array<TBlock> = [];
	let ctx: Array<string> = [];
	let i = 0;

	const flushCtx = (): void => {
		if (ctx.length) {
			blocks.push({type: 'context', lines: ctx});
			ctx = [];
		}
	};

	while (i < lines.length) {
		const line = lines[i]!;

		if (line.startsWith('<<<<<<<')) {
			flushCtx();

			const oursLabel = line.slice(7).trim() || 'HEAD';
			const ours: Array<string> = [];
			++i;

			while (i < lines.length && !lines[i]!.startsWith('=======') && !lines[i]!.startsWith('|||||||')) {
				ours.push(lines[i]!);
				++i;
			}

			// diff3 base section (||||||| … =======) — not shown, skip it.
			if (i < lines.length && lines[i]!.startsWith('|||||||')) {
				++i;

				while (i < lines.length && !lines[i]!.startsWith('=======')) {
					++i;
				}
			}

			++i; // skip =======

			const theirs: Array<string> = [];

			while (i < lines.length && !lines[i]!.startsWith('>>>>>>>')) {
				theirs.push(lines[i]!);
				++i;
			}

			const theirsLabel = (lines[i] ?? '').slice(7).trim() || 'incoming';
			++i; // skip >>>>>>>

			blocks.push({type: 'conflict', ours, theirs, oursLabel, theirsLabel});
		}
		else {
			ctx.push(line);
			++i;
		}
	}

	flushCtx();

	return blocks;
}

const blocks = computed(() => parse(props.content));

// Maps a `blocks` index to its position within the conflict-only list.
function conflictIndex(blockIdx: number): number {
	let n = 0;

	for (let i = 0; i < blockIdx; ++i) {
		if (blocks.value[i]!.type === 'conflict') ++n;
	}

	return n;
}

watch(
	blocks,
	value => {
		const count = value.filter(b => b.type === 'conflict').length;
		selections.value = Array.from({length: count}, () => ({ours: false, theirs: false}));
	},
	{immediate: true},
);

function toggle(index: number, side: 'ours' | 'theirs'): void {
	const sel = selections.value[index];

	if (!sel) return;

	sel[side] = !sel[side];
}

function isResolved(index: number): boolean {
	const sel = selections.value[index];

	return !!sel && (sel.ours || sel.theirs);
}

const remaining = computed(() => selections.value.filter(s => !s.ours && !s.theirs).length);

function acceptAllOurs(): void {
	selections.value = selections.value.map(() => ({ours: true, theirs: false}));
}

function acceptAllTheirs(): void {
	selections.value = selections.value.map(() => ({ours: false, theirs: true}));
}

function buildResult(): string {
	const out: Array<string> = [];
	let ci = 0;

	for (const block of blocks.value) {
		if (block.type === 'context') {
			out.push(...block.lines);
		}
		else {
			const sel = selections.value[ci];

			if (sel?.ours) out.push(...block.ours);
			if (sel?.theirs) out.push(...block.theirs);

			++ci;
		}
	}

	return out.join('\n');
}

async function handleSave(): Promise<void> {
	if (remaining.value > 0) return;

	await writeFile(props.filePath, buildResult());
	await stageFile(props.filePath);
	emit('saved');
}
</script>

<style scoped lang="scss">
.conflict-resolver {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
	background-color: $bg-app;

	&__bar {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 12px;
		height: 36px;
		background-color: $bg-panel;
		border-bottom: 1px solid $border;
		flex-shrink: 0;
	}

	&__bar-label {
		font-size: 12px;
		font-weight: 600;
		color: $color-warning;
		font-family: monospace;
	}

	&__bar-count {
		font-size: 11.5px;
		color: $text-muted;
		font-family: monospace;
		flex: 1;
	}

	&__body {
		flex: 1;
		overflow: auto;
		padding: 8px 10px;
		font-family: "JetBrains Mono", "Fira Code", monospace;
		font-size: 12px;
		line-height: 20px;
	}

	&__context {
		margin: 0;
		padding: 0 8px;
		color: $text-dim;
		white-space: pre;
		overflow-x: auto;
	}

	&__hunk {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		margin: 8px 0;

		&--resolved {
			opacity: 0.75;
		}
	}

	&__side {
		border: 1px solid $border-strong;
		border-radius: 5px;
		overflow: hidden;
		cursor: pointer;
		transition: border-color 0.1s, opacity 0.1s;
		opacity: 0.85;

		&--ours {
			border-color: rgba($color-cyan, 0.4);
		}

		&--theirs {
			border-color: rgba($color-warning, 0.4);
		}

		&--picked {
			opacity: 1;
		}

		&--ours#{&}--picked {
			border-color: $color-cyan;
			box-shadow: inset 0 0 0 1px $color-cyan;
		}

		&--theirs#{&}--picked {
			border-color: $color-warning;
			box-shadow: inset 0 0 0 1px $color-warning;
		}
	}

	&__side-head {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 4px 8px;
		font-family: -apple-system, "Segoe UI", sans-serif;
		border-bottom: 1px solid $border;
		user-select: none;

		.conflict-resolver__side--ours & {
			background-color: rgba($color-cyan, 0.12);
		}

		.conflict-resolver__side--theirs & {
			background-color: rgba($color-warning, 0.12);
		}
	}

	&__checkbox {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		border-radius: 3px;
		border: 1px solid $border-strong;
		background-color: $bg-app;

		svg {
			width: 12px;
			height: 12px;
		}

		.conflict-resolver__side--ours & svg {
			fill: $color-cyan;
		}

		.conflict-resolver__side--theirs & svg {
			fill: $color-warning;
		}
	}

	&__side-label {
		font-size: 11.5px;
		font-weight: 600;
		color: $text-secondary;
	}

	&__side-sub {
		font-size: 10.5px;
		color: $text-faint;
		margin-left: auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 50%;
	}

	&__code {
		margin: 0;
		padding: 6px 8px;
		white-space: pre;
		overflow-x: auto;
		color: $text-default;
	}
}
</style>
