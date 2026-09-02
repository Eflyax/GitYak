# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 02-stash-conflict.spec.ts >> stash pop with conflict shows Monaco conflict editor with Accept buttons
- Location: tests/02-stash-conflict.spec.ts:4:1

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[test-id="unstaged-file"]').first() to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - button "Manage repositories" [ref=e6] [cursor=pointer]:
      - img [ref=e8]
    - button [ref=e11] [cursor=pointer]:
      - img [ref=e12]
    - button "TP" [ref=e15] [cursor=pointer]
  - generic [ref=e16]:
    - generic [ref=e17]:
      - generic [ref=e18]:
        - generic "Repository on this machine" [ref=e19]:
          - img [ref=e20]
          - text: Local
        - generic [ref=e22]: ›
        - generic [ref=e23]: Test Project
        - generic [ref=e24]: ›
        - generic [ref=e25]: master
      - generic [ref=e26]:
        - button "Fetch" [ref=e27] [cursor=pointer]:
          - generic [ref=e29]:
            - paragraph [ref=e30]: Fetch
            - img [ref=e31]
        - button "Pull" [ref=e33] [cursor=pointer]:
          - generic [ref=e35]:
            - paragraph [ref=e36]: Pull
            - img [ref=e37]
        - button "Push" [ref=e39] [cursor=pointer]:
          - generic [ref=e41]:
            - paragraph [ref=e42]: Push
            - img [ref=e43]
        - button "Branch" [ref=e45] [cursor=pointer]:
          - generic [ref=e47]:
            - paragraph [ref=e48]: Branch
            - img [ref=e49]
        - button "Stash" [ref=e51] [cursor=pointer]:
          - generic [ref=e53]:
            - paragraph [ref=e54]: Stash
            - img [ref=e55]
        - button "Pop" [ref=e57] [cursor=pointer]:
          - generic [ref=e59]:
            - paragraph [ref=e60]: Pop
            - img [ref=e61]
      - generic [ref=e63]:
        - button "Activity Log" [ref=e64] [cursor=pointer]:
          - img [ref=e66]
        - button "Settings" [ref=e68] [cursor=pointer]:
          - img [ref=e70]
        - img [ref=e72]
    - generic [ref=e74]:
      - generic [ref=e76]:
        - generic [ref=e77]:
          - img [ref=e78] [cursor=pointer]
          - generic [ref=e81]:
            - img [ref=e83]
            - generic [ref=e85]:
              - textbox "Filter branches…" [ref=e86]
              - generic:
                - generic: Filter branches…
        - generic [ref=e89]:
          - generic [ref=e90] [cursor=pointer]:
            - generic [ref=e91]:
              - img [ref=e92]
              - generic [ref=e94]: LOCAL
              - generic [ref=e95]: (1)
            - generic [ref=e96]:
              - img [ref=e97]
              - generic [ref=e99]: master
              - generic [ref=e100]: HEAD
          - generic [ref=e102] [cursor=pointer]:
            - img [ref=e103]
            - generic [ref=e105]: REMOTE
            - generic [ref=e106]: (0)
            - img "Remote settings" [ref=e107]
          - generic [ref=e110] [cursor=pointer]:
            - img [ref=e111]
            - generic [ref=e113]: TAGS
            - generic [ref=e114]: (0)
      - separator [ref=e115]
      - generic [ref=e119]:
        - generic [ref=e123]:
          - img
          - generic "master (local)" [ref=e125] [cursor=pointer]:
            - generic [ref=e126]:
              - img [ref=e127]
              - img "Local" [ref=e129]
            - generic [ref=e131]: master
        - generic:
          - img:
            - generic:
              - generic:
                - img
            - generic:
              - generic: TA
            - generic:
              - generic: TA
        - generic [ref=e133]:
          - generic [ref=e134] [cursor=pointer]:
            - generic [ref=e136]:
              - img [ref=e138]
              - text: "1"
            - generic [ref=e141]: WORKING
          - generic [ref=e142] [cursor=pointer]:
            - generic [ref=e144]: wip
            - generic [ref=e146]: 956bf22
          - generic [ref=e147] [cursor=pointer]:
            - generic [ref=e149]: Base
            - generic [ref=e150]:
              - generic [ref=e151]: 2026-09-02 14:05
              - generic [ref=e152]: a53bd76
          - generic [ref=e153] [cursor=pointer]:
            - generic [ref=e155]: Initial
            - generic [ref=e156]:
              - generic [ref=e157]: 2026-09-02 14:05
              - generic [ref=e158]: 1cca4d7
      - separator [ref=e159]
      - generic [ref=e161]:
        - generic [ref=e162]:
          - generic [ref=e163]: 956bf22
          - generic [ref=e164]: "parents: 1"
        - generic "Only the HEAD commit can be edited" [ref=e165]: wip
        - generic [ref=e166]:
          - generic [ref=e167]: S
          - generic [ref=e169]: Stash
        - generic [ref=e170]:
          - generic [ref=e171]:
            - img [ref=e173]
            - text: "1"
          - generic [ref=e175]: Parent
          - generic [ref=e176] [cursor=pointer]: a53bd76
        - generic [ref=e178] [cursor=pointer]:
          - img [ref=e180]
          - generic [ref=e183]: file.txt
