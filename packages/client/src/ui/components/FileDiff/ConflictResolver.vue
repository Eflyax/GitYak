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
				test-id="take-all-current-btn"
				size="tiny"
				secondary
				@click="takeAll('ours')"
			>
				Take all current
			</NButton>
			<NButton
				test-id="take-all-incoming-btn"
				size="tiny"
				secondary
				@click="takeAll('theirs')"
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

		<!-- Current | Incoming on top, the editable result below -->
		<Splitpanes
			horizontal
			class="conflict-resolver__panes"
		>
			<Pane :size="55">
				<Splitpanes>
					<Pane>
						<div class="conflict-resolver__pane conflict-resolver__pane--ours">
							<div class="conflict-resolver__pane-head">
								<span class="conflict-resolver__pane-label">Current</span>
								<span class="conflict-resolver__pane-sub">{{ oursLabel }}</span>
							</div>
							<div
								test-id="conflict-ours-editor"
								class="conflict-resolver__editor"
							>
								<vue-monaco-editor
									:value="oursSide.text"
									:language="language"
									theme="vs-dark"
									:options="sideOptions"
									@mount="handleOursMount"
								/>
							</div>
						</div>
					</Pane>
					<Pane>
						<div class="conflict-resolver__pane conflict-resolver__pane--theirs">
							<div class="conflict-resolver__pane-head">
								<span class="conflict-resolver__pane-label">Incoming</span>
								<span class="conflict-resolver__pane-sub">{{ theirsLabel }}</span>
							</div>
							<div
								test-id="conflict-theirs-editor"
								class="conflict-resolver__editor"
							>
								<vue-monaco-editor
									:value="theirsSide.text"
									:language="language"
									theme="vs-dark"
									:options="sideOptions"
									@mount="handleTheirsMount"
								/>
							</div>
						</div>
					</Pane>
				</Splitpanes>
			</Pane>
			<Pane :size="45">
				<div class="conflict-resolver__pane conflict-resolver__pane--result">
					<div class="conflict-resolver__pane-head">
						<span class="conflict-resolver__pane-label">Result</span>
						<span class="conflict-resolver__pane-sub">editable — saved as the resolved file</span>
					</div>
					<div
						test-id="conflict-result-editor"
						class="conflict-resolver__editor"
					>
						<vue-monaco-editor
							:value="initialResult.text"
							:language="language"
							theme="vs-dark"
							:options="resultOptions"
							@mount="handleResultMount"
						/>
					</div>
				</div>
			</Pane>
		</Splitpanes>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, watch, nextTick, onBeforeUnmount} from 'vue';
import {NButton} from 'naive-ui';
import {Splitpanes, Pane} from 'splitpanes';
import {VueMonacoEditor} from '@guolao/vue-monaco-editor';
import type {editor, IRange} from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {useGit} from '@/composables/useGit';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {getMonacoLanguage} from '@/composables/useMonacoLanguage';
import {
	parseConflicts,
	buildSide,
	buildInitialResult,
	resolveConflict,
	countConflictMarkers,
	type IConflictBlock,
	type IConflictSelection,
	type IConflictText,
} from '@/domain/services/conflicts';

type TSide = 'ours' | 'theirs';

const props = defineProps<{
	content: string;
	filePath: string;
}>();

const emit = defineEmits<{saved: []}>();

const {writeFile} = useGit();
const {stageFile} = useWorkingTree();

const language = computed(() => getMonacoLanguage(props.filePath));

const blocks = computed(() => parseConflicts(props.content));
const conflicts = computed(() => blocks.value.filter((b): b is IConflictBlock => b.type === 'conflict'));
const oursSide = computed(() => buildSide(blocks.value, 'ours'));
const theirsSide = computed(() => buildSide(blocks.value, 'theirs'));
const initialResult = computed(() => buildInitialResult(blocks.value));

const oursLabel = computed(() => conflicts.value[0]?.oursLabel ?? 'HEAD');
const theirsLabel = computed(() => conflicts.value[0]?.theirsLabel ?? 'incoming');

