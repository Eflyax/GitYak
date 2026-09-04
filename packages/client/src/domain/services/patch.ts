export interface IHunk {
	/** The `@@ -a,b +c,d @@ …` line, verbatim. */
	header: string
	/** Body lines, verbatim, including any `\ No newline at end of file` marker. */
	lines: ReadonlyArray<string>
	oldStart: number
	oldCount: number
	newStart: number
	newCount: number
}

export interface IFilePatch {
	/** Every line before the first hunk: `diff --git`, `index`, mode, rename, `---`, `+++`. */
	header: ReadonlyArray<string>
	hunks: ReadonlyArray<IHunk>
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Splits the output of `git diff` for a SINGLE file into its header and hunks, so that any
 * subset of those hunks can be handed back to `git apply`. Returns null when the diff has
 * no hunks to stage — an empty diff, a binary file, or a rename with no content change.
 *
 * The lines are kept verbatim: git owns the details (no-newline markers, CRLF, mode and
 * rename metadata) and a re-emitted hunk has to be byte-identical to the one git produced.
 */
export function parseFilePatch(raw: string): IFilePatch | null {
	if (!raw.trim()) {
		return null;
	}

	const
		header: Array<string> = [],
		hunks: Array<IHunk> = [];

	// The hunk being filled, kept as its own mutable array: IHunk exposes the lines as
	// readonly so consumers cannot edit a parsed patch in place.
	let currentLines: Array<string> | null = null;

	for (const line of raw.split('\n')) {
		const match = HUNK_HEADER.exec(line);

		if (match) {
			currentLines = [];

			hunks.push({
				header: line,
				lines: currentLines,
				oldStart: Number(match[1]),
				// An omitted count means one line, not zero.
				oldCount: match[2] === undefined ? 1 : Number(match[2]),
				newStart: Number(match[3]),
				newCount: match[4] === undefined ? 1 : Number(match[4]),
			});

			continue;
		}

		if (!currentLines) {
			header.push(line);
			continue;
		}

		// split('\n') on a trailing newline yields a final empty element that is not part of
		// the hunk; every real body line starts with a space, +, - or a backslash.
		if (line !== '') {
			currentLines.push(line);
		}
	}

	if (!hunks.length) {
		return null;
	}

	return {header, hunks};
}

/** Re-emits the file's header plus exactly one of its hunks, ready for `git apply`. */
export function buildPatch(patch: IFilePatch, hunk: IHunk): string {
	return [...patch.header, hunk.header, ...hunk.lines, ''].join('\n');
}
