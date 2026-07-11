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
					<span v-if="i < pathParts.length - 1" class="file-diff__breadcrumb-sep">/</span>
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
				<button test-id="toggle-line-numbers-btn" class="file-diff__action-btn" title="Line numbers">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
						<path d="M2 17h2v.5H3v1h1v.5H2v1h3v-4H2v1zm1-9h1V4H2v1h1v3zm-1 3h1.8L2 13.1v.9h3v-1H3.2L5 10.9V10H2v1zm5-6v2h14V5H7zm0 14h14v-2H7v2zm0-6h14v-2H7v2z"/>
					</svg>
				</button>
				<button test-id="toggle-history-btn" class="file-diff__action-btn" title="History">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
						<path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
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

			<button test-id="close-file-diff-btn" class="file-diff__action-btn" title="Close" @click="emit('close')">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
					<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
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
		<div v-else class="file-diff__editor">
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
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount} from 'vue';
import type {editor} from 'monaco-editor';
import type * as Monaco from 'monaco-editor';
import {NButton} from 'naive-ui';
import {VueMonacoDiffEditor} from '@guolao/vue-monaco-editor';
import {useGit} from '@/composables/useGit';
import {useWorkingTree} from '@/composables/useWorkingTree';
import {useFileDiff} from '@/composables/useFileDiff';
import {getMonacoLanguage} from '@/composables/useMonacoLanguage';
import {useCommands} from '@/composables/useCommands';
import ConflictResolver from './ConflictResolver.vue';

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
const {original, modified} = useFileDiff();

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

function handleEditorMount(editorInstance: editor.IStandaloneDiffEditor, monacoInstance: typeof Monaco): void {
	diffEditor = editorInstance;

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

onBeforeUnmount(() => {
	diffEditor?.dispose();
	diffEditor = null;
});

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
