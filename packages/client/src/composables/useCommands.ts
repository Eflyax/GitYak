import {ref, computed, readonly} from 'vue';
import type {ComputedRef, Ref} from 'vue';

export interface IKeybinding {
    key: string;
    meta?: boolean;
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
}

export interface ISubItem {
    id: string;
    label: string;
    action: () => void | Promise<void>;
}

export interface ICommand {
    id: string;
    label: string;
    shortcut?: string;
    keybinding?: IKeybinding;
    isEnabled?: () => boolean;
    action?: () => void | Promise<void>;
    getItems?: (query: string) => Array<ISubItem>;
    priority?: number;
}

export interface IUseCommands {
    allCommands: ComputedRef<Array<ICommand>>;
    paletteOpen: Ref<boolean>;
    registerCommand: (cmd: ICommand) => void;
    unregisterCommand: (id: string) => void;
    executeCommand: (id: string) => Promise<void>;
    matchKeybinding: (event: KeyboardEvent) => ICommand | undefined;
    openPalette: () => void;
    closePalette: () => void;
}

const commands = ref(new Map<string, ICommand>());
const paletteOpen = ref(false);

const allCommands = computed<Array<ICommand>>(() =>
    Array.from(commands.value.values()).sort((a, b) => a.label.localeCompare(b.label))
);

function registerCommand(cmd: ICommand): void {
    commands.value = new Map(commands.value).set(cmd.id, cmd);
}

function unregisterCommand(id: string): void {
    const next = new Map(commands.value);
    next.delete(id);
    commands.value = next;
}

async function executeCommand(id: string): Promise<void> {
    const cmd = commands.value.get(id);

    if (!cmd) {
        return;
    }

    if (cmd.isEnabled && !cmd.isEnabled()) {
        return;
    }

    await cmd.action?.();
}

function matchKeybinding(event: KeyboardEvent): ICommand | undefined {
    const key = event.key.toLowerCase();

    for (const cmd of commands.value.values()) {
        const kb = cmd.keybinding;

        if (!kb) {
            continue;
        }

        if (kb.key !== key) {
            continue;
        }

        if (!!kb.meta !== event.metaKey) {
            continue;
        }

        if (!!kb.shift !== event.shiftKey) {
            continue;
        }

        if (!!kb.ctrl !== event.ctrlKey) {
            continue;
        }

        if (!!kb.alt !== event.altKey) {
            continue;
        }

        return cmd;
    }

    return undefined;
}

function openPalette(): void {
    paletteOpen.value = true;
}

function closePalette(): void {
    paletteOpen.value = false;
}

export const useCommands: () => IUseCommands = () => ({
    allCommands,
    paletteOpen: readonly(paletteOpen) as typeof paletteOpen,
    registerCommand,
    unregisterCommand,
    executeCommand,
    matchKeybinding,
    openPalette,
    closePalette,
});