const selections = ref<Array<IConflictSelection>>([]);
const resultText = ref('');

// Counted from the result itself, so a conflict resolved by hand counts as resolved and a
// marker typed back in counts again.
const remaining = computed(() => countConflictMarkers(resultText.value));

const sideOptions: editor.IStandaloneEditorConstructionOptions = {
	readOnly: true,
	domReadOnly: true,
	automaticLayout: true,
	minimap: {enabled: false},
	scrollBeyondLastLine: false,
	renderLineHighlight: 'none',
	fontSize: 12,
	lineHeight: 20,
};

const resultOptions: editor.IStandaloneEditorConstructionOptions = {
	automaticLayout: true,
	minimap: {enabled: false},
	scrollBeyondLastLine: false,
	fontSize: 12,
	lineHeight: 20,
};

let monaco: typeof Monaco | null = null;

// ── Current / Incoming panes ──────────────────────────────────────────────────────────────

interface ISidePane {
	editor: editor.IStandaloneCodeEditor;
	zoneIds: Array<string>;
	widgets: Array<editor.IContentWidget>;
	decorations: editor.IEditorDecorationsCollection;
}

const panes: Partial<Record<TSide, ISidePane>> = {};

// Each conflict gets a header row (the pick button) above it in both panes, and the shorter
// side is padded to the longer one's height. Every conflict therefore starts and ends at the
// same height in both panes, so a shared scroll position keeps them side by side.
//
// The header row is an empty view zone that only makes room; the button itself is a content
// widget laid over it, because Monaco's text layer sits above view zones and swallows clicks.
function renderSide(side: TSide): void {
	const pane = panes[side];
	const model = pane?.editor.getModel();

	if (!pane || !model || !monaco) {
		return;
	}

	const
		own: IConflictText = side === 'ours' ? oursSide.value : theirsSide.value,
		other: IConflictText = side === 'ours' ? theirsSide.value : oursSide.value;

	pane.widgets.forEach(widget => pane.editor.removeContentWidget(widget));
	pane.widgets = [];

	pane.editor.changeViewZones(accessor => {
		pane.zoneIds.forEach(id => accessor.removeZone(id));
		pane.zoneIds = [];

		own.regions.forEach((region, index) => {
			const
				before = region.startLine - 1,
				padding = Math.max(0, (other.regions[index]?.lineCount ?? 0) - region.lineCount);

			// For an empty side the filler and the header share a position; the header goes
			// last so it sits right above the line its button is anchored to.
			pane.zoneIds.push(accessor.addZone({
				afterLineNumber: before,
				heightInLines: 1,
				ordinal: 1,
				domNode: document.createElement('div'),
			}));

			if (padding > 0) {
				const filler = document.createElement('div');

				filler.className = 'conflict-resolver__filler';

				pane.zoneIds.push(accessor.addZone({
					afterLineNumber: before + region.lineCount,
					heightInLines: padding,
					ordinal: 0,
					domNode: filler,
				}));
			}
		});
	});

	own.regions.forEach((region, index) => {
		const widget = buildPickWidget(side, index, region.startLine, model.getLineCount());

		pane.widgets.push(widget);
		pane.editor.addContentWidget(widget);
	});

	pane.decorations.set(own.regions
		.map((region, index) => ({region, picked: selections.value[index]?.[side] ?? false}))
		.filter(({region}) => region.lineCount > 0)
		.map(({region, picked}) => ({
			range: new monaco!.Range(region.startLine, 1, region.startLine + region.lineCount - 1, 1),
			options: {
				isWholeLine: true,
				className: `conflict-resolver__region conflict-resolver__region--${side}${picked ? ' conflict-resolver__region--picked' : ''}`,
			},
		})));
}

