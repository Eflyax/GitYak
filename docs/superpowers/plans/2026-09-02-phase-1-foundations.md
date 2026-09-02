# Phase 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repository a single source of truth for the wire protocol and the remote-worker version, plus the lint and unit-test floor that phases 2 and 3 are written against.

**Architecture:** A new `packages/protocol` workspace package owns `ENetworkCommand` and the request/response envelopes; the client re-exports from it so no import site changes, and the Bun server imports it directly. Because the Rust worker cannot consume TypeScript, a parity script compares its dispatch arms against the enum instead of generating code. ESLint with `@stylistic` lands before any of phase 2's new code is written.

**Tech Stack:** Yarn 4 workspaces, TypeScript 5.7, Bun, Vite 7, Vue 3, ESLint 9 flat config, `@stylistic/eslint-plugin`, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-09-01-hardening-and-liveness-design.md`

## Global Constraints

- Indentation is **tabs**, not spaces. Single quotes. Semicolons. No inner spaces in `{foo}`. `catch` starts on its own line (Stroustrup brace style).
- Interfaces are prefixed `I`, enums are prefixed `E`.
- Prettier is deliberately **not** used — `@stylistic` is the only formatter.
- `packages/protocol` has **no build step**. It is consumed as TypeScript source.
- Vitest is configured **once, at the repository root**, and its `include` names `packages/client/src`, `packages/protocol/src` and `scripts` explicitly. It must never glob `packages/e2e/tests/`, whose specs are Playwright's and will hang or fail under Vitest.
- The `auth` and `event` message shapes belong to `@git-yak/protocol` but are **added in phase 2**, when they acquire a consumer. Do not declare them here.
- `bun` is not on the global PATH. It resolves inside Yarn scripts because Yarn puts `node_modules/.bin` on PATH — so always invoke it from a package script, never from a bare shell.
- The e2e suite is expected to finish this phase unchanged at **10 passed / 3 failed**. Those three failures are stale tests and belong to phase 3. Do not fix them here.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Delete | `packages/remote-worker/` | Dead Bun worker, superseded by `remote-worker-rs` |
| Delete | `packages/client/src/application/useCases/` | Empty placeholder |
| Delete | `packages/server/src/types.ts` | Absorbed by `@git-yak/protocol` |
| Create | `packages/client/scripts/check-themes.ts` | Validates every theme parses and resolves |
| Create | `eslint.config.js` | Flat ESLint config for the whole repository |
| Create | `packages/protocol/package.json` | Workspace manifest for the shared protocol |
| Create | `packages/protocol/src/index.ts` | `ENetworkCommand` + request/response envelopes |
| Create | `packages/protocol/src/index.spec.ts` | Locks the enum's wire values |
| Create | `vitest.config.ts` | Unit-test runner config, repository-wide |
| Create | `scripts/check-protocol-parity.ts` | Fails when the Rust dispatch and the TS enum drift |
| Create | `scripts/protocolParity.ts` | Pure extraction/compare helpers, unit-testable |
| Create | `packages/client/src/infrastructure/cargoVersion.ts` | Parses `version` out of a Cargo.toml string |
| Modify | `packages/client/src/domain/enums/index.ts` | Re-export `ENetworkCommand` instead of declaring it |
| Modify | `packages/client/vite.config.ts` | Alias for the protocol package, `__REMOTE_WORKER_VERSION__` define |
| Modify | `packages/client/src/infrastructure/ssh/SshTunnelClient.ts:11,104` | Use the injected version; fix the stale build hint |
| Modify | `package.json` | Workspace list, `verify` script, lint devDependencies |

---

## Task 1: Remove dead code and adopt the theme checker

Deletes the superseded Bun worker and the empty placeholder directory, and promotes the throwaway theme validator into a script the repository actually runs.

**Files:**
- Delete: `packages/remote-worker/` (whole directory)
- Delete: `packages/client/src/application/useCases/`
- Create: `packages/client/scripts/check-themes.ts`
- Modify: `packages/client/package.json`
- Modify: `packages/client/src/infrastructure/ssh/SshTunnelClient.ts:104`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `yarn workspace @git-yak/client check:themes` — exits 0 when every theme in `themes/` parses and resolves, non-zero otherwise.

- [ ] **Step 1: Write the theme checker at its new home**

Create `packages/client/scripts/check-themes.ts`. Note it resolves `themes/` relative to its own location, so it works regardless of the current working directory:

```ts
import {readdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseJsonc, resolveScope} from '../src/infrastructure/themeExpressionEvaluator';

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	themesDir = join(scriptDir, '..', '..', '..', 'themes');

