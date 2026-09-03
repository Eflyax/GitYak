# Phase 2 — Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remote-code-execution hole in the web-mode server, make an open repository refresh itself instead of waiting for a window focus, and survive a dropped socket.

**Architecture:** Two new frame types (`auth`, `event`) join the request/response envelopes in `@git-yak/protocol`. The Bun server gains a token gate, a loopback bind and an Origin check. Interactive rebase moves behind a dedicated command so the generic `gitCall` can refuse git's global options outright. Both backends gain a debounced filesystem watcher that pushes a `repoChanged` event, which requires splitting the Rust worker's axum socket into a sink and a stream. `WebSocketClient` gains an auth handshake and a reconnect loop.

**Tech Stack:** TypeScript 5.7, Bun, Vue 3, Vite 7, Vitest 3, Rust (axum 0.7, tokio, `notify`), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-01-hardening-and-liveness-design.md` — read its **Phase 2** section. Phases 1 and 3 are out of scope.

## Global Constraints

- Indentation is **tabs**, not spaces. Single quotes. Semicolons. No inner spaces in `{foo}`. `catch` on its own line (Stroustrup brace style).
- Interfaces are prefixed `I`, enums are prefixed `E`.
- `yarn verify` must exit 0 at the end of **every** task. It chains three typechecks, `yarn lint`, `yarn test`, `yarn check:protocol` and `yarn workspace @git-yak/client check:themes`.
- **`yarn check:protocol` now constrains BOTH backends.** Adding a member to `ENetworkCommand` without a dispatch arm in *both* `packages/server/src/index.ts` and `packages/remote-worker-rs/src/commands/mod.rs` turns `yarn verify` red. Therefore **every new enum member lands in the same task as both of its dispatch arms** — never earlier.
- The e2e suite must stay at **10 passed / 3 failed** plus whatever this phase adds. The three failures (`01-amend-push`, `02-stash-conflict`, `04-multi-select-squash`) are stale specs owned by phase 3. Do not fix them here.
- `packages/e2e/test-results/` is gitignored generated output. Never commit from it. Prefer `git add` with explicit paths over `git add -A`.
- `bun` resolves only in a workspace that declares it (root and `packages/client` do). `yarn add -D -W` is invalid on Yarn 4.
- **The Rust worker gets no auth token.** Per the spec it keeps its current posture: it binds
  `127.0.0.1` and is reachable only through the SSH tunnel, so a token there would protect against
  nothing the tunnel does not already protect against. Do not add one.
- `CLAUDE.md` is gitignored. Edit it when this phase falsifies something it says, but never `git add -f` it.

---

## Three findings from the code that change this phase's shape

The spec was written before phase 1 landed and before these were checked against the source. The plan resolves each; they are not open questions.

### F1 — There are two `-c` call sites, not one

The spec names `rebaseInteractive` as the only client code passing `-c`. There is a second: `rebaseContinue` (`packages/client/src/composables/useGit.ts:313`) sends `-c core.editor=true`. Both must move server-side before `gitCall` can refuse `-c`.

**Resolution:** one new command, `gitRebase`, carrying `action: 'start' | 'continue'` — not two commands. Two would double the dispatch surface in both backends for one feature.

### F2 — A naive flag blocklist breaks `isGitRepo()`

`useGit.ts:338` calls `callGit('rev-parse', '--git-dir')`. Here `--git-dir` is an argument **to the `rev-parse` subcommand**, not a git global option. A filter that scans the whole `args` array would reject it and break repository detection on every project open.

Git's global options may appear only **before** the subcommand. **Resolution:** the filter inspects only the leading run of arguments up to the first token that does not start with `-` (the subcommand), and ignores everything after it.

### F3 — The transports' own `-C` is not client input

`TauriLocalClient.ts:21` and `SshClient.ts:67` build `git -C <repoPath> ...args` themselves; the Bun server and Rust worker instead set the process working directory. The filter therefore applies to the client-supplied `args` array **inside the two backends**, where untrusted input arrives over the socket — not to the transports' own prefix.

**Resolution:** filtering lands in the Bun server and the Rust worker only. `TauriLocalClient` and `SshClient` carry app-generated arguments inside the trusted process and are deliberately left alone; adding a filter there would reject their own `-C`.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/protocol/src/index.ts` | `auth` + `event` frames, their guards, new enum members, `command` narrowed to the enum |
| Create | `packages/protocol/src/gitArgs.ts` | Position-aware git global-option filter (pure, shared) |
| Create | `packages/protocol/src/gitArgs.spec.ts` | Its tests, including the `rev-parse --git-dir` regression |
| Create | `packages/server/src/commands/GitRebase.ts` | Builds the `-c` flags server-side from a validated todo path |
| Create | `packages/server/src/commands/WatchRepo.ts` | `watchRepo` / `unwatchRepo`, debounced `repoChanged` emission |
| Create | `packages/server/src/auth.ts` | Token resolution, Origin allowlist, per-socket auth state |
| Create | `packages/server/src/auth.spec.ts` | Token and Origin unit tests |
| Modify | `packages/server/src/index.ts` | Bind host, upgrade-time Origin check, auth gate, two new dispatch arms |
| Modify | `packages/server/src/commands/GitCall.ts` | Apply the argument filter |
| Create | `packages/remote-worker-rs/src/commands/git_rebase.rs` | Rust counterpart of `gitRebase` |
| Create | `packages/remote-worker-rs/src/commands/watch_repo.rs` | Rust watcher over the `notify` crate |
| Create | `packages/remote-worker-rs/src/git_args.rs` | Rust counterpart of the filter |
| Modify | `packages/remote-worker-rs/src/server.rs` | Split the socket into sink + stream so events can be pushed |
| Modify | `packages/remote-worker-rs/src/commands/mod.rs` | Two new dispatch arms |
| Modify | `packages/remote-worker-rs/Cargo.toml` | `notify` + `notify-debouncer-mini` |
| Modify | `packages/client/src/infrastructure/websocket/WebSocketClient.ts` | Auth handshake, event callback, reconnect with backoff |
| Modify | `packages/client/src/infrastructure/ITransportClient.ts` | `command` narrowed to the enum; `onEvent` |
| Create | `packages/client/src/infrastructure/serverToken.ts` | Token acquisition across the three modes |
| Create | `packages/client/src/composables/useRepoWatch.ts` | Subscribes to `repoChanged`, debounced refresh |
| Modify | `packages/client/src/composables/useGit.ts:303-313` | Both rebase paths move onto `gitRebase` |
| Modify | `packages/client/src/domain/models/Project.ts` | Optional `token` field |
| Modify | `packages/client/vite.config.ts` | Dev-only token injection |
| Create | `packages/e2e/tests/13-auth-required.spec.ts` | Unauthenticated connection is refused |
| Create | `packages/e2e/tests/14-live-refresh.spec.ts` | External file change refreshes the UI with no reload |

---

## Task 1: Protocol frames, and `command` narrowed to the enum

Adds the two frame shapes the rest of the phase needs, and closes the parked R18 finding while the transport layer is being touched anyway. **No new enum members here** — those land with their dispatch arms.

**Files:**
- Modify: `packages/protocol/src/index.ts`
- Modify: `packages/protocol/src/index.spec.ts`
- Modify: `packages/client/src/infrastructure/ITransportClient.ts`
- Modify: `packages/client/src/infrastructure/websocket/WebSocketClient.ts`, `tauri/TauriLocalClient.ts`, `ssh/SshClient.ts`, `ssh/SshTunnelClient.ts`

**Interfaces:**
- Produces:
  - `IWsAuthRequest` — `{type: 'auth'; token: string}`
  - `IWsEvent` — `{type: 'event'; event: 'repoChanged'; paths: Array<string>}`
  - `isAuthRequest(value: unknown): value is IWsAuthRequest`
  - `isRepoChangedEvent(value: unknown): value is IWsEvent`
  - `IWsRequest.command` narrowed from `string` to `ENetworkCommand`
  - `ITransportClient.call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown>`

- [ ] **Step 1: Write the failing tests**

Append to `packages/protocol/src/index.spec.ts`:

```ts
describe('isAuthRequest', () => {
	it('accepts a well-formed auth frame', () => {
		expect(isAuthRequest({type: 'auth', token: 'abc'})).toBe(true);
	});

	it('rejects a missing token', () => {
		expect(isAuthRequest({type: 'auth'})).toBe(false);
	});

	it('rejects a non-string token', () => {
		expect(isAuthRequest({type: 'auth', token: 42})).toBe(false);
	});

	it('rejects another frame type', () => {
		expect(isAuthRequest({type: 'event', event: 'repoChanged', paths: []})).toBe(false);
	});

	it('rejects null and non-objects', () => {
		expect(isAuthRequest(null)).toBe(false);
		expect(isAuthRequest('auth')).toBe(false);
	});
});

describe('isRepoChangedEvent', () => {
	it('accepts a well-formed event frame', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: ['a.txt']})).toBe(true);
	});

	it('accepts an empty paths array', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: []})).toBe(true);
	});

	it('rejects a non-array paths', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'repoChanged', paths: 'a.txt'})).toBe(false);
	});

	it('rejects an unknown event name', () => {
		expect(isRepoChangedEvent({type: 'event', event: 'somethingElse', paths: []})).toBe(false);
	});

	it('does not mistake a response frame for an event', () => {
		expect(isRepoChangedEvent({requestId: '1', status: 'success'})).toBe(false);
	});
});
```

