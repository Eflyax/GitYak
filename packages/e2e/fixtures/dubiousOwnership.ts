import {mkdirSync, rmSync, readFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * A second backend runs on this port with `GIT_TEST_ASSUME_DIFFERENT_OWNER=1`, which makes
 * git treat every repository as owned by another user — the refusal this exercises. Only
 * tests that deliberately point a project at this port are affected.
 */
export const DUBIOUS_OWNERSHIP_PORT = 3001;

const TMP_DIR = join(currentDir, '..', '.tmp-dubious-home');

/**
 * Where that backend's `git config --global` writes. Redirecting the global config file is
 * enough to keep the developer's own ~/.gitconfig out of it; overriding HOME instead would
 * also move the server's auth token and yarn's cache, which are unrelated to this test.
 */
export const DUBIOUS_OWNERSHIP_GIT_CONFIG = join(TMP_DIR, 'gitconfig');

/** Drops whatever a previous test trusted, so each test starts from an empty config. */
export function resetDubiousOwnershipConfig(): void {
	mkdirSync(TMP_DIR, {recursive: true});
	rmSync(DUBIOUS_OWNERSHIP_GIT_CONFIG, {force: true});
}

/** The safe.directory entries that config has accumulated. */
export function safeDirectories(): Array<string> {
	if (!existsSync(DUBIOUS_OWNERSHIP_GIT_CONFIG)) {
		return [];
	}

	return readFileSync(DUBIOUS_OWNERSHIP_GIT_CONFIG, 'utf8')
		.split('\n')
		.map(line => /^\s*directory\s*=\s*(.+)$/.exec(line.trim())?.[1])
		.filter((value): value is string => Boolean(value));
}