interface IThemeFile {
	meta?: {name?: string; scheme?: string};
	themeValues?: Record<string, Record<string, string>>;
}

const
	files = readdirSync(themesDir).filter(f => f.endsWith('.jsonc')),
	parsed = new Map<string, IThemeFile>();

let failures = 0;

function fail(message: string): void {
	console.log(`  FAIL ${message}`);
	failures++;
}

for (const file of files) {
	const raw = readFileSync(join(themesDir, file), 'utf8');

	let theme: IThemeFile;

	try {
		theme = parseJsonc(raw) as IThemeFile;
	}
	catch (e: unknown) {
		fail(`${file}: does not parse — ${e instanceof Error ? e.message : String(e)}`);
		continue;
	}

	if (!theme.meta?.name || !theme.meta?.scheme) {
		fail(`${file}: missing meta.name / meta.scheme`);
	}

	parsed.set(file, theme);
}

for (const [file, theme] of parsed) {
	for (const [scope, tokens] of Object.entries(theme.themeValues ?? {})) {
		const resolved = resolveScope(tokens);

		for (const [key, value] of Object.entries(resolved)) {
			if (value.startsWith('@')) {
				fail(`${file} [${scope}] ${key}: unresolved reference "${value}"`);
			}

			if (/^(fade|lighten|darken|mixLess)\(/.test(value)) {
				fail(`${file} [${scope}] ${key}: unevaluated expression "${value}"`);
			}
		}
	}
}

console.log(`\nthemes checked: ${parsed.size}`);
console.log(failures === 0 ? 'OK — all checks passed' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 2: Add the script entry**

In `packages/client/package.json`, add to `scripts`:

```json
"check:themes": "bun run scripts/check-themes.ts"
```

- [ ] **Step 3: Run it and confirm the known pre-existing failures**

Run: `yarn workspace @git-yak/client check:themes`

Expected: **exit code 1**. Two themes still carry cross-scope references that `resolveScope` cannot see — `1984-theme.jsonc` reports `@.secondary` / `@.base1` / `@.base03` / `@.cyan`, and `light-color-blind.jsonc` reports `@ltblue`, all in their `toolbar` and `tabsbar` scopes. This is the real bug that phase 3 fixes in `resolveScope`; do not change the themes and do not change the evaluator here.

- [ ] **Step 4: Make the checker tolerate the known failures until phase 3**

The script must not block `yarn verify` for a bug scheduled in a later phase. Add a scoped exception directly under the `interface IThemeFile` block:

```ts
// Cross-scope references cannot resolve today: resolveScope() handles each scope in
// isolation, so a toolbar/tabsbar token cannot see a root token. Fixed in phase 3;
// until then these two files are reported but do not fail the run.
const KNOWN_CROSS_SCOPE_GAPS = new Set(['1984-theme.jsonc', 'light-color-blind.jsonc']);
```

Then change the reporting loop so a cross-scope miss in those two files is informational. Replace the `for (const [file, theme] of parsed)` block's inner unresolved-reference branch with:

```ts
			if (value.startsWith('@')) {
				if (scope !== 'root' && KNOWN_CROSS_SCOPE_GAPS.has(file)) {
					console.log(`  known-gap ${file} [${scope}] ${key}: "${value}"`);
				}
				else {
					fail(`${file} [${scope}] ${key}: unresolved reference "${value}"`);
				}
			}
```

- [ ] **Step 5: Run it again and confirm it now passes**

Run: `yarn workspace @git-yak/client check:themes`

Expected: exit code 0, `OK — all checks passed`, with `known-gap` lines listed for the two themes.

- [ ] **Step 6: Delete the dead worker and the empty placeholder**

```bash
git rm -r packages/remote-worker
git rm -r packages/client/src/application/useCases
```

- [ ] **Step 7: Fix the build hint that named the deleted package**

In `packages/client/src/infrastructure/ssh/SshTunnelClient.ts:104`, the thrown error tells the user to run a script that no longer exists. Replace:

```ts
				throw new Error(`Binary not executable on remote (arch: ${archInfo.trim()}). Build the correct binary with: yarn workspace @git-yak/remote-worker build:linux`);
```

with:

```ts
				throw new Error(`Binary not executable on remote (arch: ${archInfo.trim()}). Build the correct binary with: yarn build:remote-worker`);
```

- [ ] **Step 8: Confirm nothing else referenced the deleted package**

Run: `grep -rn "@git-yak/remote-worker" --include=*.ts --include=*.json --include=*.vue . | grep -v node_modules`

Expected: no output. If `package.json`'s `build:remote-worker` script matches, that is a false positive — it references `packages/remote-worker/dist`, which is the **output** directory the Rust build copies into and must stay.

- [ ] **Step 9: Verify the workspace still installs and typechecks**

Run: `yarn install && yarn workspace @git-yak/client typecheck`

Expected: install succeeds, typecheck produces no output.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: drop dead Bun worker, adopt theme checker as a script"
```

---

## Task 2: ESLint with @stylistic

Lands the formatter before phase 2 writes new code, and normalises the three space-indented files.

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `yarn lint` (check) and `yarn lint:fix` (autofix) at the repository root.

- [ ] **Step 1: Install the tooling**

```bash
yarn add -D -W eslint@^9 typescript-eslint@^8 eslint-plugin-vue@^9 @stylistic/eslint-plugin@^2 globals@^15
```

- [ ] **Step 2: Write the flat config**

Create `eslint.config.js` at the repository root. The root `package.json` has `"type": "module"`, so this file is ESM:

```js
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';

export default tseslint.config(
	{
		ignores: [
			'**/node_modules/**',
			'**/dist/**',
			'**/target/**',
			'packages/client/src-tauri/**',
			'packages/e2e/test-results/**',
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...vue.configs['flat/recommended'],
	{
		languageOptions: {
			globals: {...globals.browser, ...globals.node},
			parserOptions: {
				parser: tseslint.parser,
				ecmaVersion: 2022,
				sourceType: 'module',
			},
		},
		plugins: {'@stylistic': stylistic},
		rules: {
			'@stylistic/indent': ['error', 'tab'],
			'@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
			'@stylistic/semi': ['error', 'always'],
			'@stylistic/object-curly-spacing': ['error', 'never'],
			'@stylistic/brace-style': ['error', 'stroustrup', {allowSingleLine: true}],
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'@stylistic/eol-last': ['error', 'always'],
			'@stylistic/no-trailing-spaces': 'error',
			'@typescript-eslint/naming-convention': [
				'error',
				{selector: 'interface', format: ['PascalCase'], prefix: ['I']},
				{selector: 'enum', format: ['PascalCase'], prefix: ['E']},
			],
			'@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
			'vue/multi-word-component-names': 'off',
			'vue/html-indent': ['error', 'tab'],
		},
	},
	{
		// Vue SFC indentation is governed by vue/html-indent; the base rule fights it.
		files: ['**/*.vue'],
		rules: {'@stylistic/indent': 'off'},
	},
);
```

- [ ] **Step 3: Add the scripts**

In the root `package.json`, add to `scripts`:

```json
"lint": "eslint packages/*/src packages/e2e eslint.config.js",
"lint:fix": "eslint --fix packages/*/src packages/e2e eslint.config.js"
```

- [ ] **Step 4: Run the check and record the starting damage**

Run: `yarn lint 2>&1 | tail -5`

Expected: a large error count. `useTheme.ts`, `themeExpressionEvaluator.ts` and `themeTokenMap.ts` are indented with four spaces and will dominate it.

- [ ] **Step 5: Autofix**

Run: `yarn lint:fix`

- [ ] **Step 6: Triage whatever autofix could not repair**

Run: `yarn lint 2>&1 | tail -40`

Fix the remaining errors by hand. If a rule turns out to be violated pervasively in a way that is not worth changing by hand in this task — the likely candidates are `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` on Vue prop destructuring — do **not** delete the rule. Downgrade it to `'warn'` in `eslint.config.js` with a comment naming why, so the debt stays visible:

```js
			// Downgraded 2026-09-02: pre-existing violations across the client, not
			// worth a mass edit inside this task. Tighten to 'error' once cleared.
			'@typescript-eslint/no-explicit-any': 'warn',
```

- [ ] **Step 7: Confirm lint is clean and nothing broke**

Run: `yarn lint && yarn workspace @git-yak/client typecheck`

Expected: lint exits 0 with no errors (warnings are acceptable), typecheck produces no output.

- [ ] **Step 8: Confirm the reformat did not change behaviour**

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`

Expected: `10 passed`, `3 failed` — the same three stale specs as before this task. Any different number means the reformat broke something; bisect the `lint:fix` diff before continuing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: add ESLint with @stylistic, normalise formatting"
```

---

## Task 3: Shared protocol package

Makes one file the source of truth for the command vocabulary, and brings up Vitest, whose first real test is this package's.

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/index.spec.ts`
- Create: `vitest.config.ts`
- Delete: `packages/server/src/types.ts`
- Modify: `package.json` (workspace list)
- Modify: `packages/client/package.json`, `packages/client/tsconfig.json`, `packages/client/vite.config.ts`
- Modify: `packages/client/src/domain/enums/index.ts`
- Modify: `packages/server/src/index.ts` and all five files under `packages/server/src/commands/`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ENetworkCommand` — enum with members `GitCall = 'gitCall'`, `WriteFile = 'writeFile'`, `ReadFile = 'readFile'`, `BrowseFiles = 'browseFiles'`, `SshAgentInit = 'sshAgentInit'`, `Heartbeat = 'heartbeat'`
  - `IWsRequest` — `{requestId: string; command: string; [key: string]: unknown}`
  - `IWsSuccessResponse` — `{requestId: string; status: 'success'; data?: unknown}`
  - `IWsErrorResponse` — `{requestId?: string; status: 'error'; message: string; details?: string}`
  - `IWsResponse` — union of the two above
  - `isErrorResponse(value: IWsResponse): value is IWsErrorResponse`
  - `yarn test` — runs Vitest once, across the client, the protocol package and `scripts/`, and exits

Note: the type alias `IWsMessage` used by the server today is renamed `IWsRequest`. Every server import site is updated in step 8.

- [ ] **Step 1: Write the failing test**

Create `packages/protocol/src/index.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {ENetworkCommand, isErrorResponse} from './index';

describe('ENetworkCommand', () => {
	it('pins the wire values the Rust worker matches on', () => {
		expect(ENetworkCommand.GitCall).toBe('gitCall');
		expect(ENetworkCommand.ReadFile).toBe('readFile');
		expect(ENetworkCommand.WriteFile).toBe('writeFile');
		expect(ENetworkCommand.BrowseFiles).toBe('browseFiles');
		expect(ENetworkCommand.Heartbeat).toBe('heartbeat');
		expect(ENetworkCommand.SshAgentInit).toBe('sshAgentInit');
	});
});

describe('isErrorResponse', () => {
	it('narrows an error frame', () => {
		expect(isErrorResponse({requestId: '1', status: 'error', message: 'nope'})).toBe(true);
	});

	it('rejects a success frame', () => {
		expect(isErrorResponse({requestId: '1', status: 'success'})).toBe(false);
	});
});
```

- [ ] **Step 2: Create the package manifest**

Create `packages/protocol/package.json`:

```json
{
	"name": "@git-yak/protocol",
	"version": "1.0.0",
	"private": true,
	"type": "module",
	"main": "src/index.ts",
	"exports": {
		".": "./src/index.ts"
	}
}
```

The root `package.json` already globs `packages/*`, so no change to `workspaces` is needed — but run `yarn install` so the symlink appears in `node_modules`.

- [ ] **Step 3: Set up Vitest at the repository root**

The unit tests in this phase live in three places — `packages/client/src`, `packages/protocol/src` and `scripts/` — so a single root-level config is simpler than a client-scoped one globbing its way out with `../`.

Create `vitest.config.ts` at the repository root:

```ts
import {defineConfig} from 'vitest/config';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const
	currentDir = dirname(fileURLToPath(new URL(import.meta.url))),
	clientSrc = join(currentDir, 'packages', 'client', 'src');

export default defineConfig({
	resolve: {
		alias: {
			'@': clientSrc,
			'@git-yak/protocol': join(currentDir, 'packages', 'protocol', 'src', 'index.ts'),
		},
	},
	test: {
		environment: 'node',
		include: [
			'packages/client/src/**/*.spec.ts',
			'packages/protocol/src/**/*.spec.ts',
			'scripts/**/*.spec.ts',
		],
	},
});
```

The `include` list deliberately does not mention `packages/e2e` — those are Playwright specs and must never be collected here.

Install it and add the scripts:

```bash
yarn add -D -W vitest@^3
```

In the **root** `package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `yarn test`

