import {useWorkingTree} from './useWorkingTree';
import {useNotify} from './useNotify';
import {GitError} from '@/domain';

/**
 * Stage / unstage with user feedback: a toast once the action finishes (it can take long on
 * many or large files) and an error toast instead of an unhandled rejection. The spinner over
 * the staging panel comes from `useWorkingTree().isStaging`.
 *
 * Uses `useNotify`, so call it from a component's setup.
 */
export function useStagingActions() {
	const {stageFile, stageAll, unstageFile, unstageAll, status, conflictDetected} = useWorkingTree();
	const notify = useNotify();

	function fileName(path: string): string {
		return path.split('/').pop() || path;
	}

	function files(count: number): string {
		return `${count} file${count === 1 ? '' : 's'}`;
	}

	/** Resolves to whether the action succeeded. */
	async function run(op: () => Promise<void>, successMessage: string): Promise<boolean> {
		try {
			await op();
			notify.success(successMessage);

			return true;
		}
		catch (err: unknown) {
			if (err instanceof GitError) {
				notify.error(err.stderr.trim() || err.message);
			}
			else {
				notify.error(err instanceof Error ? err.message : String(err));
			}

			return false;
		}
	}

	function stageFileWithFeedback(filePath: string): Promise<boolean> {
		const message = conflictDetected.value
			? `Marked ${fileName(filePath)} as resolved`
			: `Staged ${fileName(filePath)}`;

		return run(() => stageFile(filePath), message);
	}

	function stageAllWithFeedback(): Promise<boolean> {
		const count = status.value.unstaged.length;
		const message = conflictDetected.value
			? `Marked ${files(count)} as resolved`
			: `Staged ${files(count)}`;

		return run(stageAll, message);
	}

	function unstageFileWithFeedback(filePath: string): Promise<boolean> {
		return run(() => unstageFile(filePath), `Unstaged ${fileName(filePath)}`);
	}

	function unstageAllWithFeedback(): Promise<boolean> {
		return run(unstageAll, `Unstaged ${files(status.value.staged.length)}`);
	}

	return {
		stageFile: stageFileWithFeedback,
		stageAll: stageAllWithFeedback,
		unstageFile: unstageFileWithFeedback,
		unstageAll: unstageAllWithFeedback,
	};
}
