import {describe, it, expect} from 'vitest';
import {parseFilePatch, buildPatch} from './patch';

const SINGLE_HUNK = `diff --git a/file.txt b/file.txt
index 83db48f..bf269f4 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
+added
 line2
 line3
`;

const TWO_HUNKS = `diff --git a/file.txt b/file.txt
index 83db48f..bf269f4 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
+added at top
 line2
 line3
@@ -20,3 +21,3 @@ function tail()
 line20
-line21
+line21 changed
 line22
`;

describe('parseFilePatch', () => {
	it('returns the header lines that precede the first hunk', () => {
		const patch = parseFilePatch(SINGLE_HUNK);

		expect(patch?.header).toEqual([
			'diff --git a/file.txt b/file.txt',
			'index 83db48f..bf269f4 100644',
			'--- a/file.txt',
			'+++ b/file.txt',
		]);
	});

	it('parses the line ranges of a single hunk', () => {
		const patch = parseFilePatch(SINGLE_HUNK);

		expect(patch?.hunks).toHaveLength(1);
		expect(patch?.hunks[0]).toMatchObject({
			header: '@@ -1,3 +1,4 @@',
			oldStart: 1,
			oldCount: 3,
			newStart: 1,
			newCount: 4,
		});
	});

	it('keeps the body lines of a hunk verbatim', () => {
		const patch = parseFilePatch(SINGLE_HUNK);

		expect(patch?.hunks[0]?.lines).toEqual([
			' line1',
			'+added',
			' line2',
			' line3',
		]);
	});

	it('splits a diff into one entry per hunk', () => {
		const patch = parseFilePatch(TWO_HUNKS);

		expect(patch?.hunks).toHaveLength(2);
		expect(patch?.hunks[1]).toMatchObject({oldStart: 20, oldCount: 3, newStart: 21, newCount: 3});
	});

	it('defaults an omitted count to 1', () => {
		const patch = parseFilePatch(`diff --git a/f b/f
--- a/f
+++ b/f
@@ -4 +4 @@
-old
+new
`);

		expect(patch?.hunks[0]).toMatchObject({oldStart: 4, oldCount: 1, newStart: 4, newCount: 1});
	});

	it('keeps the no-newline marker as part of the hunk body', () => {
		const patch = parseFilePatch(`diff --git a/f b/f
--- a/f
+++ b/f
@@ -1,2 +1,2 @@
 a
-b
\\ No newline at end of file
+B
\\ No newline at end of file
`);

		expect(patch?.hunks[0]?.lines).toEqual([
			' a',
			'-b',
			'\\ No newline at end of file',
			'+B',
			'\\ No newline at end of file',
		]);
	});

	it('keeps rename metadata in the header of a renamed file with content changes', () => {
		const patch = parseFilePatch(`diff --git a/old.txt b/new.txt
similarity index 87%
rename from old.txt
rename to new.txt
index 83db48f..bf269f4 100644
--- a/old.txt
+++ b/new.txt
@@ -1,3 +1,3 @@
 a
-b
+B
 c
`);

		expect(patch?.header).toContain('rename from old.txt');
		expect(patch?.header).toContain('rename to new.txt');
		expect(patch?.hunks).toHaveLength(1);
	});

	it('keeps mode-change metadata in the header', () => {
		const patch = parseFilePatch(`diff --git a/s.sh b/s.sh
old mode 100644
new mode 100755
index 83db48f..bf269f4
--- a/s.sh
+++ b/s.sh
@@ -1,2 +1,2 @@
 #!/bin/sh
-echo a
+echo b
`);

		expect(patch?.header).toContain('old mode 100644');
		expect(patch?.header).toContain('new mode 100755');
	});

	it('returns null for empty input', () => {
		expect(parseFilePatch('')).toBeNull();
		expect(parseFilePatch('   \n')).toBeNull();
	});

	it('returns null for a binary file, which has no stageable hunks', () => {
		const patch = parseFilePatch(`diff --git a/img.png b/img.png
index 1234567..89abcde 100644
Binary files a/img.png and b/img.png differ
`);

		expect(patch).toBeNull();
	});

	it('returns null for a pure rename, which has no hunks', () => {
		const patch = parseFilePatch(`diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`);

		expect(patch).toBeNull();
	});
});

describe('buildPatch', () => {
	it('emits the file header followed by only the requested hunk', () => {
		const patch = parseFilePatch(TWO_HUNKS)!;

		expect(buildPatch(patch, patch.hunks[1]!)).toBe(`diff --git a/file.txt b/file.txt
index 83db48f..bf269f4 100644
--- a/file.txt
+++ b/file.txt
@@ -20,3 +21,3 @@ function tail()
 line20
-line21
+line21 changed
 line22
`);
	});

	it('round-trips a single-hunk diff unchanged', () => {
		const patch = parseFilePatch(SINGLE_HUNK)!;

		expect(buildPatch(patch, patch.hunks[0]!)).toBe(SINGLE_HUNK);
	});

	it('ends the patch with a newline so git apply accepts it', () => {
		const patch = parseFilePatch(TWO_HUNKS)!;

		expect(buildPatch(patch, patch.hunks[0]!).endsWith('\n')).toBe(true);
	});
});
