import {ref, readonly} from 'vue';
import type {ITag} from '@/domain';
import {useGit} from './useGit';

const tags = ref<ITag[]>([]);
const remoteTags = ref<string[]>([]);

export function useTags() {
	const {
		callGit,
		createTag: gitCreateTag,
		deleteTag: gitDeleteTag,
		pushTag: gitPushTag,
	} = useGit();

	async function loadTags(): Promise<void> {
		const output = await callGit('tag', '--sort=-creatordate');

		tags.value = output
			.trim()
			.split('\n')
			.filter(Boolean)
			.map(name => ({name, hash: ''}));
	}

	async function loadRemoteTags(remote = 'origin'): Promise<void> {
		try {
			const output = await callGit('ls-remote', '--tags', remote);

			remoteTags.value = output
				.trim()
				.split('\n')
				.filter(Boolean)
				.map(line => {
					// format: "<hash>\trefs/tags/<name>"
					const ref = line.split('\t')[1] ?? '';

					return ref.replace('refs/tags/', '');
				})
				// skip dereferenced tag objects (^{})
				.filter(name => !name.endsWith('^{}'));
		}
		catch {
			remoteTags.value = [];
		}
	}

	// Tag mutations reload the tag list themselves, the way the branch ones do: the sidebar
	// is the only place a tag can be pushed from, and it renders `tags` — a tag missing there
	// cannot be acted on at all.
	async function createTag(name: string, ref?: string, message?: string): Promise<void> {
		await gitCreateTag(name, ref, message);
		await loadTags();
	}

	async function deleteTag(name: string): Promise<void> {
		await gitDeleteTag(name);
		await loadTags();
	}

	async function pushTag(name: string, remote?: string): Promise<void> {
		await gitPushTag(name, remote);
		await loadRemoteTags(remote);
	}

	return {
		tags: readonly(tags),
		remoteTags: readonly(remoteTags),
		loadTags,
		loadRemoteTags,
		createTag,
		deleteTag,
		pushTag,
	};
}
