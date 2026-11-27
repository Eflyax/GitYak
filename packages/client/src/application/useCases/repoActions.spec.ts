import {describe, expect, it} from 'vitest';
import {ENetworkCommand} from '@/domain';
import type {IGitProcess, ITransportClient} from '@/infrastructure/ITransportClient';
import {checkBranchNameArgs, cloneArgs, initArgs, setInitialBranchArgs, UNSET_CLONE_SSH_ARGS} from '@/domain/services/repoArgs';
import {
	assertEmptyTarget,
	assertValidBranchName,
	canCancelClone,
	cloneRepository,
	createRepository,
	resolveRepositoryRoot,
} from './repoActions';

type Handler = (payload: Record<string, unknown>) => unknown;

interface IFake {
	transport: ITransportClient
	calls: Array<string>
	spawns: Array<{repoPath: string; args: Array<string>}>
	cancels: {count: number}
}

function makeFake(
	handlers: Partial<Record<ENetworkCommand, Handler>>,
	spawn?: (onOutput: (line: string) => void) => {done: Promise<void>},
): IFake {
	const calls: Array<string> = [];
	const spawns: Array<{repoPath: string; args: Array<string>}> = [];
	const cancels = {count: 0};
	const transport: ITransportClient = {
		async call(command, payload) {
			calls.push(`${command}:${JSON.stringify(payload)}`);
			const handler = handlers[command];
			if (!handler) {
				throw new Error(`unexpected ${command}`);
			}

			return handler(payload);
		},
		close() {},
	};
	if (spawn) {
		transport.spawnGit = (repoPath, args, onOutput): IGitProcess => {
			calls.push(`spawn:${repoPath}`);
			spawns.push({repoPath, args});
			const p = spawn(onOutput);

			return {done: p.done, cancel: () => { cancels.count++; }};
		};
	}

	return {transport, calls, spawns, cancels};
}

const emptyDir: Handler = () => ({path: '/p/name', entries: []});
const missingDir: Handler = () => { throw new Error('ENOENT'); };

describe('resolveRepositoryRoot', () => {
	it('returns the trimmed toplevel', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: () => '/repo\n'});
		expect(await resolveRepositoryRoot(f.transport, '/repo/src')).toBe('/repo');
		expect(f.calls[0]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/repo/src', args: ['rev-parse', '--show-toplevel']})}`);
	});

	it('maps git errors', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: () => { throw new Error('fatal'); }});
		await expect(resolveRepositoryRoot(f.transport, '/x')).rejects.toThrow('/x is not a git repository');
	});
});

describe('assertEmptyTarget', () => {
	it('accepts a missing directory', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: missingDir});
		await expect(assertEmptyTarget(f.transport, '/p/name')).resolves.toBeUndefined();
	});

	it('accepts an empty directory', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: emptyDir});
		await expect(assertEmptyTarget(f.transport, '/p/name')).resolves.toBeUndefined();
	});

	it('rejects a non-empty directory', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: () => ({path: '/p/name', entries: [{name: 'a', isDirectory: false}]})});
		await expect(assertEmptyTarget(f.transport, '/p/name')).rejects.toThrow('/p/name already exists and is not empty');
	});
});

