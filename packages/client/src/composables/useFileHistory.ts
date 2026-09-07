import {ref, readonly} from 'vue';
import {FILE_HISTORY_FORMAT, parseFileHistory} from '@/domain/services/fileHistory';
import type {IFileHistoryEntry} from '@/domain/services/fileHistory';
import {parseBlame} from '@/domain/services/blame';
import type {IBlameLine} from '@/domain/services/blame';
import {useGit} from './useGit';

const HISTORY_LIMIT = 100;

const
	entries = ref<Array<IFileHistoryEntry>>([]),
	blame = ref<Array<IBlameLine>>([]),
	historyPath = ref<string | null>(null),
	loading = ref(false);

export function useFileHistory() {
	const {callGit} = useGit();

	/**
	 * Loads the commits that touched a path. `--follow` keeps the history going across
	 * renames, which is the whole point of asking per file rather than reading the graph.
	 */
	async function loadHistory(path: string): Promise<void> {
		historyPath.value = path;
		loading.value = true;

		try {
			const output = await callGit(
				'log',
				'--follow',
				'--name-status',
				'-z',
				`--pretty=format:${FILE_HISTORY_FORMAT}`,
				'--date=format-local:%Y-%m-%d %H:%M',
				`--max-count=${HISTORY_LIMIT}`,
				'--',
				path,
			);

			entries.value = parseFileHistory(output);
		}
		catch {
			// An untracked file has no history; an unreachable repo is reported by whatever
			// triggered the load. Either way the panel shows "no history" rather than an error.
			entries.value = [];
		}
		finally {
			loading.value = false;
		}
	}

	/**
	 * Per-line authorship for a path at a revision. Defaults to the working tree, where git
	 * attributes uncommitted lines to the all-zero hash.
	 */
	async function loadBlame(path: string, rev?: string): Promise<void> {
		try {
			const output = await callGit(
				'blame',
				'--porcelain',
				...(rev ? [rev] : []),
				'--',
				path,
			);

			blame.value = parseBlame(output);
		}
		catch {
			// Binary files and paths with no commits cannot be blamed.
			blame.value = [];
		}
	}

	function clear(): void {
		entries.value = [];
		blame.value = [];
		historyPath.value = null;
	}

	return {
		entries: readonly(entries),
		blame: readonly(blame),
		historyPath: readonly(historyPath),
		loading: readonly(loading),
		loadHistory,
		loadBlame,
		clear,
	};
}
