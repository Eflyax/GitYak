import {ref, readonly} from 'vue';
import {useGit} from './useGit';
import {useBranches} from './useBranches';
import {useWorkingTree} from './useWorkingTree';
import {useCommits} from './useCommits';
import {useStash} from './useStash';

export type TRebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop';

export interface IRebaseStep {
	hash: string;
	shortHash: string;
	subject: string;
	action: TRebaseAction;
	message: string;
}

const TODO_PATH = '.git/gityak-rebase-todo';

const show = ref(false);
const source = ref('');
const target = ref('');
const steps = ref<Array<IRebaseStep>>([]);
const running = ref(false);

export function useRebase() {
	const {logRange, mergeBase, rebaseInteractive, writeFile} = useGit();
	const {currentBranch, switchBranch, loadBranches} = useBranches();
	const {loadStatus, conflictDetected} = useWorkingTree();
	const {loadCommits, selectCommit} = useCommits();
	const {loadStashes} = useStash();

	// Open the editor for rebasing `src` onto `tgt` (replays src's unique commits).
	async function open(src: string, tgt: string): Promise<boolean> {
		const base = await mergeBase(tgt, src);
		const commits = await logRange(base, src);

		if (!commits.length) return false;

		source.value = src;
		target.value = tgt;
		steps.value = commits.map(c => ({
			hash: c.hash,
			shortHash: c.shortHash,
			subject: c.subject,
			action: 'pick',
			message: c.subject,
		}));
		show.value = true;

		return true;
	}

	function close(): void {
		show.value = false;
	}

	function move(index: number, delta: number): void {
		const next = index + delta;

		if (next < 0 || next >= steps.value.length) return;

		const list = [...steps.value];
		const [item] = list.splice(index, 1);

		list.splice(next, 0, item!);
		steps.value = list;
	}

	function reorder(from: number, to: number): void {
		if (from === to || from < 0 || to < 0) return;

		const list = [...steps.value];
		const [item] = list.splice(from, 1);

		list.splice(to, 0, item!);
		steps.value = list;
	}

	// Translates the plan into a git-rebase todo. reword/squash messages are
	// written to files and applied via `exec git commit --amend -F <file>` so no
	// interactive editor is ever needed.
	function buildTodo(): {todo: string; messages: Array<{path: string; content: string}>} {
		const lines: Array<string> = [];
		const messages: Array<{path: string; content: string}> = [];
		let msgIndex = 0;
		let groupMessage: Array<string> = [];
		let hasBase = false;

		const messagePath = (): string => `.git/gityak-msg-${msgIndex++}`;

		for (const step of steps.value) {
			if (step.action === 'drop') continue;

			// The first kept commit must create a commit — it cannot meld into a
			// predecessor, so coerce a leading fixup/squash into a pick.
			let action = step.action;

			if (!hasBase && (action === 'fixup' || action === 'squash')) {
				action = 'pick';
			}

			if (action === 'pick') {
				lines.push(`pick ${step.hash}`);
				groupMessage = [step.subject];
				hasBase = true;
			}
			else if (action === 'reword') {
				const path = messagePath();

				lines.push(`pick ${step.hash}`);
				lines.push(`exec git commit --amend -F '${path}'`);
				messages.push({path, content: step.message});
				groupMessage = [step.message];
				hasBase = true;
			}
			else if (action === 'fixup') {
				lines.push(`fixup ${step.hash}`);
			}
			else if (action === 'squash') {
				const path = messagePath();

				lines.push(`fixup ${step.hash}`);
				groupMessage.push(step.subject);
				lines.push(`exec git commit --amend -F '${path}'`);
				messages.push({path, content: groupMessage.join('\n\n')});
			}
		}

		return {todo: lines.join('\n') + '\n', messages};
	}

	async function execute(): Promise<void> {
		running.value = true;

		try {
			if (currentBranch.value?.name !== source.value) {
				await switchBranch(source.value);
			}

			const {todo, messages} = buildTodo();

			for (const message of messages) {
				await writeFile(message.path, message.content);
			}

			await writeFile(TODO_PATH, todo);

			show.value = false;

			try {
				await rebaseInteractive(target.value, TODO_PATH);
			}
			catch (err) {
				// A conflict pauses the rebase and exits non-zero — that's expected;
				// hand off to the staging panel. Re-throw anything that isn't a pause.
				await loadStatus();

				if (!conflictDetected.value) throw err;

				selectCommit('WORKING_TREE');
			}

			await Promise.all([loadCommits(), loadBranches(), loadStashes(), loadStatus()]);
		}
		finally {
			running.value = false;
		}
	}

	return {
		show: readonly(show),
		source: readonly(source),
		target: readonly(target),
		steps,
		running: readonly(running),
		open,
		close,
		move,
		reorder,
		execute,
	};
}
