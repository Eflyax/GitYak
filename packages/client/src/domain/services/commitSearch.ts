/**
 * Translates a search box query into `git log` arguments.
 *
 * Free text searches commit messages. Three prefixes narrow the search instead:
 * `author:<name>`, `content:<text>` (the diff itself, git's `-S`) and `file:<path>`.
 *
 * Every value is glued to its flag (`--grep=x`, not `--grep x`), so a value that starts
 * with a dash can never reach git as an argument of its own.
 */
export function buildSearchArgs(query: string): Array<string> {
	const
		terms: Array<string> = [],
		free: Array<string> = [];

	let path = '';

	for (const token of query.trim().split(/\s+/).filter(Boolean)) {
		const match = /^(author|content|file):(.*)$/.exec(token);

		if (!match) {
			free.push(token);
			continue;
		}

		const [, kind, value] = match;

		if (!value) {
			continue;
		}

		if (kind === 'author') {
			terms.push(`--author=${value}`);
		}
		else if (kind === 'content') {
			terms.push(`-S${value}`);
		}
		else {
			path = value;
		}
	}

	// The free words are one phrase, not one term each: "fix the login" should match a
	// message containing that phrase rather than any message mentioning "the".
	if (free.length) {
		terms.push(`--grep=${free.join(' ')}`);
	}

	if (!terms.length && !path) {
		return [];
	}

	// A pathspec is only a pathspec after `--`; before it git would try to resolve it as a
	// revision and fail on anything that is not also a ref.
	return ['--regexp-ignore-case', ...terms, ...(path ? ['--', path] : [])];
}
