<template>
	<div class="file-diff">
		<!-- Top bar -->
		<div class="file-diff__topbar">
			<div class="file-diff__breadcrumb">
				<span
					v-for="(part, i) in pathParts"
					:key="i"
					class="file-diff__breadcrumb-part"
				>
					<span
						class="file-diff__breadcrumb-segment"
						:class="{'file-diff__breadcrumb-segment--file': i === pathParts.length - 1}"
					>{{ part }}</span>
					<span
						v-if="i < pathParts.length - 1"
						class="file-diff__breadcrumb-sep"
					>/</span>
				</span>
			</div>

			<div class="file-diff__tabs">
				<button
					v-for="tab in tabs"
					:key="tab.key"
					:test-id="`file-diff-tab-${tab.key}`"
					class="file-diff__tab"
					:class="{'file-diff__tab--active': activeTab === tab.key}"
					@click="activeTab = tab.key"
				>
					{{ tab.label }}
				</button>
			</div>

			<div class="file-diff__actions">
				<button
					test-id="toggle-line-numbers-btn"
					class="file-diff__action-btn"
					title="Line numbers"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z" />
					</svg>
				</button>
				<button
					test-id="toggle-blame-btn"
					class="file-diff__action-btn"
					:class="{'file-diff__action-btn--on': blameOn}"
					title="Blame"
					@click="toggleBlame"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
					</svg>
				</button>
				<button
					test-id="toggle-history-btn"
					class="file-diff__action-btn"
					:class="{'file-diff__action-btn--on': historyOn}"
					title="History"
					@click="toggleHistory"
				>
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="currentColor"
					>
						<path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
					</svg>
				</button>

				<NButton
					test-id="stage-file-btn-diff"
					size="tiny"
					type="success"
					secondary
					:disabled="!activePath"
					@click.stop="handleStageFile"
				>
					Stage file
				</NButton>
			</div>

			<button
				test-id="close-file-diff-btn"
				class="file-diff__action-btn"
				title="Close"
				@click="emit('close')"
			>
				<svg
					width="13"
					height="13"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
				</svg>
			</button>
		</div>

		<!-- Conflict resolution: two-column, pick side(s) per hunk -->
		<ConflictResolver
			v-if="isConflictFile"
			:content="modified"
			:file-path="activePath ?? ''"
			@saved="emit('close')"
		/>

		<!-- Monaco diff editor -->
		<div
			v-else
			class="file-diff__body"
		>
			<div
				v-if="historyOn"
				test-id="file-history-panel"
				class="file-diff__history"
			>
				<div class="file-diff__history-head">
					History
				</div>
				<div
					v-if="!historyEntries.length"
					test-id="file-history-empty"
					class="file-diff__history-empty"
				>
					No history for this file.
				</div>
				<button
					v-for="entry in historyEntries"
					:key="entry.hash"
					test-id="file-history-entry"
					class="file-diff__history-item"
					:class="{'file-diff__history-item--active': entry.hash === historyRevision}"
					@click="showRevision(entry)"
				>
					<span class="file-diff__history-subject">{{ entry.subject }}</span>
					<span class="file-diff__history-meta">{{ entry.author }} · {{ entry.date }}</span>
				</button>
			</div>

			<!-- Blame needs its own editor: Monaco's diff view does not render injected text,
			     so annotations added to the modified side stay invisible there. -->
			<div
				v-if="blameOn && !blame.length"
				test-id="blame-loading"
				class="file-diff__blame-loading"
			>
				Loading blame…
			</div>

			<div
				v-else-if="blameOn"
				test-id="blame-view"
				class="file-diff__editor"
			>
				<vue-monaco-editor
					:value="blameContent"
					:language="language"
					theme="vs-dark"
					:options="blameEditorOptions"
					class="file-diff__monaco"
					@mount="handleBlameEditorMount"
				/>
			</div>

			<div
				v-else
				class="file-diff__editor"
			>
				<vue-monaco-diff-editor
					:original="original"
					:modified="modified"
					:language="language"
					theme="vs-dark"
					:options="editorOptions"
					class="file-diff__monaco"
					@mount="handleEditorMount"
				/>
			</div>
		</div>

		<ConfirmDialog
			v-model:show="showDiscardHunkConfirm"
			title="Discard hunk"
			message="This will permanently discard this change from the working tree. Are you sure?"
			@confirm="confirmDiscardHunk"
		/>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue';
