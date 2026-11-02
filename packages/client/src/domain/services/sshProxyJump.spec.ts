import {describe, it, expect} from 'vitest';
import {
	applyProxyJumpBlock,
	buildProxyJumpBlock,
	hasProxyJumpBlock,
	removeProxyJumpBlock,
	validateProxyJumpConfig,
} from './sshProxyJump';
import type {ISshProxyJumpConfig} from '@/domain/models/SshProxyJump';

const
	CONFIG: ISshProxyJumpConfig = {
		jumpHost: '10.99.0.1',
		jumpUser: 'eflyax',
		jumpPort: undefined,
		identityFile: '',
		targetHosts: 'git.example.com',
	},
	USER_CONFIG = 'Host github.com\n\tUser git\n';

describe('buildProxyJumpBlock', () => {
	it('routes the target host through a dedicated jump alias between markers', () => {
		expect(buildProxyJumpBlock(CONFIG)).toBe([
			'# >>> GitYak ProxyJump >>>',
			'Host gityak-jump',
			'\tHostName 10.99.0.1',
			'\tUser eflyax',
			'\tProxyJump none',
			'Host git.example.com',
			'\tProxyJump gityak-jump',
			'# <<< GitYak ProxyJump <<<',
		].join('\n'));
	});

	it('adds port and quoted identity file of the jump host when given', () => {
		const block = buildProxyJumpBlock({
			...CONFIG,
			jumpPort: 2222,
			identityFile: '/Users/me/My Keys/id_ed25519',
		});

		expect(block).toContain('\tPort 2222\n');
		expect(block).toContain('\tIdentityFile "/Users/me/My Keys/id_ed25519"\n');
	});

	// A broad target pattern such as `*` also matches the alias itself; ssh_config takes the
	// first value it finds, so the alias must pin its own ProxyJump to avoid a loop.
	it('pins the jump alias to a direct connection', () => {
		const block = buildProxyJumpBlock({...CONFIG, targetHosts: '*'});

		const pinned = block.indexOf('\tProxyJump none');

		expect(pinned).toBeGreaterThan(-1);
		expect(pinned).toBeLessThan(block.indexOf('\tProxyJump gityak-jump'));
	});

	it('omits the user line when no jump user is set', () => {
		expect(buildProxyJumpBlock({...CONFIG, jumpUser: ''})).not.toContain('User');
	});

	it('keeps several space separated target hosts on one Host line', () => {
		expect(buildProxyJumpBlock({...CONFIG, targetHosts: ' git.a.cz   git.b.cz '}))
			.toContain('\nHost git.a.cz git.b.cz\n');
	});
});

describe('applyProxyJumpBlock', () => {
	const block = buildProxyJumpBlock(CONFIG);

	it('appends the block after the existing content, separated by a blank line', () => {
		expect(applyProxyJumpBlock(USER_CONFIG, block)).toBe(`${USER_CONFIG}\n${block}\n`);
	});

	it('writes just the block into an empty or missing config', () => {
		expect(applyProxyJumpBlock('', block)).toBe(`${block}\n`);
	});

	it('replaces an existing block instead of adding a second one', () => {
		const
			first = applyProxyJumpBlock(USER_CONFIG, block),
			changed = buildProxyJumpBlock({...CONFIG, jumpHost: '10.99.0.9'}),
			result = applyProxyJumpBlock(first, changed);

		expect(result).toBe(`${USER_CONFIG}\n${changed}\n`);
	});

	it('keeps user content that follows a block in the middle of the file', () => {
		const
			middle = `${USER_CONFIG}\n${block}\n\nHost later\n\tUser x\n`,
			changed = buildProxyJumpBlock({...CONFIG, jumpHost: '10.99.0.9'}),
			result = applyProxyJumpBlock(middle, changed);

		expect(result).toBe(`${USER_CONFIG}\nHost later\n\tUser x\n\n${changed}\n`);
	});
});

describe('removeProxyJumpBlock', () => {
	const block = buildProxyJumpBlock(CONFIG);

	it('restores the original config after apply', () => {
		expect(removeProxyJumpBlock(applyProxyJumpBlock(USER_CONFIG, block))).toBe(USER_CONFIG);
	});

	it('leaves an empty file when the block was the only content', () => {
		expect(removeProxyJumpBlock(applyProxyJumpBlock('', block))).toBe('');
	});

	it('returns the config untouched when there is no block', () => {
		expect(removeProxyJumpBlock(USER_CONFIG)).toBe(USER_CONFIG);
	});

	it('refuses to touch a block whose end marker is missing', () => {
		expect(() => removeProxyJumpBlock(`${USER_CONFIG}# >>> GitYak ProxyJump >>>\nHost x\n`))
			.toThrow(/end marker/);
	});
});

describe('hasProxyJumpBlock', () => {
	it('is true only when the managed block is present', () => {
		expect(hasProxyJumpBlock(applyProxyJumpBlock(USER_CONFIG, buildProxyJumpBlock(CONFIG)))).toBe(true);
		expect(hasProxyJumpBlock(USER_CONFIG)).toBe(false);
	});
});

describe('validateProxyJumpConfig', () => {
	it('accepts a complete config', () => {
		expect(validateProxyJumpConfig(CONFIG)).toEqual([]);
	});

	it('requires the jump host and the target host', () => {
		expect(validateProxyJumpConfig({...CONFIG, jumpHost: ' ', targetHosts: ''})).toEqual([
			'Jump host is required',
			'Git server host is required',
		]);
	});

	// Every field ends up as a line in ~/.ssh/config; a newline or a space would let the
	// value smuggle in extra directives (e.g. a ProxyCommand) for any host.
	it('rejects values that could inject extra ssh_config directives', () => {
		expect(validateProxyJumpConfig({
			...CONFIG,
			jumpHost: '10.99.0.1\n\tProxyCommand evil',
			jumpUser: 'me root',
			identityFile: '/key"\nHost *',
			targetHosts: 'git.example.com\nHost *',
		})).toEqual([
			'Jump host contains invalid characters',
			'Jump user contains invalid characters',
			'Identity file contains invalid characters',
			'Git server host contains invalid characters',
		]);
	});

	it('rejects a port outside 1-65535', () => {
		expect(validateProxyJumpConfig({...CONFIG, jumpPort: 70000})).toEqual(['Port must be between 1 and 65535']);
		expect(validateProxyJumpConfig({...CONFIG, jumpPort: 1.5})).toEqual(['Port must be between 1 and 65535']);
	});

	it('allows ssh host patterns in the git server host', () => {
		expect(validateProxyJumpConfig({...CONFIG, targetHosts: '*.example.com !public.example.com'})).toEqual([]);
	});
});