Add `isAuthRequest, isRepoChangedEvent` to the existing import at the top of the file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test`
Expected: FAIL — `isAuthRequest is not a function`.

- [ ] **Step 3: Add the frames and guards**

In `packages/protocol/src/index.ts`, after the existing `isSuccessResponse`:

```ts
export interface IWsAuthRequest {
	type: 'auth';
	token: string;
}

export interface IWsEvent {
	type: 'event';
	event: 'repoChanged';
	paths: Array<string>;
}

export function isAuthRequest(value: unknown): value is IWsAuthRequest {
	return isRecord(value)
		&& value['type'] === 'auth'
		&& typeof value['token'] === 'string';
}

export function isRepoChangedEvent(value: unknown): value is IWsEvent {
	return isRecord(value)
		&& value['type'] === 'event'
		&& value['event'] === 'repoChanged'
		&& Array.isArray(value['paths']);
}
```

- [ ] **Step 4: Narrow `IWsRequest.command`**

In the same file, change:

```ts
export interface IWsRequest {
	requestId: string;
	command: string;
	[key: string]: unknown;
}
```

to:

```ts
export interface IWsRequest {
	requestId: string;
	command: ENetworkCommand;
	[key: string]: unknown;
}
```

- [ ] **Step 5: Narrow the transport interface**

In `packages/client/src/infrastructure/ITransportClient.ts`:

```ts
import type {ENetworkCommand} from '@git-yak/protocol';

export interface ITransportClient {
	connect?(): Promise<void>
	call(command: ENetworkCommand, payload: Record<string, unknown>): Promise<unknown>
	close(): void
}
```

Then change the `call(command: string, …)` signature to `call(command: ENetworkCommand, …)` in each implementation: `WebSocketClient.ts`, `TauriLocalClient.ts`, `SshClient.ts`, `SshTunnelClient.ts`.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `yarn test && yarn verify`

Expected: tests pass; `yarn verify` exits 0. If a call site passes a bare string it now fails to compile — fix it by using the enum member, never by widening the type back.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol packages/client/src/infrastructure
git commit -m "feat(protocol): add auth and event frames, narrow command to ENetworkCommand"
```

---

## Task 2: `gitRebase` command, in both backends

Moves both `-c` call sites server-side. This is the prerequisite that makes Task 3's filter possible.

**Files:**
- Modify: `packages/protocol/src/index.ts` (add `GitRebase = 'gitRebase'`)
- Create: `packages/server/src/commands/GitRebase.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/remote-worker-rs/src/commands/git_rebase.rs`
- Modify: `packages/remote-worker-rs/src/commands/mod.rs`
- Modify: `packages/client/src/composables/useGit.ts`

**Interfaces:**
- Consumes: `ENetworkCommand` from Task 1.
- Produces: wire command `gitRebase` with payload `{repo_path, action: 'start' | 'continue', upstream?: string, todo_path?: string}`. `useGit` exposes `rebaseInteractive(upstream, todoRelPath)` and `rebaseContinue()` with unchanged signatures, so `useRebase.ts` needs no edit.

> Context for the implementer: today `useGit.ts:303-310` sends
> `-c core.editor=false -c rebase.missingCommitsCheck=ignore -c "sequence.editor=cp '<path>'" rebase -i --autostash <upstream>`,
> and `useGit.ts:313` sends `-c core.editor=true rebase --continue`. The client passes a repo-relative
> todo path (`.git/gityak-rebase-todo`, written earlier via `writeFile`). After this task the client
> sends only the path; the **server** composes every `-c` flag.

- [ ] **Step 1: Add the enum member**

In `packages/protocol/src/index.ts`, add to `ENetworkCommand`:

```ts
	GitRebase = 'gitRebase',
```

`yarn check:protocol` is now red until both dispatch arms exist. That is expected mid-task.

- [ ] **Step 2: Write the Bun handler**

Create `packages/server/src/commands/GitRebase.ts`:

```ts
import {resolve, isAbsolute, sep} from 'path';
import {existsSync} from 'fs';
import {getAgentEnv} from './SshAgentInit';
import type {IWsRequest} from '@git-yak/protocol';

function validateRepoPath(repoPath: unknown): string {
	if (typeof repoPath !== 'string' || !repoPath) {
		throw new Error('repo_path must be a non-empty string');
	}

	const resolved = isAbsolute(repoPath) ? repoPath : resolve(repoPath);

	if (!existsSync(resolved)) {
		throw new Error(`Repository path does not exist: ${resolved}`);
	}

	return resolved;
}

// The todo path becomes part of a `sequence.editor` shell command, so it must be proven to
// sit inside the repository before it is interpolated. A path that escapes the repo — or
// contains a quote that could break out of the surrounding single quotes — is refused.
function validateTodoPath(repoRoot: string, todoPath: unknown): string {
	if (typeof todoPath !== 'string' || !todoPath) {
		throw new Error('todo_path must be a non-empty string');
	}

	if (todoPath.includes("'")) {
		throw new Error('todo_path must not contain a single quote');
	}

	const resolved = resolve(repoRoot, todoPath);

	if (resolved !== repoRoot && !resolved.startsWith(repoRoot + sep)) {
		throw new Error(`Access denied: todo path outside repository: ${resolved}`);
	}

	if (!existsSync(resolved)) {
		throw new Error(`Todo file does not exist: ${resolved}`);
	}

	return resolved;
}

function buildArgs(action: string, repoRoot: string, data: IWsRequest): Array<string> {
	if (action === 'continue') {
		// core.editor=true accepts the in-progress message as-is, with no prompt.
		return ['-c', 'core.editor=true', 'rebase', '--continue'];
	}

	if (action !== 'start') {
		throw new Error(`Unknown rebase action: ${action}`);
	}

	const {upstream} = data;

	if (typeof upstream !== 'string' || !upstream) {
		throw new Error('upstream must be a non-empty string');
	}

	const todo = validateTodoPath(repoRoot, data['todo_path']);

	// Our pre-written todo is copied over git's generated one via sequence.editor, and
	// core.editor is disabled so no action ever opens an interactive editor.
	return [
		'-c', 'core.editor=false',
		'-c', 'rebase.missingCommitsCheck=ignore',
		'-c', `sequence.editor=cp '${todo}'`,
		'rebase', '-i', '--autostash', upstream,
	];
}

export async function run(ws: {send: (msg: string) => void}, data: IWsRequest): Promise<void> {
	const {requestId} = data;

	let args: Array<string>;
	let repoRoot: string;

	try {
		repoRoot = validateRepoPath(data['repo_path']);
		args = buildArgs(String(data['action'] ?? ''), repoRoot, data);
	}
	catch (e: unknown) {
		ws.send(JSON.stringify({
			requestId,
			status: 'error',
			message: e instanceof Error ? e.message : 'Invalid rebase request',
		}));

		return;
	}

	const proc = Bun.spawn(['git', ...args], {
		cwd: repoRoot,
		env: getAgentEnv(ws),
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;

	if (exitCode === 0) {
		ws.send(JSON.stringify({requestId, status: 'success', data: stdout}));

		return;
	}

	ws.send(JSON.stringify({
		requestId,
		status: 'error',
		message: stderr.trim() || `git rebase exited ${exitCode}`,
	}));
}
```

- [ ] **Step 3: Wire the Bun dispatch**

In `packages/server/src/index.ts`, add the import beside the others:

```ts
import * as GitRebase from './commands/GitRebase';
```

and the arm, directly after the `GitCall` arm:

```ts
					case ENetworkCommand.GitRebase:
						await GitRebase.run(ws, data);
						break;
```

- [ ] **Step 4: Write the Rust handler**

Create `packages/remote-worker-rs/src/commands/git_rebase.rs`:

