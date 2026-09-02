# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-amend-push.spec.ts >> amend previous commit prefills form and creates an amended commit
- Location: tests/01-amend-push.spec.ts:4:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[test-id="amend-checkbox"]')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('[test-id="amend-checkbox"]')

```

```yaml
- button "Manage repositories":
  - img
- button:
  - img
- button "TP"
- img
- text: Local › Test Project › master
- button "Fetch":
  - paragraph: Fetch
  - img
- button "Pull":
  - paragraph: Pull
  - img
- button "Push":
  - paragraph: Push
  - img
- button "Branch":
  - paragraph: Branch
  - img
- button "Stash":
  - paragraph: Stash
  - img
- button "Pop" [disabled]:
  - paragraph: Pop
  - img
- button "Activity Log":
  - img
- button "Settings":
  - img
- img
- img
- img
- textbox "Filter branches…"
- text: Filter branches…
- img
- text: LOCAL (1)
- img
- text: master HEAD
- img
- text: REMOTE (0)
- img "Remote settings"
- img
- text: TAGS (0)
- separator
- img
- img
- img "Local"
- text: master
- img: TA TA
- text: Original subject 2026-09-02 14:05 0330ee8 Initial 2026-09-02 14:05 25a6bd9
- separator
- text: "0330ee8 parents: 1 Original subject T Test Author 2026-09-02 14:05"
- img
- text: 1 Parent 25a6bd9
- img
- text: file.txt
```

# Test source

```ts
  1  | import {test, expect} from '../fixtures/test';
  2  | import {byTestId, waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';
  3  | 
  4  | test('amend previous commit prefills form and creates an amended commit', async ({page, repo, openRepo}) => {
  5  | 	repo.commit('Initial', {'README.md': '# repo\n'});
  6  | 	repo.commit('Original subject', {'file.txt': 'first content\n'});
  7  | 
  8  | 	await openRepo(page, repo.path);
  9  | 	await waitForRepoLoaded(page);
  10 | 	await waitForCommitRow(page, 'Original subject');
  11 | 
  12 | 	// Initially amend checkbox is unchecked and form is empty
  13 | 	const amend = byTestId(page, 'amend-checkbox');
  14 | 
> 15 | 	await expect(amend).toBeVisible();
     |                      ^ Error: expect(locator).toBeVisible() failed
  16 | 	await expect(amend).not.toBeChecked();
  17 | 
  18 | 	// Stage a new change so commit button can fire
  19 | 	repo.writeFile('file.txt', 'changed content\n');
  20 | 
  21 | 	// Reload to pick up filesystem changes
  22 | 	await page.reload();
  23 | 	await waitForRepoLoaded(page);
  24 | 
  25 | 	await amend.check();
  26 | 
  27 | 	const summary = byTestId(page, 'commit-summary-input').locator('input');
  28 | 	await expect(summary).toHaveValue('Original subject');
  29 | 
  30 | 	await summary.fill('Amended subject');
  31 | 	await byTestId(page, 'stage-all-btn').click();
  32 | 	await byTestId(page, 'commit-btn').click();
  33 | 
  34 | 	await waitForCommitRow(page, 'Amended subject');
  35 | 	// Original subject row must be gone (replaced by amend)
  36 | 	await expect(page.locator('.commit-row__message', {hasText: 'Original subject'})).toHaveCount(0);
  37 | });
  38 | 
```