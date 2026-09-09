import {describe, it, expect} from 'vitest';
import {FILE_HISTORY_FORMAT, parseFileHistory} from './fileHistory';

const SEP = '\x06';

// Verified against `git log --follow --name-status -z`: the formatted header ends with a
// newline followed by the status word, and every field after that — each path, then an
// empty field closing the record — is NUL terminated.
function record(hash: string, author: string, date: string, subject: string, status: string, ...paths: Array<string>): string {
	return [hash, author, date, subject].join(SEP) + '\n' + status + '\0' + paths.map(p => p + '\0').join('') + '\0';
}

const LOG =
	record('aaa111', 'Jane Roe', '2026-03-01 10:00', 'Rewrite the parser', 'M', 'src/parser.ts')
	+ record('bbb222', 'John Doe', '2026-02-01 09:00', 'Rename it', 'R100', 'src/old-parser.ts', 'src/parser.ts')
	+ record('ccc333', 'Jane Roe', '2026-01-01 08:00', 'Add the parser', 'A', 'src/old-parser.ts');

describe('parseFileHistory', () => {
	it('returns one entry per commit, newest first as git emits them', () => {
		expect(parseFileHistory(LOG).map(h => h.hash)).toEqual(['aaa111', 'bbb222', 'ccc333']);
	});

	it('carries the author, date and subject of each commit', () => {
		expect(parseFileHistory(LOG)[0]).toMatchObject({
			author: 'Jane Roe',
			date: '2026-03-01 10:00',
			subject: 'Rewrite the parser',
		});
	});

	it('records the status the file had in that commit', () => {
		const history = parseFileHistory(LOG);

		expect(history[0]?.status).toBe('M');
		expect(history[2]?.status).toBe('A');
	});

	// `--follow` keeps reporting a file across renames; the path has to travel with it or a
	// diff against the parent would look for a path that did not exist yet.
	it('tracks the path the file had at each commit, across a rename', () => {
		const history = parseFileHistory(LOG);

		expect(history[0]?.path).toBe('src/parser.ts');
		expect(history[1]).toMatchObject({
			status: 'R',
			path: 'src/parser.ts',
			oldPath: 'src/old-parser.ts',
		});
		expect(history[2]?.path).toBe('src/old-parser.ts');
	});

	it('reads a single-commit log', () => {
		const history = parseFileHistory(record('aaa111', 'Jane Roe', '2026-03-01 10:00', 'Only one', 'A', 'a.ts'));

		expect(history).toHaveLength(1);
		expect(history[0]).toMatchObject({subject: 'Only one', status: 'A', path: 'a.ts'});
	});

	it('keeps a subject that contains a newline of its own', () => {
		const history = parseFileHistory(
			record('aaa111', 'Jane Roe', '2026-03-01 10:00', 'Subject', 'M', 'a.ts'),
		);

		expect(history[0]?.subject).toBe('Subject');
	});

	it('handles empty output', () => {
		expect(parseFileHistory('')).toEqual([]);
	});
});

describe('FILE_HISTORY_FORMAT', () => {
	it('declares the fields in the order the parser reads them', () => {
		expect(FILE_HISTORY_FORMAT).toBe(`%H${SEP}%an${SEP}%ad${SEP}%s`);
	});
});
