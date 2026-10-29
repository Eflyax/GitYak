import type {ISshProxyJumpConfig} from '@/domain/models/SshProxyJump';

const
	START_MARKER = '# >>> GitYak ProxyJump >>>',
	END_MARKER = '# <<< GitYak ProxyJump <<<',
	JUMP_ALIAS = 'gityak-jump',
	HOST_RE = /^[A-Za-z0-9._:-]+$/,
	HOST_PATTERN_RE = /^!?[A-Za-z0-9._:*?-]+$/,
	USER_RE = /^[A-Za-z0-9._-]+$/;

/** Target hosts trimmed and joined by single spaces, as they go on the `Host` line. */
function targetHostList(targetHosts: string): Array<string> {
	return targetHosts.trim().split(/ +/).filter(Boolean);
}

/** Control characters and quotes would end the quoted IdentityFile value early. */
function isSafeQuotedValue(value: string): boolean {
	return Array.from(value).every(char => {
		const code = char.charCodeAt(0);

		return code >= 32 && code !== 127 && char !== '"';
	});
}

function validateJumpHost(config: ISshProxyJumpConfig): Array<string> {
	const
		host = config.jumpHost.trim(),
		user = config.jumpUser.trim(),
		errors: Array<string> = [];

	if (!host) {
		errors.push('Jump host is required');
	}
	else if (!HOST_RE.test(host)) {
		errors.push('Jump host contains invalid characters');
	}

	if (user && !USER_RE.test(user)) {
		errors.push('Jump user contains invalid characters');
	}

	if (config.jumpPort !== undefined && !(Number.isInteger(config.jumpPort) && config.jumpPort >= 1 && config.jumpPort <= 65535)) {
		errors.push('Port must be between 1 and 65535');
	}

	if (!isSafeQuotedValue(config.identityFile.trim())) {
		errors.push('Identity file contains invalid characters');
	}

	return errors;
}

function validateTargetHosts(targetHosts: string): Array<string> {
	const hosts = targetHostList(targetHosts);

	if (hosts.length === 0) {
		return ['Git server host is required'];
	}

	return hosts.every(host => HOST_PATTERN_RE.test(host)) ? [] : ['Git server host contains invalid characters'];
}

/**
 * Every field ends up on its own line in ~/.ssh/config, so anything that could break out of
 * that line (whitespace, newlines, quotes) is rejected before a block is ever built.
 */
export function validateProxyJumpConfig(config: ISshProxyJumpConfig): Array<string> {
	return [...validateJumpHost(config), ...validateTargetHosts(config.targetHosts)];
}

export function buildProxyJumpBlock(config: ISshProxyJumpConfig): string {
	const
		user = config.jumpUser.trim(),
		identityFile = config.identityFile.trim(),
		lines = [START_MARKER, `Host ${JUMP_ALIAS}`, `\tHostName ${config.jumpHost.trim()}`];

	if (user) {
		lines.push(`\tUser ${user}`);
	}

	if (config.jumpPort !== undefined) {
		lines.push(`\tPort ${config.jumpPort}`);
	}

	if (identityFile) {
		lines.push(`\tIdentityFile "${identityFile}"`);
	}

	// ssh_config keeps the first value it sees; without this a target pattern like `*` would
	// also match the alias and make it jump through itself.
	lines.push('\tProxyJump none', `Host ${targetHostList(config.targetHosts).join(' ')}`, `\tProxyJump ${JUMP_ALIAS}`, END_MARKER);

	return lines.join('\n');
}

export function hasProxyJumpBlock(content: string): boolean {
	const start = content.indexOf(START_MARKER);

	return start !== -1 && content.indexOf(END_MARKER, start) !== -1;
}

/** Drops the managed block together with the blank lines that separated it from user content. */
export function removeProxyJumpBlock(content: string): string {
	const start = content.indexOf(START_MARKER);

	if (start === -1) {
		return content;
	}

	const end = content.indexOf(END_MARKER, start);

	if (end === -1) {
		throw new Error('GitYak ProxyJump block in ~/.ssh/config has no end marker; fix the file manually');
	}

	const
		before = content.slice(0, start).replace(/\n+$/, ''),
		after = content.slice(end + END_MARKER.length).replace(/^\n+/, '');

	if (!after) {
		return before ? `${before}\n` : '';
	}

	return before ? `${before}\n\n${after}` : after;
}

/**
 * Appends the block at the very end: placed at the top, the user's global options that precede
 * their first `Host` line would silently fall under our `Host` pattern instead.
 */
export function applyProxyJumpBlock(content: string, block: string): string {
	const base = removeProxyJumpBlock(content).replace(/\n+$/, '');

	return base ? `${base}\n\n${block}\n` : `${block}\n`;
}
