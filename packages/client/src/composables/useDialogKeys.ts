import {watch, onUnmounted} from 'vue';
import type {Ref} from 'vue';

export type TDialogActionType = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error';

export interface IDialogAction {
	/** The letter that runs this action. Shown on the button, so the two cannot drift apart. */
	key: string;
	label: string;
	testId?: string;
	type?: TDialogActionType;
	disabled?: boolean;
	loading?: boolean;
	onSelect: () => void;
}

// Only the dialog opened last answers to keys: a confirmation raised on top of another
// dialog must not have its letters read by the one underneath.
const stack: Array<symbol> = [];

function isTypingTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;

	if (!el || typeof el.tagName !== 'string') return false;

	return el.tagName === 'INPUT'
		|| el.tagName === 'TEXTAREA'
		|| el.tagName === 'SELECT'
		|| el.isContentEditable === true;
}

/**
 * Runs a dialog's actions from the keyboard while that dialog is the open one. `actions` is
 * read on every keystroke so a disabled button is never triggered by its key.
 */
export function useDialogKeys(active: Ref<boolean>, actions: () => Array<IDialogAction>): void {
	const id = Symbol('dialog-keys');

	function handler(event: KeyboardEvent): void {
		if (stack[stack.length - 1] !== id) return;
		// A modifier means the keystroke is a command (⌘P and friends), not an answer here.
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (isTypingTarget(event.target)) return;

		const action = actions().find(a => !a.disabled && a.key.toLowerCase() === event.key.toLowerCase());

		if (!action) return;

		event.preventDefault();
		// Listening in the capture phase and stopping here keeps the app-wide keyboard handler
		// from reading the same keystroke as a command.
		event.stopPropagation();
		action.onSelect();
	}

	function release(): void {
		const index = stack.lastIndexOf(id);

		if (index !== -1) stack.splice(index, 1);

		document.removeEventListener('keydown', handler, true);
	}

	watch(active, isActive => {
		if (isActive) {
			release();
			stack.push(id);
			document.addEventListener('keydown', handler, true);
		}
		else {
			release();
		}
	}, {immediate: true});

	onUnmounted(release);
}
