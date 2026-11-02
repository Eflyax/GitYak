import {useGit} from './useGit';
import {useProject} from './useProject';

const STAMP_PREFIX = 'git-yak:commitGraph:';
// `--split` only appends the commits made since the last write, so a weekly refresh is cheap.
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const running = new Set<string>();

function readStamp(key: string): number {
	try {
		return Number(localStorage.getItem(key)) || 0;
	}
	catch {
		return 0;
	}
}

function writeStamp(key: string, value: number): void {
	try {
		localStorage.setItem(key, String(value));
	}
	catch {
		console.error('localStorage is not available');
	}
}

/**
 * Background housekeeping that keeps large repositories fast to open.
 */
export function useRepoMaintenance() {
	const {callGit} = useGit();
	const {currentProject} = useProject();

	/**
	 * Writes git's commit-graph file for the open repository, at most once a week. Without it
	 * `git log --all --date-order` walks the entire history before printing the first commit;
	 * with it the walk stops early, which makes opening and paging a large history several
	 * times faster. The file only caches what git can recompute, so writing it is safe.
	 */
	async function ensureCommitGraph(): Promise<void> {
		const id = currentProject.value?.id;

		if (!id || running.has(id)) return;

		const key = STAMP_PREFIX + id;

		if (Date.now() - readStamp(key) < REFRESH_INTERVAL_MS) return;

		running.add(id);

		try {
			await callGit('commit-graph', 'write', '--reachable', '--split');
		}
		catch {
			// Purely an optimisation: the failure is in the activity log, and a git too old for
			// --split is not retried on every open — the stamp below defers it like a success.
		}
		finally {
			writeStamp(key, Date.now());
			running.delete(id);
		}
	}

	return {ensureCommitGraph};
}
