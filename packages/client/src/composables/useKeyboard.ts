import {useCommands} from './useCommands';

export interface IUseKeyboard {
    mount: () => void;
    unmount: () => void;
}

const PALETTE_KEYBINDING = {key: 'p', meta: true, shift: true};

export const useKeyboard: () => IUseKeyboard = () => {
    const {matchKeybinding, executeCommand, openPalette} = useCommands();

    function handler(event: KeyboardEvent): void {
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
    }

    function unmount(): void {
        document.removeEventListener('keydown', handler);
    }

    const instance: IUseKeyboard = {mount, unmount};

    return instance;
};
