import {ref, readonly} from 'vue';

// Shared state: the refusal can come from any git command in the app, and there must only
// ever be one prompt for it.
const
	show = ref(false),
	path = ref<string | null>(null);

/**
 * Holds the prompt asking whether to trust a repository git refused to open — see
 * `SafeDirectoryDialog`. Only the state lives here; adding the exception needs a git call and
 * belongs to the component that can make one.
 */
export function useSafeDirectory() {
	/**
	 * Asks about `directory`, unless a prompt is already up: a single refresh runs several
	 * git commands at once and every one of them fails the same way.
	 */
	function request(directory: string): void {
		if (show.value) {
			return;
		}

		path.value = directory;
		show.value = true;
	}

	function dismiss(): void {
		show.value = false;
		path.value = null;
	}

	return {
		show: readonly(show),
		path: readonly(path),
		request,
		dismiss,
	};
}
