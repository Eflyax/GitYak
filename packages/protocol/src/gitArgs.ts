// git's global options — the ones that can redirect git at another repository, run a
// different binary, or execute arbitrary shell through configuration.
const FORBIDDEN = [
	'-c',
	'-C',
	'--exec-path',
	'--git-dir',
	'--work-tree',
	'--namespace',
	'--upload-pack',
	'--receive-pack',
];

// A global option may appear only BEFORE the subcommand, so only the leading run of
// option-looking tokens is inspected. `git rev-parse --git-dir` is legitimate: there
// `--git-dir` belongs to rev-parse, not to git.
export function findForbiddenGitOption(args: Array<string>): string | undefined {
	for (const arg of args) {
		if (!arg.startsWith('-')) {
			// The subcommand. Everything after it belongs to that subcommand.
			return undefined;
		}

		const name = arg.split('=')[0];

		if (FORBIDDEN.includes(name)) {
			return arg;
		}
	}

	return undefined;
}
