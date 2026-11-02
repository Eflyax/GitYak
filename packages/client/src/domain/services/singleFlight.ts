/**
 * Wraps a loader so its runs never overlap. A call that arrives while one is running does not
 * start a second, concurrent run; it queues a single follow-up run that starts once the current
 * one finishes, so the caller still gets data fetched after its call. Any number of calls during
 * one run share that same follow-up.
 */
export function singleFlight(fn: () => Promise<void>): () => Promise<void> {
	let
		running: Promise<void> | null = null,
		queued: Promise<void> | null = null;

	function run(): Promise<void> {
		running = fn().finally(() => {
			running = null;
		});

		return running;
	}

	return () => {
		if (!running) {
			return run();
		}

		queued ??= running
			.catch(() => {
				// The failure belongs to the caller of the current run; the follow-up runs anyway.
			})
			.then(() => {
				queued = null;

				return run();
			});

		return queued;
	};
}
