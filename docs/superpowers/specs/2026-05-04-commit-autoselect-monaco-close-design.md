# Commit Auto-Select & Monaco Auto-Close Design

**Date:** 2026-05-04  
**Status:** Approved

## Problem

Two related UX gaps:

1. **Commit graph:** On initial project load with commits present, nothing is auto-selected — the user must click manually to see commit details.
2. **Monaco editor:** When all staged/unstaged files are committed (working tree becomes empty), the Monaco editor stays open showing a now-invalid diff.

## Features

### Feature 1: Auto-select first commit on initial load

**Trigger:** `commits` reactive array transitions from empty to non-empty on first load, and `selectedHashes` is empty.

**Action:** Select the first regular commit (not WORKING_TREE, not stash).

**Where:** `CommitHistory.vue` — has direct access to `commits` and `selectCommit`.

**Implementation:**

```ts
watch(commits, (newCommits) => {
    if (newCommits.length && !selectedHashes.value.length) {
        const firstCommit = newCommits.find(c => c.hash !== 'WORKING_TREE' && !c.isStash);
        if (firstCommit) {
            selectCommit(firstCommit.hash);
        }
    }
}, { immediate: false });
```

`immediate: false` ensures the watcher fires only on actual data change (first load), not synchronously during setup.

**Fallback:** The existing `if (!selectedHashes.value.length) { selectCommit('WORKING_TREE') }` in `AppLayout.vue` is kept as a fallback for repositories with no commits (fresh repo).

### Feature 2: Close Monaco when working tree becomes empty

**Trigger:** Total count of `staged + unstaged` files drops to 0 while Monaco is open and WORKING_TREE is selected.

**Action:** Set `activePath.value = null` + call `closeFileDiff()`.

**Where:** `AppLayout.vue` — has access to `activePath` (useGit), `closeFileDiff` (useLayout), `isWorkingTreeSelected` (computed), and `status` (useWorkingTree).

**Implementation:**

```ts
const {status} = useWorkingTree();

watch(
    () => status.value.staged.length + status.value.unstaged.length,
    (total) => {
        if (total === 0 && isWorkingTreeSelected.value && activePath.value) {
            activePath.value = null;
            closeFileDiff();
        }
    }
);
```

**Guard conditions:**
- `isWorkingTreeSelected` must be true — prevents closing Monaco when viewing `changed-file` in CommitDetails
- `activePath.value` must be set — no-op if Monaco is already closed

## Files Modified

| File | Change |
|------|--------|
| `packages/client/src/ui/components/CommitHistory/CommitHistory.vue` | Add watcher for commits auto-select |
| `packages/client/src/ui/components/AppLayout.vue` | Add watcher + import useWorkingTree |

## Edge Cases

| Case | Handling |
|------|----------|
| Fresh repo (no commits) | AppLayout fallback keeps WORKING_TREE selected |
| All commits are stashes | Watcher finds no regular commit → no selection change |
| Monaco open on changed-file (CommitDetails) | `isWorkingTreeSelected` is false → watcher does not fire |
| Working tree already empty on load | Watcher fires but `activePath` is null → no-op |
| Rapid stage/unstage (files go to 0 then back) | Watcher fires on 0, Monaco closes; re-opens only on explicit file click |
