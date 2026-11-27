/** Where an in-app update stands, from the Update click to the restart. */
export type TUpdatePhase =
	| {phase: 'idle'}
	| {phase: 'downloading'; downloaded: number; total: number | null}
	| {phase: 'ready'}
	| {phase: 'installing'}
	| {phase: 'failed'; message: string};

const MB = 1024 * 1024;

function megabytes(bytes: number): string {
	return (bytes / MB).toFixed(1);
}

/** "12.4 / 40.1 MB", or "12.4 MB" when the server did not say how large the download is. */
export function formatProgress(downloaded: number, total: number | null): string {
	return total === null
		? `${megabytes(downloaded)} MB`
		: `${megabytes(downloaded)} / ${megabytes(total)} MB`;
}