function buildPickWidget(side: TSide, index: number, startLine: number, lineCount: number): editor.IContentWidget {
	const
		picked = selections.value[index]?.[side] ?? false,
		node = document.createElement('div'),
		button = document.createElement('button');

	node.className = `conflict-resolver__pick conflict-resolver__pick--${side}`;

	// Only one pane carries it, so the count of widgets equals the count of conflicts.
	if (side === 'ours') {
		node.setAttribute('test-id', 'conflict-widget');
	}

	button.className = `conflict-resolver__pick-btn${picked ? ' conflict-resolver__pick-btn--picked' : ''}`;
	button.setAttribute('test-id', side === 'ours' ? 'accept-ours-btn' : 'accept-theirs-btn');
	button.setAttribute('aria-pressed', String(picked));
	button.textContent = `${picked ? '✓' : '○'} ${side === 'ours' ? 'Take current' : 'Take incoming'}`;
	button.addEventListener('click', () => toggle(index, side));
	// Monaco treats a mousedown inside the editor as the start of a selection; stopping it
	// here keeps the click on the button.
	button.addEventListener('mousedown', e => e.stopPropagation());

	node.appendChild(button);

	// An empty side at the very end of the file has no line of its own below the header;
	// anchor to the last line and sit beneath it instead.
	const pastEnd = startLine > lineCount;

	return {
		getId: () => `gityak.conflict.${side}.${index}`,
		getDomNode: () => node,
		getPosition: () => ({
			position: {lineNumber: pastEnd ? lineCount : startLine, column: 1},
			preference: [
				pastEnd
					? monaco!.editor.ContentWidgetPositionPreference.BELOW
					: monaco!.editor.ContentWidgetPositionPreference.ABOVE,
			],
		}),
	};
}

function renderSides(): void {
	renderSide('ours');
	renderSide('theirs');
}

let syncingScroll = false;

function handleSideMount(side: TSide, instance: editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco): void {
	monaco = monacoInstance;
	panes[side] = {editor: instance, zoneIds: [], widgets: [], decorations: instance.createDecorationsCollection()};

	instance.onDidScrollChange(e => {
		const other = panes[side === 'ours' ? 'theirs' : 'ours'];

		if (!e.scrollTopChanged || !other || syncingScroll) {
			return;
		}

		syncingScroll = true;
		other.editor.setScrollTop(e.scrollTop);
		syncingScroll = false;
	});

	renderSide(side);
}

function handleOursMount(instance: editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco): void {
	handleSideMount('ours', instance, monacoInstance);
}

function handleTheirsMount(instance: editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco): void {
	handleSideMount('theirs', instance, monacoInstance);
}

// ── Result pane ───────────────────────────────────────────────────────────────────────────

let resultEditor: editor.IStandaloneCodeEditor | null = null;

// One tracked range per conflict. A range covers the conflict's lines INCLUDING the newline
// that ends the last one — (L,1) to (L+N,1) — so an empty resolution is an empty range and
// a one-empty-line resolution is not, and the two can be told apart later. Only a conflict
// that ends the file without a trailing newline has to stop at the end of its last line.
let regionIds: Array<string> = [];
let highlightIds: Array<string> = [];

function regionRange(model: editor.ITextModel, startLine: number, lineCount: number): IRange {
	const endLine = startLine + lineCount;

	if (endLine <= model.getLineCount()) {
		return new monaco!.Range(startLine, 1, endLine, 1);
	}

	const last = model.getLineCount();

	return new monaco!.Range(startLine, 1, last, model.getLineMaxColumn(last));
}

function trackedRegion(model: editor.ITextModel, startLine: number, lineCount: number): editor.IModelDeltaDecoration {
	return {
		range: regionRange(model, startLine, lineCount),
		options: {stickiness: monaco!.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges},
	};
}

function highlight(startLine: number, lineCount: number): editor.IModelDeltaDecoration | null {
	if (lineCount === 0) {
		return null;
	}

	return {
		range: new monaco!.Range(startLine, 1, startLine + lineCount - 1, 1),
		options: {isWholeLine: true, className: 'conflict-resolver__region conflict-resolver__region--result'},
	};
}

