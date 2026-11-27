export interface IManagerVisibilityState {
	/** The connection status (SSH provisioning steps or a connection error) wants the screen. */
	statusVisible: boolean;
	/** The user asked for the manager - its rail button, after an open began. */
	requested: boolean;
	/** A project opened from the manager or the rail is still connecting. */
	opening: boolean;
	hasOpenProject: boolean;
}

/**
 * Whether the project manager takes the repository area. The connection status wins while it
 * has something to show - progress of a connect in flight, or why it failed - unless the user
 * asks for the manager again. Without a status, the manager stays up through an open (the views
 * behind it would load against a connection still being replaced) and whenever no project is
 * open.
 */
export function isManagerVisible(s: IManagerVisibilityState): boolean {
	if (s.statusVisible) {
		return s.requested;
	}

	return s.requested || s.opening || !s.hasOpenProject;
}
