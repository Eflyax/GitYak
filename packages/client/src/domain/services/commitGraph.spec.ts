import {describe, it, expect} from 'vitest';
import type {ICommit} from '@/domain';
import {buildGraph} from './commitGraph';

function commit(hash: string, parents: string): ICommit {
	return {
		hash,
		hashAbbr: '',
		parents: parents as unknown as ReadonlyArray<string>,
		subject: hash,
		body: '',
		authorEmail: '',
		authorName: '',
		authorDate: '',
		committerEmail: '',
		committerName: '',
		committerDate: '',
	};
}

// Newest first, as `git log --date-order` prints it: two branches forking from `a`, merged in `m`.
function history(): Array<ICommit> {
	return [
		commit('m', 'd f'),
		commit('f', 'e'),
		commit('d', 'c'),
		commit('e', 'b'),
		commit('c', 'b'),
		commit('b', 'a'),
		commit('a', ''),
	];
}

function lanes(commits: ReadonlyArray<ICommit>): Array<string> {
	return commits.map(c => `${c.hash}@${c.level}#${c.index}`);
}

describe('buildGraph', () => {
	it('keeps a straight line in one lane', () => {
		const commits = [commit('c', 'b'), commit('b', 'a'), commit('a', '')];

		expect(buildGraph(commits, {})).toBe(0);
		expect(commits.map(c => c.level)).toEqual([0, 0, 0]);
	});

	it('puts a second branch in its own lane and reports the widest lane', () => {
		const commits = history();

		expect(buildGraph(commits, {})).toBe(1);
		expect(commits.find(c => c.hash === 'f')?.level).toBe(1);
	});

	it('splits the parents string into an array', () => {
		const commits = history();

		buildGraph(commits, {});

		expect(commits[0]?.parents).toEqual(['d', 'f']);
	});

	it('attaches the references of each commit', () => {
		const commits = [commit('a', '')];
		const ref = {type: 'branch', name: 'main', id: 'refs/heads/main', hash: 'a'} as never;

		buildGraph(commits, {a: [ref]});

		expect(commits[0]?.references).toEqual([ref]);
	});

	// Paging appends older commits below the loaded ones and lays the whole list out again.
	it('lays out an appended page the same as loading everything at once', () => {
		const all = history();

		buildGraph(all, {});

		const paged = history();
		const firstPage = paged.slice(0, 3);

		buildGraph(firstPage, {});
		buildGraph([...firstPage, ...paged.slice(3)], {});

		expect(lanes([...firstPage, ...paged.slice(3)])).toEqual(lanes(all));
	});

	it('does not keep a stale lane when run again over the same commits', () => {
		const commits = history();

		buildGraph(commits, {});
		commits.forEach(c => {
			c.level = 9;
		});
		buildGraph(commits, {});

		expect(Math.max(...commits.map(c => c.level ?? 0))).toBe(1);
	});
});
