import {describe, expect, it} from 'vitest';
import {ENetworkCommand} from '@git-yak/protocol';
import {TauriLocalClient} from './TauriLocalClient';

// TauriLocalClient is the third implementation of ITransportClient, alongside the Bun server
// and the Rust worker, and the only one the e2e suite (which runs in web mode) cannot reach.
// A command added to the protocol and to "both backends" but not here fails in the shipped
// desktop app only — so its coverage is pinned by a test instead.
const HANDLED = [
	ENetworkCommand.GitCall,
	ENetworkCommand.GitRebase,
	ENetworkCommand.ReadFile,
	ENetworkCommand.WriteFile,
	ENetworkCommand.BrowseFiles,
];

// Deliberately not handled: the agent socket and heartbeat are SSH-tunnel concerns, and
// watchRepo needs a Tauri event channel, which is a separate, deferred decision.
const UNHANDLED = [
	ENetworkCommand.SshAgentInit,
	ENetworkCommand.Heartbeat,
	ENetworkCommand.WatchRepo,
	ENetworkCommand.UnwatchRepo,
];

async function messageOf(command: ENetworkCommand, payload: Record<string, unknown> = {}): Promise<string> {
	try {
		await new TauriLocalClient().call(command, payload);
	}
	catch (e: unknown) {
		return e instanceof Error ? e.message : String(e);
	}

	return '';
}

describe('TauriLocalClient command coverage', () => {
	it.each(HANDLED)('handles %s', async command => {
		// Outside Tauri the underlying invoke/shell call fails — what matters is that the
		// switch recognised the command instead of falling through to its default arm.
		expect(await messageOf(command)).not.toMatch(/^Unknown command:/);
	});

	it.each(UNHANDLED)('reports %s as unhandled', async command => {
		expect(await messageOf(command)).toBe(`Unknown command: ${command}`);
	});
});

describe('TauriLocalClient gitRebase validation', () => {
	it('enumerates the action', async () => {
		expect(await messageOf(ENetworkCommand.GitRebase, {repo_path: '/repo', action: 'abort'}))
			.toBe('Unknown rebase action: abort');
	});

	it('refuses an upstream that starts with "-"', async () => {
		expect(await messageOf(ENetworkCommand.GitRebase, {
			repo_path: '/repo',
			action: 'start',
			upstream: '--exec=touch /tmp/pwned',
			todo_path: '.git/gityak-rebase-todo',
		})).toBe('upstream must not start with "-"');
	});

	it('refuses a todo path with a single quote or one that escapes the repository', async () => {
		expect(await messageOf(ENetworkCommand.GitRebase, {
			repo_path: '/repo',
			action: 'start',
			upstream: 'main',
			todo_path: '.git/x\';touch /tmp/pwned;\'',
		})).toBe('todo_path must not contain a single quote');

		expect(await messageOf(ENetworkCommand.GitRebase, {
			repo_path: '/repo',
			action: 'start',
			upstream: 'main',
			todo_path: '../../etc/passwd',
		})).toBe('Access denied: todo path outside repository: /etc/passwd');
	});
});