Expected: FAIL — `Failed to resolve import "./index"`, because `packages/protocol/src/index.ts` does not exist yet.

- [ ] **Step 5: Write the protocol module**

Create `packages/protocol/src/index.ts`:

```ts
export enum ENetworkCommand {
	GitCall = 'gitCall',
	WriteFile = 'writeFile',
	ReadFile = 'readFile',
	BrowseFiles = 'browseFiles',
	SshAgentInit = 'sshAgentInit',
	Heartbeat = 'heartbeat',
}

export interface IWsRequest {
	requestId: string;
	command: string;
	[key: string]: unknown;
}

export interface IWsSuccessResponse {
	requestId: string;
	status: 'success';
	data?: unknown;
}

export interface IWsErrorResponse {
	requestId?: string;
	status: 'error';
	message: string;
	details?: string;
}

export type IWsResponse = IWsSuccessResponse | IWsErrorResponse;

export function isErrorResponse(value: IWsResponse): value is IWsErrorResponse {
	return value.status === 'error';
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `yarn test`

Expected: PASS, 3 tests.

- [ ] **Step 7: Point the client at the package**

In `packages/client/tsconfig.json`, add to `compilerOptions.paths`:

```json
			"@git-yak/protocol": ["../protocol/src/index.ts"]
```

In `packages/client/vite.config.ts`, add to `resolve.alias` alongside the existing `'@'` entry:

```ts
			'@git-yak/protocol': join(currentDir, '..', 'protocol', 'src', 'index.ts'),
