import type {IBranch} from '../models/Branch';

/**
 * Field order for `git for-each-ref`, tab separated (%09). `branch -v` cannot report the
 * upstream and the divergence counts, which is why branches are read through for-each-ref.
 */
export const BRANCH_REF_FORMAT =
	'%(refname)%09%(objectname)%09%(HEAD)%09%(upstream:short)%09%(upstream:track)';

// `%(upstream:track)` renders as "[ahead 2, behind 1]", "[ahead 2]", "[behind 1]", "[gone]"
// or an empty string when the branch is level with its upstream.
function parseTrack(track: string): {ahead: number; behind: number} | null {
	if (track.includes('gone')) {
		return null;
	}

	const
		ahead = /ahead (\d+)/.exec(track),
		behind = /behind (\d+)/.exec(track);

	return {
		ahead: ahead ? Number(ahead[1]) : 0,
		behind: behind ? Number(behind[1]) : 0,
	};
}

export function parseBranchRefs(output: string): {branches: Array<IBranch>; current: IBranch | null} {
	const branches: Array<IBranch> = [];
	let current: IBranch | null = null;

	for (const line of output.trim().split('\n').filter(Boolean)) {
		const [refname = '', hash = '', head = '', upstream = '', track = ''] = line.split('\t');
		const isRemote = refname.startsWith('refs/remotes/');
		const name = refname.replace(/^refs\/(heads|remotes)\//, '');

		// `refs/remotes/<remote>/HEAD` is a symbolic pointer at the remote's default branch,
		// not a branch of its own — showing it would duplicate whatever it points at.
		if (name === 'HEAD' || name.endsWith('/HEAD')) {
			continue;
		}

		const branch: IBranch = {
			name,
			hash,
			isRemote,
			isCurrent: head === '*' && !isRemote,
		};

		if (upstream) {
			branch.upstream = upstream;

			const counts = parseTrack(track);

			if (counts) {
				branch.ahead = counts.ahead;
				branch.behind = counts.behind;
			}
		}

		branches.push(branch);

		if (branch.isCurrent) {
			current = branch;
		}
	}

	return {branches, current};
}