import type {editor} from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {NButton} from 'naive-ui';
import {VueMonacoDiffEditor, VueMonacoEditor} from '@guolao/vue-monaco-editor';
import {useGit} from '@/composables/useGit';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useFileDiff} from '@/composables/useFileDiff';
import {useFileHistory} from '@/composables/useFileHistory';
import {getMonacoLanguage} from '@/composables/useMonacoLanguage';
import {useCommands} from '@/composables/useCommands';
import ConflictResolver from './ConflictResolver.vue';
import ConfirmDialog from '../ConfirmDialog.vue';
import {useNotify} from '@/composables/useNotify';
import type {IHunk} from '@/domain/services/patch';
import type {IFileHistoryEntry} from '@/domain/services/fileHistory';
import {EFileArea, EFileStatus} from '@/domain';

const emit = defineEmits<{
	close: []
}>();

const {paletteOpen} = useCommands();

// Esc closes the editor. Capture phase so it fires before Monaco swallows the key.
function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'Escape' || paletteOpen.value) return;

	event.preventDefault();
	event.stopPropagation();
	emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown, true));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));

const {activePath, stageFile} = useGit();
const {loadStatus} = useWorkingTree();
const {original, modified, patch, hunkActions, applyHunk, loadDiff} = useFileDiff();
const {entries: historyEntries, blame, loadHistory, loadBlame, clear: clearHistory} = useFileHistory();
const notify = useNotify();

type TabKey = 'unstaged' | 'fileDiff' | 'gitDiff';

const activeTab = ref<TabKey>('fileDiff');

const tabs: {key: TabKey; label: string}[] = [
	{key: 'unstaged', label: 'Unstaged'},
	{key: 'fileDiff', label: 'File Diff'},
	{key: 'gitDiff', label: 'Git Diff'},
];

const language = computed(() => getMonacoLanguage(activePath.value ?? ''));

const pathParts = computed(() => (activePath.value ?? '').split('/'));
const isConflictFile = computed(() => modified.value.includes('<<<<<<<'));

async function handleStageFile(): Promise<void> {
	if (!activePath.value) return;
	await stageFile(activePath.value);
	await loadStatus();
}

let diffEditor: editor.IStandaloneDiffEditor | null = null;
let monaco: typeof Monaco | null = null;

// ── Per-hunk actions ─────────────────────────────────────────────────────────
// One Monaco content widget per git hunk, anchored to the hunk's first line in the modified
// editor. Monaco keeps them positioned while the user scrolls; we only rebuild them when the
// underlying patch changes.

const
	hunkWidgets: Array<editor.IContentWidget> = [],
	showDiscardHunkConfirm = ref(false),
	pendingDiscardHunk = ref<IHunk | null>(null),
	ACTION_LABELS: Record<'stage' | 'unstage' | 'discard', string> = {
		stage: 'Stage hunk',
		unstage: 'Unstage hunk',
		discard: 'Discard hunk',
	};

function clearHunkWidgets(): void {
	const modifiedEditor = diffEditor?.getModifiedEditor();

	for (const widget of hunkWidgets) {
		modifiedEditor?.removeContentWidget(widget);
	}

	hunkWidgets.length = 0;
}

/**
 * Hunk actions rewrite the file on disk, so an unsaved edit in the editor would be silently
 * lost — or make the patch no longer apply. Refuse while the buffer differs from what we
 * loaded.
 */
function hasUnsavedEdits(): boolean {
	const value = diffEditor?.getModifiedEditor().getValue();

	return value !== undefined && value !== modified.value;
}

