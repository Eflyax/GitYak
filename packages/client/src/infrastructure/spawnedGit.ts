import type {Child, Command, IOPayload} from '@tauri-apps/plugin-shell';
import type {IGitProcess} from './ITransportClient';

/** Git reports progress as `\r`-separated updates on one line, so both separators end a line. */
export function splitOutputLines(chunk: string): Array<string> {
	return chunk.split(/[\r\n]+/).filter(piece => piece.length > 0);
}

export interface ILineSplitter {
	/** The lines `text` completes; an unterminated tail waits for the next chunk. */
	push(text: string): Array<string>;
	/** Whatever tail is left when the stream ends. */
	flush(): Array<string>;
}

/**
 * Splits a stream of output chunks on `\r` and `\n`. Raw chunks are cut wherever the pipe
 * happened to be read, so a line (or a progress update) can arrive in two pieces.
 */
export function createLineSplitter(): ILineSplitter {
	let tail = '';

	return {
		push(text: string): Array<string> {
			const pieces = (tail + text).split(/[\r\n]/);

			tail = pieces.pop() ?? '';

			return pieces.filter(piece => piece.length > 0);
		},
		flush(): Array<string> {
			const rest = tail;

			tail = '';

			return rest ? [rest] : [];
		},
	};
}

/** What a chunk of process output arrives as: text, or bytes (a number array over Tauri 2 IPC). */
export type TOutputChunk = IOPayload | Array<number>;

/**
 * Decodes one stream's raw chunks as UTF-8, carrying a character split across two chunks over
 * to the next; text chunks pass through.
 */
export function createChunkDecoder(): (chunk: TOutputChunk) => string {
	const decoder = new TextDecoder();

	return chunk => {
		if (typeof chunk === 'string') return chunk;

		return decoder.decode(chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk), {stream: true});
	};
}

/**
 * The encoding to spawn a streaming git with. Tauri 2 hands back raw chunks as the pipe is read,
 * so every `\r` progress update arrives on its own; text mode reads line by line, preferring
 * `\n`, which can hold a whole phase of updates back. The Tauri 1 shim cannot spawn raw, so it
 * stays line-based there.
 */
export function streamEncoding(): 'raw' | undefined {
	return __APP_FLAVOR__ === 'tauri-v1' ? undefined : 'raw';
}

/** A failing kill (already exited, permission) must neither mask `Cancelled` nor go unhandled. */
async function killQuietly(child: Child): Promise<void> {
	try {
		await child.kill();
	}
	catch {
		// Nothing more to do: the cancel outcome is reported through the close event.
	}
}

/**
 * Runs a streaming git child process: every stdout/stderr line goes to `onOutput`, `done` settles
 * on exit. `createCommand` may be async; `cancel()` works even before the child exists (it is
 * stopped as soon as it spawns). `terminate` stops the child more gently than `Child.kill()`
 * (SIGKILL) - so git can clean up after itself; if it fails, the child is killed.
 */
export function runSpawnedGit(
	createCommand: () => Promise<Command<string> | Command<Uint8Array>>,
	onOutput: (line: string) => void,
	terminate?: (child: Child) => Promise<void>,
): IGitProcess {
	let child: Child | undefined;
	let cancelled = false;
	const stderrLines: Array<string> = [];

	async function stop(target: Child): Promise<void> {
		if (terminate) {
			try {
				await terminate(target);

				return;
			}
			catch {
				// Fall back to the kill below.
			}
		}

		await killQuietly(target);
	}

	const done = new Promise<void>((resolve, reject) => {
		createCommand()
			.then(async created => {
				// Both Command variants share one runtime shape; only the chunk type differs.
				const command = created as unknown as Command<IOPayload>;
				const stdout = {decode: createChunkDecoder(), lines: createLineSplitter()};
				const stderr = {decode: createChunkDecoder(), lines: createLineSplitter()};
				const onStderrLine = (line: string): void => {
					stderrLines.push(line);
					onOutput(line);
				};

				command.stdout.on('data', (chunk: TOutputChunk) => {
					stdout.lines.push(stdout.decode(chunk)).forEach(onOutput);
				});
				command.stderr.on('data', (chunk: TOutputChunk) => {
					stderr.lines.push(stderr.decode(chunk)).forEach(onStderrLine);
				});
				command.on('error', (message: string) => reject(new Error(message)));
				command.on('close', ({code}: {code: number | null}) => {
					stdout.lines.flush().forEach(onOutput);
					stderr.lines.flush().forEach(onStderrLine);

					if (cancelled) {
						reject(new Error('Cancelled'));
					}
					else if (code === 0) {
						resolve();
					}
					else {
						reject(new Error(stderrLines.join('\n').trim() || `git exited with code ${code}`));
					}
				});

				child = await command.spawn();

				if (cancelled) {
					await stop(child);
				}
			})
			.catch(reject);
	});

	return {
		done,
		cancel(): void {
			cancelled = true;
			if (child) {
				void stop(child);
			}
		},
	};
}
