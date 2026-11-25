import {ref, computed, readonly} from 'vue';
import type {IFileStatus} from '@/domain';
import {EFileArea, EFileStatus} from '@/domain';
import {parseFilePatch, buildPatch} from '@/domain/services/patch';
import type {IHunk, IFilePatch} from '@/domain/services/patch';
import {useGit} from './useGit';
import {
	base64DataUrl,
	formatBase64Size,
	formatBytes,
	getImageMimeType,
	isRasterImagePath,
	isSvgPath,
	svgDataUrl,
} from '@/domain/services/imagePreview';

const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

// The working-tree revision pair. Only a diff loaded with these revisions describes changes
// that are still stageable; anything else is a historical commit diff, which has no hunk
// actions.
const WORKING_TREE_REVISIONS: [string, string] = ['WORKING_TREE', 'HEAD'];

const
	original = ref(''),
	modified = ref(''),
	originalImage = ref<IImageSide | null>(null),
	modifiedImage = ref<IImageSide | null>(null),
	activeFile = ref<IFileStatus | null>(null),
	patch = ref<IFilePatch | null>(null),
	// Bumped by every loadDiff, so views can start fresh for each file or revision shown.
	loadCount = ref(0);

/** One side of an image diff, ready for an <img>. */
export interface IImageSide {
	url: string;
	/** Human-readable file size, e.g. "12.4 KB". */
	size: string;
}

/** Where one side of a diff is read from; `revision: null` is the working tree. */
interface IContentSource {
	revision: string | null;
	path: string;
}

function originalSource(file: IFileStatus, rev1: string): IContentSource | null {
	if (file.status === EFileStatus.Added) return null;

	const revision = file.area === EFileArea.Unstaged ? ':0' : rev1;

	if (revision === 'EMPTY_ROOT' || revision === EMPTY_TREE_HASH) return null;

	const path = ([EFileStatus.Renamed, EFileStatus.Conflicted] as string[]).includes(file.status)
		? (file.oldPath ?? file.path)
		: file.path;

	return {revision, path};
}

function modifiedSource(file: IFileStatus, rev0: string): IContentSource | null {
	if (file.status === EFileStatus.Deleted) return null;

	const revision = file.area === EFileArea.Staged ? ':0' : rev0;

	return {revision: revision === 'WORKING_TREE' ? null : revision, path: file.path};
}

function svgSide(source: string): IImageSide | null {
	return source
		? {url: svgDataUrl(source), size: formatBytes(new TextEncoder().encode(source).length)}
		: null;
}

export function useFileDiff() {
	const {callGit, readFile, readBlob, activePath, getFilePatch, applyPatch} = useGit();

	async function loadText(source: IContentSource | null): Promise<string> {
		if (!source) return '';

		try {
			return source.revision === null
				? await readFile(source.path)
				: await callGit('show', `${source.revision}:${source.path}`);
		}
		catch {
			return '';
		}
	}

	async function loadRasterImage(source: IContentSource | null, mimeType: string): Promise<IImageSide | null> {
		if (!source) return null;

		try {
			const base64 = await readBlob(source.path, source.revision ?? undefined);

			return {url: base64DataUrl(mimeType, base64), size: formatBase64Size(base64)};
		}
		catch {
			return null;
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

		const
			[rev0, rev1] = revisions,
			from = originalSource(file, rev1),
			to = modifiedSource(file, rev0),
			mimeType = getImageMimeType(file.path);

		// A raster image is binary: read as text it is garbage for the editor, and its patch
		// has no hunks. Only its bytes are loaded, for the preview.
		if (mimeType && isRasterImagePath(file.path)) {
			[originalImage.value, modifiedImage.value] = await Promise.all([
				loadRasterImage(from, mimeType),
				loadRasterImage(to, mimeType),
			]);
			original.value = '';
			modified.value = '';
			patch.value = null;
			loadCount.value++;

			return;
		}

		[original.value, modified.value, patch.value] = await Promise.all([
			loadText(from),
			loadText(to),
			loadPatch(file, revisions),
		]);

		// SVG is text: the editor shows its source and the preview renders that same source.
		const isSvg = isSvgPath(file.path);

		originalImage.value = isSvg ? svgSide(original.value) : null;
		modifiedImage.value = isSvg ? svgSide(modified.value) : null;
		loadCount.value++;
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
		originalImage: readonly(originalImage),
		modifiedImage: readonly(modifiedImage),
		patch: readonly(patch),
		loadCount: readonly(loadCount),
		activeFile: readonly(activeFile),
		hunkActions,
		loadDiff,
		applyHunk,
	};
}