async function runHunkAction(hunk: IHunk, mode: 'stage' | 'unstage' | 'discard'): Promise<void> {
	if (hasUnsavedEdits()) {
		notify.warning('Save or revert your edits first');
		return;
	}

	try {
		const hasChangesLeft = await applyHunk(hunk, mode);

		await loadStatus();

		if (!hasChangesLeft) {
			emit('close');
		}
	}
	catch (err: unknown) {
		notify.error(err instanceof Error ? err.message : 'Could not apply the hunk');
		await loadStatus();
	}
}

function requestHunkAction(hunk: IHunk, mode: 'stage' | 'unstage' | 'discard'): void {
	if (mode === 'discard') {
		pendingDiscardHunk.value = hunk;
		showDiscardHunkConfirm.value = true;
		return;
	}

	void runHunkAction(hunk, mode);
}

function confirmDiscardHunk(): void {
	const hunk = pendingDiscardHunk.value;

	pendingDiscardHunk.value = null;

	if (hunk) {
		void runHunkAction(hunk, 'discard');
	}
}

function buildHunkWidget(hunk: IHunk, index: number): editor.IContentWidget {
	const node = document.createElement('div');

	node.className = 'file-diff__hunk-actions';

	for (const mode of hunkActions.value) {
		const button = document.createElement('button');

		button.className = `file-diff__hunk-btn file-diff__hunk-btn--${mode}`;
		button.textContent = ACTION_LABELS[mode];
		button.setAttribute('test-id', `hunk-${mode}-btn-${index}`);
		button.addEventListener('click', () => requestHunkAction(hunk, mode));
		node.appendChild(button);
	}

	// A pure deletion has no line of its own in the modified file; newStart then points just
	// before the removed block, and 0 when it was removed from the top.
	const lineNumber = Math.max(1, hunk.newStart);

	return {
		getId: () => `gityak.hunk.${index}`,
		getDomNode: () => node,
		getPosition: () => ({
			position: {lineNumber, column: 1},
			preference: [
				monaco!.editor.ContentWidgetPositionPreference.ABOVE,
				monaco!.editor.ContentWidgetPositionPreference.BELOW,
			],
		}),
	};
}

function renderHunkWidgets(): void {
	clearHunkWidgets();

	const modifiedEditor = diffEditor?.getModifiedEditor();

	if (!modifiedEditor || !monaco || !patch.value || !hunkActions.value.length) {
		return;
	}

	patch.value.hunks.forEach((hunk, index) => {
		const widget = buildHunkWidget(hunk, index);

		hunkWidgets.push(widget);
		modifiedEditor.addContentWidget(widget);
	});
}

watch([patch, hunkActions], renderHunkWidgets);

function handleEditorMount(editorInstance: editor.IStandaloneDiffEditor, monacoInstance: typeof Monaco): void {
	diffEditor = editorInstance;
	monaco = monacoInstance;
	// The editor mounts asynchronously — later than the first click, in practice. Whatever
	// was requested while it was still loading is applied here, or it would never appear.
	renderHunkWidgets();

	const scrollDisposable = editorInstance.onDidUpdateDiff(() => {
		scrollDisposable.dispose();
		const changes = editorInstance.getLineChanges();
		if (changes && changes.length > 0) {
			editorInstance.getModifiedEditor().revealLineInCenter(changes[0]!.modifiedStartLineNumber);
		}
	});

	monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
		noSuggestionDiagnostics: true,
	});
	monacoInstance.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
		noSemanticValidation: true,
		noSyntaxValidation: true,
		noSuggestionDiagnostics: true,
	});
	monacoInstance.languages.json.jsonDefaults.setDiagnosticsOptions({
		validate: false,
		allowComments: true,
	});

	const cssLang = monacoInstance.languages as unknown as {
		css: {
			cssDefaults: {setOptions(o: {validate: boolean}): void};
			lessDefaults: {setOptions(o: {validate: boolean}): void};
			scssDefaults: {setOptions(o: {validate: boolean}): void};
		}
	};
	if (cssLang.css) {
		cssLang.css.cssDefaults.setOptions({validate: false});
		cssLang.css.lessDefaults.setOptions({validate: false});
		cssLang.css.scssDefaults.setOptions({validate: false});
	}
}

// ── File history & blame ─────────────────────────────────────────────────────

const
	historyOn = ref(false),
	blameOn = ref(false),
	historyRevision = ref<string | null>(null);

