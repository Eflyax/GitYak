import {describe, it, expect} from 'vitest';
import {getGitTaskLabel} from './gitTaskLabel';

describe('getGitTaskLabel', () => {
	it('labels remote operations', () => {
		expect(getGitTaskLabel(['fetch', '--prune', '--all'])).toBe('Fetching');
		expect(getGitTaskLabel(['pull', 'origin', 'main'])).toBe('Pulling');
		expect(getGitTaskLabel(['push', '--set-upstream', 'origin'])).toBe('Pushing');
	});

	it('labels history-changing operations', () => {
		expect(getGitTaskLabel(['merge', 'feature'])).toBe('Merging');
		expect(getGitTaskLabel(['cherry-pick', 'abc123'])).toBe('Cherry-picking');
		expect(getGitTaskLabel(['reset', '--hard', 'HEAD~1'])).toBe('Resetting');
	});

	it('ignores read-only queries', () => {
		expect(getGitTaskLabel(['log', '--all'])).toBeNull();
		expect(getGitTaskLabel(['diff', 'a', 'b'])).toBeNull();
		expect(getGitTaskLabel(['rev-parse', 'HEAD'])).toBeNull();
		expect(getGitTaskLabel([])).toBeNull();
	});

	it('tells stash subcommands apart', () => {
		expect(getGitTaskLabel(['stash', 'list'])).toBeNull();
		expect(getGitTaskLabel(['stash', 'show', 'stash@{0}'])).toBeNull();
		expect(getGitTaskLabel(['stash', 'pop', 'stash@{0}'])).toBe('Applying stash');
		expect(getGitTaskLabel(['stash', 'drop', 'stash@{0}'])).toBe('Dropping stash');
		expect(getGitTaskLabel(['stash', 'push', '-m', 'wip'])).toBe('Stashing');
		expect(getGitTaskLabel(['stash'])).toBe('Stashing');
	});
});
