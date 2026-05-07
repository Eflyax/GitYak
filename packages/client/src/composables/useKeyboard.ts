import {getCurrentWindow} from '@tauri-apps/api/window';
import {useCommands} from './useCommands';

export interface IUseKeyboard {
    mount: () => void;
    unmount: () => void;
}

const PALETTE_KEYBINDING = {key: 'p', meta: true, shift: true};

let isFullscreen = false;
let unlistenResize: (() => void) | undefined;

async function initFullscreenTracking(): Promise<void> {
    const appWindow = getCurrentWindow();
    isFullscreen = await appWindow.isFullscreen();
    unlistenResize = await appWindow.listen('tauri://resize', async () => {
        isFullscreen = await appWindow.isFullscreen();
    });
}

export const useKeyboard: () => IUseKeyboard = () => {
    const {matchKeybinding, executeCommand, openPalette} = useCommands();

    function handler(event: KeyboardEvent): void {
        if (event.key === 'Escape' && isFullscreen) {
            event.preventDefault();
        }

        if (
            event.key.toLowerCase() === PALETTE_KEYBINDING.key &&
            event.metaKey === true &&
            event.shiftKey === true
        ) {
            event.preventDefault();
            openPalette();
            return;
        }

        const cmd = matchKeybinding(event);

        if (cmd) {
            event.preventDefault();
            executeCommand(cmd.id);
        }
    }

    function mount(): void {
        document.addEventListener('keydown', handler);
        void initFullscreenTracking();
    }

    function unmount(): void {
        document.removeEventListener('keydown', handler);
        unlistenResize?.();
    }

    const instance: IUseKeyboard = {mount, unmount};

    return instance;
};
