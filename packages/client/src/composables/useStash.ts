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

	async function loadStashes(): Promise<void> {
		const output = await callGit(
			'stash', 'list',
			'--format=%gd|%H|%P|%s',
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

	return {
		stashes: readonly(stashes),
		loadStashes,
		stashSave,
		stashPop,
		stashDrop,
	};
}
