import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';
import {useCommits} from './useCommits';
import {useBranches} from './useBranches';
import {useWorkingTree} from './useWorkingTree';
import {ENetworkCommand} from '@/domain';

const REFRESH_DEBOUNCE_MS = 250;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

export function useRepoWatch() {
	const
		{call, onEvent, onReconnect} = useWebSocket(),
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

		// Registered on every start, not once per session: connect() installs a NEW transport
		// client for each project, and a callback registered on the previous one would never
		// fire again. The slot is a single idempotent overwrite, so re-registering is free.
		onEvent(scheduleRefresh);

		// Re-issue the watch once the transport reconnects — the server-side watcher
		// state is gone with the old socket, so a fresh watchRepo call is needed or
		// live refresh silently stops working after a drop.
		onReconnect(() => {
			void start();
		});

		try {
			await call(ENetworkCommand.WatchRepo, {repo_path: currentProject.value.path});
		}
		catch {
			// A backend or transport without watch support simply pushes no events; the
			// window-focus refresh remains the fallback.
		}
	}

	function stop(): void {
		clearTimeout(refreshTimer);
	}

	return {start, stop};
}
