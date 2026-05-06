# Worktree Refresh on Window Focus

**Date:** 2026-05-04  
**Status:** Approved

## Problem

The working tree status is only refreshed after explicit git operations or on component mount. When the user switches to another app and back (alt+tab) or switches browser tabs, the worktree panel may show stale data.

## Goal

Automatically call `loadStatus()` when the application window regains focus, with debounce to avoid redundant calls on rapid switching.

## Scope

- Refresh **only** the worktree (staged/unstaged files via `loadStatus()`)
- Browser mode and Tauri desktop mode both covered
- No changes to Rust backend

## Approach

Use Web API events — `document.visibilitychange` and `window.focus` — which fire in both browser and Tauri (WebView). This avoids Tauri-specific APIs and keeps a single code path.

## Architecture

### New composable: `useWindowFocus`

**Path:** `packages/client/src/composables/useWindowFocus.ts`

```ts
export interface IUseWindowFocus {
    onFocus: (callback: () => void, debounceMs?: number) => void;
    destroy: () => void;
}

export const useWindowFocus: () => IUseWindowFocus = () => { ... }
```

Responsibilities:
- Register `visibilitychange` and `focus` listeners
- Wrap the callback in a debounce (default 800 ms) shared by both events
- `destroy()` removes both listeners and cancels any pending debounce timer

### Integration point: `AppLayout.ts`

In `mounted`: call `useWindowFocus().onFocus(() => useWorkingTree().loadStatus())`  
In `beforeUnmount`: call `destroy()`

## Event Flow

1. User alt+tabs back or switches to the app's browser tab
2. `visibilitychange` fires (visibilityState === 'visible') **and/or** `window.focus` fires
3. Both events share one debounced callback — fires once after 800 ms of silence
4. `loadStatus()` executes `git status --porcelain -z` and updates staged/unstaged state

## Edge Cases

| Case | Handling |
|------|----------|
| No project open | `loadStatus()` exits silently — no guard needed in `useWindowFocus` |
| WebSocket disconnected | Fails the same way as any other git call — no special handling |
| Rapid focus/blur cycling | Debounce (800 ms) absorbs multiple events into one call |
| Component unmounts before debounce fires | `destroy()` calls `cancel()` on the debounce timer |

## Debounce implementation

Custom inline debounce (no external dependency) with a `cancel()` method:

```ts
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
```
