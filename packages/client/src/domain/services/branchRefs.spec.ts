import {describe, it, expect} from 'vitest';
import {BRANCH_REF_FORMAT, parseBranchRefs} from './branchRefs';

// `git for-each-ref` emits one line per ref, fields separated by tabs, in the order the
// format string declares them.
function line(refname: string, hash: string, head = '', upstream = '', track = ''): string {
	return [refname, hash, head, upstream, track].join('\t');
}

describe('parseBranchRefs', () => {
	it('reads a local branch', () => {
		const {branches} = parseBranchRefs(line('refs/heads/master', 'abc123'));

		expect(branches).toEqual([{
			name: 'master',
			hash: 'abc123',
			isRemote: false,
			isCurrent: false,
		}]);
	});

	it('strips the remotes/ prefix from a remote branch', () => {
		const {branches} = parseBranchRefs(line('refs/remotes/origin/master', 'abc123'));

		expect(branches[0]).toMatchObject({name: 'origin/master', isRemote: true});
	});

	it('marks the checked-out branch as current', () => {
		const {branches, current} = parseBranchRefs([
			line('refs/heads/master', 'aaa', '*'),
			line('refs/heads/feature', 'bbb'),
		].join('\n'));

		expect(current?.name).toBe('master');
		expect(branches.find(b => b.name === 'master')?.isCurrent).toBe(true);
		expect(branches.find(b => b.name === 'feature')?.isCurrent).toBe(false);
	});

	it('has no current branch on a detached HEAD', () => {
		const {current} = parseBranchRefs(line('refs/heads/master', 'aaa'));

		expect(current).toBeNull();
	});

	it('reads the upstream and how far the branch has diverged from it', () => {
		const {branches} = parseBranchRefs(
			line('refs/heads/master', 'aaa', '*', 'origin/master', '[ahead 2, behind 1]'),
		);

		expect(branches[0]).toMatchObject({upstream: 'origin/master', ahead: 2, behind: 1});
	});

	it('reads a branch that is only ahead', () => {
		const {branches} = parseBranchRefs(
			line('refs/heads/master', 'aaa', '', 'origin/master', '[ahead 3]'),
		);

		expect(branches[0]).toMatchObject({upstream: 'origin/master', ahead: 3, behind: 0});
	});

	it('reads a branch that is only behind', () => {
		const {branches} = parseBranchRefs(
			line('refs/heads/master', 'aaa', '', 'origin/master', '[behind 4]'),
		);

		expect(branches[0]).toMatchObject({ahead: 0, behind: 4});
	});

	it('reports an in-sync branch as zero in both directions', () => {
		const {branches} = parseBranchRefs(
			line('refs/heads/master', 'aaa', '', 'origin/master', ''),
		);

		expect(branches[0]).toMatchObject({upstream: 'origin/master', ahead: 0, behind: 0});
	});

	// `[gone]` means the upstream ref was deleted on the remote — the branch still has one
	// configured, but there is nothing to compare against.
	it('keeps the upstream name but no counts when the upstream is gone', () => {
		const {branches} = parseBranchRefs(
			line('refs/heads/master', 'aaa', '', 'origin/master', '[gone]'),
		);

		expect(branches[0]).toMatchObject({upstream: 'origin/master'});
		expect(branches[0]?.ahead).toBeUndefined();
		expect(branches[0]?.behind).toBeUndefined();
	});

	it('leaves a branch with no upstream without counts', () => {
		const {branches} = parseBranchRefs(line('refs/heads/local-only', 'aaa'));

		expect(branches[0]?.upstream).toBeUndefined();
		expect(branches[0]?.ahead).toBeUndefined();
	});

	it('skips the remote HEAD pointer, which is not a branch', () => {
		const {branches} = parseBranchRefs([
			line('refs/remotes/origin/HEAD', 'aaa'),
			line('refs/remotes/origin/master', 'bbb'),
		].join('\n'));

		expect(branches.map(b => b.name)).toEqual(['origin/master']);
	});

	it('handles empty output', () => {
		expect(parseBranchRefs('')).toEqual({branches: [], current: null});
	});

	it('keeps a branch name containing a slash intact', () => {
		const {branches} = parseBranchRefs(line('refs/heads/feature/login', 'aaa'));

		expect(branches[0]?.name).toBe('feature/login');
	});
});

describe('BRANCH_REF_FORMAT', () => {
	it('declares the fields in the order the parser reads them', () => {
		expect(BRANCH_REF_FORMAT).toBe(
			'%(refname)%09%(objectname)%09%(HEAD)%09%(upstream:short)%09%(upstream:track)',
		);
	});
});
