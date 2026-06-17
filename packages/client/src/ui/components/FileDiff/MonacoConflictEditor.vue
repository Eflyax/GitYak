<template>
	<div class="monaco-conflict-editor">
		<!-- Status bar -->
		<div class="monaco-conflict-editor__bar">
			<span class="monaco-conflict-editor__bar-label">Merge conflicts</span>
			<span
				test-id="conflict-counter"
				class="monaco-conflict-editor__bar-count"
			>
				{{ conflictCount === 0 ? 'All conflicts resolved' : `${conflictCount} conflict${conflictCount === 1 ? '' : 's'} remaining` }}
			</span>
			<NButton
				test-id="conflict-save-btn"
				size="tiny"
				:type="conflictCount === 0 ? 'warning' : 'default'"
				:disabled="conflictCount > 0"
				secondary
				@click="handleSave"
			>
				Save resolution
			</NButton>
		</div>

		<!-- Monaco editor -->
		<div class="monaco-conflict-editor__editor">
			<vue-monaco-editor
				v-model:value="content"
				:language="language"
				theme="vs-dark"
				:options="editorOptions"
				class="monaco-conflict-editor__monaco"
				@mount="handleMount"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed, onBeforeUnmount, watch} from 'vue';
import {NButton} from 'naive-ui';
import {VueMonacoEditor} from '@guolao/vue-monaco-editor';
import type {editor as MonacoEditor, IDisposable} from 'monaco-editor';
import {useGit} from '@/composables/useGit';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {getMonacoLanguage} from '@/composables/useMonacoLanguage';

interface IConflict {
	startLine: number;
	divLine: number;
	endLine: number;
	oursLines: Array<string>;
	theirsLines: Array<string>;
}

const props = defineProps<{
	content: string;
	filePath: string;
}>();

const emit = defineEmits<{saved: []}>();

const {writeFile} = useGit();
const {stageFile} = useWorkingTree();

const content = ref(props.content);
const conflictCount = ref(0);

let editor: MonacoEditor.IStandaloneCodeEditor | null = null;
let contentChangeDisposable: IDisposable | null = null;
const widgets = new Map<string, MonacoEditor.IContentWidget>();

const language = computed(() => getMonacoLanguage(props.filePath));

const editorOptions: MonacoEditor.IStandaloneEditorConstructionOptions = {
	scrollBeyondLastLine: false,
	minimap: {enabled: false},
	fontSize: 12,
	lineHeight: 20,
	fontFamily: '"JetBrains Mono", "Fira Code", monospace',
	renderLineHighlight: 'line',
	glyphMargin: false,
	automaticLayout: true,
};

watch(() => props.content, val => {
	if (val !== content.value) {
		content.value = val;
	}
});

function findConflicts(model: MonacoEditor.ITextModel): Array<IConflict> {
	const lineCount = model.getLineCount();
	const result: Array<IConflict> = [];
	let start = -1;
	let div = -1;

	for (let i = 1; i <= lineCount; ++i) {
		const line = model.getLineContent(i);

		if (line.startsWith('<<<<<<<')) {
			start = i;
			div = -1;
		}
		else if (line.startsWith('=======') && start !== -1) {
			div = i;
		}
		else if (line.startsWith('>>>>>>>') && start !== -1 && div !== -1) {
			const oursLines: Array<string> = [];
			const theirsLines: Array<string> = [];

			for (let j = start + 1; j < div; ++j) {
				oursLines.push(model.getLineContent(j));
			}

			for (let j = div + 1; j < i; ++j) {
				theirsLines.push(model.getLineContent(j));
			}

			result.push({startLine: start, divLine: div, endLine: i, oursLines, theirsLines});
			start = -1;
			div = -1;
		}
	}

	return result;
}

function buildWidgetDom(conflict: IConflict, onAccept: (side: 'ours' | 'theirs' | 'both') => void): HTMLElement {
	const root = document.createElement('div');
	root.className = 'mc-conflict-widget';
	root.setAttribute('test-id', 'conflict-widget');

	const oursBtn = document.createElement('button');
	oursBtn.className = 'mc-conflict-widget__btn mc-conflict-widget__btn--ours';
	oursBtn.setAttribute('test-id', 'accept-ours-btn');
	oursBtn.textContent = 'Accept ours';
	oursBtn.addEventListener('click', () => onAccept('ours'));

	const theirsBtn = document.createElement('button');
	theirsBtn.className = 'mc-conflict-widget__btn mc-conflict-widget__btn--theirs';
	theirsBtn.setAttribute('test-id', 'accept-theirs-btn');
	theirsBtn.textContent = 'Accept theirs';
	theirsBtn.addEventListener('click', () => onAccept('theirs'));

	const bothBtn = document.createElement('button');
	bothBtn.className = 'mc-conflict-widget__btn mc-conflict-widget__btn--both';
	bothBtn.setAttribute('test-id', 'accept-both-btn');
	bothBtn.textContent = 'Accept both';
	bothBtn.addEventListener('click', () => onAccept('both'));

	root.append(oursBtn, theirsBtn, bothBtn);

	void conflict;

	return root;
}

