import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';
import {useCommits} from './useCommits';
import {useBranches} from './useBranches';
import {useWorkingTree} from './useWorkingTree';
import {ENetworkCommand} from '@/domain';

const REFRESH_DEBOUNCE_MS = 250;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

export function useRepoWatch() {
	const
		{call, onEvent} = useWebSocket(),
		{currentProject} = useProject(),
		{loadCommits} = useCommits(),
		{loadBranches} = useBranches(),
		{loadStatus} = useWorkingTree();

	// The server already debounces filesystem noise; this second, shorter debounce keeps a
	// burst of events from queueing several full refreshes behind each other.
	function scheduleRefresh(): void {
		clearTimeout(refreshTimer);

		refreshTimer = setTimeout(() => {
			void Promise.all([loadCommits(), loadBranches(), loadStatus()]);
		}, REFRESH_DEBOUNCE_MS);
	}

	async function start(): Promise<void> {
		if (!currentProject.value) {
			return;
		}

		if (!started) {
			onEvent(scheduleRefresh);
			started = true;
		}

		try {
			await call(ENetworkCommand.WatchRepo, {repo_path: currentProject.value.path});
		}
		catch {
			// A backend without watch support (or a transport with no socket) simply does
			// not push events; the window-focus refresh remains the fallback.
		}
	}

	function stop(): void {
		clearTimeout(refreshTimer);
	}

	return {start, stop};
}
