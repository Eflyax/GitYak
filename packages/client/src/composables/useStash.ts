import {ref, readonly} from 'vue';
import type {IStash} from '@/domain';
import {useGit} from './useGit';

const stashes = ref<IStash[]>([]);

function parseStashes(output: string): IStash[] {
	return output
		.split('\n')
		.filter(Boolean)
		.map(line => {
			const [id, hash, parentHash, ...messageParts] = line.split('|');

			return {
				id: id ?? '',
				hash: hash ?? '',
				parentHash: parentHash ?? '',
				message: messageParts.join('|').trimEnd(),
				isStash: true as const,
			};
		});
}

export function useStash() {
	const {callGit, stashSave: gitStashSave, stashPop: gitStashPop, stashDrop: gitStashDrop} = useGit();

	// `%gs` is the reflog subject — what `git stash list` itself prints, and the only
	// part a rename can change. The stash commit's own subject (`%s`) is frozen at
	// creation time, so reading that would keep showing the pre-rename name.
	async function loadStashes(): Promise<void> {
		const output = await callGit(
			'stash', 'list',
			'--format=%gd|%H|%P|%gs',
		);

		stashes.value = parseStashes(output);
	}

	async function stashSave(message?: string): Promise<void> {
		await gitStashSave(message);
		await loadStashes();
	}

	async function stashPop(stashId: string): Promise<void> {
		await gitStashPop(stashId);
		await loadStashes();
	}

	async function stashDrop(stashId: string): Promise<void> {
		await gitStashDrop(stashId);
		await loadStashes();
	}

	// git has no `stash rename`, so the entry is dropped and the very same commit is
	// re-stored under a new reflog message. Dropping first keeps the reflog free of a
	// duplicate entry for `hash`. Note that `stash store` pushes to the top of the
	// reflog, so a renamed entry becomes stash@{0}.
	async function renameStash(stashId: string, hash: string, message: string): Promise<void> {
		await callGit('stash', 'drop', stashId);
		await callGit('stash', 'store', '-m', message, hash);
		await loadStashes();
	}

	return {
		stashes: readonly(stashes),
		loadStashes,
		stashSave,
		stashPop,
		stashDrop,
		renameStash,
	};
}
