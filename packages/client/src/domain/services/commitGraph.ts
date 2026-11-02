import type {ICommit, IReference} from '@/domain';

/**
 * Assigns every commit its row (`index`) and lane (`level`) in one pass over the list, which
 * must already be in display order. A commit's lane depends only on the commits above it, so
 * appending a page and running this again leaves the lanes of the earlier rows unchanged.
 *
 * Mutates the commits in place and returns the highest lane used.
 */
export function buildGraph(
	rawCommits: Array<ICommit>,
	referencesByHash: Readonly<Record<string, ReadonlyArray<IReference>>>,
): number {
	const occupiedLevels: Record<number, ICommit> = {};
	const remainingParents: Record<string, Set<string>> = {};
	const children: Record<string, Array<ICommit>> = {};

	let maxLevel = 0;

	for (const [i, commit] of rawCommits.entries()) {
		commit.index = i;
		commit.hashAbbr = commit.hash.slice(0, 7);
		// A re-run over commits laid out before must not keep their old lane: the free-lane
		// search below only runs for a commit without one.
		commit.level = undefined;

		const
			rawParents = commit.parents;

		let parents: Array<string>;

		if (Array.isArray(rawParents)) {
			parents = rawParents as Array<string>;
		}
		else {
			const raw = rawParents as unknown as string;

			parents = raw ? raw.split(' ').filter(Boolean) : [];
		}

		commit.parents = parents;

		if (!commit.isStash && commit.hash !== 'WORKING_TREE') {
			commit.references = referencesByHash[commit.hash] ?? [];
		}

		for (const parentHash of parents) {
			children[parentHash] ??= [];
			children[parentHash].push(commit);
		}

		remainingParents[commit.hash] = new Set(parents);

		const sortedChildren = (children[commit.hash] ?? []).sort(
			(a, b) => (a.level ?? 0) - (b.level ?? 0),
		);

		for (const child of sortedChildren) {
			if (
				occupiedLevels[child.level ?? -1] === child &&
				commit.hash === child.parents[0] &&
				(child.index ?? 0) < i
			) {
				commit.level = child.level;
				break;
			}
		}

		if (commit.level === undefined) {
			for (let level = 0; ; ++level) {
				if (occupiedLevels[level] === undefined) {
					commit.level = level;
					break;
				}
			}
		}

		if (commit.level > maxLevel) {
			maxLevel = commit.level;
		}

		if (parents.length > 0) {
			occupiedLevels[commit.level] = commit;
		}

		for (const child of children[commit.hash] ?? []) {
			remainingParents[child.hash].delete(commit.hash);

			if (
				remainingParents[child.hash].size === 0 &&
				child.level !== commit.level &&
				occupiedLevels[child.level ?? -1] === child
			) {
				delete occupiedLevels[child.level ?? -1];
			}
		}
	}

	return maxLevel;
}
