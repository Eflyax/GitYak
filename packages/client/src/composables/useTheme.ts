import {ref, computed, readonly} from 'vue';
import type {ComputedRef} from 'vue';
import {invoke} from '@tauri-apps/api/core';
import type {IResolvedTheme, IThemeEntry, IThemeFile} from '@/domain/models/Theme';
import {parseJsonc, resolveScope} from '@/infrastructure/themeExpressionEvaluator';
import {tokenToCssVar} from '@/infrastructure/themeTokenMap';

const THEME_PATH_KEY = 'git-yak:theme';
const THEMES_DIR_KEY = 'git-yak:themes-dir';
const DEFAULT_THEMES_DIR = '~/.git-yak/themes';

const STYLE_IDS = {
    root:    'git-yak-theme-root',
    toolbar: 'git-yak-theme-toolbar',
    tabsbar: 'git-yak-theme-tabsbar',
} as const;

const availableThemes = ref<Array<IThemeEntry>>([]);
const activeTheme = ref<IResolvedTheme | undefined>();
const themesDir = ref<string>(localStorage.getItem(THEMES_DIR_KEY) ?? DEFAULT_THEMES_DIR);
const themeVersion = ref(0);

export interface IUseTheme {
    availableThemes: typeof availableThemes;
    activeTheme: typeof activeTheme;
    themesDir: typeof themesDir;
    themeVersion: typeof themeVersion;
    loadThemes: (dir?: string) => Promise<void>;
    applyTheme: (filePath: string) => Promise<void>;
    naiveUiOverrides: ComputedRef<Record<string, unknown>>;
}

const naiveUiOverrides = computed<Record<string, unknown>>(() => {
    const root = activeTheme.value?.root;

    if (!root) {
        return {
            common: {
                primaryColor: '#6f9ef8',
                primaryColorHover: '#8fb4ff',
                bodyColor: '#0d0f11',
                cardColor: '#111418',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontFamilyMono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            },
        };
    }

    return {
        common: {
            primaryColor:      root['text-accent'] ?? root['blue'] ?? '#6f9ef8',
            primaryColorHover: root['blue'] ?? '#8fb4ff',
            bodyColor:         root['app__bg0'] ?? '#0d0f11',
            cardColor:         root['panel__bg0'] ?? '#111418',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            fontFamilyMono: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        },
    };
});

function getOrCreateStyleEl(id: string): HTMLStyleElement {
    let el = document.getElementById(id) as HTMLStyleElement | null;

    if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
    }

    return el;
}

function buildCssBlock(selector: string, tokens: Record<string, string>): string {
    const lines = Object.entries(tokens)
        .filter(([key]) => !key.startsWith('.'))
        .map(([key, value]) => {
            const cssVar = tokenToCssVar(key);
            return `    ${cssVar}: ${value};`;
        });

    if (!lines.length) {
        return '';
    }

    return `${selector} {\n${lines.join('\n')}\n}`;
}

function applyCssVars(resolved: IResolvedTheme): void {
    const rootEl = getOrCreateStyleEl(STYLE_IDS.root);
    rootEl.textContent = buildCssBlock(':root', resolved.root);

    const toolbarEl = getOrCreateStyleEl(STYLE_IDS.toolbar);
    toolbarEl.textContent = buildCssBlock('.toolbar', resolved.toolbar);

    const tabsbarEl = getOrCreateStyleEl(STYLE_IDS.tabsbar);
    tabsbarEl.textContent = buildCssBlock('.tabsbar', resolved.tabsbar);
}

async function readAndParseTheme(filePath: string): Promise<IThemeFile> {
    const raw = await invoke<string>('read_file_at', {
        path: filePath,
        nullIfNotExists: false,
    });
    return parseJsonc(raw) as IThemeFile;
}

async function loadThemes(dir?: string): Promise<void> {
    const directory = dir ?? themesDir.value;

    if (dir) {
        themesDir.value = dir;
        localStorage.setItem(THEMES_DIR_KEY, dir);
    }

    try {
        const paths = await invoke<Array<string>>('list_theme_files', {dir: directory});
        const entries: Array<IThemeEntry> = [];

        for (const filePath of paths) {
            try {
                const parsed = await readAndParseTheme(filePath);
                entries.push({
                    name: parsed.meta?.name ?? filePath,
                    filePath,
                });
            }
            catch {
                console.warn(`[useTheme] Failed to parse theme: ${filePath}`);
            }
        }

        availableThemes.value = entries;
    }
    catch {
        console.warn(`[useTheme] Could not list themes from: ${directory}`);
        availableThemes.value = [];
    }
}

async function applyTheme(filePath: string): Promise<void> {
    try {
        const parsed = await readAndParseTheme(filePath);
        const rootResolved = resolveScope(parsed.themeValues.root);
        const toolbarResolved = resolveScope(parsed.themeValues.toolbar ?? {}, rootResolved);
        const tabsbarResolved = resolveScope(parsed.themeValues.tabsbar ?? {}, rootResolved);

        const resolved: IResolvedTheme = {
            meta: parsed.meta,
            filePath,
            root:    rootResolved,
            toolbar: toolbarResolved,
            tabsbar: tabsbarResolved,
        };

        activeTheme.value = resolved;
        applyCssVars(resolved);
        themeVersion.value++;
        localStorage.setItem(THEME_PATH_KEY, filePath);
    }
    catch (err) {
        console.error('[useTheme] Failed to apply theme:', err);
    }
}

async function restoreSavedTheme(): Promise<void> {
    const saved = localStorage.getItem(THEME_PATH_KEY);

    if (saved) {
        await applyTheme(saved);
    }
}

export const useTheme: () => IUseTheme = () => {
    const instance: IUseTheme = {
        availableThemes: readonly(availableThemes) as typeof availableThemes,
        activeTheme: readonly(activeTheme) as typeof activeTheme,
        themesDir,
        themeVersion: readonly(themeVersion) as typeof themeVersion,
        loadThemes,
        applyTheme,
        naiveUiOverrides,
    };

    return instance;
};

export {restoreSavedTheme};
