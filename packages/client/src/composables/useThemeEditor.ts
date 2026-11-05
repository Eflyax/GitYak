import {computed, readonly, ref, shallowRef} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import {homeDir} from '@tauri-apps/api/path';
import type {IThemeFile} from '@/domain/models/Theme';
import {parseJsonc} from '@/infrastructure/themeExpressionEvaluator';
import {isBuiltinThemeId} from '@/infrastructure/builtinThemes';
import {
	EDITABLE_THEME_COLORS,
	patchThemeSource,
	rootOverrides,
	themeFileName,
	withRootOverrides,
} from '@/domain/services/themeEditor';
import {useTheme} from './useTheme';

interface IThemeEditSession {
	/** `copy` saves into a new file in the themes directory; `edit` overwrites `sourcePath`. */
	mode: 'copy' | 'edit'
	name: string
	/** Theme the session started from; Cancel brings it back. */
	sourcePath: string
	/** Its file as written, so a save keeps the comments and formatting. */
	source: string
	theme: IThemeFile
}

const
	session = shallowRef<IThemeEditSession | null>(null),
	// Colour shown for each editable token (resolved value at the start, then the user's pick).
	colors = ref<Record<string, string>>({}),
	// Only the tokens the user actually changed get written; the rest keep their derivations.
	changed = ref<Record<string, string>>({}),
	isSaving = ref(false);

const isEditorOpen = computed(() => session.value !== null);

let previewFrame: number | null = null;

async function expandHome(path: string): Promise<string> {
	if (!path.startsWith('~/')) {
		return path;
	}

	const home = (await homeDir()).replace(/\/+$/, '');

	return `${home}/${path.slice(2)}`;
}

export function useThemeEditor() {
	const {activeTheme, themesDir, applyTheme, previewTheme, readThemeSource, loadThemes} = useTheme();

	const canEditActive = computed(() => {
		const path = activeTheme.value?.filePath;

		return !!path && !isBuiltinThemeId(path);
	});

	async function open(mode: IThemeEditSession['mode'], name: string): Promise<void> {
		const active = activeTheme.value;

		if (!active) {
			throw new Error('No theme is active');
		}

		const source = await readThemeSource(active.filePath);

		colors.value = Object.fromEntries(EDITABLE_THEME_COLORS.map(c => [
			c.token,
			active.root[c.token] ?? (c.token === '.text-color' ? active.root['text-selected'] : undefined) ?? '#000000',
		]));
		changed.value = {};
		session.value = {
			mode,
			name,
			sourcePath: active.filePath,
			source,
			theme: parseJsonc(source) as IThemeFile,
		};
	}

	/** Opens the editor on a copy of the active theme, saved under `name` as a new file. */
	async function startCopy(name: string): Promise<void> {
		const trimmed = name.trim();

		if (!trimmed) {
			throw new Error('Enter a name for the copy');
		}

		await open('copy', trimmed);
	}

	/** Opens the editor on the active theme; only custom (copied) themes can be edited. */
	async function startEdit(): Promise<void> {
		if (!canEditActive.value) {
			throw new Error('Built-in themes cannot be edited; copy the theme first');
		}

		await open('edit', activeTheme.value!.meta.name);
	}

	function overriddenTheme(current: IThemeEditSession): IThemeFile {
		return withRootOverrides(
			current.theme,
			current.name,
			rootOverrides(current.theme.themeValues.root, changed.value),
		);
	}

	// A colour picker reports every drag step; repaint at most once per frame.
	function schedulePreview(): void {
		if (previewFrame !== null) return;

		previewFrame = requestAnimationFrame(() => {
			previewFrame = null;

			const current = session.value;

			if (current) {
				previewTheme(overriddenTheme(current), current.sourcePath);
			}
		});
	}

	function setColor(token: string, value: string): void {
		if (!session.value) return;

		colors.value = {...colors.value, [token]: value};
		changed.value = {...changed.value, [token]: value};
		schedulePreview();
	}

	function close(): void {
		if (previewFrame !== null) {
			cancelAnimationFrame(previewFrame);
			previewFrame = null;
		}

		session.value = null;
		changed.value = {};
	}

	/** Discards the changes and repaints the app with the theme as it was. */
	async function cancel(): Promise<void> {
		const current = session.value;

		close();

		if (current) {
			await applyTheme(current.sourcePath);
		}
	}

	async function targetPath(current: IThemeEditSession): Promise<string> {
		if (current.mode === 'edit') {
			return current.sourcePath;
		}

		const dir = (await expandHome(themesDir.value.trim())).replace(/\/+$/, '');

		if (!dir) {
			throw new Error('Set a themes directory in Settings first');
		}

		const path = `${dir}/${themeFileName(current.name)}`;
		const existing = await invoke<string | null>('read_file_at', {path, nullIfNotExists: true});

		if (existing !== null) {
			throw new Error(`A theme file ${themeFileName(current.name)} already exists in ${themesDir.value}`);
		}

		return path;
	}

	/** Writes the theme file, makes it the active theme and closes the editor. */
	async function save(): Promise<void> {
		const current = session.value;

		if (!current || isSaving.value) return;

		isSaving.value = true;

		try {
			const path = await targetPath(current);
			const values = rootOverrides(current.theme.themeValues.root, changed.value);
			const content = patchThemeSource(current.source, current.name, values);

			await invoke('write_file_at', {path, content, makeDirectory: true});
			close();
			await loadThemes();
			await applyTheme(path);
		}
		finally {
			isSaving.value = false;
		}
	}

	return {
		isEditorOpen,
		canEditActive,
		session: readonly(session),
		colors: readonly(colors),
		isSaving: readonly(isSaving),
		startCopy,
		startEdit,
		setColor,
		cancel,
		save,
	};
}