```

# Test source

```ts
  1  | import {test, expect} from '../fixtures/test';
  2  | import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
  3  | 
  4  | test('stash pop with conflict shows Monaco conflict editor with Accept buttons', async ({page, repo, openRepo}) => {
  5  | 	repo.commit('Initial', {'README.md': '# repo\n'});
  6  | 	repo.commit('Base', {'file.txt': 'line one\nline two\nline three\n'});
  7  | 
  8  | 	// Modify file then stash
  9  | 	repo.writeFile('file.txt', 'line ONE\nline two\nline three\n');
  10 | 	repo.run('stash push -m "wip"');
  11 | 
  12 | 	// Modify same line differently → will cause conflict on pop
  13 | 	repo.writeFile('file.txt', 'line ALT\nline two\nline three\n');
  14 | 
  15 | 	await openRepo(page, repo.path);
  16 | 	await waitForRepoLoaded(page);
  17 | 	await waitForCommitRow(page, 'Base');
  18 | 
  19 | 	// Right-click the stash row in the commit history and pop it
  20 | 	const stashRow = page.locator('[test-id="commit-row-stash"]').first();
  21 | 
  22 | 	await expect(stashRow).toBeVisible({timeout: 10_000});
  23 | 	await stashRow.click({button: 'right'});
  24 | 
  25 | 	// Wait for context menu and click "Pop stash"
  26 | 	await page.locator('.mx-context-menu-item:has-text("Pop stash")').first().click();
  27 | 
  28 | 	// Open the conflicted file in the staging panel
  29 | 	const conflictedFile = page.locator('[test-id="unstaged-file"]').first();
> 30 | 	await conflictedFile.waitFor({state: 'visible', timeout: 10_000});
     |                       ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  31 | 	await conflictedFile.click();
  32 | 
  33 | 	// Monaco conflict editor should be visible with counter and at least one widget
  34 | 	await expect(byTestId(page, 'conflict-counter')).toBeVisible({timeout: 10_000});
  35 | 	await expect(byTestId(page, 'conflict-widget').first()).toBeVisible();
  36 | 
  37 | 	// Save button is disabled while a conflict remains
  38 | 	await expect(byTestId(page, 'conflict-save-btn')).toBeDisabled();
  39 | 
  40 | 	// Accept ours
  41 | 	await byTestId(page, 'accept-ours-btn').first().click();
  42 | 
  43 | 	// Counter says "All conflicts resolved" → save enabled
  44 | 	await expect(byTestId(page, 'conflict-counter')).toHaveText(/resolved/i);
  45 | 	await expect(byTestId(page, 'conflict-save-btn')).toBeEnabled();
  46 | 
  47 | 	await byTestId(page, 'conflict-save-btn').click();
  48 | });
  49 | 
```