import {describe, it, expect} from 'vitest';
import {parseBlame} from './blame';

// `git blame --porcelain` emits a header line "<hash> <origLine> <finalLine> [<count>]",
// then key/value lines for the first line attributed to that commit, then the source line
// prefixed with a tab. Later lines from the same commit repeat only the header.
const PORCELAIN = `3f2a1b0c000000000000000000000000000000aa 1 1 2
author Jane Roe
author-mail <jane@example.com>
author-time 1717000000
author-tz +0200
summary Add the parser
filename src/parser.ts
\tfirst line
3f2a1b0c000000000000000000000000000000aa 2 2
\tsecond line
9e8d7c6b000000000000000000000000000000bb 3 3 1
author John Doe
author-mail <john@example.com>
author-time 1717600000
author-tz +0200
summary Fix the parser
filename src/parser.ts
\tthird line
`;

describe('parseBlame', () => {
	it('returns one entry per source line, in order', () => {
		const lines = parseBlame(PORCELAIN);

		expect(lines).toHaveLength(3);
		expect(lines.map(l => l.line)).toEqual([1, 2, 3]);
	});

	it('attributes each line to its commit', () => {
		const lines = parseBlame(PORCELAIN);

		expect(lines[0]?.hash).toBe('3f2a1b0c000000000000000000000000000000aa');
		expect(lines[2]?.hash).toBe('9e8d7c6b000000000000000000000000000000bb');
	});

	it('carries the author and summary of the commit', () => {
		const [first] = parseBlame(PORCELAIN);

		expect(first).toMatchObject({author: 'Jane Roe', summary: 'Add the parser'});
	});

	// The porcelain format states a commit's metadata only once; every later line from that
	// commit carries the bare header and has to inherit it.
	it('reuses the metadata for a later line from the same commit', () => {
		const lines = parseBlame(PORCELAIN);

		expect(lines[1]).toMatchObject({
			hash: '3f2a1b0c000000000000000000000000000000aa',
			author: 'Jane Roe',
			summary: 'Add the parser',
		});
	});

	it('converts the author time into a date', () => {
		const [first] = parseBlame(PORCELAIN);

		expect(first?.authorTime).toBe(1717000000);
	});

	it('marks a not-yet-committed line', () => {
		const lines = parseBlame(`0000000000000000000000000000000000000000 1 1 1
author Not Committed Yet
author-mail <not.committed.yet>
author-time 1717600000
author-tz +0200
summary Version of src/parser.ts from src/parser.ts
filename src/parser.ts
\tuncommitted line
`);

		expect(lines[0]?.isUncommitted).toBe(true);
	});

	it('does not mark a real commit as uncommitted', () => {
		expect(parseBlame(PORCELAIN)[0]?.isUncommitted).toBe(false);
	});

	it('handles empty output', () => {
		expect(parseBlame('')).toEqual([]);
	});

	it('keeps a source line that itself starts with a tab', () => {
		const lines = parseBlame(`3f2a1b0c000000000000000000000000000000aa 1 1 1
author Jane Roe
summary Indent
filename a.ts
\t\tindented
`);

		expect(lines[0]?.content).toBe('\tindented');
	});
});