function resetResult(): void {
	const model = resultEditor?.getModel();

	if (!model || !monaco) {
		return;
	}

	const regions = initialResult.value.regions;

	regionIds = model.deltaDecorations(regionIds, regions.map(r => trackedRegion(model, r.startLine, r.lineCount)));
	highlightIds = model.deltaDecorations(
		highlightIds,
		regions.map(r => highlight(r.startLine, r.lineCount)).filter((d): d is editor.IModelDeltaDecoration => !!d),
	);
	resultText.value = model.getValue();
}

function replaceRegion(index: number, lines: ReadonlyArray<string>): void {
	const model = resultEditor?.getModel();
	const id = regionIds[index];
	const tracked = id ? model?.getDecorationRange(id) : null;

	if (!model || !monaco || !id || !tracked) {
		return;
	}

	let range: IRange = tracked;
	let text: string;
	let lead = 0;

	if (tracked.isEmpty() && tracked.startColumn === 1) {
		// An empty resolution sitting at the start of a line: insert whole lines before it.
		text = lines.map(line => `${line}\n`).join('');
	}
	else if (tracked.isEmpty()) {
		// An empty resolution at the end of a file with no final newline: append after it.
		text = lines.map(line => `\n${line}`).join('');
		lead = text ? 1 : 0;
	}
	else if (tracked.endColumn === 1) {
		// The usual case: the range ends with the newline after its last line.
		text = lines.map(line => `${line}\n`).join('');
	}
	else if (lines.length) {
		// The last lines of a file with no final newline.
		text = lines.join('\n');
	}
	else {
		// Emptying those: take the newline before them too, or an empty last line remains.
		const previous = tracked.startLineNumber - 1;

		range = previous > 0
			? new monaco.Range(previous, model.getLineMaxColumn(previous), tracked.endLineNumber, tracked.endColumn)
			: tracked;
		text = '';
	}

	const startOffset = model.getOffsetAt({lineNumber: range.startLineNumber, column: range.startColumn});

	resultEditor!.pushUndoStop();
	resultEditor!.executeEdits('conflict-resolver', [{range, text}]);
	resultEditor!.pushUndoStop();

	const replaced = monaco.Range.fromPositions(
		model.getPositionAt(startOffset + lead),
		model.getPositionAt(startOffset + text.length),
	);
	const [newId] = model.deltaDecorations([id], [{
		range: replaced,
		options: {stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges},
	}]);

	regionIds[index] = newId!;
	refreshHighlights();
}

// Highlights follow the tracked ranges, so they stay right after edits made by hand.
function refreshHighlights(): void {
	const model = resultEditor?.getModel();

	if (!model || !monaco) {
		return;
	}

	const decorations = regionIds
		.map(id => model.getDecorationRange(id))
		.map(range => {
			if (!range || range.isEmpty()) {
				return null;
			}

			const lastLine = range.endColumn === 1 ? range.endLineNumber - 1 : range.endLineNumber;

			return highlight(range.startLineNumber, lastLine - range.startLineNumber + 1);
		})
		.filter((d): d is editor.IModelDeltaDecoration => !!d);

	highlightIds = model.deltaDecorations(highlightIds, decorations);
}

function handleResultMount(instance: editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco): void {
	monaco = monacoInstance;
	resultEditor = instance;

	instance.onDidChangeModelContent(() => {
		resultText.value = instance.getValue();
	});

	resetResult();

	// Monaco loads asynchronously, and the side panes may be ready first: anything picked
	// there before this editor existed is applied now rather than lost.
	selections.value.forEach((selection, index) => {
		if (selection.ours || selection.theirs) {
			apply(index);
		}
	});
}

// ── Picking sides ─────────────────────────────────────────────────────────────────────────

function apply(index: number): void {
	const block = conflicts.value[index];
	const selection = selections.value[index];

	if (block && selection) {
		replaceRegion(index, resolveConflict(block, selection));
	}
}

function toggle(index: number, side: TSide): void {
	const selection = selections.value[index];

	if (!selection) {
		return;
	}

	selection[side] = !selection[side];
	apply(index);
	renderSides();
}

