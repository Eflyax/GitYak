# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 04-multi-select-squash.spec.ts >> multi-select two consecutive commits and squash via context menu
- Location: tests/04-multi-select-squash.spec.ts:4:1

# Error details

```
TimeoutError: locator.inputValue: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('[test-id="commit-summary-input"]').locator('input')

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
        - button "Pop" [disabled] [ref=e57]:
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
        - generic [ref=e122]:
          - img
          - generic "master (local)" [ref=e124] [cursor=pointer]:
            - generic [ref=e125]:
              - img [ref=e126]
              - img "Local" [ref=e128]
            - generic [ref=e130]: master
        - generic:
          - img:
            - generic:
              - generic: TA
        - generic [ref=e131]:
          - generic [ref=e132] [cursor=pointer]:
            - generic [ref=e134]:
              - img [ref=e136]
              - text: "2"
            - generic [ref=e139]: WORKING
          - generic [ref=e140] [cursor=pointer]:
            - generic [ref=e142]: Initial
            - generic [ref=e143]:
              - generic [ref=e144]: 2026-09-02 14:06
              - generic [ref=e145]: 7a94b6d
      - separator [ref=e146]
      - generic [ref=e148]:
        - generic [ref=e149]:
          - generic [ref=e150]: 7a94b6d
          - generic [ref=e151]: "parents: 0"
        - generic "Only the HEAD commit can be edited" [ref=e152]: Initial
        - generic [ref=e153]:
          - generic [ref=e154]: T
          - generic [ref=e155]:
            - generic [ref=e156]: Test Author
            - generic [ref=e157]: 2026-09-02 14:06
        - generic [ref=e159] [cursor=pointer]:
          - img [ref=e161]
          - generic [ref=e164]: README.md
```

# Test source

```ts
  1  | import {test, expect} from '../fixtures/test';
  2  | import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
  3  | 
  4  | test('multi-select two consecutive commits and squash via context menu', async ({page, repo, openRepo}) => {
  5  | 	repo.commit('Initial', {'README.md': '# repo\n'});
  6  | 	repo.commit('Step one', {'a.txt': 'aaa\n'});
  7  | 	repo.commit('Step two', {'b.txt': 'bbb\n'});
  8  | 
  9  | 	await openRepo(page, repo.path);
  10 | 	await waitForRepoLoaded(page);
  11 | 	await waitForCommitRow(page, 'Step two');
  12 | 
  13 | 	const stepOneRow = page.locator('.commit-row', {hasText: 'Step one'});
  14 | 	const stepTwoRow = page.locator('.commit-row', {hasText: 'Step two'});
  15 | 
  16 | 	// Single-click step two
  17 | 	await stepTwoRow.click();
  18 | 
  19 | 	// CMD/CTRL+click step one to add it to selection
  20 | 	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  21 | 
  22 | 	await stepOneRow.click({modifiers: [modifier]});
  23 | 
  24 | 	// CommitDetails should now show multi-selection summary
  25 | 	await expect(byTestId(page, 'commit-details-multi-summary')).toBeVisible();
  26 | 	await expect(byTestId(page, 'commit-details-multi-summary')).toContainText('2 commits');
  27 | 
  28 | 	// Right-click one of the selected rows
  29 | 	await stepTwoRow.click({button: 'right'});
  30 | 
  31 | 	const squashItem = page.locator('.mx-context-menu-item:has-text("Squash 2 commits")');
  32 | 
  33 | 	await expect(squashItem).toBeVisible();
  34 | 	await expect(squashItem).not.toHaveClass(/mx-disabled/);
  35 | 
  36 | 	await squashItem.click();
  37 | 
  38 | 	// Commit form is prefilled — fill summary if blank and commit
  39 | 	const summaryInput = byTestId(page, 'commit-summary-input').locator('input');
> 40 | 	const value = await summaryInput.inputValue();
     |                                   ^ TimeoutError: locator.inputValue: Timeout 10000ms exceeded.
  41 | 
  42 | 	expect(value.length).toBeGreaterThan(0);
  43 | 
  44 | 	await byTestId(page, 'commit-btn').click();
  45 | 
  46 | 	// After squash there should be 2 regular commits total (Initial + squashed)
  47 | 	await page.waitForTimeout(2_000);
  48 | 
  49 | 	const logLines = repo.run('log --format=%s').trim().split('\n');
  50 | 
  51 | 	expect(logLines.length).toBe(2);
  52 | });
  53 | 
```