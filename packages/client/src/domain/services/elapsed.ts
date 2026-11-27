/** A running duration as m:ss, or h:mm:ss from an hour on (negative counts as zero). */
export function formatElapsed(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor(total / 60) % 60;
	const seconds = String(total % 60).padStart(2, '0');

	return hours > 0
		? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
		: `${minutes}:${seconds}`;
}
