const FIELD_SEP = '\x06';

/** Field order for the per-commit header of `git log --follow`, matching the parser below. */
export const FILE_HISTORY_FORMAT = `%H${FIELD_SEP}%an${FIELD_SEP}%ad${FIELD_SEP}%s`;

export interface IFileHistoryEntry {
	hash: string
	author: string
	date: string
	subject: string
	/** git's name-status letter: A, M, D, R… — empty when the commit reported none. */
	status: string
	/** The path the file had AT this commit, which a rename changes. */
	path: string
	/** Where a rename brought it from. */
	oldPath?: string
}

/**
 * Parses `git log --follow --name-status -z` for a single file.
 *
 * With `-z` every field is NUL terminated, paths included — so a record reads as
 * `<header>\n<status>` NUL `<path>` [NUL `<newPath>`] NUL NUL, where the empty field closes
 * the record. Splitting the whole output on NUL therefore yields a flat token stream in
 * which a token carrying the field separator starts a new commit and the tokens after it are
 * that commit's paths.
 */
export function parseFileHistory(output: string): Array<IFileHistoryEntry> {
	const entries: Array<IFileHistoryEntry> = [];

	let pending: {hash: string; author: string; date: string; subject: string; status: string} | null = null;
	let paths: Array<string> = [];

	function flush(): void {
		if (!pending) {
			return;
		}

		// A rename or copy reports "R100" / "C075" and both paths; everything else is a
		// single letter and one path.
		const isMove = pending.status === 'R' || pending.status === 'C';

		entries.push({
			hash: pending.hash,
			author: pending.author,
			date: pending.date,
			subject: pending.subject,
			status: pending.status,
			path: (isMove ? paths[1] : paths[0]) ?? '',
			...(isMove && paths[0] ? {oldPath: paths[0]} : {}),
		});

		pending = null;
		paths = [];
	}

	for (const token of output.split('\0')) {
		if (!token.includes(FIELD_SEP)) {
			if (token) {
				paths.push(token);
			}

			continue;
		}

		// A new commit header; whatever was being collected belongs to the previous one.
		flush();

		// The header and the status share a token, separated by the newline git puts before
		// the name-status output.
		const newline = token.indexOf('\n');
		const header = newline === -1 ? token : token.slice(0, newline);
		const status = newline === -1 ? '' : token.slice(newline + 1);
		const [hash = '', author = '', date = '', subject = ''] = header.split(FIELD_SEP);

		if (!hash) {
			continue;
		}

		pending = {hash, author, date, subject, status: status.charAt(0)};
	}

	flush();

	return entries;
}