```

In `packages/client/src/domain/enums/index.ts`, delete the whole `export enum ENetworkCommand {…}` block and add this line at the top of the file:

```ts
export {ENetworkCommand} from '@git-yak/protocol';
```

`packages/client/src/domain/index.ts` already re-exports `ENetworkCommand` from `'./enums'`, so it needs no change and every consumer keeps working.

- [ ] **Step 8: Point the server at the package**

Add the dependency:

```bash
yarn workspace @git-yak/server add @git-yak/protocol@workspace:*
```

In `packages/server/src/index.ts` replace lines 2-3:

```ts
import {ENetworkCommand} from './types';
import type {IWsMessage} from './types';
```

with:

```ts
import {ENetworkCommand} from '@git-yak/protocol';
import type {IWsRequest} from '@git-yak/protocol';
```

Then rename the one use of the type in that file — the declaration `let data: IWsMessage | undefined;` becomes `let data: IWsRequest | undefined;`.

In each of `packages/server/src/commands/GitCall.ts`, `ReadFile.ts`, `WriteFile.ts`, `BrowseFiles.ts` and `SshAgentInit.ts`, replace:

```ts
import type {IWsMessage} from '../types';
```

with:

```ts
import type {IWsRequest} from '@git-yak/protocol';
```

and change each `data: IWsMessage` parameter annotation to `data: IWsRequest`.

Then delete the old declaration:

```bash
git rm packages/server/src/types.ts
```

- [ ] **Step 9: Verify every consumer still builds and behaves**

Run: `yarn install && yarn workspace @git-yak/client typecheck && yarn lint && yarn test`

Expected: typecheck silent, lint exits 0, 3 tests pass.

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`