function rebuildWidgets(): void {
	if (!editor) return;

	for (const widget of widgets.values()) {
		editor.removeContentWidget(widget);
	}

	widgets.clear();

	const model = editor.getModel();

	if (!model) {
		conflictCount.value = 0;

		return;
	}

	const conflicts = findConflicts(model);
	conflictCount.value = conflicts.length;

	conflicts.forEach((conflict, idx) => {
		const id = `mc-conflict-${idx}-${conflict.startLine}`;
		const dom = buildWidgetDom(conflict, side => acceptSide(conflict, side));

		const widget: MonacoEditor.IContentWidget = {
			getId: () => id,
			getDomNode: () => dom,
			getPosition: () => ({
				position: {lineNumber: conflict.startLine, column: 1},
				preference: [1], // ContentWidgetPositionPreference.ABOVE
			}),
		};

		editor!.addContentWidget(widget);
		widgets.set(id, widget);
	});
}

function acceptSide(conflict: IConflict, side: 'ours' | 'theirs' | 'both'): void {
	if (!editor) return;

	const model = editor.getModel();

	if (!model) return;

	const replacementLines = side === 'ours'
		? conflict.oursLines
		: side === 'theirs'
			? conflict.theirsLines
			: [...conflict.oursLines, ...conflict.theirsLines];

	const replacement = replacementLines.length > 0
		? replacementLines.join('\n') + '\n'
		: '';

	const endLineMaxCol = model.getLineMaxColumn(conflict.endLine);

	editor.executeEdits('accept-side', [{
		range: {
			startLineNumber: conflict.startLine,
			startColumn: 1,
			endLineNumber: conflict.endLine,
			endColumn: endLineMaxCol,
		},
		text: replacement.replace(/\n$/, ''),
		forceMoveMarkers: true,
	}]);

	// Trigger re-parse via the content-change listener.
}

function handleMount(editorInstance: MonacoEditor.IStandaloneCodeEditor): void {
	editor = editorInstance;

	rebuildWidgets();

	contentChangeDisposable = editor.onDidChangeModelContent(() => {
		rebuildWidgets();
	});
}

async function handleSave(): Promise<void> {
	await writeFile(props.filePath, content.value);
	await stageFile(props.filePath);
	emit('saved');
}

onBeforeUnmount(() => {
	contentChangeDisposable?.dispose();
	contentChangeDisposable = null;

	if (editor) {
		for (const widget of widgets.values()) {
			editor.removeContentWidget(widget);
		}
	}

	widgets.clear();
	editor = null;
});
</script>

<style lang="scss">
.mc-conflict-widget {
	display: inline-flex;
	gap: 4px;
	padding: 2px 4px;
	background: rgba(0, 0, 0, 0.7);
	border-radius: 3px;
	font-family: "JetBrains Mono", "Fira Code", monospace;
	font-size: 11px;
	pointer-events: auto;

	&__btn {
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 3px;
		padding: 2px 8px;
		font-size: 11px;
		font-family: inherit;
		cursor: pointer;
		color: #e0e0e0;
		background: transparent;
		transition: all 0.1s;

		&:hover {
			background: rgba(255, 255, 255, 0.08);
		}

		&--ours {
			color: #6f9ef8;
			border-color: rgba(111, 158, 248, 0.4);

			&:hover {
				background: rgba(111, 158, 248, 0.15);
			}
		}

		&--theirs {
			color: #f89b6f;
			border-color: rgba(248, 155, 111, 0.4);

			&:hover {
				background: rgba(248, 155, 111, 0.15);
			}
		}

		&--both {
			color: #6ff8a0;
			border-color: rgba(111, 248, 160, 0.4);

			&:hover {
				background: rgba(111, 248, 160, 0.15);
			}
		}
	}
}
</style>

<style scoped lang="scss">
.monaco-conflict-editor {
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

	&__editor {
		flex: 1;
		overflow: hidden;
	}

	&__monaco {
		width: 100%;
		height: 100%;
		min-height: 200px;
	}
}
</style>
