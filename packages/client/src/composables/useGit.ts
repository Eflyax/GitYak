import {ref} from 'vue';
import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';
import {useLayout} from './useLayout';
import {useActivityLog} from './useActivityLog';
import {useSafeDirectory} from './useSafeDirectory';
import {ENetworkCommand, EFileArea, EGitErrorCode} from '@/domain';
import {parseGitError, isNotARepository, parseDubiousOwnershipPath} from '@/domain';
import type {IFileStatus} from '@/domain';

export interface IRemoteConfig {
	name: string;
	fetchUrl: string;
	pushUrl: string;
}

const activePath = ref<string | null>(null);

export function useGit() {
	const
		{call} = useWebSocket(),
		{currentProject} = useProject(),
		{setLoading} = useLayout(),
		{addLog} = useActivityLog(),
		{request: requestSafeDirectory} = useSafeDirectory();

	function repoPath(): string {
		if (!currentProject.value) {
			throw new Error('No project selected');
		}

		return currentProject.value.path;
	}

	/**
	 * Classifies a backend failure. A dubious-ownership refusal blocks every command in the
	 * repository, so it raises the prompt from here rather than from one call site; the error
	 * itself is returned unchanged for the caller to handle as it always did.
	 */
	function toGitError(message: string): ReturnType<typeof parseGitError> {
		const gitError = parseGitError(message, -1);

		if (gitError.code === EGitErrorCode.DubiousOwnership) {
			const refused = parseDubiousOwnershipPath(message);

			if (refused) {
				requestSafeDirectory(refused);
			}
		}

		return gitError;
	}

	async function callGit(...args: string[]): Promise<string> {
		setLoading(true);
		const cmdLabel = 'git ' + args.join(' ');
		addLog({type: 'git', status: 'info', direction: 'request', message: cmdLabel});

		try {
			const result = await call(ENetworkCommand.GitCall, {
				repo_path: repoPath(),
				args,
			});

			addLog({type: 'git', status: 'success', direction: 'response', message: cmdLabel});
			return result as string;
		}
		catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			addLog({type: 'git', status: 'error', direction: 'response', message});

			throw toGitError(message);
		}
		finally {
			setLoading(false);
		}
	}

	async function readFile(filePath: string, options: Record<string, unknown> = {}): Promise<string> {
		activePath.value = filePath;

		const result = await call(ENetworkCommand.ReadFile, {
			repo_path: repoPath(),
			file_path: filePath,
			options,
		});

		return result as string;
	}

	async function writeFile(filePath: string, content: string): Promise<void> {
		await call(ENetworkCommand.WriteFile, {
			repo_path: repoPath(),
			file_path: filePath,
			content,
		});
	}

	// ── Základní Git operace ───────────────────────────────────────────────────

	async function resolveRemote(preferredRemote?: string): Promise<string> {
		if (preferredRemote) {
			return preferredRemote;
		}

		try {
			const branch = (await callGit('branch', '--show-current')).trim();

			if (branch) {
				const tracked = (await callGit('config', `branch.${branch}.remote`).catch(() => '')).trim();

				if (tracked) {
					return tracked;
				}
			}
		}
		catch {
			// ignore: no current branch (e.g. detached HEAD)
		}

		try {
			const firstRemote = (await callGit('remote')).trim().split('\n')[0];

			if (firstRemote) {
				return firstRemote;
			}
		}
		catch {
			// ignore: no remotes configured
		}

		return 'origin';
	}

	async function fetch(remote?: string): Promise<void> {
		await callGit('fetch', '--prune', remote ?? '--all');
	}

	async function pull(remote?: string, branch?: string): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit('pull', r, ...(branch ? [branch] : []));
	}

	async function push(remote?: string, branch?: string, force = false): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit(
			'push',
			'--set-upstream',
			r,
			...(branch ? [branch] : []),
			...(force ? ['--force-with-lease'] : []),
		);
	}

	async function pushBranch(branchName: string, remote?: string): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit('push', '--set-upstream', r, branchName);
	}

	// ── Checkout ───────────────────────────────────────────────────────────────

	async function checkout(ref: string): Promise<void> {
		await callGit('checkout', ref);
	}

	async function checkoutNewBranch(branchName: string, from?: string): Promise<void> {
		await callGit('checkout', '-b', branchName, ...(from ? [from] : []));
	}

	// ── Branch ────────────────────────────────────────────────────────────────

	async function deleteBranch(branchName: string, force = false): Promise<void> {
		await callGit('branch', force ? '-D' : '-d', branchName);
	}

	async function deleteRemoteBranch(branchName: string, remote?: string): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit('push', r, '--delete', branchName);
	}

	async function renameBranch(oldName: string, newName: string): Promise<void> {
		await callGit('branch', '-m', oldName, newName);
	}

	async function setUpstream(branchName: string, upstream: string): Promise<void> {
		await callGit('branch', `--set-upstream-to=${upstream}`, branchName);
	}

	// ── Staging ───────────────────────────────────────────────────────────────

	async function stageFile(filePath: string): Promise<void> {
		await callGit('add', '--', filePath);
	}

	async function stageAll(): Promise<void> {
		await callGit('add', '--all');
	}

	async function unstageFile(filePath: string): Promise<void> {
		await callGit('restore', '--staged', '--', filePath);
	}

	async function unstageAll(): Promise<void> {
		await callGit('restore', '--staged', '.');
	}

	async function discardFile(filePath: string): Promise<void> {
		await callGit('restore', '--', filePath);
	}

	async function discardAllChanges(): Promise<void> {
		await callGit('reset', '--hard', 'HEAD');
		await callGit('clean', '-fd');
	}

	// ── Partial (per-hunk) staging ────────────────────────────────────────────

	/**
	 * The diff of one file against the index (or the index against HEAD for a staged file),
	 * as raw patch text. Returns '' when there is nothing to diff — an untracked file has no
	 * index entry, so git prints nothing rather than failing.
	 */
	async function getFilePatch(file: IFileStatus): Promise<string> {
		const args = ['diff', '--no-color', '--no-ext-diff'];

		if (file.area === EFileArea.Staged) {
			args.push('--cached');
		}

		args.push('--');

		// A rename has to name both sides or the diff header would not describe the move.
		if (file.oldPath && file.oldPath !== file.path) {
			args.push(file.oldPath);
		}

		args.push(file.path);

		return callGit(...args);
	}

	/**
	 * Applies a patch built from a subset of a file's hunks. `gitCall` is argv-only on every
	 * backend, so the patch reaches git through a scratch file inside .git — the same route
	 * the interactive rebase uses for its todo list.
	 */
	async function applyPatch(patchText: string, mode: 'stage' | 'unstage' | 'discard'): Promise<void> {
		const patchFile = '.git/gityak-hunk.patch';

		await writeFile(patchFile, patchText);

		const args = ['apply', '--whitespace=nowarn'];

		if (mode !== 'discard') {
			args.push('--cached');
		}

		if (mode !== 'stage') {
			args.push('-R');
		}

		await callGit(...args, patchFile);
	}

	// ── Commit ────────────────────────────────────────────────────────────────

	async function commit(message: string, options: {amend?: boolean; noVerify?: boolean} = {}): Promise<string> {
		return callGit(
			'commit',
			'-m', message,
			...(options.amend ? ['--amend'] : []),
			...(options.noVerify ? ['--no-verify'] : []),
		);
	}

	// ── Tag ───────────────────────────────────────────────────────────────────

	async function createTag(name: string, ref?: string, message?: string): Promise<void> {
		if (message) {
			await callGit('tag', '-a', name, ...(ref ? [ref] : []), '-m', message);
		}
		else {
			await callGit('tag', name, ...(ref ? [ref] : []));
		}
	}

	async function deleteTag(name: string): Promise<void> {
		await callGit('tag', '-d', name);
	}

	async function deleteRemoteTag(name: string, remote?: string): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit('push', r, '--delete', `refs/tags/${name}`);
	}

	async function pushTag(name: string, remote?: string): Promise<void> {
		const r = await resolveRemote(remote);
		await callGit('push', r, `refs/tags/${name}`);
	}

	// ── Stash ─────────────────────────────────────────────────────────────────

	async function stashSave(message?: string): Promise<void> {
		await callGit('stash', 'push', '--include-untracked', ...(message ? ['-m', message] : []));
	}

	async function stashPop(stashId: string): Promise<void> {
		await callGit('stash', 'pop', stashId);
	}

	async function stashDrop(stashId: string): Promise<void> {
		await callGit('stash', 'drop', stashId);
	}

	// ── Reset ─────────────────────────────────────────────────────────────────

	async function resetSoft(ref: string): Promise<void> {
		await callGit('reset', '--soft', ref);
	}

	async function resetHard(ref: string): Promise<void> {
		await callGit('reset', '--hard', ref);
	}

	async function resetMixed(ref: string): Promise<void> {
		await callGit('reset', '--mixed', ref);
	}

	async function mergeAbort(): Promise<void> {
		await callGit('merge', '--abort');
	}

	// ── Cherry-pick ───────────────────────────────────────────────────────────

	async function cherryPick(hashes: Array<string>): Promise<void> {
		await callGit('cherry-pick', ...hashes);
	}

	/**
	 * Creates a commit that undoes the given one, leaving history intact. `--no-edit` keeps
	 * git's generated message instead of opening an editor the GUI has no way to answer.
	 */
	async function revertCommit(hash: string): Promise<void> {
		await callGit('revert', '--no-edit', hash);
	}

	async function cherryPickAbort(): Promise<void> {
		await callGit('cherry-pick', '--abort');
	}

	async function cherryPickContinue(): Promise<void> {
		await callGit('cherry-pick', '--continue');
	}

	// ── Merge ─────────────────────────────────────────────────────────────────

	async function merge(branchName: string): Promise<void> {
		await callGit('merge', branchName);
	}

	// ── Rebase ────────────────────────────────────────────────────────────────

	async function mergeBase(a: string, b: string): Promise<string> {
		return (await callGit('merge-base', a, b)).trim();
	}

	// Commits reachable from `to` but not `from`, oldest first (git-rebase order).
	async function logRange(from: string, to: string): Promise<Array<{hash: string; shortHash: string; subject: string}>> {
		const SEP = '\x1f';
		const raw = await callGit('log', '--reverse', `--pretty=format:%H${SEP}%h${SEP}%s`, `${from}..${to}`);

		return raw
			.split('\n')
			.filter(Boolean)
			.map(line => {
				const [hash = '', shortHash = '', subject = ''] = line.split(SEP);

				return {hash, shortHash, subject};
			});
	}

	async function callRebase(payload: Record<string, unknown>): Promise<string> {
		setLoading(true);
		const cmdLabel = `git rebase (${String(payload['action'])})`;
		addLog({type: 'git', status: 'info', direction: 'request', message: cmdLabel});

		try {
			const result = await call(ENetworkCommand.GitRebase, {
				repo_path: repoPath(),
				...payload,
			});

			addLog({type: 'git', status: 'success', direction: 'response', message: cmdLabel});

			return result as string;
		}
		catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			addLog({type: 'git', status: 'error', direction: 'response', message});

			throw toGitError(message);
		}
		finally {
			setLoading(false);
		}
	}

	// Runs `git rebase -i <upstream>` headlessly. The server composes every `-c` flag from
	// a todo path it has validated against the repository, so no client string reaches
	// `git -c`.
	async function rebaseInteractive(upstream: string, todoRelPath: string): Promise<void> {
		await callRebase({action: 'start', upstream, todo_path: todoRelPath});
	}

	async function rebaseContinue(): Promise<void> {
		await callRebase({action: 'continue'});
	}

	async function rebaseSkip(): Promise<void> {
		await callGit('rebase', '--skip');
	}

	async function rebaseAbort(): Promise<void> {
		await callGit('rebase', '--abort');
	}

	// ── Init ──────────────────────────────────────────────────────────────────

	async function initRepo(defaultBranch = 'master'): Promise<void> {
		try {
			await callGit('init', '-b', defaultBranch);
		}
		catch {
			await callGit('init');
			await callGit('symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`);
		}
	}

	/**
	 * Answers whether the project path is a git repository. A transport failure is NOT an
	 * answer — it is rethrown, so the caller reports a connection problem instead of
	 * latching "this folder is not a git repository" onto a repo it simply could not reach.
	 */
	async function isGitRepo(): Promise<boolean> {
		try {
			await callGit('rev-parse', '--git-dir');
			return true;
		}
		catch (err: unknown) {
			if (isNotARepository(err)) {
				return false;
			}

			throw err;
		}
	}

	/**
	 * Records a directory as trusted in the user's global git config — the remedy git itself
	 * prints when it refuses a repository for dubious ownership.
	 */
	async function addSafeDirectory(directory: string): Promise<void> {
		await callGit('config', '--global', '--add', 'safe.directory', directory);
	}

	// ── Remotes ───────────────────────────────────────────────────────────────

	async function getRemotes(): Promise<Array<IRemoteConfig>> {
		const raw = (await callGit('remote', '-v')).trim();

		if (!raw) return [];

		const map = new Map<string, IRemoteConfig>();

		for (const line of raw.split('\n')) {
			const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);

			if (!match) continue;

			const [, name, url, kind] = match as unknown as [string, string, string, 'fetch' | 'push'];
			const entry = map.get(name) ?? {name, fetchUrl: '', pushUrl: ''};

			if (kind === 'fetch') entry.fetchUrl = url;
			else entry.pushUrl = url;

			map.set(name, entry);
		}

		return [...map.values()];
	}

	async function saveRemote(originalName: string | null, name: string, fetchUrl: string, pushUrl: string): Promise<void> {
		if (!originalName) {
			await callGit('remote', 'add', name, fetchUrl);
		}
		else if (originalName !== name) {
			await callGit('remote', 'rename', originalName, name);
		}

		await callGit('remote', 'set-url', name, fetchUrl);
		await callGit('remote', 'set-url', '--push', name, pushUrl || fetchUrl);
	}

	// ── Read commit message (for amend prefill / squash) ──────────────────────

	async function getCommitMessage(hash = 'HEAD'): Promise<{subject: string; body: string}> {
		const FIELD_SEP = '\x06';
		const raw = await callGit('log', '-1', `--pretty=format:%s${FIELD_SEP}%b`, hash);
		const [subject = '', body = ''] = raw.split(FIELD_SEP);

		return {subject, body};
	}

	return {
		activePath,
		callGit,
		readFile,
		writeFile,
		fetch,
		pull,
		push,
		pushBranch,
		checkout,
		checkoutNewBranch,
		deleteBranch,
		deleteRemoteBranch,
		renameBranch,
		setUpstream,
		stageFile,
		stageAll,
		unstageFile,
		unstageAll,
		discardFile,
		discardAllChanges,
		getFilePatch,
		applyPatch,
		commit,
		createTag,
		deleteTag,
		deleteRemoteTag,
		pushTag,
		stashSave,
		stashPop,
		stashDrop,
		resetSoft,
		resetHard,
		resetMixed,
		mergeAbort,
		cherryPick,
		revertCommit,
		cherryPickAbort,
		cherryPickContinue,
		merge,
		mergeBase,
		logRange,
		rebaseInteractive,
		rebaseContinue,
		rebaseSkip,
		rebaseAbort,
		initRepo,
		isGitRepo,
		addSafeDirectory,
		getRemotes,
		saveRemote,
		getCommitMessage,
	};
}
