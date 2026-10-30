const LABELS: Record<string, string> = {
	'fetch': 'Fetching',
	'pull': 'Pulling',
	'push': 'Pushing',
	'merge': 'Merging',
	'rebase': 'Rebasing',
	'cherry-pick': 'Cherry-picking',
	'revert': 'Reverting',
	'reset': 'Resetting',
	'checkout': 'Checking out',
	'switch': 'Switching branch',
	'commit': 'Committing',
	'clone': 'Cloning',
	'clean': 'Cleaning',
};

const STASH_LABELS: Record<string, string | null> = {
	'list': null,
	'show': null,
	'pop': 'Applying stash',
	'apply': 'Applying stash',
	'drop': 'Dropping stash',
	'clear': 'Dropping stash',
};

/**
 * Names the git invocation for the global activity indicator, or `null` when it is not
 * worth showing there.
 *
 * Only commands that change the repository or talk to a remote get a label; the read-only
 * queries behind every refresh (`log`, `status`, `diff`, …) would keep the indicator on
 * permanently and drown out the actions the user actually started.
 */
export function getGitTaskLabel(args: ReadonlyArray<string>): string | null {
	const [command = '', sub = ''] = args;

	if (command === 'stash') {
		return sub in STASH_LABELS ? STASH_LABELS[sub]! : 'Stashing';
	}

	return LABELS[command] ?? null;
}
