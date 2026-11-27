import {computed, ref, shallowRef} from 'vue';
import type {ComputedRef} from 'vue';
import type {IProject} from '@/domain';
import {isManagerVisible} from '@/domain/services/managerVisibility';
import {useConnectionStatus} from '@/composables/useConnectionStatus';
import {useLayout} from '@/composables/useLayout';
import {useProject} from '@/composables/useProject';

// Opens started from the manager or the project rail that are still connecting.
const pendingOpens = ref(0);

/** Asks whether the manager's current work may be dropped; resolves true to go ahead. */
export type TLeaveGuard = () => Promise<boolean>;

// Set by the form whose work would be lost if the manager (or its panel) were left - a clone
// in progress. One confirmation at a time: a second leave while it is asked waits for it.
const leaveGuard = shallowRef<TLeaveGuard | null>(null);
let pendingConfirm: Promise<boolean> | null = null;

/** Whether leaving the manager's current panel may go ahead (asks the guard, if one is set). */
export function confirmLeave(): Promise<boolean> {
	const guard = leaveGuard.value;

	if (!guard) return Promise.resolve(true);

	pendingConfirm ??= guard().finally(() => {
		pendingConfirm = null;
	});

	return pendingConfirm;
}

export interface IUseProjectManager {
	/** Whether the manager takes the repository area (see `isManagerVisible`). */
	managerVisible: ComputedRef<boolean>;
	/** A project opened from the manager or the rail is still connecting. */
	opening: ComputedRef<boolean>;
	/** Opens a project from the manager; ignored while another open is in flight. */
	openFromManager: (project: IProject) => Promise<void>;
	/** Opens a project from the rail, which may always switch, even mid-connect. */
	openFromRail: (project: IProject) => Promise<void>;
	/**
	 * Leaves the manager for the open project (Esc, Back, the rail button). A connection error
	 * still showing is cleared on the way: the project behind it is the one still connected.
	 */
	leaveManager: () => Promise<void>;
	/** Whether the manager's current panel may be left (see `setLeaveGuard`). */
	confirmLeave: () => Promise<boolean>;
	/** Installs (or with null removes) the check that runs before the manager's panel is left. */
	setLeaveGuard: (guard: TLeaveGuard | null) => void;
}

export function useProjectManager(): IUseProjectManager {
	const {showProjectManager} = useLayout();
	const {currentProject, openProject} = useProject();
	const connectionStatus = useConnectionStatus();

	const opening = computed(() => pendingOpens.value > 0);

	const managerVisible = computed(() => isManagerVisible({
		statusVisible: connectionStatus.isVisible.value,
		requested: showProjectManager.value,
		opening: opening.value,
		hasOpenProject: !!currentProject.value,
	}));

	// The manager steps aside at once, so an SSH connect shows its progress; without such a
	// status it stays up (as `opening`) until the connection is in place. Either way it is
	// left once the open settles - on a failure, for the error the connection status shows.
	async function startOpen(project: IProject): Promise<void> {
		pendingOpens.value++;
		showProjectManager.value = false;

		try {
			await openProject(project);
		}
		catch (err: unknown) {
			if (connectionStatus.phase.value !== 'error') {
				connectionStatus.setError(err instanceof Error ? err.message : String(err));
			}
		}
		finally {
			pendingOpens.value--;
			showProjectManager.value = false;
		}
	}

	// Only a guard is waited for: unguarded, an open has to count as pending at once, or a
	// second double-click in the same task would start a second connect.
	async function openFromManager(project: IProject): Promise<void> {
		if (opening.value) return;
		if (leaveGuard.value && !await confirmLeave()) return;
		// Another open may have begun while the guard was asking.
		if (opening.value) return;

		await startOpen(project);
	}

	async function openFromRail(project: IProject): Promise<void> {
		if (leaveGuard.value && !await confirmLeave()) return;

		await startOpen(project);
	}

	async function leaveManager(): Promise<void> {
		if (!await confirmLeave()) return;

		if (connectionStatus.phase.value === 'error') {
			connectionStatus.reset();
		}

		showProjectManager.value = false;
	}

	function setLeaveGuard(guard: TLeaveGuard | null): void {
		leaveGuard.value = guard;
	}

	return {managerVisible, opening, openFromManager, openFromRail, leaveManager, confirmLeave, setLeaveGuard};
}
