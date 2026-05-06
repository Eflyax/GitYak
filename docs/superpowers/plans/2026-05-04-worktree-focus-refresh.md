# Worktree Refresh on Window Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically refresh the worktree status when the application window regains focus (alt+tab or browser tab switch), with 800 ms debounce.

**Architecture:** A new generic composable `useWindowFocus` listens to `document.visibilitychange` and `window.focus` events, wraps the callback in a shared debounce, and exposes a `destroy()` method for cleanup. `AppLayout.vue` wires it to `useWorkingTree().loadStatus()` on mount and tears it down on unmount.

**Tech Stack:** Vue 3, TypeScript, Web API (`document.visibilitychange`, `window.focus`)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `packages/client/src/composables/useWindowFocus.ts` | Generic window focus composable with debounce |
| Modify | `packages/client/src/ui/components/AppLayout.vue` | Wire focus refresh on mount/unmount |

---

## Task 1: Create `useWindowFocus` composable

**Files:**
- Create: `packages/client/src/composables/useWindowFocus.ts`

- [ ] **Step 1: Create the file with full implementation**

Create `packages/client/src/composables/useWindowFocus.ts` with this exact content:

```ts
export interface IUseWindowFocus {
	onFocus: (callback: () => void, debounceMs?: number) => void;
	destroy: () => void;
}

function debounce(fn: () => void, ms: number): { call: () => void; cancel: () => void } {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return {
		call: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			timer = setTimeout(fn, ms);
		},
		cancel: () => {
			if (timer !== undefined) {
				clearTimeout(timer);
				timer = undefined;
			}
		},
	};
}

export const useWindowFocus: () => IUseWindowFocus = () => {
	let debouncedCallback: ReturnType<typeof debounce> | undefined;
	let visibilityHandler: (() => void) | undefined;
	let focusHandler: (() => void) | undefined;

	function onFocus(callback: () => void, debounceMs = 800): void {
		debouncedCallback = debounce(callback, debounceMs);

		visibilityHandler = () => {
			if (document.visibilityState === 'visible') {
				debouncedCallback!.call();
			}
		};

		focusHandler = () => {
			debouncedCallback!.call();
		};

		document.addEventListener('visibilitychange', visibilityHandler);
		window.addEventListener('focus', focusHandler);
	}

	function destroy(): void {
		if (debouncedCallback !== undefined) {
			debouncedCallback.cancel();
		}
		if (visibilityHandler !== undefined) {
			document.removeEventListener('visibilitychange', visibilityHandler);
		}
		if (focusHandler !== undefined) {
			window.removeEventListener('focus', focusHandler);
		}
	}

	const instance: IUseWindowFocus = {
		onFocus,
		destroy,
	};

	return instance;
};
```

- [ ] **Step 2: Type-check**

```bash
yarn workspace @git-yak/client typecheck
```

Expected: no errors related to `useWindowFocus.ts`.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/composables/useWindowFocus.ts
git commit -m "feat: add useWindowFocus composable with debounce"
```

---

## Task 2: Wire focus refresh into `AppLayout.vue`

**Files:**
- Modify: `packages/client/src/ui/components/AppLayout.vue`

- [ ] **Step 1: Add imports**

In `AppLayout.vue`, find the existing import block inside `<script setup lang="ts">`:

```ts
import {computed, onMounted} from 'vue';
```

Replace with:

```ts
import {computed, onMounted, onUnmounted} from 'vue';
import {useWindowFocus} from '@/composables/useWindowFocus';
import {useWorkingTree} from '@/composables/useWorkingTree';
```

- [ ] **Step 2: Instantiate composable and wire lifecycle hooks**

Find the existing `onMounted` block:

```ts
onMounted(() => {
	openLastOpenProject();
});
```

Replace with:

```ts
const windowFocus = useWindowFocus();

onMounted(() => {
	openLastOpenProject();
	windowFocus.onFocus(() => {
		useWorkingTree().loadStatus();
	});
});

onUnmounted(() => {
	windowFocus.destroy();
});
```

- [ ] **Step 3: Type-check**

```bash
yarn workspace @git-yak/client typecheck
```

Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run the app:

```bash
yarn dev
```

1. Open a project in the app
2. Make a file change in the terminal (e.g. `touch /path/to/repo/test.txt`)
3. Switch to another app or browser tab, then switch back
4. Verify the new file appears in the unstaged panel within ~1 second
5. Delete the file: `rm /path/to/repo/test.txt`, switch away and back — verify it disappears

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/components/AppLayout.vue
git commit -m "feat: refresh worktree on window focus"
```