Expected: `10 passed`, `3 failed` — unchanged. This is the real proof the server still speaks the same protocol.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: extract @git-yak/protocol as the single protocol source"
```

---

## Task 4: Protocol parity check

Catches the case where someone adds a command to the Rust worker's dispatch that the TypeScript enum does not know about, or renames one on either side.

**Files:**
- Create: `scripts/protocolParity.ts`
- Create: `scripts/protocolParity.spec.ts`
- Create: `scripts/check-protocol-parity.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `ENetworkCommand` from `@git-yak/protocol`.
- Produces:
  - `extractRustCommands(source: string): Array<string>` — the string literals matched on in the Rust dispatch, in source order
  - `findParityGaps(rustCommands: Array<string>, tsCommands: Array<string>, rustExempt: Array<string>): IParityGaps`, where `IParityGaps` is `{missingInTs: Array<string>; missingInRust: Array<string>}`
  - `yarn check:protocol` — exits non-zero on drift

Background for the implementer: the Rust worker deliberately does **not** implement `sshAgentInit` — SSH agent forwarding is a Bun-server concern, because the remote worker is already reached through an SSH tunnel. So parity is not equality; `sshAgentInit` is exempt from the "missing in Rust" side.

- [ ] **Step 1: Write the failing test**

Create `scripts/protocolParity.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {extractRustCommands, findParityGaps} from './protocolParity';

const RUST_SAMPLE = `
	match req.command.as_str() {
		"gitCall" => git_call::run(&req).await,
		"readFile" => read_file::run(&req).await,
		"heartbeat" => heartbeat::run(&req, state),
		unknown => protocol::error(&req.request_id, &format!("Unknown command: {unknown}")),
	}
