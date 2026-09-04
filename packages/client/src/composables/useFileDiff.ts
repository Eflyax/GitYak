import {ref, computed, readonly} from 'vue';
import type {IFileStatus} from '@/domain';
import {EFileArea, EFileStatus} from '@/domain';
import {parseFilePatch, buildPatch} from '@/domain/services/patch';
import type {IHunk, IFilePatch} from '@/domain/services/patch';
import {useGit} from './useGit';

const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// The working-tree revision pair. Only a diff loaded with these revisions describes changes
// that are still stageable; anything else is a historical commit diff, which has no hunk
// actions.
const WORKING_TREE_REVISIONS: [string, string] = ['WORKING_TREE', 'HEAD'];

const
	original = ref(''),
	modified = ref(''),
	activeFile = ref<IFileStatus | null>(null),
	patch = ref<IFilePatch | null>(null);

export function useFileDiff() {
	const {callGit, readFile, activePath, getFilePatch, applyPatch} = useGit();

	async function loadOriginal(file: IFileStatus, rev1: string): Promise<string> {
		if (file.status === EFileStatus.Added) return '';

		const rev = file.area === EFileArea.Unstaged ? ':0' : rev1;

		if (rev === 'EMPTY_ROOT' || rev === EMPTY_TREE_HASH) return '';

		const filePath = ([EFileStatus.Renamed, EFileStatus.Conflicted] as string[]).includes(file.status)
			? (file.oldPath ?? file.path)
			: file.path;

		try {
			return await callGit('show', `${rev}:${filePath}`);
		}
		catch {
			return '';
		}
	}

	async function loadModified(file: IFileStatus, rev0: string): Promise<string> {
		if (file.status === EFileStatus.Deleted) return '';

		const rev = file.area === EFileArea.Staged ? ':0' : rev0;

		if (rev === 'WORKING_TREE') {
			try {
				return await readFile(file.path);
			}
			catch {
				return '';
			}
		}

		try {
			return await callGit('show', `${rev}:${file.path}`);
		}
		catch {
			return '';
		}
	}

	// A commit diff is read-only, and a conflicted file is handled by the conflict resolver,
	// so neither gets hunks. Anything else is diffed against the index so its hunks can be
	// staged, unstaged or discarded individually.
	async function loadPatch(file: IFileStatus, revisions: [string, string]): Promise<IFilePatch | null> {
		const isWorkingTree = revisions[0] === WORKING_TREE_REVISIONS[0]
			&& revisions[1] === WORKING_TREE_REVISIONS[1];

		if (!isWorkingTree || file.status === EFileStatus.Conflicted) {
			return null;
		}

		try {
			return parseFilePatch(await getFilePatch(file));
		}
		catch {
			return null;
		}
	}

	async function loadDiff(file: IFileStatus, revisions: [string, string] = WORKING_TREE_REVISIONS): Promise<void> {
		activePath.value = file.path;
		activeFile.value = file;

		const [rev0, rev1] = revisions;

		[original.value, modified.value, patch.value] = await Promise.all([
			loadOriginal(file, rev1),
			loadModified(file, rev0),
			loadPatch(file, revisions),
		]);
	}

	/** Which per-hunk actions the current diff supports; empty when it has no stageable hunks. */
	const hunkActions = computed<Array<'stage' | 'unstage' | 'discard'>>(() => {
		if (!patch.value || !activeFile.value) {
			return [];
		}

		return activeFile.value.area === EFileArea.Staged
			? ['unstage']
			: ['stage', 'discard'];
	});

	/**
	 * Applies one hunk and reloads the diff, so the editor and the remaining hunks reflect
	 * the new state. Returns false when the file has no changes left in its area — the
	 * caller closes the viewer in that case, matching what staging a whole file does.
	 */
	async function applyHunk(hunk: IHunk, mode: 'stage' | 'unstage' | 'discard'): Promise<boolean> {
		const file = activeFile.value;

		if (!patch.value || !file) {
			return true;
		}

		await applyPatch(buildPatch(patch.value, hunk), mode);
		await loadDiff(file);

		return patch.value !== null;
	}

	return {
		original: readonly(original),
		modified: readonly(modified),
		patch: readonly(patch),
		activeFile: readonly(activeFile),
		hunkActions,
		loadDiff,
		applyHunk,
	};
}
