import {describe, it, expect, beforeEach, vi} from 'vitest';
import {ref} from 'vue';
import type {IResolvedTheme} from '@/domain/models/Theme';
import {parseJsonc} from '@/infrastructure/themeExpressionEvaluator';

const SOURCE = `{
	"meta": {"name": "Grape", "scheme": "dark"},
	"themeValues": {
		// palette
		"root": {
			"app__bg0": "#1A132B",
			"panel__bg0": "lighten(@app__bg0, 6%)"
		}
	}
}
`;

const
	files = new Map<string, string>(),
	invoke = vi.fn(async (command: string, args: Record<string, unknown>): Promise<unknown> => {
		const path = String(args['path']);

		if (command === 'read_file_at') {
			return files.get(path) ?? (args['nullIfNotExists'] ? null : Promise.reject(new Error('No such file')));
		}

		if (command === 'write_file_at') {
			files.set(path, String(args['content']));

			return null;
		}

		throw new Error(`Unexpected command ${command}`);
	}),
	activeTheme = ref<IResolvedTheme | undefined>(),
	themesDir = ref('~/.git-yak/themes'),
	applyTheme = vi.fn(async (_path: string) => {}),
	previewTheme = vi.fn(),
	loadThemes = vi.fn(async () => {}),
	readThemeSource = vi.fn(async (path: string) => files.get(path) ?? SOURCE);

vi.mock('@tauri-apps/api/core', () => ({invoke}));
vi.mock('@tauri-apps/api/path', () => ({homeDir: async () => '/Users/me/'}));
vi.mock('./useTheme', () => ({
	useTheme: () => ({activeTheme, themesDir, applyTheme, previewTheme, loadThemes, readThemeSource}),
}));
// The live preview waits for the next frame; run it right away.
vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
	callback();

	return 1;
});
vi.stubGlobal('cancelAnimationFrame', () => {});

function activate(filePath: string): void {
	activeTheme.value = {
		meta: {name: 'Grape', scheme: 'dark'},
		filePath,
		root: {'app__bg0': '#1A132B', 'panel__bg0': '#231a3a', 'text-selected': '#ffffff'},
		toolbar: {},
		tabsbar: {},
	};
}

// The editor keeps its session in module scope, so every test starts from a fresh module.
async function load(): Promise<ReturnType<typeof import('./useThemeEditor')['useThemeEditor']>> {
	vi.resetModules();

	return (await import('./useThemeEditor')).useThemeEditor();
}

beforeEach(() => {
	files.clear();
	vi.clearAllMocks();
	activate('builtin:grape.jsonc');
});

describe('useThemeEditor copy', () => {
	it('saves the copy as a new file in the themes directory and applies it', async () => {
		const editor = await load();

		await editor.startCopy('Grape (copy)');
		editor.setColor('app__bg0', '#000000');
		await editor.save();

		const path = '/Users/me/.git-yak/themes/grape-copy.jsonc';
		const saved = files.get(path)!;

		expect(saved).toContain('// palette');
		expect(parseJsonc(saved)).toMatchObject({
			meta: {name: 'Grape (copy)'},
			themeValues: {root: {'app__bg0': '#000000', 'panel__bg0': 'lighten(@app__bg0, 6%)'}},
		});
		expect(loadThemes).toHaveBeenCalled();
		expect(applyTheme).toHaveBeenCalledWith(path);
		expect(editor.isEditorOpen.value).toBe(false);
	});

	it('refuses to overwrite an existing theme file and keeps the editor open', async () => {
		files.set('/Users/me/.git-yak/themes/grape-copy.jsonc', 'existing');
		const editor = await load();

		await editor.startCopy('Grape (copy)');
		await expect(editor.save()).rejects.toThrow(/already exists/);

		expect(files.get('/Users/me/.git-yak/themes/grape-copy.jsonc')).toBe('existing');
		expect(editor.isEditorOpen.value).toBe(true);
	});

	it('needs a name', async () => {
		const editor = await load();

		await expect(editor.startCopy('  ')).rejects.toThrow();
		expect(editor.isEditorOpen.value).toBe(false);
	});
});

describe('useThemeEditor edit', () => {
	it('does not edit a built-in theme', async () => {
		const editor = await load();

		expect(editor.canEditActive.value).toBe(false);
		await expect(editor.startEdit()).rejects.toThrow();
	});

	it('overwrites the custom theme file in place', async () => {
		const path = '/Users/me/.git-yak/themes/mine.jsonc';

		files.set(path, SOURCE);
		activate(path);
		const editor = await load();

		await editor.startEdit();
		editor.setColor('app__bg0', '#222222');
		await editor.save();

		expect(parseJsonc(files.get(path)!)).toMatchObject({
			meta: {name: 'Grape'},
			themeValues: {root: {'app__bg0': '#222222'}},
		});
		expect(applyTheme).toHaveBeenCalledWith(path);
	});
});

describe('useThemeEditor preview and cancel', () => {
	it('repaints the app with every change and restores the theme on cancel', async () => {
		const editor = await load();

		await editor.startCopy('Grape (copy)');
		expect(editor.colors.value['app__bg0']).toBe('#1A132B');
		expect(editor.colors.value['.text-color']).toBe('#ffffff');

		editor.setColor('app__bg0', '#101010');
		expect(previewTheme).toHaveBeenLastCalledWith(
			expect.objectContaining({themeValues: expect.objectContaining({root: expect.objectContaining({'app__bg0': '#101010'})})}),
			'builtin:grape.jsonc',
		);

		await editor.cancel();
		expect(applyTheme).toHaveBeenCalledWith('builtin:grape.jsonc');
		expect(editor.isEditorOpen.value).toBe(false);
		expect(files.size).toBe(0);
	});
});
