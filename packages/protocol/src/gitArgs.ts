// git's global options — the ones that can redirect git at another repository, run a
// different binary, or execute arbitrary shell through configuration. A global option may
// appear only BEFORE the subcommand, so this list is checked only in the leading run of
// option-looking tokens. `git rev-parse --git-dir` is legitimate: there `--git-dir` belongs
// to rev-parse, not to git.
const FORBIDDEN_GLOBAL = [
	'-c',
	'-C',
	'--exec-path',
	'--git-dir',
	'--work-tree',
	'--namespace',
];

// Options that make git execute a command of the caller's choosing (a hook, a remote
// helper, an arbitrary shell command) regardless of which subcommand they're attached to —
// `fetch --upload-pack=...`, `push --receive-pack=...`, `rebase --exec=...` / `-x`. These
// have no legitimate use through this generic route, so they are refused ANYWHERE in the
// argument vector, not just in the leading run.
const FORBIDDEN_ANYWHERE = [
	'--upload-pack',
	'--receive-pack',
	'--exec',
	'-x',
];

export function findForbiddenGitOption(args: Array<string>): string | undefined {
	let sawSubcommand = false;

	for (const arg of args) {
		if (!arg.startsWith('-')) {
			// The subcommand. Everything after it still belongs to the subcommand for
			// the purposes of FORBIDDEN_GLOBAL, but FORBIDDEN_ANYWHERE keeps applying.
			sawSubcommand = true;
			continue;
		}

		const name = arg.split('=')[0];

		if (!sawSubcommand && FORBIDDEN_GLOBAL.includes(name)) {
			return arg;
		}

		if (FORBIDDEN_ANYWHERE.includes(name)) {
			return arg;
		}
	}

	return undefined;
}

// The two lists are refused for different reasons, so the refusal must say which applied:
// reporting `--exec` as "a git global option" is simply false — it is a subcommand option.
// The lists do not overlap, so the option name alone determines the reason.
export function describeForbiddenGitOption(option: string): string {
	const name = option.split('=')[0];

	if (FORBIDDEN_ANYWHERE.includes(name)) {
		return `Refused: "${option}" makes git run a command of the caller's choosing and is not allowed here`;
	}

	return `Refused: "${option}" is a git global option and is not allowed here`;
}
