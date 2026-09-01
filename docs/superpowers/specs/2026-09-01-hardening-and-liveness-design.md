# Hardening & Liveness — Design

**Date:** 2026-09-01
**Status:** Approved, ready for planning

## Goal

Close a remote-code-execution hole in the web-mode server, make open repositories refresh
themselves instead of waiting for a window focus, survive a dropped socket, and put the
project on a verification floor (lint + unit tests) it does not have today.

The work is split into three phases. Each phase leaves the repository green and committable
on its own; later phases depend on earlier ones, never the reverse.

## Context — what is true today

- `packages/server` (Bun) has **no authentication and no origin check**, and Bun binds all
  interfaces by default. `GitCall.ts` accepts an arbitrary `repo_path` plus an arbitrary
  `args` array, so any process on the network — or any web page the user opens, since
  `ws://localhost:3000` is reachable cross-origin — can run
  `git -c alias.x='!sh -c "…"' x` as the user.
- The Rust worker binds `127.0.0.1` (`main.rs:29`) and is only reachable through the SSH
  tunnel, so it is not exposed the same way.
- Repository state refreshes on window focus (`useWindowFocus`) or explicit user action.
  The e2e suite calls `page.reload()` after touching the filesystem because nothing else
  picks the change up.
- `WebSocketClient.onclose` (`WebSocketClient.ts:49`) rejects in-flight requests and stops.
  There is no reconnect, so a laptop sleep or a server restart requires closing and
  reopening the project.
- `ENetworkCommand` and the message shape are declared three times: `server/src/types.ts`,
  `client/src/domain/enums/index.ts`, and the Rust `commands::dispatch` match.
- `REMOTE_WORKER_VERSION = '2.0.0'` (`SshTunnelClient.ts:11`) and `version = "2.0.0"`
  (`remote-worker-rs/Cargo.toml`) are maintained by hand. When they diverge the client
  silently keeps an outdated binary on the remote host.
- `packages/remote-worker` (Bun/TypeScript) is dead code, superseded by
  `packages/remote-worker-rs`, but is still a workspace member and is still named in the
  error message at `SshTunnelClient.ts:104`.
- There is no ESLint, no Prettier, and no unit test runner. Indentation is already
  inconsistent: most files use tabs, `useTheme.ts`, `themeExpressionEvaluator.ts` and
  `themeTokenMap.ts` use four spaces.
- Three e2e tests fail on `master`: `01-amend-push`, `02-stash-conflict`,
  `04-multi-select-squash`. They are **stale, not a regression** — the
  `2026-05-04-commit-autoselect-monaco-close` change made the first real commit the initial
  selection (`CommitHistory.vue:309`), and `StagingPanel` only renders while the working
  tree is selected (`AppLayout.vue:39`), so `amend-checkbox` and `unstaged-file` are absent
  from the DOM.
- Interactive rebase legitimately sends `-c` flags from the client
  (`useGit.ts:300-302`: `-c sequence.editor=cp '<todo path>'`). This is the same shape as
  the injection this design blocks, so the flag filter cannot simply blacklist `-c` without
  first moving that flow server-side.

## Phase 1 — Foundations

Nothing user-visible. Establishes the shared vocabulary and the verification floor that
phases 2 and 3 are written against.

### Shared protocol package

New workspace member `packages/protocol`, published to the workspace as
`@git-yak/protocol`. Plain TypeScript with no build step — Vite consumes it through an
alias, Bun executes TypeScript directly.

It owns:

- `ENetworkCommand`
- the request envelope (`requestId`, `command`, payload)
- the response envelope (`status: 'success' | 'error'`, `data`, `message`)
- the message shapes phase 2 adds (`auth`, `event`)
- type guards for discriminating server → client frames

`client/src/domain/enums/index.ts` re-exports `ENetworkCommand` from the package rather
than declaring it, so no import site in the client changes. `server/src/types.ts` is
deleted and the server imports the package directly.

The Rust worker cannot consume TypeScript. Rather than generating Rust from TS, a script
`scripts/check-protocol-parity.ts` extracts the command strings from the Rust dispatch and
compares them against the TypeScript enum, failing when the two drift. It runs as part of
`yarn verify`.

### Worker version from one source

`vite.config.ts` reads `version` from `packages/remote-worker-rs/Cargo.toml` and exposes it
as `__REMOTE_WORKER_VERSION__`. `SshTunnelClient.ts` uses that global and drops its own
constant.