describe('cloneRepository', () => {
	const opts = {parent: '/p', name: 'name', url: 'git@host:a/name.git'};

	it('rejects a non-empty target without spawning git', async () => {
		const f = makeFake(
			{[ENetworkCommand.BrowseFiles]: () => ({path: '/p/name', entries: [{name: 'a', isDirectory: false}]})},
			() => ({done: Promise.resolve()}),
		);
		await expect(cloneRepository(f.transport, opts, () => {}).done).rejects.toThrow('already exists and is not empty');
		expect(f.spawns).toHaveLength(0);
	});

	it('spawns the clone, then unsets the ssh command', async () => {
		const f = makeFake(
			{[ENetworkCommand.BrowseFiles]: emptyDir, [ENetworkCommand.GitCall]: () => ''},
			() => ({done: Promise.resolve()}),
		);
		await cloneRepository(f.transport, opts, () => {}).done;
		expect(f.calls.map(c => c.split(':')[0])).toEqual([ENetworkCommand.BrowseFiles, 'spawn', ENetworkCommand.GitCall]);
		expect(f.spawns[0]).toEqual({repoPath: '/p', args: cloneArgs(opts.url, opts.name)});
		expect(f.calls[2]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p/name', args: UNSET_CLONE_SSH_ARGS})}`);
	});

	it('does not fail the clone when unsetting fails, but reports it', async () => {
		const f = makeFake(
			{[ENetworkCommand.BrowseFiles]: emptyDir, [ENetworkCommand.GitCall]: () => { throw new Error('locked'); }},
			() => ({done: Promise.resolve()}),
		);
		const warnings: Array<string> = [];
		await expect(cloneRepository(f.transport, opts, () => {}, w => warnings.push(w)).done).resolves.toBeUndefined();
		expect(warnings).toEqual(['Could not remove the clone\'s core.sshCommand from /p/name/.git/config: locked']);
	});

	it('reports no warning when unsetting succeeds', async () => {
		const f = makeFake(
			{[ENetworkCommand.BrowseFiles]: emptyDir, [ENetworkCommand.GitCall]: () => ''},
			() => ({done: Promise.resolve()}),
		);
		const warnings: Array<string> = [];
		await cloneRepository(f.transport, opts, () => {}, w => warnings.push(w)).done;
		expect(warnings).toEqual([]);
	});

	it('falls back to GitCall without spawnGit', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: emptyDir, [ENetworkCommand.GitCall]: () => ''});
		await cloneRepository(f.transport, opts, () => {}).done;
		expect(f.calls[1]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p', args: cloneArgs(opts.url, opts.name)})}`);
		expect(f.calls).toHaveLength(3);
	});

	it('adds the ssh-add hint on auth failures', async () => {
		for (const msg of ['Permission denied (publickey).', 'Host key verification failed.']) {
			const f = makeFake(
				{[ENetworkCommand.BrowseFiles]: emptyDir},
				() => ({done: Promise.reject(new Error(msg))}),
			);
			await expect(cloneRepository(f.transport, opts, () => {}).done).rejects.toThrow(`${msg}\nLoad the key into your ssh-agent: ssh-add <key>`);
		}
	});

	it('leaves other errors untouched', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: emptyDir}, () => ({done: Promise.reject(new Error('boom'))}));
		await expect(cloneRepository(f.transport, opts, () => {}).done).rejects.toThrow(/^boom$/);
	});

	it('cancel before the emptiness check finishes starts no git', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: emptyDir}, () => ({done: Promise.resolve()}));
		const proc = cloneRepository(f.transport, opts, () => {});
		proc.cancel();
		await expect(proc.done).rejects.toThrow('Cancelled');
		expect(f.spawns).toHaveLength(0);
	});

	it('cancel while git runs delegates to the spawned process', async () => {
		let release!: () => void;
		const f = makeFake(
			{[ENetworkCommand.BrowseFiles]: emptyDir, [ENetworkCommand.GitCall]: () => ''},
			() => ({done: new Promise<void>(r => { release = r; })}),
		);
		const proc = cloneRepository(f.transport, opts, () => {});
		await vi_waitFor(() => f.spawns.length === 1);
		proc.cancel();
		expect(f.cancels.count).toBe(1);
		release();
		await proc.done;
		proc.cancel();
		expect(f.cancels.count).toBe(1);
	});
});

async function vi_waitFor(cond: () => boolean): Promise<void> {
	for (let i = 0; i < 50 && !cond(); i++) {
		await new Promise(r => setTimeout(r, 0));
	}
	expect(cond()).toBe(true);
}

// git check-ref-format --branch prints a valid name back and dies on an invalid one.
const checkRefFormat = (valid: boolean): Handler => payload => {
	const args = payload['args'] as Array<string>;
	if (args[0] !== 'check-ref-format') return '';
	if (!valid) throw new Error(`fatal: '${args[2]}' is not a valid branch name`);

	return `${args[2]}\n`;
};

describe('assertValidBranchName', () => {
	it('accepts what git prints back', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: checkRefFormat(true)});
		await expect(assertValidBranchName(f.transport, '/p', 'main')).resolves.toBeUndefined();
		expect(f.calls[0]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p', args: checkBranchNameArgs('main')})}`);
	});

	it('rejects a name git refuses', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: checkRefFormat(false)});
		await expect(assertValidBranchName(f.transport, '/p', 'a.lock')).rejects.toThrow("'a.lock' is not a valid branch name");
	});

	it('rejects a name git expands to something else', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: () => 'previous-branch\n'});
		await expect(assertValidBranchName(f.transport, '/p', '@{-1}')).rejects.toThrow("'@{-1}' is not a valid branch name");
	});

	it('passes other errors on', async () => {
		const f = makeFake({[ENetworkCommand.GitCall]: () => { throw new Error('Repository path does not exist: /p'); }});
		await expect(assertValidBranchName(f.transport, '/p', 'main')).rejects.toThrow('Repository path does not exist: /p');
	});
});

describe('createRepository', () => {
	it('checks the branch, inits, sets the branch and returns the path', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: missingDir, [ENetworkCommand.GitCall]: checkRefFormat(true)});
		expect(await createRepository(f.transport, {parent: '/p', name: 'name', branch: 'main'})).toBe('/p/name');
		expect(f.calls[1]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p', args: checkBranchNameArgs('main')})}`);
		expect(f.calls[2]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p', args: initArgs('name')})}`);
		expect(f.calls[3]).toBe(`${ENetworkCommand.GitCall}:${JSON.stringify({repo_path: '/p/name', args: setInitialBranchArgs('main')})}`);
	});

	it('creates nothing when git refuses the branch name', async () => {
		const f = makeFake({[ENetworkCommand.BrowseFiles]: missingDir, [ENetworkCommand.GitCall]: checkRefFormat(false)});
		await expect(createRepository(f.transport, {parent: '/p', name: 'name', branch: 'bad.lock'})).rejects.toThrow('not a valid branch name');
		expect(f.calls.some(c => c.includes('"init"'))).toBe(false);
	});
});

describe('canCancelClone', () => {
	it('reflects spawnGit presence', () => {
		expect(canCancelClone(makeFake({}, () => ({done: Promise.resolve()})).transport)).toBe(true);
		expect(canCancelClone(makeFake({}).transport)).toBe(false);
	});
});
