// Stands in for `@tauri-apps/plugin-shell` in the Tauri 1 build. Tauri 1's Command has the same
// methods and events, but is built with `new` rather than `Command.create`, and cannot hand
// back raw bytes; a raw git call goes through the `run_git_raw` command of src-tauri-v1.
import {Command as V1Command} from '@tauri-apps/api-v1/shell';
import {invoke} from '@tauri-apps/api-v1/tauri';

export type {Child} from '@tauri-apps/api-v1/shell';

interface ISpawnOptions {
	cwd?: string;
	env?: Record<string, string>;
	encoding?: string;
}

interface IRawOutput {
	code: number | null;
	stdout: Array<number>;
	stderr: Array<number>;
}

interface IRawChildProcess {
	code: number | null;
	signal: number | null;
	stdout: Uint8Array;
	stderr: Uint8Array;
}

class RawGitCommand {
	constructor(private readonly args: Array<string>, private readonly env: Record<string, string>) {}

	async execute(): Promise<IRawChildProcess> {
		const output = await invoke<IRawOutput>('run_git_raw', {args: this.args, env: this.env});

		return {
			code: output.code,
			signal: null,
			stdout: new Uint8Array(output.stdout),
			stderr: new Uint8Array(output.stderr),
		};
	}
}

function create(program: string, args: string | Array<string> = [], options: ISpawnOptions = {}): V1Command | RawGitCommand {
	if (options.encoding !== 'raw') {
		return new V1Command(program, args, options);
	}

	if (program !== 'git') {
		throw new Error(`Raw output is only available for git, not ${program}`);
	}

	return new RawGitCommand(typeof args === 'string' ? [args] : args, options.env ?? {});
}

export const Command = {create};
