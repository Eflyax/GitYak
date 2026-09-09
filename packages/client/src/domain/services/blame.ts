export interface IBlameLine {
	/** 1-based line number in the blamed file. */
	line: number
	hash: string
	author: string
	summary: string
	/** Unix seconds, as git reports them. */
	authorTime: number
	/** A line that is in the working tree but not in any commit yet. */
	isUncommitted: boolean
	content: string
}

const UNCOMMITTED_HASH = '0'.repeat(40);
const HEADER = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/;

interface ICommitInfo {
	author: string
	summary: string
	authorTime: number
}

/**
 * Parses `git blame --porcelain`. The format states a commit's metadata only the first time
 * that commit appears; every later line from it carries just the header, so the metadata is
 * remembered per commit and reused.
 */
export function parseBlame(output: string): Array<IBlameLine> {
	const
		lines: Array<IBlameLine> = [],
		commits = new Map<string, ICommitInfo>();

	let
		hash = '',
		lineNumber = 0,
		pending: ICommitInfo = {author: '', summary: '', authorTime: 0};

	for (const raw of output.split('\n')) {
		const header = HEADER.exec(raw);

		if (header) {
			hash = header[1]!;
			lineNumber = Number(header[2]);
			pending = {...(commits.get(hash) ?? {author: '', summary: '', authorTime: 0})};
			continue;
		}

		// The source line itself, the only line the format indents with a tab.
		if (raw.startsWith('\t')) {
			commits.set(hash, pending);

			lines.push({
				line: lineNumber,
				hash,
				author: pending.author,
				summary: pending.summary,
				authorTime: pending.authorTime,
				isUncommitted: hash === UNCOMMITTED_HASH,
				content: raw.slice(1),
			});

			continue;
		}

		const separator = raw.indexOf(' ');
		const key = separator === -1 ? raw : raw.slice(0, separator);
		const value = separator === -1 ? '' : raw.slice(separator + 1);

		if (key === 'author') {
			pending.author = value;
		}
		else if (key === 'summary') {
			pending.summary = value;
		}
		else if (key === 'author-time') {
			pending.authorTime = Number(value);
		}
	}

	return lines;
}