```rust
use crate::commands::resolve_file_path;
use crate::protocol;

fn build_args(
	action: &str,
	repo_path: &std::path::Path,
	req: &protocol::WsRequest,
) -> Result<Vec<String>, String> {
	if action == "continue" {
		return Ok(vec![
			"-c".into(),
			"core.editor=true".into(),
			"rebase".into(),
			"--continue".into(),
		]);
	}

	if action != "start" {
		return Err(format!("Unknown rebase action: {action}"));
	}

	let upstream = req
		.payload
		.get("upstream")
		.and_then(|v| v.as_str())
		.filter(|s| !s.is_empty())
		.ok_or("upstream must be a non-empty string")?;

	let todo_raw = req
		.payload
		.get("todo_path")
		.and_then(|v| v.as_str())
		.filter(|s| !s.is_empty())
		.ok_or("todo_path must be a non-empty string")?;

	// The path is interpolated into a shell command via sequence.editor, so a single
	// quote would break out of the surrounding quotes.
	if todo_raw.contains('\'') {
		return Err("todo_path must not contain a single quote".into());
	}

	let todo = resolve_file_path(repo_path, todo_raw)?;

	if !todo.exists() {
		return Err(format!("Todo file does not exist: {}", todo.display()));
	}

	Ok(vec![
		"-c".into(),
		"core.editor=false".into(),
		"-c".into(),
		"rebase.missingCommitsCheck=ignore".into(),
		"-c".into(),
		format!("sequence.editor=cp '{}'", todo.display()),
		"rebase".into(),
		"-i".into(),
		"--autostash".into(),
		upstream.to_string(),
	])
}

pub async fn run(req: &protocol::WsRequest) -> String {
	let request_id = &req.request_id;

	let repo_path = match req.payload.get("repo_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => std::path::PathBuf::from(p),
		_ => return protocol::error(request_id, "repo_path must be a non-empty string"),
	};

	if !repo_path.exists() {
		return protocol::error(
			request_id,
			&format!("Repository path does not exist: {}", repo_path.display()),
		);
	}

	let action = req.payload.get("action").and_then(|v| v.as_str()).unwrap_or("");

	let args = match build_args(action, &repo_path, req) {
		Ok(a) => a,
		Err(e) => return protocol::error(request_id, &e),
	};

	let output = tokio::process::Command::new("git")
		.args(&args)
		.current_dir(&repo_path)
		.output()
		.await;

	match output {
		Ok(out) if out.status.success() => {
			protocol::success(request_id, serde_json::json!(String::from_utf8_lossy(&out.stdout)))
		}
		Ok(out) => {
			let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
			protocol::error(
				request_id,
				if stderr.is_empty() { "git rebase failed" } else { &stderr },
			)
		}
		Err(e) => protocol::error(request_id, &format!("Failed to run git: {e}")),
	}
}
```

- [ ] **Step 5: Wire the Rust dispatch**

In `packages/remote-worker-rs/src/commands/mod.rs`, add `mod git_rebase;` to the module list and this arm to the `match`:

```rust
		"gitRebase" => git_rebase::run(&req).await,
```

- [ ] **Step 6: Move the client onto the new command**

In `packages/client/src/composables/useGit.ts`, replace the bodies of `rebaseInteractive` and `rebaseContinue` (lines 303-314). Keep both signatures exactly as they are so `useRebase.ts` is untouched:

```ts
	// Runs `git rebase -i <upstream>` headlessly. The server composes every `-c` flag from
	// a todo path it has validated against the repository, so no client string reaches
	// `git -c`.
	async function rebaseInteractive(upstream: string, todoRelPath: string): Promise<void> {
		await callRebase({action: 'start', upstream, todo_path: todoRelPath});
	}

	async function rebaseContinue(): Promise<void> {
		await callRebase({action: 'continue'});
	}
```

and add this helper directly above them, mirroring how `callGit` logs and unwraps errors:

```ts
	async function callRebase(payload: Record<string, unknown>): Promise<string> {
		setLoading(true);
		const cmdLabel = `git rebase (${String(payload['action'])})`;
		addLog({type: 'git', status: 'info', direction: 'request', message: cmdLabel});

		try {
			const result = await call(ENetworkCommand.GitRebase, {
				repo_path: repoPath(),
				...payload,
			});

			addLog({type: 'git', status: 'success', direction: 'response', message: cmdLabel});

			return result as string;
		}
		catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			addLog({type: 'git', status: 'error', direction: 'response', message});
			throw parseGitError(message, -1);
		}
		finally {
			setLoading(false);
		}
	}
```

- [ ] **Step 7: Verify parity is green again and rebase still works**

Run: `yarn verify`
Expected: exit 0, and `check:protocol` reports 6 Rust / 6 Bun / 7 protocol commands.

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`
Expected: 10 passed / 3 failed. **`10-rebase-onto-remote` is the load-bearing one here** — it exercises the rebase path this task rewired. If it regresses, the new command is wrong.

- [ ] **Step 8: Commit**

```bash
git add packages/protocol packages/server packages/remote-worker-rs packages/client/src/composables/useGit.ts
git commit -m "feat: move interactive rebase behind a dedicated gitRebase command"
```

---

## Task 3: Refuse git's global options in `gitCall`

With no client code passing `-c`, the generic path can refuse git's global options outright.

**Files:**
- Create: `packages/protocol/src/gitArgs.ts`, `packages/protocol/src/gitArgs.spec.ts`
- Modify: `packages/protocol/src/index.ts` (re-export)
- Modify: `packages/server/src/commands/GitCall.ts`
- Create: `packages/remote-worker-rs/src/git_args.rs`
- Modify: `packages/remote-worker-rs/src/main.rs`, `packages/remote-worker-rs/src/commands/git_call.rs`

**Interfaces:**
- Produces: `findForbiddenGitOption(args: Array<string>): string | undefined` — the first forbidden global option, or `undefined`.

- [ ] **Step 1: Write the failing tests**

Create `packages/protocol/src/gitArgs.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {findForbiddenGitOption} from './gitArgs';