`;

describe('extractRustCommands', () => {
	it('pulls the matched command literals in order', () => {
		expect(extractRustCommands(RUST_SAMPLE)).toEqual(['gitCall', 'readFile', 'heartbeat']);
	});

	it('ignores the catch-all arm and its format string', () => {
		expect(extractRustCommands(RUST_SAMPLE)).not.toContain('Unknown command: {unknown}');
	});
});

describe('findParityGaps', () => {
	it('reports a Rust command the TypeScript enum does not know', () => {
		const gaps = findParityGaps(['gitCall', 'newThing'], ['gitCall'], []);

		expect(gaps.missingInTs).toEqual(['newThing']);
		expect(gaps.missingInRust).toEqual([]);
	});

	it('reports a TypeScript command the Rust worker does not implement', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'writeFile'], []);

		expect(gaps.missingInRust).toEqual(['writeFile']);
	});

	it('honours the exemption list', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall', 'sshAgentInit'], ['sshAgentInit']);

		expect(gaps.missingInRust).toEqual([]);
	});

	it('reports nothing when both sides agree', () => {
		const gaps = findParityGaps(['gitCall'], ['gitCall'], []);

		expect(gaps).toEqual({missingInTs: [], missingInRust: []});
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test`

Expected: FAIL — cannot resolve `./protocolParity`.

- [ ] **Step 3: Write the helpers**

Create `scripts/protocolParity.ts`:

```ts
export interface IParityGaps {
	missingInTs: Array<string>;
	missingInRust: Array<string>;
}

// Matches the `"commandName" =>` arms of the Rust dispatch. The catch-all arm binds an
// identifier rather than a literal, so it never matches.
const MATCH_ARM = /"([A-Za-z][A-Za-z0-9]*)"\s*=>/g;

export function extractRustCommands(source: string): Array<string> {
	return [...source.matchAll(MATCH_ARM)].map(m => m[1]);
}

export function findParityGaps(
	rustCommands: Array<string>,
	tsCommands: Array<string>,
	rustExempt: Array<string>,
): IParityGaps {
	const
		rust = new Set(rustCommands),
		ts = new Set(tsCommands),
		exempt = new Set(rustExempt);

	return {
		missingInTs: rustCommands.filter(c => !ts.has(c)),
		missingInRust: tsCommands.filter(c => !rust.has(c) && !exempt.has(c)),
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test`

Expected: PASS, 9 tests total (3 from task 3, 6 here).

- [ ] **Step 5: Write the runner**

Create `scripts/check-protocol-parity.ts`:

```ts
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ENetworkCommand} from '../packages/protocol/src/index';
import {extractRustCommands, findParityGaps} from './protocolParity';

// The Rust worker is reached only through an SSH tunnel, so agent forwarding — a
// Bun-server concern — has no counterpart there.
const RUST_EXEMPT = [ENetworkCommand.SshAgentInit];

const
	scriptDir = dirname(fileURLToPath(import.meta.url)),
	dispatchPath = join(scriptDir, '..', 'packages', 'remote-worker-rs', 'src', 'commands', 'mod.rs'),
	rustCommands = extractRustCommands(readFileSync(dispatchPath, 'utf8')),
	tsCommands = Object.values(ENetworkCommand),
	gaps = findParityGaps(rustCommands, tsCommands, RUST_EXEMPT);

for (const command of gaps.missingInTs) {
	console.log(`  FAIL Rust dispatches "${command}", which ENetworkCommand does not declare`);
}

for (const command of gaps.missingInRust) {
	console.log(`  FAIL ENetworkCommand declares "${command}", which the Rust worker does not handle`);
}

const failures = gaps.missingInTs.length + gaps.missingInRust.length;

console.log(`\nrust commands: ${rustCommands.length}, protocol commands: ${tsCommands.length}`);
console.log(failures === 0 ? 'OK — protocol in parity' : `${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
```

Add to the root `package.json` scripts:

```json
"check:protocol": "bun run scripts/check-protocol-parity.ts"
```

- [ ] **Step 6: Run it against the real files**

Run: `yarn check:protocol`

Expected: exit 0, `OK — protocol in parity`, reporting 5 Rust commands and 6 protocol commands.

- [ ] **Step 7: Prove it actually catches drift**

Temporarily add a bogus arm to `packages/remote-worker-rs/src/commands/mod.rs`, directly above the `unknown =>` arm:

```rust
		"bogusCommand" => heartbeat::run(&req, state),
```

Run: `yarn check:protocol`

Expected: exit 1, `FAIL Rust dispatches "bogusCommand", which ENetworkCommand does not declare`.

Now revert that edit:

```bash
git checkout packages/remote-worker-rs/src/commands/mod.rs
```

and re-run `yarn check:protocol` to confirm it is green again.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test: fail the build when the Rust dispatch and ENetworkCommand drift"
```

---

## Task 5: Remote worker version from one source

Removes the hand-maintained duplicate that silently leaves stale binaries on remote hosts.

**Files:**
- Create: `packages/client/src/infrastructure/cargoVersion.ts`
- Create: `packages/client/src/infrastructure/cargoVersion.spec.ts`
- Create: `packages/client/src/vite-env.d.ts`
- Modify: `packages/client/vite.config.ts`
- Modify: `packages/client/src/infrastructure/ssh/SshTunnelClient.ts:11`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseCargoVersion(cargoToml: string): string` — throws when no `version` key is present in `[package]`
  - the compile-time global `__REMOTE_WORKER_VERSION__: string`

- [ ] **Step 1: Write the failing test**

Create `packages/client/src/infrastructure/cargoVersion.spec.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {parseCargoVersion} from './cargoVersion';

const CARGO_SAMPLE = `[package]
name = "remote-worker-rs"
version = "2.0.0"
edition = "2021"

[dependencies]
axum = { version = "0.7", features = ["ws"] }
`;

describe('parseCargoVersion', () => {
	it('reads the package version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE)).toBe('2.0.0');
	});

	it('does not pick up a dependency version', () => {
		expect(parseCargoVersion(CARGO_SAMPLE)).not.toBe('0.7');
	});

	it('throws when the package section has no version', () => {
		expect(() => parseCargoVersion('[package]\nname = "x"\n')).toThrow(/no version/i);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test`

Expected: FAIL — cannot resolve `./cargoVersion`.

- [ ] **Step 3: Write the parser**

Create `packages/client/src/infrastructure/cargoVersion.ts`:

```ts
// Reads `version` from the [package] section only — a dependency's inline
// `version = "0.7"` must never win.
export function parseCargoVersion(cargoToml: string): string {
	const packageSection = /^\[package\]$([\s\S]*?)(?=^\[|\Z)/m.exec(cargoToml);

	if (!packageSection) {
		throw new Error('Cargo.toml has no [package] section');
	}

	const version = /^\s*version\s*=\s*"([^"]+)"/m.exec(packageSection[1]);

	if (!version) {
		throw new Error('Cargo.toml [package] has no version key');
	}

	return version[1];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test`

Expected: PASS, 12 tests total.

- [ ] **Step 5: Inject the version at build time**

In `packages/client/vite.config.ts`, add the import and the read near the existing `currentDir` block:

```ts
import {readFileSync} from 'node:fs';
import {parseCargoVersion} from './src/infrastructure/cargoVersion';
```

```ts
const remoteWorkerVersion = parseCargoVersion(
	readFileSync(join(currentDir, '..', 'remote-worker-rs', 'Cargo.toml'), 'utf8'),
);
```

Then add a top-level `define` entry to the exported config, as a sibling of `plugins` and `resolve`:

```ts
	define: {
		__REMOTE_WORKER_VERSION__: JSON.stringify(remoteWorkerVersion),
	},
```

- [ ] **Step 6: Declare the global for TypeScript**

Create `packages/client/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare const __REMOTE_WORKER_VERSION__: string;
```

- [ ] **Step 7: Consume it**

In `packages/client/src/infrastructure/ssh/SshTunnelClient.ts`, replace line 11:

```ts
const REMOTE_WORKER_VERSION = '2.0.0';
```

with:

```ts
const REMOTE_WORKER_VERSION = __REMOTE_WORKER_VERSION__;
```

- [ ] **Step 8: Verify it resolves to the real Cargo version**

Run: `yarn workspace @git-yak/client build`

Expected: the build succeeds.

Run: `grep -rn "2\.0\.0" packages/client/dist/assets/*.js | head -3`

Expected: at least one hit — the literal `"2.0.0"` was substituted into the bundle, proving the define fired rather than leaving an undefined global.

- [ ] **Step 9: Prove the duplicate is really gone**

Run: `grep -rn "REMOTE_WORKER_VERSION\s*=\s*'" packages/client/src`

Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "build: derive the remote worker version from Cargo.toml"
```

---

## Task 6: Aggregate verification entry point

Gives one command that gates a change, and which phases 2 and 3 can rely on.

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `lint`, `test`, `check:protocol` (root); `typecheck`, `check:themes` (client).
- Produces: `yarn verify`.

- [ ] **Step 1: Add the script**

In the root `package.json` scripts, add:

```json
"verify": "yarn workspace @git-yak/client typecheck && yarn lint && yarn test && yarn check:protocol && yarn workspace @git-yak/client check:themes"
```

- [ ] **Step 2: Run it**

Run: `yarn verify`

Expected: exit 0. Typecheck silent, lint clean, 12 unit tests passing, protocol in parity, themes OK.

- [ ] **Step 3: Prove it fails when something is wrong**

Introduce a deliberate type error — append to `packages/client/src/infrastructure/cargoVersion.ts`:

```ts
const deliberateBreakage: number = 'not a number';
```

Run: `yarn verify`

Expected: exit non-zero, stopping at the typecheck step.

Revert it:

```bash
git checkout packages/client/src/infrastructure/cargoVersion.ts
```

- [ ] **Step 4: Confirm the e2e baseline is still what phase 3 inherits**

Run: `yarn test:e2e 2>&1 | grep -E "passed|failed"`

Expected: `10 passed`, `3 failed`. Record this in the commit message so phase 3 starts from a known baseline.

- [ ] **Step 5: Document the entry point**

In `CLAUDE.md`, under the Commands section, add below the existing `typecheck` line:

```markdown
yarn verify               # typecheck + lint + unit tests + protocol parity + theme validation
yarn lint                 # ESLint with @stylistic (no Prettier); yarn lint:fix to autofix
yarn test                 # Vitest unit tests (single run); yarn test:watch to watch
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add yarn verify as the single pre-commit gate

E2E baseline unchanged at 10 passed / 3 failed; the three stale specs
are fixed in phase 3."
```

---

## Done when

- `yarn verify` exits 0.
- `yarn test:e2e` reports 10 passed / 3 failed — the same three stale specs as before this phase.
- `packages/remote-worker/` and `packages/client/src/application/useCases/` no longer exist.
- `ENetworkCommand` is declared in exactly one place: `grep -rn "enum ENetworkCommand" packages --include=*.ts` returns a single hit in `packages/protocol/src/index.ts`.
- `grep -rn "'2\.0\.0'" packages/client/src` returns nothing.
