import {execFileSync} from 'node:child_process';

export function git(args: Array<string>, cwd?: string): string {
	return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

function tryGit(args: Array<string>, cwd?: string): string | null {
	try {
		return git(args, cwd);
	}
	catch {
		return null;
	}
}

/** The newest tag reachable from `ref`, or null when there is none. */
export function previousTag(ref: string, cwd?: string): string | null {
	return tryGit(['describe', '--tags', '--abbrev=0', ref], cwd);
}

/** `- subject` for each non-merge commit in `range`. */
export function commitSubjects(range: string, cwd?: string): string {
	return tryGit(['log', '--no-merges', '--format=- %s', range], cwd) ?? '';
}

/**
 * The release notes of a tag: the message of an annotated tag, without a signature. A
 * lightweight tag has none, so the commit subjects since the previous tag stand in.
 */
export function tagNotes(tag: string, cwd?: string): string {
	if (tryGit(['cat-file', '-t', tag], cwd) === 'tag') {
		const message = git(['tag', '-l', '--format=%(contents)', tag], cwd)
			.split(/^-----BEGIN (?:PGP|SSH) SIGNATURE-----/m)[0]
			.trim();

		if (message) {
			return message;
		}
	}

	const previous = previousTag(`${tag}^`, cwd);

	return commitSubjects(previous ? `${previous}..${tag}` : tag, cwd);
}