describe('findForbiddenGitOption', () => {
	it('rejects -c, the command-injection vector', () => {
		expect(findForbiddenGitOption(['-c', 'alias.x=!sh', 'x'])).toBe('-c');
	});

	it('rejects -c written with an equals sign', () => {
		expect(findForbiddenGitOption(['-c=alias.x=!sh', 'x'])).toBe('-c=alias.x=!sh');
	});

	it('rejects --exec-path, --git-dir and --work-tree as globals', () => {
		expect(findForbiddenGitOption(['--exec-path=/tmp', 'status'])).toBe('--exec-path=/tmp');
		expect(findForbiddenGitOption(['--git-dir', '/tmp/x', 'status'])).toBe('--git-dir');
		expect(findForbiddenGitOption(['--work-tree', '/tmp', 'status'])).toBe('--work-tree');
	});

	it('rejects -C, which relocates the repository', () => {
		expect(findForbiddenGitOption(['-C', '/etc', 'status'])).toBe('-C');
	});

	// F2: git's global options may appear only BEFORE the subcommand. `--git-dir` after
	// `rev-parse` is an argument to that subcommand and must be allowed, or isGitRepo() breaks.
	it('allows --git-dir as an argument to rev-parse', () => {
		expect(findForbiddenGitOption(['rev-parse', '--git-dir'])).toBeUndefined();
	});

	it('allows a forbidden-looking flag anywhere after the subcommand', () => {
		expect(findForbiddenGitOption(['log', '--work-tree'])).toBeUndefined();
		expect(findForbiddenGitOption(['commit', '-c', 'HEAD'])).toBeUndefined();
	});

	it('allows ordinary commands', () => {
		expect(findForbiddenGitOption(['status', '--porcelain'])).toBeUndefined();
		expect(findForbiddenGitOption(['log', '--format=%H', '-n', '50'])).toBeUndefined();
		expect(findForbiddenGitOption([])).toBeUndefined();
	});

	it('allows a leading option that is not on the list', () => {
		expect(findForbiddenGitOption(['--no-pager', 'log'])).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test`
Expected: FAIL — cannot resolve `./gitArgs`.

- [ ] **Step 3: Write the filter**

Create `packages/protocol/src/gitArgs.ts`:

```ts
// git's global options — the ones that can redirect git at another repository, run a
// different binary, or execute arbitrary shell through configuration.
const FORBIDDEN = [
	'-c',
	'-C',
	'--exec-path',
	'--git-dir',
	'--work-tree',
	'--namespace',
	'--upload-pack',
	'--receive-pack',
];

// A global option may appear only BEFORE the subcommand, so only the leading run of
// option-looking tokens is inspected. `git rev-parse --git-dir` is legitimate: there
// `--git-dir` belongs to rev-parse, not to git.
export function findForbiddenGitOption(args: Array<string>): string | undefined {
	for (const arg of args) {
		if (!arg.startsWith('-')) {
			// The subcommand. Everything after it belongs to that subcommand.
			return undefined;
		}

		const name = arg.split('=')[0];

		if (FORBIDDEN.includes(name)) {
			return arg;
		}
	}

	return undefined;
}
```

Re-export it from `packages/protocol/src/index.ts`:

```ts
export {findForbiddenGitOption} from './gitArgs';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 5: Enforce it in the Bun server**

In `packages/server/src/commands/GitCall.ts`, add to the imports:

```ts
import {findForbiddenGitOption} from '@git-yak/protocol';
```

and immediately after the existing `args` type check, before `validateRepoPath` is called:

```ts
	const forbidden = findForbiddenGitOption(args);

	if (forbidden) {
		ws.send(JSON.stringify({
			requestId,
			status: 'error',
			message: `Refused: "${forbidden}" is a git global option and is not allowed here`,
		}));

		return;
	}
```

- [ ] **Step 6: Enforce it in the Rust worker**

Create `packages/remote-worker-rs/src/git_args.rs`:

```rust
const FORBIDDEN: [&str; 8] = [
	"-c",
	"-C",
	"--exec-path",
	"--git-dir",
	"--work-tree",
	"--namespace",
	"--upload-pack",
	"--receive-pack",
];

/// Returns the first forbidden git *global* option, if any. Global options may appear only
/// before the subcommand, so scanning stops at the first non-option token — `git rev-parse
/// --git-dir` is legitimate, because there `--git-dir` belongs to rev-parse.
pub fn find_forbidden_git_option(args: &[String]) -> Option<&str> {
	for arg in args {
		if !arg.starts_with('-') {
			return None;
		}

		let name = arg.split('=').next().unwrap_or(arg);

		if FORBIDDEN.contains(&name) {
			return Some(arg);
		}
	}

	None
}

#[cfg(test)]
mod tests {
	use super::*;

	fn v(items: &[&str]) -> Vec<String> {
		items.iter().map(|s| s.to_string()).collect()
	}

	#[test]
	fn rejects_dash_c() {
		assert_eq!(find_forbidden_git_option(&v(&["-c", "alias.x=!sh", "x"])), Some("-c"));
	}

	#[test]
	fn rejects_equals_form() {
		assert_eq!(
			find_forbidden_git_option(&v(&["--git-dir=/tmp", "status"])),
			Some("--git-dir=/tmp")
		);
	}

	#[test]
	fn allows_git_dir_after_subcommand() {
		assert_eq!(find_forbidden_git_option(&v(&["rev-parse", "--git-dir"])), None);
	}

	#[test]
	fn allows_ordinary_commands() {
		assert_eq!(find_forbidden_git_option(&v(&["status", "--porcelain"])), None);
	}
}
```

Add `mod git_args;` to `packages/remote-worker-rs/src/main.rs`, and in `packages/remote-worker-rs/src/commands/git_call.rs`, directly after `args` is parsed:

```rust
	if let Some(forbidden) = crate::git_args::find_forbidden_git_option(&args) {
		return protocol::error(
			request_id,
			&format!("Refused: \"{forbidden}\" is a git global option and is not allowed here"),
		);
	}
```

- [ ] **Step 7: Run the Rust tests**

Run: `cd packages/remote-worker-rs && PATH=$HOME/.cargo/bin:$PATH cargo test && cd ../..`
Expected: 4 tests pass.

- [ ] **Step 8: Prove the app still works end to end**

Run: `yarn verify && yarn test:e2e 2>&1 | grep -E "passed|failed"`

Expected: verify exits 0; e2e 10 passed / 3 failed. **`09-init-repo` and `10-rebase-onto-remote` are the load-bearing ones**: the first exercises `rev-parse --git-dir` through `isGitRepo()`, which finding F2 says a naive filter would break; the second proves the rebase path still works now that `-c` is refused on the generic route.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol packages/server packages/remote-worker-rs
git commit -m "feat: refuse git global options on the generic gitCall route"
```

---

## Task 4: Bun server auth gate, loopback bind and Origin check

**Files:**
- Create: `packages/server/src/auth.ts`, `packages/server/src/auth.spec.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `vitest.config.ts` (collect `packages/server/src/**/*.spec.ts`)

**Interfaces:**
- Produces:
  - `resolveToken(): string` — `GITYAK_TOKEN`, else `~/.git-yak/server-token`, else a freshly generated 32-byte hex written there with mode `0600`
  - `isOriginAllowed(origin: string | null, allowlist: Array<string>): boolean`
  - `defaultAllowlist(): Array<string>` — from `GITYAK_ALLOWED_ORIGINS`, else the Vite dev and Tauri origins
  - `BIND_HOST` — `GITYAK_HOST` or `127.0.0.1`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/auth.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {isOriginAllowed} from './auth';

const ALLOWLIST = ['http://localhost:5173', 'tauri://localhost'];

describe('isOriginAllowed', () => {
	// A native client sends no Origin header; a browser always does. So "absent" means
	// "not a web page", which is exactly what we want to let through.
	it('allows a missing origin, which means a native client', () => {
		expect(isOriginAllowed(null, ALLOWLIST)).toBe(true);
	});

	it('allows an allowlisted origin', () => {
		expect(isOriginAllowed('http://localhost:5173', ALLOWLIST)).toBe(true);
		expect(isOriginAllowed('tauri://localhost', ALLOWLIST)).toBe(true);
	});

	it('refuses an arbitrary web page', () => {
		expect(isOriginAllowed('https://evil.example', ALLOWLIST)).toBe(false);
	});

	it('refuses a lookalike origin', () => {
		expect(isOriginAllowed('http://localhost:5173.evil.example', ALLOWLIST)).toBe(false);
		expect(isOriginAllowed('http://localhost:51730', ALLOWLIST)).toBe(false);
	});

	it('refuses an empty allowlist for any present origin', () => {
		expect(isOriginAllowed('http://localhost:5173', [])).toBe(false);
	});
});
```

- [ ] **Step 2: Make Vitest collect the server's specs**

In `vitest.config.ts`, add to `test.include`:

```ts
			'packages/server/src/**/*.spec.ts',
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `yarn test`
Expected: FAIL — cannot resolve `./auth`.

- [ ] **Step 4: Write the auth module**

Create `packages/server/src/auth.ts`:

```ts
import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

const TOKEN_PATH = join(homedir(), '.git-yak', 'server-token');

export const BIND_HOST = process.env.GITYAK_HOST ?? '127.0.0.1';

export function defaultAllowlist(): Array<string> {
	const configured = process.env.GITYAK_ALLOWED_ORIGINS;

	if (configured) {
		return configured.split(',').map(o => o.trim()).filter(Boolean);
	}

	return ['http://localhost:5173', 'http://127.0.0.1:5173', 'tauri://localhost'];
}

// A browser always sends Origin; a native client never does. So an absent Origin means the
// caller is not a web page, which is the case we want to admit.
export function isOriginAllowed(origin: string | null, allowlist: Array<string>): boolean {
	if (origin === null) {
		return true;
	}

	return allowlist.includes(origin);
}

export function resolveToken(): string {
	const fromEnv = process.env.GITYAK_TOKEN;

	if (fromEnv) {
		return fromEnv;
	}

	if (existsSync(TOKEN_PATH)) {
		const existing = readFileSync(TOKEN_PATH, 'utf8').trim();

		if (existing) {
			return existing;
		}
	}

	const generated = randomBytes(32).toString('hex');

	mkdirSync(dirname(TOKEN_PATH), {recursive: true, mode: 0o700});
	writeFileSync(TOKEN_PATH, generated + '\n', {mode: 0o600});
	console.log(`[auth] generated a new server token at ${TOKEN_PATH}`);

	return generated;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 6: Gate the socket**

In `packages/server/src/index.ts`:

Add the imports:

```ts
import {isAuthRequest} from '@git-yak/protocol';
import {BIND_HOST, defaultAllowlist, isOriginAllowed, resolveToken} from './auth';
```

Add the module-level state below `PORT`:

```ts
const
	TOKEN = resolveToken(),
	ALLOWED_ORIGINS = defaultAllowlist(),
	AUTH_TIMEOUT_MS = 5_000;

// Sockets start unauthenticated. A socket that has not sent a valid auth frame within
// AUTH_TIMEOUT_MS is closed, and any command sent before authentication is refused.
const authenticated = new WeakSet<object>();
const authTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
```

Set `hostname` and add the Origin check in `fetch`:

```ts
	hostname: BIND_HOST,
	port: PORT,
	fetch(req, server) {
		if (req.headers.get('upgrade')?.toLowerCase() === 'websocket') {
			if (!isOriginAllowed(req.headers.get('origin'), ALLOWED_ORIGINS)) {
				console.warn('[ws] refused upgrade from origin:', req.headers.get('origin'));

				return new Response('Forbidden origin', {status: 403});
			}
		}

		if (server.upgrade(req)) {
			return;
		}

		return new Response('Git Yak server', {status: 200});
	},
```

In `open(ws)`, start the timeout:

```ts
		open(ws) {
			console.log('[ws] client connected');
			authTimers.set(ws, setTimeout(() => {
				if (!authenticated.has(ws)) {
					console.warn('[ws] closing socket that never authenticated');
					ws.close();
				}
			}, AUTH_TIMEOUT_MS));
			ws.send(JSON.stringify({type: 'hello', message: 'Git Yak server ready'}));
		},
```

At the very top of `message(ws, message)`, before the existing `try`, handle the auth frame and reject everything else while unauthenticated:

```ts
			let parsed: unknown;

			try {
				parsed = JSON.parse(message.toString());
			}
			catch {
				ws.send(JSON.stringify({status: 'error', message: 'Failed to parse message'}));

				return;
			}

			if (isAuthRequest(parsed)) {
				if (parsed.token === TOKEN) {
					authenticated.add(ws);
					clearTimeout(authTimers.get(ws));
					ws.send(JSON.stringify({type: 'auth', status: 'success'}));
				}
				else {
					console.warn('[ws] rejected a bad token');
					ws.send(JSON.stringify({status: 'error', message: 'Invalid token'}));
					ws.close();
				}

				return;
			}

			if (!authenticated.has(ws)) {
				const requestId = (parsed as {requestId?: string} | null)?.requestId;

				ws.send(JSON.stringify({requestId, status: 'error', message: 'Not authenticated'}));
				ws.close();

				return;
			}
```

Then change the existing body to reuse `parsed` rather than parsing a second time: replace `data = JSON.parse(message.toString()) as IWsRequest;` with `data = parsed as IWsRequest;`.

In `close(ws)`, clear the timer:

```ts
		close(ws) {
			console.log('[ws] client disconnected');
			clearTimeout(authTimers.get(ws));
			SshAgentInit.destroyAgent(ws);
		},
```

Finally, update the startup log:

```ts
console.log(`[server] running on ${BIND_HOST}:${PORT}`);
```

- [ ] **Step 7: Verify the gate refuses an unauthenticated socket**

The e2e suite will fail at this point — the client cannot authenticate yet. That is expected; Task 5 fixes it. Prove the gate works by hand instead:

```bash
yarn workspace @git-yak/server dev &
sleep 2
yarn exec bun -e '
const ws = new WebSocket("ws://127.0.0.1:3000");
ws.onopen = () => ws.send(JSON.stringify({requestId: "1", command: "gitCall", repo_path: "/tmp", args: ["status"]}));
ws.onmessage = e => { console.log("REPLY:", e.data); if (!String(e.data).includes("hello")) process.exit(0); };
setTimeout(() => { console.log("no reply"); process.exit(1); }, 3000);
'
kill %1
```

Expected: the reply is `{"status":"error","message":"Not authenticated"}`.

Record this output in your report. Do **not** run the e2e suite in this task.

- [ ] **Step 8: Commit**

```bash
git add packages/server vitest.config.ts
git commit -m "feat(server): require a token, bind loopback, check Origin"
```

---

## Task 5: Client authentication

Restores a working application by teaching the client to authenticate. The e2e suite must be green again at the end of this task.

**Files:**
- Create: `packages/client/src/infrastructure/serverToken.ts`
- Modify: `packages/client/src/infrastructure/websocket/WebSocketClient.ts`
- Modify: `packages/client/src/composables/useWebSocket.ts`
- Modify: `packages/client/src/domain/models/Project.ts`
- Modify: `packages/client/src/ui/components/ProjectManager/ProjectForm.vue`
- Modify: `packages/client/vite.config.ts`
- Create: `packages/e2e/tests/13-auth-required.spec.ts`

**Interfaces:**
- Consumes: `isAuthRequest` (Task 1), the server gate (Task 4).
- Produces: `getServerToken(project: IProject): Promise<string>`; `WebSocketClient` constructor takes `(url: string, token: string)` and does not resolve any `call()` until the server has accepted the token.

> The three modes, per the spec: **Tauri** reads `~/.git-yak/server-token` through the existing
> `read_file_at` command; **web dev** receives the token through a dev-only Vite `define`; **anything
> else** takes it from the project record's new optional `token` field.

- [ ] **Step 1: Inject the token in dev only**

In `packages/client/vite.config.ts`, change the exported config to the function form so `command` is available, and add the define. The token is read at dev-server startup and **must never reach a production bundle**:

```ts
export default defineConfig(({command}) => ({
	// …existing config unchanged…
	define: {
		__REMOTE_WORKER_VERSION__: JSON.stringify(remoteWorkerVersion),
		__DEV_SERVER_TOKEN__: JSON.stringify(command === 'serve' ? readDevToken() : ''),
	},
}));
```

with this helper beside `remoteWorkerVersion`:

```ts
// Dev-server convenience only: a browser cannot read the user's home directory, so the
// token is injected at dev time. Guarded on `command === 'serve'` so a production build
// always embeds an empty string.
function readDevToken(): string {
	try {
		return readFileSync(join(homedir(), '.git-yak', 'server-token'), 'utf8').trim();
	}
	catch {
		return '';
	}
}
```

Add `__DEV_SERVER_TOKEN__` to `packages/client/src/vite-env.d.ts`:

```ts
declare const __DEV_SERVER_TOKEN__: string;
```

- [ ] **Step 2: Write the token resolver**

Create `packages/client/src/infrastructure/serverToken.ts`:

```ts
import {invoke} from '@tauri-apps/api/core';
import type {IProject} from '@/domain';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Where the token comes from depends on what can reach the user's home directory:
// Tauri reads the file directly; the Vite dev server injects it at build time; anything
// else must be told the token explicitly on the project record.
export async function getServerToken(project: IProject): Promise<string> {
	if (project.token) {
		return project.token;
	}

	if (isTauri) {
		const contents = await invoke<string | null>('read_file_at', {
			path: '~/.git-yak/server-token',
			nullIfNotExists: true,
		});

		if (contents) {
			return contents.trim();
		}
	}

	return __DEV_SERVER_TOKEN__;
}
```

Add the field to `packages/client/src/domain/models/Project.ts`:

```ts
	token?: string
```

- [ ] **Step 3: Authenticate in `WebSocketClient`**

Give the constructor a second parameter and hold every message until the server accepts the token. Replace the constructor's `onopen` and the top of `onmessage`:

```ts
	constructor(url: string, private readonly token: string) {
		this.ws = new WebSocket(url);

		this.ws.onopen = () => {
			// The auth frame goes first, alone. Queued calls are released only once the
			// server has accepted it.
			this.ws.send(JSON.stringify({type: 'auth', token: this.token}));
		};

		this.ws.onmessage = (event: MessageEvent) => {
			let data: unknown;

			try {
				data = JSON.parse(event.data as string);
			}
			catch {
				return;
			}

			if (isRecord(data) && data['type'] === 'auth') {
				if (data['status'] === 'success') {
					this.connected = true;
					this.queue.forEach(msg => this.ws.send(msg));
					this.queue.length = 0;
				}

				return;
			}

			// …existing requestId routing, unchanged…
```

Add this helper next to `extractRequestId`:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
```

- [ ] **Step 4: Pass the token through**

In `packages/client/src/composables/useWebSocket.ts`, `connect(project)` becomes async at the point it builds the client:

```ts
			else {
				const token = await getServerToken(project);

				newClient = new WebSocketClient(`ws://${project.server}:${project.port}`, token);
			}
```

Import `getServerToken` at the top. `SshTunnelClient` builds its own inner `WebSocketClient` against the tunnel — pass the same token there too, resolving it via `getServerToken` where the tunnel client is constructed.

- [ ] **Step 5: Expose the field in the project form**

In `packages/client/src/ui/components/ProjectManager/ProjectForm.vue`, add a `token` input beside the existing server/port fields, following the pattern of the `sshUser` field already there: add `token: ''` to the form state, `token: project?.token ?? ''`, and `token: form.token || undefined` in the submitted payload. Label it "Server token" with the hint "Only needed for a server exposed beyond localhost."

- [ ] **Step 5b: Unit-test the queueing behaviour against a fake socket**

The spec asks for this explicitly, and it is the part an e2e test cannot isolate: a `call()` made
before the server accepts the token must not reach the wire until it does.

Create `packages/client/src/infrastructure/websocket/WebSocketClient.spec.ts`:

```ts
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ENetworkCommand} from '@git-yak/protocol';
import {WebSocketClient} from './WebSocketClient';

class FakeSocket {
	static OPEN = 1;
	readyState = FakeSocket.OPEN;
	sent: Array<string> = [];
	onopen?: () => void;
	onmessage?: (event: {data: string}) => void;
	onclose?: () => void;
	onerror?: () => void;

	send(msg: string): void {
		this.sent.push(msg);
	}

	close(): void {}
}

let socket: FakeSocket;

beforeEach(() => {
	socket = new FakeSocket();
	vi.stubGlobal('WebSocket', function (this: unknown) {
		return socket;
	} as unknown as typeof WebSocket);
	(globalThis.WebSocket as unknown as {OPEN: number}).OPEN = FakeSocket.OPEN;
});

function accept(): void {
	socket.onmessage?.({data: JSON.stringify({type: 'auth', status: 'success'})});
}

describe('WebSocketClient auth gate', () => {
	it('sends the auth frame first, alone', () => {
		new WebSocketClient('ws://x', 'secret');
		socket.onopen?.();

		expect(socket.sent).toEqual([JSON.stringify({type: 'auth', token: 'secret'})]);
	});

	it('holds a call made before the token is accepted', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		void client.call(ENetworkCommand.GitCall, {args: ['status']});

		expect(socket.sent).toHaveLength(1);
		expect(socket.sent[0]).toContain('"type":"auth"');
	});

	it('releases queued calls once the token is accepted', () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		void client.call(ENetworkCommand.GitCall, {args: ['status']});
		accept();

		expect(socket.sent).toHaveLength(2);
		expect(socket.sent[1]).toContain('"command":"gitCall"');
	});

	it('resolves a call routed back after authentication', async () => {
		const client = new WebSocketClient('ws://x', 'secret');

		socket.onopen?.();
		accept();

		const pending = client.call(ENetworkCommand.GitCall, {args: ['status']});
		const requestId = JSON.parse(socket.sent[1]).requestId as string;

		socket.onmessage?.({data: JSON.stringify({requestId, status: 'success', data: 'ok'})});

		await expect(pending).resolves.toBe('ok');
	});
});
```

Run: `yarn test`
Expected: 4 new tests pass. If "holds a call" fails, the gate is leaking commands before authentication.

- [ ] **Step 6: Write the e2e test proving the gate holds**

Create `packages/e2e/tests/13-auth-required.spec.ts`:

```ts
import {test, expect} from '../fixtures/test';

test('the server refuses a socket that never authenticates', async ({page}) => {
	await page.goto('/');

	const reply = await page.evaluate(() => new Promise<string>(resolve => {
		const ws = new WebSocket('ws://localhost:3000');

		ws.onopen = () => ws.send(JSON.stringify({
			requestId: 'probe',
			command: 'gitCall',
			repo_path: '/tmp',
			args: ['status'],
		}));

		ws.onmessage = event => {
			const data = String(event.data);

			// Skip the server's unsolicited hello frame.
			if (data.includes('"hello"')) {
				return;
			}

			resolve(data);
		};

		setTimeout(() => resolve('NO REPLY'), 5_000);
	}));

	expect(reply).toContain('Not authenticated');
});

test('an authenticated project loads its repository', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);

	// The app authenticates on connect; reaching the commit list proves it succeeded.
	await expect(page.locator('.commit-row__message', {hasText: 'Initial'})).toBeVisible({timeout: 30_000});
});
```

- [ ] **Step 7: Verify the whole application is healthy again**

Run: `yarn verify`
Expected: exit 0.

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`
Expected: **12 passed / 3 failed** — the 10 previously passing, plus the two new auth tests. Anything less means the client cannot authenticate and the application is broken; do not proceed.

