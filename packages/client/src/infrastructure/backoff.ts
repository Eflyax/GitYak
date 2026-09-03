const BASE_MS = 500;
const CAP_MS = 8_000;
const JITTER = 0.25;

// Exponential backoff with +/-25% jitter, so a fleet of reconnecting clients does not
// retry in lockstep. `random` is injectable to keep the schedule testable.
export function nextBackoffDelay(attempt: number, random: () => number = Math.random): number {
	const base = Math.min(BASE_MS * 2 ** attempt, CAP_MS);
	const offset = (random() * 2 - 1) * JITTER * base;

	return Math.round(base + offset);
}
