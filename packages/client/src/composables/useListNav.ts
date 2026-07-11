import {ref} from 'vue';
import {useCommands} from './useCommands';

interface IListNavHandlers {
	moveUp: () => void;
	moveDown: () => void;
}

// Which list ArrowUp/ArrowDown drive — set to the list the user last interacted
// with. A single document-level listener routes the keys to that list's handlers.
const activeList = ref<string | null>(null);
const registry = new Map<string, IListNavHandlers>();
let listening = false;

function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;

	if (!el) return false;

	return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
	if (isTypingTarget(event.target)) return;

	const {paletteOpen} = useCommands();

	if (paletteOpen.value) return;

	const id = activeList.value;

	if (!id) return;

	const handlers = registry.get(id);

	if (!handlers) return;

	event.preventDefault();

	if (event.key === 'ArrowUp') handlers.moveUp();
	else handlers.moveDown();
}

export function useListNav() {
	function ensureListening(): void {
		if (listening) return;

		document.addEventListener('keydown', onKeydown);
		listening = true;
	}

	function register(id: string, handlers: IListNavHandlers): void {
		registry.set(id, handlers);
		ensureListening();
	}

	function unregister(id: string): void {
		registry.delete(id);

		if (activeList.value === id) activeList.value = null;
	}

	function setActive(id: string): void {
		activeList.value = id;
	}

	return {register, unregister, setActive, activeList};
}