- [ ] **Step 8: Commit**

```bash
git add packages/client packages/e2e/tests/13-auth-required.spec.ts
git commit -m "feat(client): authenticate to the server before issuing commands"
```

---

## Task 6: Bun server watcher

**Files:**
- Modify: `packages/protocol/src/index.ts` (`WatchRepo`, `UnwatchRepo`)
- Create: `packages/server/src/commands/WatchRepo.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `packages/remote-worker-rs/src/commands/mod.rs` (stub arms — see below)

**Interfaces:**
- Produces: commands `watchRepo` / `unwatchRepo` with payload `{repo_path}`; server pushes `{type: 'event', event: 'repoChanged', paths}`.

> **Why the Rust stubs:** `yarn check:protocol` requires a dispatch arm in both backends for every
> enum member. The Rust watcher is Task 7. So this task adds Rust arms that return an explicit
> "not implemented" error — the command is genuinely routed and answers honestly, rather than
> falling through to `Unknown command`. Task 7 replaces them.

- [ ] **Step 1: Add the enum members**

In `packages/protocol/src/index.ts`:

```ts
	WatchRepo = 'watchRepo',
	UnwatchRepo = 'unwatchRepo',
```

- [ ] **Step 2: Write the watcher**

Create `packages/server/src/commands/WatchRepo.ts`:

```ts
import {watch} from 'node:fs';
import type {FSWatcher} from 'node:fs';
import {existsSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import type {IWsRequest} from '@git-yak/protocol';

const DEBOUNCE_MS = 300;

interface IWatchSession {
	watchers: Array<FSWatcher>;
	timer?: ReturnType<typeof setTimeout>;
	paths: Set<string>;
}

const sessions = new WeakMap<object, IWatchSession>();

// fs.watch's `recursive` option is unsupported on Linux in Node and Bun. `.git` is watched
// recursively where possible because it is small and captures commit, checkout, fetch and
// rebase; the repository root is watched for working-tree edits. On Linux both degrade to
// non-recursive, so edits inside working-tree subdirectories raise no event there.
const RECURSIVE = process.platform !== 'linux';

function emit(ws: {send: (msg: string) => void}, session: IWatchSession): void {
	clearTimeout(session.timer);

	session.timer = setTimeout(() => {
		const paths = [...session.paths];

		session.paths.clear();

		ws.send(JSON.stringify({type: 'event', event: 'repoChanged', paths}));
	}, DEBOUNCE_MS);
}

export function stop(ws: object): void {
	const session = sessions.get(ws);

	if (!session) {
		return;
	}

	clearTimeout(session.timer);
	session.watchers.forEach(w => w.close());
	sessions.delete(ws);
}

export function run(ws: {send: (msg: string) => void}, data: IWsRequest): void {
	const {requestId} = data;
	const repoPath = data['repo_path'];

	if (typeof repoPath !== 'string' || !repoPath) {
		ws.send(JSON.stringify({requestId, status: 'error', message: 'repo_path must be a non-empty string'}));

		return;
	}

	const root = isAbsolute(repoPath) ? repoPath : resolve(repoPath);

	if (!existsSync(root)) {
		ws.send(JSON.stringify({requestId, status: 'error', message: `Repository path does not exist: ${root}`}));

		return;
	}

	stop(ws);

	const session: IWatchSession = {watchers: [], paths: new Set()};

	const onChange = (_event: string, filename: string | null): void => {
		if (filename) {
			session.paths.add(filename);
		}

		emit(ws, session);
	};

	try {
		session.watchers.push(watch(root, {recursive: RECURSIVE}, onChange));

		const gitDir = join(root, '.git');

		if (existsSync(gitDir)) {
			session.watchers.push(watch(gitDir, {recursive: RECURSIVE}, onChange));
		}
	}
	catch (e: unknown) {
		session.watchers.forEach(w => w.close());
		ws.send(JSON.stringify({
			requestId,
			status: 'error',
			message: e instanceof Error ? e.message : 'Failed to watch repository',
		}));

		return;
	}

	sessions.set(ws, session);
	ws.send(JSON.stringify({requestId, status: 'success'}));
}

export function unwatch(ws: {send: (msg: string) => void}, data: IWsRequest): void {
	stop(ws);
	ws.send(JSON.stringify({requestId: data.requestId, status: 'success'}));
}
```

- [ ] **Step 3: Wire the Bun dispatch**

Import it, add the two arms beside the others, and call `WatchRepo.stop(ws)` in `close(ws)` next to `SshAgentInit.destroyAgent(ws)`:

```ts
					case ENetworkCommand.WatchRepo:
						WatchRepo.run(ws, data);
						break;

					case ENetworkCommand.UnwatchRepo:
						WatchRepo.unwatch(ws, data);
						break;
```

- [ ] **Step 4: Add the Rust stub arms**

In `packages/remote-worker-rs/src/commands/mod.rs`, add to the match:

```rust
		// Implemented in the next task; answered explicitly so the command is genuinely
		// routed rather than falling through to "Unknown command".
		"watchRepo" | "unwatchRepo" => {
			protocol::error(&req.request_id, "Repository watching is not yet supported by the remote worker")
		}
```

- [ ] **Step 5: Verify parity and prove the watcher emits**

Run: `yarn verify`
Expected: exit 0; `check:protocol` reports 8 Rust / 8 Bun / 9 protocol commands.

Prove the event actually fires:

```bash
REPO=$(mktemp -d) && git -C "$REPO" init -q
yarn workspace @git-yak/server dev &
sleep 2
yarn exec bun -e "
const token = require('fs').readFileSync(require('os').homedir() + '/.git-yak/server-token','utf8').trim();
const ws = new WebSocket('ws://127.0.0.1:3000');
ws.onopen = () => ws.send(JSON.stringify({type:'auth', token}));
ws.onmessage = e => {
  const d = JSON.parse(e.data);
  if (d.type === 'auth') { ws.send(JSON.stringify({requestId:'w', command:'watchRepo', repo_path:'$REPO'})); return; }
  if (d.requestId === 'w') { require('fs').writeFileSync('$REPO/poke.txt','hi'); return; }
  if (d.event === 'repoChanged') { console.log('EVENT:', JSON.stringify(d)); process.exit(0); }
};
setTimeout(() => { console.log('NO EVENT'); process.exit(1); }, 8000);
"
kill %1; rm -rf "$REPO"
```

Expected: a line beginning `EVENT:` with `poke.txt` among the paths. Record it in your report.

- [ ] **Step 6: Commit**

```bash
git add packages/protocol packages/server packages/remote-worker-rs
git commit -m "feat(server): push a debounced repoChanged event while a repo is watched"
```

---

## Task 7: Rust worker watcher

Replaces the stubs. Requires splitting the axum socket, because the current `while socket.next()` loop owns the socket and cannot send unsolicited frames.

**Files:**
- Modify: `packages/remote-worker-rs/Cargo.toml`
- Modify: `packages/remote-worker-rs/src/server.rs`
- Create: `packages/remote-worker-rs/src/commands/watch_repo.rs`
- Modify: `packages/remote-worker-rs/src/commands/mod.rs`, `packages/remote-worker-rs/src/main.rs`

**Interfaces:**
- Consumes: the `watchRepo` / `unwatchRepo` wire commands and the `repoChanged` frame shape from Task 6 — the Rust worker must emit a byte-identical frame.

- [ ] **Step 1: Add the dependencies**

In `packages/remote-worker-rs/Cargo.toml`:

```toml
notify = "6"
notify-debouncer-mini = "0.4"
```

- [ ] **Step 2: Split the socket**

Rewrite `handle_socket` in `packages/remote-worker-rs/src/server.rs` so a background task can push frames while the request loop reads. Add `use futures_util::SinkExt;` and `use tokio::sync::mpsc;` to the imports:

```rust
async fn handle_socket(socket: WebSocket, state: AppState) {
	eprintln!("[ws] client connected");

	let (mut sink, mut stream) = socket.split();
	// Events and responses share one outbound channel so only this task touches the sink.
	let (tx, mut rx) = mpsc::unbounded_channel::<String>();

	let hello = serde_json::json!({
		"type": "hello",
		"message": "git-yak remote-worker ready"
	});
	let _ = tx.send(hello.to_string());

	let writer = tokio::spawn(async move {
		while let Some(msg) = rx.recv().await {
			if sink.send(Message::Text(msg)).await.is_err() {
				break;
			}
		}
	});

	while let Some(Ok(msg)) = stream.next().await {
		if let Message::Text(text) = msg {
			let response = crate::commands::dispatch(&text, &state, &tx).await;

			if let Some(response) = response {
				if tx.send(response).is_err() {
					break;
				}
			}
		}
	}

	crate::commands::watch_repo::stop(&state);
	drop(tx);
	let _ = writer.await;

	eprintln!("[ws] client disconnected");
}
```

`dispatch` now takes the sender and returns `Option<String>` — `watchRepo` replies immediately *and* keeps the sender for later events, while every other command returns `Some(response)` as before. Update its signature in `commands/mod.rs` accordingly, and add the watcher handle to `AppState`:

```rust
#[derive(Clone)]
pub struct AppState {
	pub last_heartbeat: Arc<Mutex<Instant>>,
	pub watcher: Arc<Mutex<Option<notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>>,
}
```

Update `make_router` and `main.rs` to construct the new field with `Arc::new(Mutex::new(None))`.

- [ ] **Step 3: Write the watcher**

Create `packages/remote-worker-rs/src/commands/watch_repo.rs`:

```rust
use std::time::Duration;

use notify::RecursiveMode;
use notify_debouncer_mini::new_debouncer;
use tokio::sync::mpsc::UnboundedSender;

use crate::protocol;
use crate::server::AppState;

const DEBOUNCE: Duration = Duration::from_millis(300);

pub fn stop(state: &AppState) {
	*state.watcher.lock().unwrap() = None;
}

pub fn run(req: &protocol::WsRequest, state: &AppState, tx: &UnboundedSender<String>) -> String {
	let request_id = &req.request_id;

	let repo_path = match req.payload.get("repo_path").and_then(|v| v.as_str()) {
		Some(p) if !p.is_empty() => std::path::PathBuf::from(p),
		_ => return protocol::error(request_id, "repo_path must be a non-empty string"),
	};

	if !repo_path.exists() {
		return protocol::error(
			request_id,
			&format!("Repository path does not exist: {}", repo_path.display()),
		);
	}

	stop(state);

	let sender = tx.clone();

	let mut debouncer = match new_debouncer(DEBOUNCE, move |res| {
		let paths: Vec<String> = match res {
			Ok(events) => events
				.into_iter()
				.map(|e: notify_debouncer_mini::DebouncedEvent| e.path.display().to_string())
				.collect(),
			Err(_) => Vec::new(),
		};

		let frame = serde_json::json!({
			"type": "event",
			"event": "repoChanged",
			"paths": paths
		});

		let _ = sender.send(frame.to_string());
	}) {
		Ok(d) => d,
		Err(e) => return protocol::error(request_id, &format!("Failed to create watcher: {e}")),
	};

	// The whole repository is watched recursively — notify handles recursion on Linux,
	// unlike fs.watch in the Bun server.
	if let Err(e) = debouncer.watcher().watch(&repo_path, RecursiveMode::Recursive) {
		return protocol::error(request_id, &format!("Failed to watch repository: {e}"));
	}

	*state.watcher.lock().unwrap() = Some(debouncer);

	protocol::success_no_data(request_id)
}

pub fn unwatch(req: &protocol::WsRequest, state: &AppState) -> String {
	stop(state);

	protocol::success_no_data(&req.request_id)
}
```

- [ ] **Step 4: Replace the stub arms**

In `packages/remote-worker-rs/src/commands/mod.rs`, add `pub mod watch_repo;` and replace the stub with:

```rust
		"watchRepo" => watch_repo::run(&req, state, tx),
		"unwatchRepo" => watch_repo::unwatch(&req, state),
```

- [ ] **Step 5: Build and verify parity**

Run: `cd packages/remote-worker-rs && PATH=$HOME/.cargo/bin:$PATH cargo build --release && PATH=$HOME/.cargo/bin:$PATH cargo test && cd ../..`
Expected: builds clean, existing tests pass.

Run: `yarn verify`
Expected: exit 0.

- [ ] **Step 6: Prove the remote worker emits the same frame**

```bash
REPO=$(mktemp -d) && git -C "$REPO" init -q
PORT=0 ONESHOT=0 ./packages/remote-worker-rs/target/release/remote-worker-rs &
sleep 1
```

Note the `SERVER_READY|PORT:<n>` line, then run the same probe as Task 6 step 5 against that port (the remote worker has no auth gate, so skip the auth frame). Expected: an `EVENT:` line with `repoChanged`. Record it, then `kill %1; rm -rf "$REPO"`.

- [ ] **Step 7: Commit**

```bash
git add packages/remote-worker-rs
git commit -m "feat(worker): watch the repository and push repoChanged over a split socket"
```

---

## Task 8: Client live refresh

**Files:**
- Modify: `packages/client/src/infrastructure/websocket/WebSocketClient.ts`, `ITransportClient.ts`, `ssh/SshTunnelClient.ts`, `tauri/TauriLocalClient.ts`
- Modify: `packages/client/src/composables/useWebSocket.ts`
- Create: `packages/client/src/composables/useRepoWatch.ts`
- Modify: `packages/client/src/ui/components/AppLayout.vue`
- Create: `packages/e2e/tests/14-live-refresh.spec.ts`

**Interfaces:**
- Produces: `ITransportClient.onEvent?(cb: (event: IWsEvent) => void): void`; `useRepoWatch().start()` / `.stop()`.

- [ ] **Step 1: Surface events from the transport**

In `ITransportClient.ts` add the optional method:

```ts
	onEvent?(callback: (event: IWsEvent) => void): void
```

In `WebSocketClient`, hold a callback and dispatch matching frames to it, immediately after the auth branch in `onmessage`:

```ts
			if (isRepoChangedEvent(data)) {
				this.eventCallback?.(data);

				return;
			}
```

with the field and setter:

```ts
	private eventCallback?: (event: IWsEvent) => void;

	onEvent(callback: (event: IWsEvent) => void): void {
		this.eventCallback = callback;
	}
```

`SshTunnelClient` forwards to its inner `WebSocketClient`. `TauriLocalClient` has no socket and leaves `onEvent` undefined.

- [ ] **Step 2: Write the composable**

Create `packages/client/src/composables/useRepoWatch.ts`:

```ts
import {useWebSocket} from './useWebSocket';
import {useProject} from './useProject';
import {useCommits} from './useCommits';
import {useBranches} from './useBranches';
import {useWorkingTree} from './useWorkingTree';
import {ENetworkCommand} from '@/domain';

const REFRESH_DEBOUNCE_MS = 250;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let started = false;

export function useRepoWatch() {
	const
		{call, onEvent} = useWebSocket(),
		{currentProject} = useProject(),
		{loadCommits} = useCommits(),
		{loadBranches} = useBranches(),
		{loadStatus} = useWorkingTree();

	// The server already debounces filesystem noise; this second, shorter debounce keeps a
	// burst of events from queueing several full refreshes behind each other.
	function scheduleRefresh(): void {
		clearTimeout(refreshTimer);

		refreshTimer = setTimeout(() => {
			void Promise.all([loadCommits(), loadBranches(), loadStatus()]);
		}, REFRESH_DEBOUNCE_MS);
	}

	async function start(): Promise<void> {
		if (!currentProject.value) {
			return;
		}

		if (!started) {
			onEvent(scheduleRefresh);
			started = true;
		}

		try {
			await call(ENetworkCommand.WatchRepo, {repo_path: currentProject.value.path});
		}
		catch {
			// A backend without watch support (or a transport with no socket) simply does
			// not push events; the window-focus refresh remains the fallback.
		}
	}

	function stop(): void {
		clearTimeout(refreshTimer);
	}

	return {start, stop};
}
```

`useWebSocket` needs to expose `onEvent`, forwarding to the active client when it implements it:

```ts
	function onEvent(callback: (event: IWsEvent) => void): void {
		client.value?.onEvent?.(callback);
	}
```

- [ ] **Step 2b: Start watching when a project opens**

`AppLayout.vue` already opens the last project in `onMounted` (line 241-242) and has an `onUnmounted`
block (line 295). Add the watch alongside them, and re-watch whenever the project changes:

```ts
const {start: startRepoWatch, stop: stopRepoWatch} = useRepoWatch();

watch(currentProject, project => {
	if (project) {
		void startRepoWatch();
	}
	else {
		stopRepoWatch();
	}
}, {immediate: true});
```

Add `stopRepoWatch()` to the existing `onUnmounted` block. Keep the `useWindowFocus` refresh exactly as
it is — the spec keeps it as the fallback for backends and transports that push no events.

- [ ] **Step 3: Write the e2e test that could not exist before**

Create `packages/e2e/tests/14-live-refresh.spec.ts`:

```ts
import {test, expect} from '../fixtures/test';
import {waitForRepoLoaded, waitForCommitRow} from '../fixtures/ui';

test('an external commit appears without reloading the page', async ({page, repo, openRepo}) => {
	repo.commit('Initial', {'README.md': '# repo\n'});

	await openRepo(page, repo.path);
	await waitForRepoLoaded(page);
	await waitForCommitRow(page, 'Initial');

	// Commit from outside the application entirely. No page.reload() below — that is the
	// whole point of this test.
	repo.commit('Made outside the app', {'outside.txt': 'hello\n'});

	await expect(page.locator('.commit-row__message', {hasText: 'Made outside the app'}))
		.toBeVisible({timeout: 15_000});
});
```

- [ ] **Step 4: Verify**

Run: `yarn verify`
Expected: exit 0.

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`
Expected: **13 passed / 3 failed**. The new `14-live-refresh` must pass without any reload; if it only passes when you add one, the watcher is not reaching the client and the task is not done.

- [ ] **Step 5: Commit**

```bash
git add packages/client packages/e2e/tests/14-live-refresh.spec.ts
git commit -m "feat(client): refresh the open repository from server events"
```

---

## Task 9: Reconnect

**Files:**
- Modify: `packages/client/src/infrastructure/websocket/WebSocketClient.ts`
- Create: `packages/client/src/infrastructure/backoff.ts`, `packages/client/src/infrastructure/backoff.spec.ts`
- Modify: `packages/client/src/composables/useConnectionStatus.ts`
- Modify: `packages/client/src/infrastructure/ssh/SshConnectionPool.ts`

**Interfaces:**
- Produces: `nextBackoffDelay(attempt: number, random?: () => number): number` — 500 ms doubling to an 8 s cap, with jitter.

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/infrastructure/backoff.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {nextBackoffDelay} from './backoff';

describe('nextBackoffDelay', () => {
	// random() is injected so the schedule is assertable; 0.5 means "no jitter offset".
	const noJitter = () => 0.5;

	it('starts at 500ms', () => {
		expect(nextBackoffDelay(0, noJitter)).toBe(500);
	});

	it('doubles each attempt', () => {
		expect(nextBackoffDelay(1, noJitter)).toBe(1_000);
		expect(nextBackoffDelay(2, noJitter)).toBe(2_000);
		expect(nextBackoffDelay(3, noJitter)).toBe(4_000);
	});

	it('caps at 8s', () => {
		expect(nextBackoffDelay(4, noJitter)).toBe(8_000);
		expect(nextBackoffDelay(10, noJitter)).toBe(8_000);
		expect(nextBackoffDelay(100, noJitter)).toBe(8_000);
	});

	it('applies jitter within +/-25% of the base delay', () => {
		expect(nextBackoffDelay(0, () => 0)).toBe(375);
		expect(nextBackoffDelay(0, () => 1)).toBe(625);
	});

	it('never returns a negative delay', () => {
		expect(nextBackoffDelay(0, () => 0)).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn test`
Expected: FAIL — cannot resolve `./backoff`.

- [ ] **Step 3: Write it**

Create `packages/client/src/infrastructure/backoff.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn test`
Expected: PASS.

- [ ] **Step 5: Reconnect in `WebSocketClient`**

The constructor's socket setup moves into a private `open()` method so it can run again. Add:

```ts
	private attempt = 0;
	private closedByUser = false;
	private readonly url: string;
```

`close()` sets `this.closedByUser = true` before closing. `onclose` schedules a retry unless the user closed it:

```ts
		this.ws.onclose = () => {
			this.connected = false;
			this.pending.forEach(({reject}) => reject(new Error('WebSocket connection closed')));
			this.pending.clear();

			if (this.closedByUser) {
				return;
			}

			// In-flight requests are deliberately NOT retried: replaying a git command
			// risks applying it twice. They reject above; the socket alone comes back.
			setTimeout(() => this.open(), nextBackoffDelay(this.attempt++));
		};
```

`open()` resets `this.attempt = 0` once the server accepts the auth frame, and re-issues `watchRepo` by invoking a `onReconnect` callback the client sets. Add:

```ts
	private reconnectCallback?: () => void;

	onReconnect(callback: () => void): void {
		this.reconnectCallback = callback;
	}
```

and call `this.reconnectCallback?.()` in the auth-success branch, but only when `this.attempt > 0` (a first connect is not a reconnect).

`onReconnect` must also be declared on the interface, beside `onEvent` from Task 8, or `useWebSocket`
cannot reach it through the `ITransportClient` type:

```ts
	onReconnect?(callback: () => void): void
```

`SshTunnelClient` forwards it to its inner `WebSocketClient`; `TauriLocalClient` leaves it undefined.

- [ ] **Step 6: Re-watch after a reconnect**

In `useRepoWatch().start()`, register the reconnect hook so the watch is re-established:

```ts
		onReconnect(() => {
			void start();
		});
```

exposing `onReconnect` from `useWebSocket` the same way `onEvent` is.

- [ ] **Step 7: Drop a dead SSH tunnel from the pool**

In `SshConnectionPool`, set the pooled client's `onDead` handler to remove that entry, so the next `connect` re-provisions the tunnel rather than reusing a corpse.

- [ ] **Step 8: Verify, including a real server restart**

Run: `yarn verify && yarn test:e2e 2>&1 | grep -E "passed|failed"`
Expected: verify exits 0; e2e 13 passed / 3 failed.

Then prove reconnect by hand, because no automated test covers it:

```bash
yarn dev &
# Open http://localhost:5173, open a project, confirm the commit list loads.
# Then, in another shell:
pkill -f "git-yak/server" || pkill -f "packages/server/src/index.ts"
# Wait ~2s, restart it:
yarn workspace @git-yak/server dev &
```

Expected: the UI reports the disconnect and then recovers on its own within a few seconds — no page reload, no reopening the project. Record what you observed in your report; if it does not recover, the task is not done.

- [ ] **Step 9: Commit**

```bash
git add packages/client
git commit -m "feat(client): reconnect with backoff, re-auth and re-watch"
```

---

## Done when

- `yarn verify` exits 0.
- `yarn test:e2e` reports **13 passed / 3 failed** — the original 10, plus `13-auth-required` (2 tests) and `14-live-refresh`, minus nothing. The three failures remain the stale phase-3 specs.
- A connection to the Bun server without a valid token is refused: proven by `13-auth-required`.
- `git -c …` sent through `gitCall` is refused, while interactive rebase still works: proven by `10-rebase-onto-remote` passing alongside the filter.
- `grep -rn "'-c'" packages/client/src/composables/useGit.ts` returns nothing.
- Editing a file outside the application refreshes the UI with no reload: proven by `14-live-refresh`.
- Killing and restarting the Bun server under an open project recovers on its own: proven by hand in Task 9.
