import type {IWsRequest} from '@git-yak/protocol';

interface IAgentSession {
	authSock: string;
	agentPid: number;
}

const sessions = new WeakMap<object, IAgentSession>();

async function initAgent(ws: object, privateKey: string): Promise<void> {
	destroyAgent(ws);

	const agentProc = Bun.spawnSync(['ssh-agent', '-s']);
	const agentOutput = agentProc.stdout.toString();
	const authSock = agentOutput.match(/SSH_AUTH_SOCK=([^;]+)/)?.[1]?.trim();
	const agentPid = parseInt(agentOutput.match(/SSH_AGENT_PID=(\d+)/)?.[1] ?? '0');

	if (!authSock || !agentPid) {
		throw new Error('Failed to start ssh-agent');
	}

	const addProc = Bun.spawn(['ssh-add', '-'], {
		env: {...process.env, SSH_AUTH_SOCK: authSock},
		stdin: new Blob([privateKey.trimEnd() + '\n']),
	});

	const exitCode = await addProc.exited;

	if (exitCode !== 0) {
		const stderr = await new Response(addProc.stderr).text();

		Bun.spawnSync(['ssh-agent', '-k'], {
			env: {...process.env, SSH_AUTH_SOCK: authSock},
		});

		throw new Error(`ssh-add failed (exit ${exitCode}): ${stderr}`);
	}

	sessions.set(ws, {authSock, agentPid});
	console.log(`[ssh-agent] Session started, PID=${agentPid}`);
}

export function getAgentEnv(ws: object): NodeJS.ProcessEnv {
	const session = sessions.get(ws);

	if (!session) {
		return process.env as NodeJS.ProcessEnv;
	}

	return {
		...process.env,
		SSH_AUTH_SOCK: session.authSock,
	};
}

export function destroyAgent(ws: object): void {
	const session = sessions.get(ws);

	if (!session) {
		return;
	}

	try {
		Bun.spawnSync(['ssh-agent', '-k'], {
			env: {...process.env, SSH_AUTH_SOCK: session.authSock},
		});
		console.log(`[ssh-agent] Session destroyed, PID=${session.agentPid}`);
	}
	catch (e) {
		console.warn('[ssh-agent] Failed to kill agent:', e);
	}
	finally {
		sessions.delete(ws);
	}
}

export async function run(ws: object, data: IWsRequest): Promise<void> {
	const {requestId, privateKey} = data;

	if (typeof privateKey !== 'string' || !privateKey) {
		(ws as {send: (msg: string) => void}).send(JSON.stringify({
			requestId,
			status: 'error',
			message: 'privateKey must be a non-empty string',
		}));
		return;
	}

	try {
		await initAgent(ws, privateKey);
		(ws as {send: (msg: string) => void}).send(JSON.stringify({requestId, status: 'success'}));
	}
	catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Failed to init ssh-agent';
		console.error('[ssh-agent] initAgent error:', message);
		(ws as {send: (msg: string) => void}).send(JSON.stringify({requestId, status: 'error', message}));
	}
}
