import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

const TOKEN_PATH = join(homedir(), '.git-yak', 'server-token');

export const BIND_HOST = process.env.GITYAK_HOST ?? '127.0.0.1';

export function defaultAllowlist(): Array<string> {
	const configured = process.env.GITYAK_ALLOWED_ORIGINS;

	if (configured) {
		return configured.split(',').map(o => o.trim()).filter(Boolean);
	}

	return ['http://localhost:5173', 'http://127.0.0.1:5173', 'tauri://localhost'];
}

// A browser always sends Origin; a native client never does. So an absent Origin means the
// caller is not a web page, which is the case we want to admit.
export function isOriginAllowed(origin: string | null, allowlist: Array<string>): boolean {
	if (origin === null) {
		return true;
	}

	return allowlist.includes(origin);
}

export function resolveToken(): string {
	const fromEnv = process.env.GITYAK_TOKEN;

	if (fromEnv) {
		return fromEnv;
	}

	if (existsSync(TOKEN_PATH)) {
		const existing = readFileSync(TOKEN_PATH, 'utf8').trim();

		if (existing) {
			return existing;
		}
	}

	const generated = randomBytes(32).toString('hex');

	mkdirSync(dirname(TOKEN_PATH), {recursive: true, mode: 0o700});
	writeFileSync(TOKEN_PATH, generated + '\n', {mode: 0o600});
	console.log(`[auth] generated a new server token at ${TOKEN_PATH}`);

	return generated;
}