### Lint

ESLint flat config at the repository root, using `typescript-eslint`, `eslint-plugin-vue`
and `@stylistic/eslint-plugin`. **Prettier is deliberately not used** — two formatters
disagree with each other, and `@stylistic` covers the formatting rules this repository
needs on its own.

Rules follow the existing dominant style: tabs, single quotes, semicolons, no inner spaces
in `{foo}`, `catch` on its own line. `@typescript-eslint/naming-convention` enforces the
`I` prefix on interfaces and the `E` prefix on enums. A single `--fix` pass normalises the
three space-indented files.

Scope: `packages/*/src` plus `packages/e2e`.

### Unit tests

`vitest` in the client workspace, reusing the Vite aliases, with `include` restricted to
`packages/client/src/**/*.spec.ts` so it never picks up the Playwright specs. Tests live
next to the code they cover.

No tests are written in this phase beyond a smoke test proving the runner works; the real
unit tests belong to phase 3, which is where the code they cover is touched.

### Cleanup

- Delete `packages/remote-worker` and remove it from the workspace. Update the error
  message at `SshTunnelClient.ts:104` to name `yarn build:remote-worker`.
- Delete the empty `packages/client/src/application/useCases/` placeholder.
- Move the theme validator from scratch into `packages/client/scripts/check-themes.ts`.

### Verification

A root `yarn verify` script chains typecheck, lint, unit tests, protocol parity and the
theme check. Phase 1 is done when `yarn verify` is green and the e2e suite is unchanged at
10 passed / 3 failed — those three are phase 3's problem.

## Phase 2 — Connection

### Protocol additions

Two new frame types, declared in `@git-yak/protocol`:

```jsonc
// client → server, must be the first frame on a new socket
{"type": "auth", "token": "…"}

// server → client, unsolicited, no requestId
{"type": "event", "event": "repoChanged", "paths": ["…"]}
```

The existing `hello` frame and the request/response envelopes are unchanged, so the
addition is backward compatible in shape — but not in policy, since an unauthenticated
socket is now refused.

### Authentication and binding

On startup the Bun server resolves its token in this order: `GITYAK_TOKEN`, then
`~/.git-yak/server-token`, then a freshly generated 32-byte hex value written to that path
with mode `0600`.

It binds `127.0.0.1` unless `GITYAK_HOST` says otherwise.

At upgrade time it checks `Origin`: absent means a native client and is allowed; present
and not on the allowlist is rejected with 403. The allowlist defaults to the Vite dev
origin and the Tauri origin, and is overridable through `GITYAK_ALLOWED_ORIGINS`.

After upgrade the socket is unauthenticated. The first frame must be `auth` carrying a
token that matches; anything else, or five seconds of silence, closes the socket. Commands
sent before authentication get an error response and a close.

The client obtains the token differently per mode, because a browser cannot read a file
from the user's home directory:

| Mode | Source |
|---|---|
| Tauri desktop | reads `~/.git-yak/server-token` through the existing `read_file_at` command |
| Web, dev server | Vite dev-only plugin reads the file at startup and injects it via `define` — guarded on `command === 'serve'` so it never reaches a production bundle |
| Web production, or a deliberately network-exposed server | a new optional `IProject.token` field the user fills in, alongside the host and port they already enter |

The Rust worker keeps its current posture: loopback bind, reachable only through the
tunnel, no token. Adding one there would protect against nothing the tunnel does not
already protect against.

### Flag filtering, and the rebase move that enables it

`gitCall` rejects `-c`, `-C`, `--exec-path`, `--git-dir`, `--work-tree`, `--upload-pack`,
`--receive-pack` and `--namespace` outright, in both backends.

That is only possible after interactive rebase stops sending `-c` itself. A dedicated
`rebaseInteractive` command is added: the client passes the todo content and the operation
it wants, and the **server** constructs the `-c core.editor=false`,
`-c rebase.missingCommitsCheck=ignore` and `-c sequence.editor=cp '<path>'` flags from a
path it has validated to sit inside the repository. `useGit.ts:295-310` and `useRebase`
move over to it.

This is the one place in the design where an existing feature's mechanism changes. The
boundary it buys is worth it: the client asks for an operation, and the server decides
which flags implement it, so no client-supplied string can reach `git -c` again.