function takeAll(side: TSide): void {
	selections.value = selections.value.map(() => ({ours: side === 'ours', theirs: side === 'theirs'}));
	selections.value.forEach((_, index) => apply(index));
	renderSides();
}

watch(
	blocks,
	() => {
		selections.value = conflicts.value.map(() => ({ours: false, theirs: false}));
		resultText.value = initialResult.value.text;
		// The editors receive the new text through their :value binding; the zones, ranges
		// and decorations computed against the old text are rebuilt once it has landed.
		void nextTick(() => {
			resetResult();
			renderSides();
		});
	},
	{immediate: true},
);

onBeforeUnmount(() => {
	panes.ours = undefined;
	panes.theirs = undefined;
	resultEditor = null;
});

async function handleSave(): Promise<void> {
	if (remaining.value > 0) return;

	await writeFile(props.filePath, resultText.value);
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

	&__panes {
		flex: 1;
		min-height: 0;
	}

	&__pane {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-width: 0;
	}

	&__pane-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		flex-shrink: 0;
		font-family: -apple-system, "Segoe UI", sans-serif;
		border-bottom: 1px solid $border;
		user-select: none;

		.conflict-resolver__pane--ours & {
			background-color: color-mix(in srgb, #{$color-cyan} 12%, transparent);
		}

		.conflict-resolver__pane--theirs & {
			background-color: color-mix(in srgb, #{$color-warning} 12%, transparent);
		}

		.conflict-resolver__pane--result & {
			background-color: $bg-panel;
		}
	}

	&__pane-label {
		font-size: 11.5px;
		font-weight: 600;
		color: $text-secondary;
	}

	&__pane-sub {
		font-size: 10.5px;
		color: $text-faint;
		margin-left: auto;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__editor {
		flex: 1;
		min-height: 0;
	}

	// Rendered by Monaco inside the editors, hence :deep.
	&__editor :deep(.conflict-resolver__region--ours) {
		background-color: color-mix(in srgb, #{$color-cyan} 8%, transparent);
	}

	&__editor :deep(.conflict-resolver__region--theirs) {
		background-color: color-mix(in srgb, #{$color-warning} 8%, transparent);
	}

	&__editor :deep(.conflict-resolver__region--ours.conflict-resolver__region--picked) {
		background-color: color-mix(in srgb, #{$color-cyan} 22%, transparent);
	}

	&__editor :deep(.conflict-resolver__region--theirs.conflict-resolver__region--picked) {
		background-color: color-mix(in srgb, #{$color-warning} 22%, transparent);
	}

	&__editor :deep(.conflict-resolver__region--result) {
		background-color: color-mix(in srgb, #{$color-warning} 6%, transparent);
	}

	&__editor :deep(.conflict-resolver__filler) {
		background-image: repeating-linear-gradient(
			-45deg,
			transparent 0,
			transparent 6px,
			color-mix(in srgb, #{$text-faint} 8%, transparent) 6px,
			color-mix(in srgb, #{$text-faint} 8%, transparent) 7px
		);
	}

	&__editor :deep(.conflict-resolver__pick) {
		display: flex;
		align-items: center;
		height: 20px;
		padding-left: 4px;
		white-space: nowrap;
	}

	&__editor :deep(.conflict-resolver__pick-btn) {
		padding: 0 8px;
		border: 1px solid $border;
		border-radius: 3px;
		background-color: $bg-panel;
		color: $text-secondary;
		font-family: -apple-system, "Segoe UI", sans-serif;
		font-size: 10.5px;
		line-height: 16px;
		cursor: pointer;
	}

	&__editor :deep(.conflict-resolver__pick--ours .conflict-resolver__pick-btn--picked) {
		color: $color-cyan;
		border-color: $color-cyan;
	}

	&__editor :deep(.conflict-resolver__pick--theirs .conflict-resolver__pick-btn--picked) {
		color: $color-warning;
		border-color: $color-warning;
	}
}
</style>
