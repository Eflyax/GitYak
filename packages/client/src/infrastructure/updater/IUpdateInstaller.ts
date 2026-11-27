/** Downloads one update and installs it; one installer per update the user started. */
export interface IUpdateInstaller {
	/** Downloads (and verifies) the update; `total` is null when the size is not known. */
	download(onProgress: (downloaded: number, total: number | null) => void): Promise<void>;
	/**
	 * Installs what `download` fetched and restarts the app. 'cancelled' when the user declined
	 * (e.g. the password prompt); the download stays and may be installed later.
	 */
	install(): Promise<'restarting' | 'cancelled'>;
}
