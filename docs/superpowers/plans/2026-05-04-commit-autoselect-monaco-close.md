# Commit Auto-Select & Monaco Auto-Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-select the first commit on initial project load, and auto-close Monaco editor when the working tree becomes empty.

**Architecture:** Two independent watchers: one in `CommitHistory.vue` watching the `commits` array to trigger initial selection, one in `AppLayout.vue` watching staged+unstaged file count to close Monaco. The AppLayout fallback that pre-selects WORKING_TREE is removed — CommitHistory's watcher handles initial selection instead.

**Tech Stack:** Vue 3 (`watch`), TypeScript, existing composables (`useCommits`, `useWorkingTree`, `useGit`, `useLayout`)

---

## File Map

| Action | Path | Change |
|--------|------|--------|
| Modify | `packages/client/src/ui/components/CommitHistory/CommitHistory.vue` | Add watcher for initial commit auto-select |
| Modify | `packages/client/src/ui/components/AppLayout.vue` | Remove WORKING_TREE pre-selection; add watcher to close Monaco on empty working tree |

---

## Task 1: Auto-select first commit in CommitHistory

**Files:**
- Modify: `packages/client/src/ui/components/CommitHistory/CommitHistory.vue`

> Context: `commits` is a module-level `ref<ICommit[]>([])` from `useCommits`. It starts empty and gets populated asynchronously by `loadCommits()` called in `onMounted`. `selectedHashes` is also from `useCommits`. `watch` is already imported from Vue on line 67. `commits`, `selectedHashes`, and `selectCommit` are already destructured on line 88.

- [ ] **Step 1: Add the watcher**

In `CommitHistory.vue`, after line 156 (`watch(() => currentProject.value, refresh);`), add:

```ts
watch(commits, newCommits => {
	if (!newCommits.length || selectedHashes.value.length) {
		return;
	}

	const firstCommit = newCommits.find(c => c.hash !== 'WORKING_TREE' && !c.isStash);

	selectCommit(firstCommit ? firstCommit.hash : 'WORKING_TREE');
}, {immediate: false});
```

Explanation:
- `immediate: false` — only fires on actual data change, not synchronously at setup time
- Guard `!newCommits.length` — no-op if commits list is empty (fresh repo with no commits yet)
- Guard `selectedHashes.value.length` — skip if something is already selected (not initial load)
- `find(c => c.hash !== 'WORKING_TREE' && !c.isStash)` — first real commit (not pseudo-entries)
- Fallback to `'WORKING_TREE'` if no real commit found (repo with only stashes, or fresh repo)

- [ ] **Step 2: Remove WORKING_TREE pre-selection from AppLayout.vue**

In `packages/client/src/ui/components/AppLayout.vue`, find and remove these three lines (currently lines 100–102):

```ts
if (!selectedHashes.value.length) {
	selectCommit('WORKING_TREE');
}
```

This synchronous pre-selection ran before commits loaded, always forcing WORKING_TREE. The CommitHistory watcher now handles initial selection correctly after commits arrive.

- [ ] **Step 3: Type-check**

```bash
yarn workspace @git-yak/client typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/ui/components/CommitHistory/CommitHistory.vue
git add packages/client/src/ui/components/AppLayout.vue
git commit -m "feat: auto-select first commit on initial project load"
```

---

## Task 2: Auto-close Monaco when working tree becomes empty

**Files:**
- Modify: `packages/client/src/ui/components/AppLayout.vue`

> Context: `AppLayout.vue` already imports `useWorkingTree` and destructures `loadStatus` from it (line 105). It also has `activePath` from `useGit` (line 88), `closeFileDiff` from `useLayout` (line 86), and `isWorkingTreeSelected` computed (line 98). `watch` is NOT yet imported in AppLayout — it currently imports only `computed, onMounted, onUnmounted` from vue.

- [ ] **Step 1: Add `watch` to Vue import**

In `AppLayout.vue`, find line 65:

```ts
import {computed, onMounted, onUnmounted} from 'vue';
```

Replace with:

```ts
import {computed, onMounted, onUnmounted, watch} from 'vue';
```

- [ ] **Step 2: Destructure `status` from `useWorkingTree`**

Find line 105:

```ts
const {loadStatus} = useWorkingTree();
```

Replace with:

```ts
const {loadStatus, status} = useWorkingTree();
```

- [ ] **Step 3: Add the watcher**

After the `onUnmounted` block (after line 119), add:

```ts
watch(
	() => status.value.staged.length + status.value.unstaged.length,
	total => {
		if (total === 0 && isWorkingTreeSelected.value && activePath.value) {
			activePath.value = null;
			closeFileDiff();
		}
	},
);
```

Explanation:
- Watches the combined count of staged + unstaged files
- Only closes Monaco when all three conditions hold:
  1. `total === 0` — working tree is now empty
  2. `isWorkingTreeSelected.value` — we are in working tree view (not CommitDetails showing a `changed-file`)
  3. `activePath.value` — Monaco is actually open (no-op if already closed)
- No `immediate` option needed — default is `false`, watcher only fires on changes

- [ ] **Step 4: Type-check**

```bash
yarn workspace @git-yak/client typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/ui/components/AppLayout.vue
git commit -m "feat: auto-close Monaco when working tree becomes empty"
```
