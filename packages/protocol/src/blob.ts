/**
 * The `<revision>:<path>` object name `git cat-file blob` reads for a ReadBlob request.
 * The revision ends up as git's first positional argument, so one starting with "-" would be
 * read as an option; such a revision, and an empty path, are refused.
 */
export function blobObjectName(revision: string, filePath: string): string {
	if (!revision || revision.startsWith('-')) {
		throw new Error(`Invalid revision: ${revision}`);
	}

	if (!filePath) {
		throw new Error('file_path must be a non-empty string');
	}

	return `${revision}:${filePath}`;
}
