/** Escape a string so it is safe as a single-quoted shell argument. */
export function sq(arg: string): string {
	return "'" + arg.replace(/'/g, "'\\''") + "'";
}

/**
 * The env assignments stay unquoted (quoted, the shell would run a command named `LC_ALL=C`).
 * GIT_TERMINAL_PROMPT=0: the app never answers a prompt (an HTTPS clone asking for a username),
 * so git must fail with its error rather than wait for one.
 */
export function buildRemoteGitCommand(repoPath: string, args: Array<string>): string {
	return `GIT_TERMINAL_PROMPT=0 LC_ALL=C git -C ${[repoPath, ...args].map(sq).join(' ')}`;
}
