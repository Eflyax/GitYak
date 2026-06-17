import {execSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export interface ITempRepo {
	path: string;
	cleanup: () => void;
	run: (cmd: string) => string;
	writeFile: (relPath: string, content: string) => void;
	commit: (message: string, files?: Record<string, string>) => void;
	branch: (name: string, from?: string) => void;
	checkout: (ref: string) => void;
}

function git(cwd: string, cmd: string): string {
	return execSync(`git ${cmd}`, {
		cwd,
		env: {
			...process.env,
			GIT_AUTHOR_NAME: 'Test Author',
			GIT_AUTHOR_EMAIL: 'test@example.com',
			GIT_COMMITTER_NAME: 'Test Author',
			GIT_COMMITTER_EMAIL: 'test@example.com',
		},
		stdio: ['pipe', 'pipe', 'pipe'],
	}).toString();
}

export function createTempRepo(opts: {init?: boolean} = {init: true}): ITempRepo {
	const path = mkdtempSync(join(tmpdir(), 'gityak-e2e-'));

	const run = (cmd: string) => git(path, cmd);

	const writeFile = (relPath: string, content: string) => {
		const full = join(path, relPath);
		const dir = full.substring(0, full.lastIndexOf('/'));

		mkdirSync(dir, {recursive: true});
		writeFileSync(full, content);
	};

	const commit = (message: string, files?: Record<string, string>) => {
		if (files) {
			for (const [k, v] of Object.entries(files)) writeFile(k, v);
		}

		run('add -A');
		run(`commit -m "${message}"`);
	};

	const branch = (name: string, from?: string) => {
		run(`branch ${name}${from ? ` ${from}` : ''}`);
	};

	const checkout = (ref: string) => run(`checkout ${ref}`);

	if (opts.init) {
		run('init -b master');
	}

	return {
		path,
		run,
		writeFile,
		commit,
		branch,
		checkout,
		cleanup: () => {
			try {
				rmSync(path, {recursive: true, force: true});
			}
			catch {}
		},
	};
}

export function createBareRemote(): {path: string; cleanup: () => void} {
	const path = mkdtempSync(join(tmpdir(), 'gityak-e2e-remote-'));

	git(path, 'init --bare -b master');

	return {
		path,
		cleanup: () => {
			try {
				rmSync(path, {recursive: true, force: true});
			}
			catch {}
		},
	};
}