### File watching

Two new commands, `watchRepo` and `unwatchRepo`. The client calls `watchRepo` after
connecting. Making it explicit — rather than inferring the repository from the `repo_path`
on each request — keeps the lifecycle testable and the teardown unambiguous.

Each backend watches `.git` recursively (a small tree that captures commit, checkout,
fetch and rebase) plus the repository root, coalesces events over a 300 ms debounce, and
emits a single `repoChanged` frame carrying the affected paths.

Bun uses `fs.watch`; the Rust worker uses the `notify` crate. In axum this requires
splitting the socket into a sink and a stream joined by `tokio::select!`, because the
current `while socket.next()` loop in `server.rs` has no way to send an unsolicited frame.

**Known limitation:** `fs.watch` with `recursive: true` is unsupported on Linux in
Node and Bun. The Rust worker is unaffected (`notify` handles it), and the Bun server is
primarily a local, macOS-side process here — but on a Linux Bun server the watch degrades
to `.git` plus a non-recursive repository root, so edits inside working-tree subdirectories
will not raise an event there.

On the client, `useWebSocket` gains `onEvent`, and a new `useRepoWatch` composable
subscribes to it and runs a debounced refresh of commits, status and branches.
`useWindowFocus` stays as a fallback rather than being removed.

### Reconnect

`WebSocketClient` reconnects after an unintentional close, backing off from 500 ms to a
cap of 8 s with jitter. On success it re-authenticates and re-issues `watchRepo`.

Requests that were in flight when the socket dropped are **not** retried — a blind retry of
a git command risks applying an operation twice — so they keep today's behaviour and
reject. Connection state feeds `useConnectionStatus` so the toolbar can show a
reconnecting indicator next to the location badge added in `a5e5e4e`.

For SSH, `SshTunnelClient` already heartbeats and exposes `onDead`; that gets wired to drop
the pooled entry so the next connect re-provisions the tunnel.

### Verification

- Unit tests for the backoff schedule and for the auth gate's queueing behaviour, against a
  fake socket.
- An e2e test asserting a connection without a valid token is refused.
- An e2e test that writes a file on disk and expects the UI to update **without**
  `page.reload()` — the behaviour no current test can express.

## Phase 3 — Debt

### Stale e2e tests

`01-amend-push`, `02-stash-conflict` and `04-multi-select-squash` each click
`commit-row-working-tree` before touching the commit form, matching the auto-select
behaviour introduced in May. No application change.

### Unit tests

Covering `themeExpressionEvaluator` (each of `fade`, `lighten`, `darken`, `mixLess`,
reference resolution, dependency cycles), `parseGitError`, `projectSearch` and
`graphColors`. The two theme bugs found on 2026-08-31 — trailing commas defeating
`parseJsonc`, and an `@rgba(…)` typo — are the motivating examples.

### Cross-scope theme references

`resolveScope` resolves each scope in isolation, so `@ltblue` in `light-color-blind`'s
`toolbar` scope and `@.base03` in `1984-theme`'s survive into the CSS as literal text.
Resolution takes the root scope as its base so scope overrides can reference root tokens.
This changes rendered output for those two themes, which is why it lands behind the unit
tests above.

### Splitting `useContextMenu`

499 lines holding every context menu in the application. Split by domain into
`useBranchMenu`, `useCommitMenu`, `useFileMenu` and `useStashMenu`, with `useContextMenu`
kept as a thin façade so call sites do not change. The `.vue` components are explicitly out
of scope.

## Out of scope

- Moving `sshPrivateKey` out of `localStorage` into an OS keychain. Real, and worth doing,
  but it is a Tauri-plugin question independent of everything here.
- Exporting and importing project configuration.
- Bundling `themes/` as a Tauri resource so a fresh install has themes.
- Splitting any `.vue` component.

## Acceptance

1. `yarn verify` passes: typecheck, lint, unit tests, protocol parity, theme validation.
2. The full e2e suite passes — the 13 existing tests, including the three fixed in phase 3,
   plus the two added in phase 2.
3. A connection to the Bun server without a valid token is refused.
4. `git -c …` sent through `gitCall` is refused, while interactive rebase still works
   through `rebaseInteractive`.
5. Editing a file outside the application refreshes the UI without a reload, for both a
   local repository and one opened over SSH.
6. Killing and restarting the Bun server under an open project reconnects on its own.