let blameEditor: editor.IStandaloneCodeEditor | null = null;
let blameDecorationIds: Array<string> = [];

async function toggleHistory(): Promise<void> {
	historyOn.value = !historyOn.value;

	if (!historyOn.value || !activePath.value) {
		return;
	}

	await loadHistory(activePath.value);
}

/** Opens the diff this commit made to the file, against its first parent. */
async function showRevision(entry: IFileHistoryEntry): Promise<void> {
	historyRevision.value = entry.hash;

	await loadDiff(
		{
			path: entry.path,
			oldPath: entry.oldPath,
			status: (entry.status || 'M') as EFileStatus,
			area: EFileArea.Committed,
		},
		[entry.hash, `${entry.hash}^`],
	);
}

// The blame editor shows the file as blame reported it, so the annotations line up even if
// the diff view was showing a different revision.
const blameContent = computed(() => blame.value.map(entry => entry.content).join('\n'));

function clearBlameDecorations(): void {
	const model = blameEditor?.getModel();

	if (model && blameDecorationIds.length) {
		model.deltaDecorations(blameDecorationIds, []);
	}

	blameDecorationIds = [];
}

// Each line is prefixed with the commit and author that last touched it, injected into the
// view rather than into the document, so the file's own text is untouched.
function renderBlame(): void {
	const model = blameEditor?.getModel();

	if (!model || !monaco || !blame.value.length) {
		return;
	}

	blameDecorationIds = model.deltaDecorations(blameDecorationIds, blame.value.map(entry => ({
		range: new monaco!.Range(entry.line, 1, entry.line, 1),
		options: {
			// The range is a single position, and Monaco drops injected text on an empty
			// range unless it is told to show it anyway.
			showIfCollapsed: true,
			before: {
				content: entry.isUncommitted
					? 'uncommitted        '
					: `${entry.hash.slice(0, 7)} ${entry.author.padEnd(12).slice(0, 12)}`,
				inlineClassName: 'file-diff__blame-gutter',
			},
			hoverMessage: entry.isUncommitted
				? {value: 'Not committed yet'}
				: {value: `**${entry.summary}**\n\n${entry.author}`},
		},
	})));
}

function handleBlameEditorMount(editorInstance: editor.IStandaloneCodeEditor, monacoInstance: typeof Monaco): void {
	blameEditor = editorInstance;
	monaco ??= monacoInstance;
	renderBlame();
}

async function toggleBlame(): Promise<void> {
	blameOn.value = !blameOn.value;

	if (!blameOn.value) {
		clearBlameDecorations();
		blameEditor = null;

		return;
	}

	if (activePath.value) {
		await loadBlame(activePath.value, historyRevision.value ?? undefined);
	}
}

watch(blame, renderBlame);

// A different file means a different history: dropping the old one keeps the panel from
// showing another file's commits while the new ones load.
watch(activePath, path => {
	historyRevision.value = null;
	clearBlameDecorations();
	blameOn.value = false;
	clearHistory();

	if (historyOn.value && path) {
		void loadHistory(path);
	}
});

onBeforeUnmount(() => {
	clearHunkWidgets();
	clearBlameDecorations();
	blameEditor = null;
	clearHistory();
	diffEditor?.dispose();
	diffEditor = null;
	monaco = null;
});

const blameEditorOptions = {
	readOnly: true,
	scrollBeyondLastLine: false,
	minimap: {enabled: false},
	fontSize: 12,
	lineHeight: 20,
	fontFamily: '"JetBrains Mono", "Fira Code", monospace',
	renderLineHighlight: 'none' as const,
	'bracketPairColorization.enabled': false,
};

const editorOptions = {
	renderSideBySide: true,
	readOnly: false,
	scrollBeyondLastLine: false,
	minimap: {enabled: false},
	fontSize: 12,
	lineHeight: 20,
	fontFamily: '"JetBrains Mono", "Fira Code", monospace',
	renderLineHighlight: 'none' as const,
	'bracketPairColorization.enabled': false,
	glyphMargin: true,
	renderMarginRevertIcon: false,
};

