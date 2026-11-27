import {describe, expect, it} from 'vitest';
import {buildRemoteGitCommand, sq} from './remoteGitCommand';

describe('buildRemoteGitCommand', () => {
	it('keeps the env assignments unquoted (no prompts, C locale) and quotes every argument', () => {
		expect(buildRemoteGitCommand('/srv/my repo', ['clone', '--progress', 'a b'])).toBe(
			"GIT_TERMINAL_PROMPT=0 LC_ALL=C git -C '/srv/my repo' 'clone' '--progress' 'a b'",
		);
	});

	it('escapes single quotes', () => {
		expect(sq("it's")).toBe("'it'\\''s'");
	});
});