</script>

<style scoped lang="scss">
.file-diff {
	display: flex;
	flex-direction: column;
	height: 100%;
	overflow: hidden;
	background-color: $bg-app;

	&__topbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 10px;
		height: 36px;
		border-bottom: 1px solid $border;
		background-color: $bg-panel;
		flex-shrink: 0;
		overflow: hidden;
	}

	&__breadcrumb {
		display: flex;
		align-items: center;
		overflow: hidden;
		font-size: 11.5px;
		flex-shrink: 1;
		min-width: 0;
	}

	&__breadcrumb-part {
		display: flex;
		align-items: center;
		white-space: nowrap;
	}

	&__breadcrumb-segment {
		color: $text-dim;

		&--file {
			color: $text-primary;
			font-weight: 500;
		}
	}

	&__breadcrumb-sep {
		color: $text-ghost;
		margin: 0 2px;
	}

	&__tabs {
		display: flex;
		gap: 2px;
		flex-shrink: 0;
	}

	&__tab {
		padding: 3px 10px;
		border: none;
		border-radius: 4px;
		font-size: 11.5px;
		background: transparent;
		color: $text-dim;
		cursor: pointer;
		white-space: nowrap;
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

	&__actions {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	&__action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 26px;
		height: 26px;
		padding: 0 6px;
		border: none;
		background: transparent;
		color: $text-dim;
		border-radius: 4px;
		cursor: pointer;
		font-size: 11.5px;
		transition: all 0.1s;

		&:hover {
			background-color: rgba($text-white, 0.06);
			color: $text-secondary;
		}

		&--primary {
			background: $color-accent;
			color: $bg-app;
			font-weight: 700;
			font-size: 12px;
			padding: 0 12px;

			&:hover {
				background: $color-accent-hover;
				color: $bg-app;
			}
		}
	}

	&__body {
		flex: 1;
		display: flex;
		min-height: 0;
	}

	&__editor {
		flex: 1;
		overflow: hidden;
		min-width: 0;
	}

	&__blame-loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		color: $text-muted;
	}

	&__history {
		width: 240px;
		flex-shrink: 0;
		overflow-y: auto;
		border-right: 1px solid $border;
		background-color: $bg-panel;
	}

	&__history-head {
		padding: 6px 10px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: $text-muted;
		border-bottom: 1px solid $border;
	}

	&__history-empty {
		padding: 10px;
		font-size: 11px;
		color: $text-dim;
	}

	&__history-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
		padding: 6px 10px;
		border: none;
		border-bottom: 1px solid $border;
		background: transparent;
		text-align: left;
		cursor: pointer;

		&:hover {
			background-color: $bg-hover;
		}

		&--active {
			background-color: $bg-section;
			box-shadow: inset 2px 0 0 $color-accent;
		}
	}

	&__history-subject {
		font-size: 11px;
		color: $text-primary;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	&__history-meta {
		font-size: 10px;
		color: $text-dim;
	}

	&__action-btn--on {
		color: $color-accent;
	}

	// Injected by Monaco, so it is outside this component's scope.
	:deep(.file-diff__blame-gutter) {
		color: $text-dim;
		font-size: 11px;
	}

	&__monaco {
		width: 100%;
		height: 100%;
		min-height: 200px;
	}

	// Hunk widgets are created imperatively for Monaco, so they never carry the scope
	// attribute — reach them through the editor subtree instead.
	&__editor :deep(.file-diff__hunk-actions) {
		display: flex;
		gap: 4px;
		z-index: 10;
	}

	&__editor :deep(.file-diff__hunk-btn) {
		padding: 1px 8px;
		border: 1px solid $border;
		border-radius: 3px;
		background-color: $bg-panel;
		color: $text-secondary;
		font-size: 10px;
		line-height: 16px;
		cursor: pointer;
	}

	&__editor :deep(.file-diff__hunk-btn:hover) {
		color: $text-primary;
		border-color: $text-secondary;
	}

	&__editor :deep(.file-diff__hunk-btn--discard:hover) {
		color: $color-danger;
		border-color: $color-danger;
	}
}
</style>
