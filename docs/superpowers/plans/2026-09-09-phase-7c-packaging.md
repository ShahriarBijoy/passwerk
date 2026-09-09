# Phase 7c Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three installable artefacts — an offline `.mcpb` bundle for Claude Desktop, a Codex plugin carrying `skills/passwerk`, and a Claude connector submission checklist with `PRIVACY.md`.

**Architecture:** Two new private workspace packages under `packaging/` consume already-built artefacts and produce installers into `out/`. The MCPB bundle vendors the `rules`, `core` and `server` release tarballs into `server/node_modules` so a one-click install never touches the network. The Codex plugin does not vendor a runtime; it points at `npx -y @passwerk/server` and copies the skill from its single source. Nothing in `packages/` changes except one test helper extracted from `tools/release/pack-smoke.mjs`.

**Tech Stack:** Node >= 22.13, pnpm 10, Vitest 4, Biome 2, `@anthropic-ai/mcpb` 2.1.2 CLI, `fflate` (unzip), `pngjs` (icon), `npm` (tarball install inside the bundle).

**Spec:** `docs/superpowers/specs/2026-09-09-phase-7c-packaging-design.md` — read it before Task 1. The plan argues from it.

## Global Constraints

- Node floor `>=22.13`; pnpm `10`. Never add a dependency published less than 3 days ago (pnpm `minimumReleaseAge`). `@anthropic-ai/mcpb@2.1.2` (published 2025-12-04) is the only new dependency and it is a **root devDependency**.
- **Never invent** a URL, standard version, semanticId, template idShort or legal reference. The two external manifest formats come from spec section 2 and nowhere else.
- No network at runtime in `core` or `server`. Packaging scripts run `npm install` at **build** time only; that is a dev script, like `packages/rules/scripts/fetch.ts`.
- TypeScript strict, ESM, `.js` extensions in relative TS imports (NodeNext). Build scripts are `.mjs` and are **not** typechecked.
- Tests live in `packaging/<name>/test/`. Conventional Commits, personal identity `shahriarbijoy`.
- Every commit message ends with the line `Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1`.
- Run `pnpm check` (lint + typecheck + test) before every commit. Never claim a result you did not run.
- Both new packages are `"private": true` and are never published to npm.

## File Structure

| File | Responsibility |
|---|---|
| `pnpm-workspace.yaml` | add `packaging/*` glob |
| `vitest.config.ts` | add `packaging/*/test/**/*.test.ts` to `include` |
| `tsconfig.test.json` | add `packaging/*/test/**/*.ts` to `include` |
| `package.json` (root) | `@anthropic-ai/mcpb` devDependency; `package:mcpb`, `package:codex`, `package:smoke` scripts |
| `tools/release/stdio-client.mjs` | **new.** Generic newline-framed JSON-RPC stdio client, shared |
| `tools/release/pack-smoke.mjs` | **modify.** Import the shared client instead of its private copy |
| `packaging/mcpb/package.json` | private package `@passwerk/mcpb-bundle` |
| `packaging/mcpb/manifest.json` | committed MCPB manifest **template**: everything except `version`, `tools`, `prompts` |
| `packaging/mcpb/scripts/manifest.mjs` | pure `buildManifest()` — injects version, tools, prompts. Testable |
| `packaging/mcpb/scripts/icon.mjs` | deterministic 512×512 `icon.png` generator (pngjs) |
| `packaging/mcpb/server/index.js` | three-line launcher copied into the bundle |
| `packaging/mcpb/scripts/build.mjs` | assemble → inject → `mcpb validate` → `mcpb pack` |
| `packaging/mcpb/scripts/smoke.mjs` | unzip the `.mcpb`, drive it over stdio, read a real PDF |
| `packaging/mcpb/test/manifest.test.ts` | manifest shape, tool/prompt agreement with the registry |
| `packaging/codex-plugin/package.json` | private package `@passwerk/codex-plugin` |
| `packaging/codex-plugin/.codex-plugin/plugin.json` | Codex manifest template (no `version`) |
| `packaging/codex-plugin/.mcp.json` | `npx -y @passwerk/server` |
| `packaging/codex-plugin/marketplace.json` | local marketplace template |
| `packaging/codex-plugin/scripts/build.mjs` | assemble `out/codex-plugin/`, copying the skill |
| `packaging/codex-plugin/test/plugin.test.ts` | manifest shape, name regexes, policy fields |
| `PRIVACY.md` | privacy statement |
| `docs/connector-submission.md` | dated submission checklist |
| `.github/workflows/ci.yml` | `packaging` job, 3 OS |
| `.github/workflows/release.yml` | `mcpb` job attaching the bundle to the release |
| `docs/DECISIONS.md` | ADR D-039 |

**One improvement over the spec, adopted deliberately.** The spec had `manifest.json` and `plugin.json` carry a hand-written `version` kept in step by a test and by the release workflow's agreement loop. Instead both committed files **omit** `version`, and the build scripts inject it from `packages/server/package.json`. Derived beats checked: there is no second copy to drift. The same applies to the MCPB `tools` and `prompts` arrays, injected from the server's exported `TOOLS` and `PROMPT_NAMES`. Consequence: the release workflow's agreement loop does **not** change (Task 9 note), and the tests assert the derivation instead of the copy.

---

### Task 1: Workspace scaffolding for the two packaging packages

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts` (the `test.include` array)
- Modify: `tsconfig.test.json` (the `include` array)
- Create: `packaging/mcpb/package.json`
- Create: `packaging/codex-plugin/package.json`
- Test: `packaging/mcpb/test/manifest.test.ts` (a wiring smoke test only, replaced in Task 3)

**Interfaces:**
- Consumes: nothing.
- Produces: two workspace packages named `@passwerk/mcpb-bundle` and `@passwerk/codex-plugin`; a Vitest include path `packaging/*/test/**/*.test.ts` that later tasks add tests to.

- [ ] **Step 1: Write the failing test**

Create `packaging/mcpb/test/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { TOOLS } from '@passwerk/server';

describe('packaging workspace wiring', () => {
  it('resolves the server registry from a packaging test', () => {
    expect(TOOLS.map((t) => t.name)).toContain('ingest_documents');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packaging/mcpb/test/manifest.test.ts`
Expected: FAIL — Vitest reports no test files matched, because `test.include` does not cover `packaging/`.

- [ ] **Step 3: Add the workspace glob**

In `pnpm-workspace.yaml`, the `packages:` list becomes:

```yaml
packages:
  - packages/*
  - tools/*
  - apps/*
  - packaging/*
```

- [ ] **Step 4: Create the two package manifests**

`packaging/mcpb/package.json`:

```json
{
  "name": "@passwerk/mcpb-bundle",
  "version": "0.0.0",
  "private": true,
  "description": "Builds the .mcpb bundle Claude Desktop installs with one click; vendors the release tarballs so the install is offline",
  "license": "Apache-2.0",
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs",
    "smoke": "node scripts/smoke.mjs"
  }
}
```

`packaging/codex-plugin/package.json`:

```json
{
  "name": "@passwerk/codex-plugin",
  "version": "0.0.0",
  "private": true,
  "description": "Builds the Codex plugin: skills/passwerk plus the passwerk MCP server, installable from a local marketplace",
  "license": "Apache-2.0",
  "type": "module",
  "scripts": {
    "build": "node scripts/build.mjs"
  }
}
```

- [ ] **Step 5: Add the test globs**

In `vitest.config.ts`, `test.include` gains one entry after the `tools/*` line:

```ts
      'tools/*/test/**/*.test.ts',
      'packaging/*/test/**/*.test.ts',
```

In `tsconfig.test.json`, `include` gains one entry after the `tools/*/test/**/*.ts` line:

```json
    "tools/*/test/**/*.ts",
    "packaging/*/test/**/*.ts",
```

- [ ] **Step 6: Install and run the test to verify it passes**

Run: `pnpm install && pnpm vitest run packaging/mcpb/test/manifest.test.ts`
Expected: PASS, 1 test.

Note: `pnpm install` is required because the workspace gained two packages; the lockfile changes.

- [ ] **Step 7: Run the full check**

Run: `pnpm check`
Expected: lint, typecheck and the whole suite pass.

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts tsconfig.test.json packaging/
git commit -m "chore(packaging): add the mcpb and codex-plugin workspace packages

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 2: Extract the shared JSON-RPC stdio client

`tools/release/pack-smoke.mjs` contains a correct newline-framed stdio client. The MCPB smoke needs the same thing with different requests. Extract and generalise it once, rather than writing the subtle part twice.

**Files:**
- Create: `tools/release/stdio-client.mjs`
- Modify: `tools/release/pack-smoke.mjs` (delete the private `stdioSurface` body, import instead)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```js
  export class StdioRpcError extends Error {}
  /**
   * @param {object} opts
   * @param {string} opts.bin        absolute path to a JS file run with node
   * @param {string} opts.cwd
   * @param {Record<string,string>} [opts.env]   merged over process.env
   * @param {{method: string, params?: unknown}[]} opts.requests
   * @param {number} [opts.timeoutMs=30000]
   * @returns {Promise<unknown[]>}  results, aligned index-for-index with opts.requests
   */
  export async function rpcCollect(opts)
  ```
  Ids are assigned internally: `initialize` is 1, `requests[i]` is `i + 2`. `notifications/initialized` is sent after `initialize`. The child is killed on every settle path — success, parse failure, child error, timeout.

- [ ] **Step 1: Write the failing test**

Create `packaging/mcpb/test/stdio-client.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build helper, deliberately untyped
import { rpcCollect, StdioRpcError } from '../../../tools/release/stdio-client.mjs';

const echo = fileURLToPath(new URL('./fixtures/echo-server.mjs', import.meta.url));

describe('rpcCollect', () => {
  it('returns one result per request, in order', async () => {
    const [a, b] = await rpcCollect({
      bin: echo,
      cwd: process.cwd(),
      requests: [{ method: 'first' }, { method: 'second', params: { x: 1 } }],
    });
    expect(a).toEqual({ echoed: 'first' });
    expect(b).toEqual({ echoed: 'second', params: { x: 1 } });
  });

  it('rejects when the server reports an error', async () => {
    await expect(
      rpcCollect({ bin: echo, cwd: process.cwd(), requests: [{ method: 'boom' }] }),
    ).rejects.toBeInstanceOf(StdioRpcError);
  });

  it('rejects on timeout without hanging', async () => {
    await expect(
      rpcCollect({ bin: echo, cwd: process.cwd(), requests: [{ method: 'silent' }], timeoutMs: 300 }),
    ).rejects.toBeInstanceOf(StdioRpcError);
  });
});
```

Create the fake server `packaging/mcpb/test/fixtures/echo-server.mjs`:

```js
#!/usr/bin/env node
// A minimal newline-delimited JSON-RPC peer for testing the shared stdio client.
// `boom` answers with an error, `silent` never answers, anything else echoes.
let buf = '';
process.stdin.on('data', (d) => {
  buf += d.toString();
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id === undefined) continue; // a notification
    if (msg.method === 'initialize') {
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} })}\n`);
    } else if (msg.method === 'boom') {
      process.stdout.write(
        `${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -1, message: 'boom' } })}\n`,
      );
    } else if (msg.method === 'silent') {
      // deliberately no reply
    } else {
      const result = { echoed: msg.method };
      if (msg.params !== undefined) result.params = msg.params;
      process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, result })}\n`);
    }
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packaging/mcpb/test/stdio-client.test.ts`
Expected: FAIL — cannot resolve `tools/release/stdio-client.mjs`.

- [ ] **Step 3: Write the client**

Create `tools/release/stdio-client.mjs`:

```js
/**
 * Newline-delimited JSON-RPC over a child process's stdio, shared by the release pack smoke
 * and the MCPB bundle smoke. Frames correctly across `data` chunks (only the trailing partial
 * line stays in the buffer) and always kills the child before settling, on every path:
 * success, a malformed line, a process error or the timeout.
 */
import { spawn } from 'node:child_process';

export class StdioRpcError extends Error {}

export async function rpcCollect({ bin, cwd, env, requests, timeoutMs = 30000 }) {
  if (!Array.isArray(requests) || requests.length === 0)
    throw new StdioRpcError('rpcCollect needs at least one request');

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [bin], {
      cwd,
      shell: false,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const results = new Array(requests.length).fill(undefined);
    const seen = new Set();
    let buf = '';
    let settled = false;

    const timer = setTimeout(
      () =>
        settle(
          rejectPromise,
          new StdioRpcError(
            `timed out after ${timeoutMs} ms waiting for ${requests.length - seen.size} of ${requests.length} responses`,
          ),
        ),
      timeoutMs,
    );
    timer.unref();

    function settle(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      fn(arg);
    }

    child.stdout.on('data', (d) => {
      if (settled) return;
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch (err) {
          settle(rejectPromise, new StdioRpcError(`could not parse stdio line: ${line}\n${err}`));
          return;
        }
        if (typeof msg.id !== 'number' || msg.id < 2) continue; // initialize, or a notification
        const index = msg.id - 2;
        if (index >= requests.length || seen.has(index)) continue;
        if (msg.error) {
          settle(
            rejectPromise,
            new StdioRpcError(
              `${requests[index].method} error: ${JSON.stringify(msg.error)}`,
            ),
          );
          return;
        }
        results[index] = msg.result;
        seen.add(index);
        if (seen.size === requests.length) {
          settle(resolvePromise, results);
          return;
        }
      }
    });
    child.on('error', (err) => settle(rejectPromise, err));

    const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'passwerk-smoke', version: '0' },
      },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    requests.forEach((r, i) =>
      send({ jsonrpc: '2.0', id: i + 2, method: r.method, ...(r.params ? { params: r.params } : {}) }),
    );
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packaging/mcpb/test/stdio-client.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Rewire pack-smoke.mjs**

In `tools/release/pack-smoke.mjs`, delete the whole `stdioSurface` function (its JSDoc block and body) and replace it with:

```js
/**
 * Talks the stdio JSON-RPC handshake to the freshly installed server: tools/list and a
 * resources/read of the MCP App workbench (ADR D-037). Framing and child-process lifetime
 * live in the shared client.
 */
async function stdioSurface(serverBin, cwd) {
  const [list, read] = await rpcCollect({
    bin: serverBin,
    cwd,
    requests: [
      { method: 'tools/list' },
      { method: 'resources/read', params: { uri: 'ui://passwerk/workbench.html' } },
    ],
  });
  return { tools: list.tools, workbench: read.contents[0] };
}
```

Add to the imports at the top of the file:

```js
import { rpcCollect } from './stdio-client.mjs';
```

The `spawn` import from `node:child_process` is now unused by this file — remove `spawn` from that import statement, keeping `spawnSync`.

- [ ] **Step 6: Prove the release smoke still passes**

Run: `pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm release:smoke`
Expected: the same output as before the extraction, ending with the existing success lines. This is the regression proof for the refactor — do not skip it and do not report it as passing without running it.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add tools/release/stdio-client.mjs tools/release/pack-smoke.mjs packaging/mcpb/test/
git commit -m "refactor(release): extract the JSON-RPC stdio client so both smokes share it

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 3: The MCPB manifest template and its derivation

**Files:**
- Create: `packaging/mcpb/manifest.json`
- Create: `packaging/mcpb/scripts/manifest.mjs`
- Test: `packaging/mcpb/test/manifest.test.ts` (replaces the Task 1 wiring test)

**Interfaces:**
- Consumes: `TOOLS` and `PROMPT_NAMES` from `@passwerk/server`.
- Produces:
  ```js
  /**
   * @param {object} base     the committed manifest.json, parsed
   * @param {object} opts
   * @param {string} opts.version                 from packages/server/package.json
   * @param {{name: string, description: string}[]} opts.tools
   * @param {readonly string[]} opts.promptNames
   * @returns {object} the manifest that ships inside the bundle
   */
  export function buildManifest(base, { version, tools, promptNames })
  ```
  It returns a new object; it never mutates `base`. Key order is `manifest_version`, `name`, `display_name`, `version`, then the rest of `base` in its own order, then `tools`, `tools_generated`, `prompts`, `prompts_generated`.

- [ ] **Step 1: Write the failing test**

Replace the whole contents of `packaging/mcpb/test/manifest.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROMPT_NAMES, TOOLS } from '@passwerk/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build helper, deliberately untyped
import { buildManifest } from '../scripts/manifest.mjs';

const base = JSON.parse(
  readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'),
);
const serverPkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/server/package.json', import.meta.url)), 'utf8'),
);

const built = buildManifest(base, {
  version: serverPkg.version,
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  promptNames: PROMPT_NAMES,
});

describe('the committed manifest template', () => {
  it('declares manifest_version 0.4 and a node server', () => {
    expect(base.manifest_version).toBe('0.4');
    expect(base.server.type).toBe('node');
    expect(base.server.entry_point).toBe('server/index.js');
  });

  it('omits the derived fields so they cannot drift', () => {
    expect(base).not.toHaveProperty('version');
    expect(base).not.toHaveProperty('tools');
    expect(base).not.toHaveProperty('prompts');
  });

  it('runs the launcher from the extension directory', () => {
    expect(base.server.mcp_config.command).toBe('node');
    expect(base.server.mcp_config.args).toEqual(['${__dirname}/server/index.js']);
  });

  it('roots the server at a required document directory', () => {
    expect(base.server.mcp_config.env).toEqual({
      PASSWERK_ROOT: '${user_config.documents_directory}',
    });
    expect(base.user_config.documents_directory).toMatchObject({
      type: 'directory',
      required: true,
      default: '${DOCUMENTS}',
      multiple: false,
    });
  });

  it('claims the three desktop platforms and the node floor', () => {
    expect(base.compatibility.platforms).toEqual(['darwin', 'win32', 'linux']);
    expect(base.compatibility.runtimes.node).toBe('>=22.13');
  });

  it('omits privacy_policies, because passwerk contacts no external service', () => {
    expect(base).not.toHaveProperty('privacy_policies');
  });
});

describe('buildManifest', () => {
  it('injects the server version', () => {
    expect(built.version).toBe(serverPkg.version);
  });

  it('declares every registry tool, in registry order, with its description', () => {
    expect(built.tools).toEqual(TOOLS.map((t) => ({ name: t.name, description: t.description })));
    expect(built.tools).toHaveLength(12);
    expect(built.tools_generated).toBe(false);
  });

  it('declares every prompt', () => {
    expect(built.prompts.map((p: { name: string }) => p.name)).toEqual([...PROMPT_NAMES]);
    expect(built.prompts_generated).toBe(false);
  });

  it('does not mutate the template', () => {
    expect(base).not.toHaveProperty('version');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packaging/mcpb/test/manifest.test.ts`
Expected: FAIL — `manifest.json` and `scripts/manifest.mjs` do not exist.

- [ ] **Step 3: Write the manifest template**

Create `packaging/mcpb/manifest.json`. `version`, `tools` and `prompts` are absent on purpose — `buildManifest` injects them.

```json
{
  "manifest_version": "0.4",
  "name": "passwerk",
  "display_name": "passwerk",
  "description": "Offline EU Digital Battery Passport toolkit: ingest supplier documents, map, validate against IDTA 02035, report gaps with legal citations, emit AASX.",
  "long_description": "passwerk turns a battery supplier's documents (BOMs, Excel exports, energy bills, supplier declarations) into a conformant EU Digital Battery Passport in the official AAS format (IDTA 02035-1 to -7) plus a legally cited gap report. Regulation (EU) 2023/1542 Article 77 makes the passport mandatory for EV, LMT and industrial batteries above 2 kWh from 18 February 2027.\n\nEverything runs on this machine. The server makes no network calls and no model calls; documents never leave the computer. Open the workbench to upload documents, review each mapping with its provenance, and export.\n\npasswerk reports gaps and cites the regulation. It is not legal advice.",
  "author": {
    "name": "Shahriar Bijoy",
    "url": "https://github.com/ShahriarBijoy"
  },
  "license": "Apache-2.0",
  "icon": "icon.png",
  "repository": {
    "type": "git",
    "url": "https://github.com/ShahriarBijoy/passwerk"
  },
  "homepage": "https://github.com/ShahriarBijoy/passwerk#readme",
  "documentation": "https://github.com/ShahriarBijoy/passwerk/tree/main/docs",
  "support": "https://github.com/ShahriarBijoy/passwerk/issues",
  "keywords": [
    "battery-passport",
    "digital-product-passport",
    "aas",
    "idta-02035",
    "eu-2023-1542"
  ],
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": {
        "PASSWERK_ROOT": "${user_config.documents_directory}"
      }
    }
  },
  "user_config": {
    "documents_directory": {
      "type": "directory",
      "title": "Document folder",
      "description": "The only folder passwerk may read documents from and write passports to.",
      "required": true,
      "default": "${DOCUMENTS}",
      "multiple": false
    }
  },
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=22.13"
    }
  }
}
```

- [ ] **Step 4: Write the derivation**

Create `packaging/mcpb/scripts/manifest.mjs`:

```js
/**
 * Derives the manifest that ships inside the .mcpb from the committed template. `version`,
 * `tools` and `prompts` are injected rather than committed so there is no second copy to
 * drift from the server package and its registry.
 */

/** Prompt descriptions shown in the Claude Desktop extension listing. */
const PROMPT_DESCRIPTIONS = {
  'build-passport-interview':
    'Interview the supplier for the data a battery passport needs, one attribute at a time.',
  'audit-supplier-submission':
    'Audit a set of supplier documents and report the gaps against Regulation (EU) 2023/1542.',
  'draft-data-request':
    'Draft a data request to the party that holds a missing attribute, in German or English.',
};

export function buildManifest(base, { version, tools, promptNames }) {
  const { manifest_version, name, display_name, ...rest } = base;
  return {
    manifest_version,
    name,
    display_name,
    version,
    ...rest,
    tools: tools.map((t) => ({ name: t.name, description: t.description })),
    tools_generated: false,
    prompts: promptNames.map((promptName) => ({
      name: promptName,
      description: PROMPT_DESCRIPTIONS[promptName] ?? promptName,
    })),
    prompts_generated: false,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packaging/mcpb/test/manifest.test.ts`
Expected: PASS, 10 tests.

If the prompt-description keys and `PROMPT_NAMES` disagree, the `?? promptName` fallback hides it. Add this assertion to the `buildManifest` describe block and make it pass:

```ts
  it('has a real description for every prompt', () => {
    for (const p of built.prompts as { name: string; description: string }[]) {
      expect(p.description).not.toBe(p.name);
    }
  });
```

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`

```bash
git add packaging/mcpb/manifest.json packaging/mcpb/scripts/manifest.mjs packaging/mcpb/test/manifest.test.ts
git commit -m "feat(packaging): MCPB manifest template with derived version, tools and prompts

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 4: The bundle icon

**Files:**
- Create: `packaging/mcpb/scripts/icon.mjs`
- Create: `packaging/mcpb/icon.png` (generated, committed)
- Test: `packaging/mcpb/test/icon.test.ts`

**Interfaces:**
- Consumes: `pngjs` (already a root devDependency).
- Produces: `export function iconPng(): Buffer` — a deterministic 512×512 RGBA PNG. `packaging/mcpb/icon.png` is its committed output and is copied into the bundle.

A geometric battery mark, no text: drawing glyphs pixel by pixel would be worse than drawing none.

- [ ] **Step 1: Write the failing test**

Create `packaging/mcpb/test/icon.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build helper, deliberately untyped
import { iconPng } from '../scripts/icon.mjs';

describe('the bundle icon', () => {
  it('is a 512x512 PNG', () => {
    const png = iconPng();
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });

  it('is deterministic', () => {
    expect(iconPng().equals(iconPng())).toBe(true);
  });

  it('matches the committed icon.png', () => {
    const committed = readFileSync(fileURLToPath(new URL('../icon.png', import.meta.url)));
    expect(iconPng().equals(committed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packaging/mcpb/test/icon.test.ts`
Expected: FAIL — `scripts/icon.mjs` does not exist.

- [ ] **Step 3: Write the generator**

Create `packaging/mcpb/scripts/icon.mjs`:

```js
/**
 * The bundle icon: a battery mark on a dark ground, drawn from rectangles so it is
 * deterministic and needs no rasteriser. Run `node scripts/icon.mjs` to rewrite icon.png.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const SIZE = 512;
const GROUND = [0x10, 0x16, 0x1f, 0xff]; // near-black slate
const MARK = [0x4a, 0xde, 0x80, 0xff]; // green, "valid"

function fill(png, x0, y0, w, h, rgba) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * SIZE + x) << 2;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
}

export function iconPng() {
  const png = new PNG({ width: SIZE, height: SIZE });
  fill(png, 0, 0, SIZE, SIZE, GROUND);
  // battery body outline: 288 x 192, centred, 20 px stroke
  const bx = 104;
  const by = 160;
  const bw = 288;
  const bh = 192;
  const s = 20;
  fill(png, bx, by, bw, s, MARK); // top
  fill(png, bx, by + bh - s, bw, s, MARK); // bottom
  fill(png, bx, by, s, bh, MARK); // left
  fill(png, bx + bw - s, by, s, bh, MARK); // right
  // terminal
  fill(png, bx + bw, by + 64, 28, 64, MARK);
  // charge bars inside
  fill(png, bx + 44, by + 48, 56, 96, MARK);
  fill(png, bx + 120, by + 48, 56, 96, MARK);
  return PNG.sync.write(png, { deflateLevel: 9, filterType: 0 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../icon.png', import.meta.url));
  writeFileSync(out, iconPng());
  console.log(`wrote ${out}`);
}
```

- [ ] **Step 4: Generate the committed icon**

Run: `node packaging/mcpb/scripts/icon.mjs`
Expected: prints `wrote .../packaging/mcpb/icon.png`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run packaging/mcpb/test/icon.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`

```bash
git add packaging/mcpb/scripts/icon.mjs packaging/mcpb/icon.png packaging/mcpb/test/icon.test.ts
git commit -m "feat(packaging): deterministic bundle icon

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 5: The bundle build script

**Files:**
- Create: `packaging/mcpb/server/index.js`
- Create: `packaging/mcpb/scripts/build.mjs`
- Modify: `package.json` (root) — add `@anthropic-ai/mcpb` devDependency and the `package:mcpb` script

**Interfaces:**
- Consumes: `out/pack/passwerk-{rules,core,server}-<version>.tgz` from `pnpm release:pack`; `buildManifest` from Task 3; `packaging/mcpb/icon.png` from Task 4.
- Produces: `out/mcpb/passwerk-<version>.mcpb`, and the unpacked tree at `out/mcpb/build/`. Task 6's smoke reads the `.mcpb`.

- [ ] **Step 1: Add the CLI dependency and verify its bin name**

```bash
pnpm add -Dw @anthropic-ai/mcpb@2.1.2
pnpm exec mcpb --version
```

Expected: prints `2.1.2`. If the binary is not named `mcpb`, read `node_modules/@anthropic-ai/mcpb/package.json`'s `bin` field and use the real name everywhere below — do not guess.

- [ ] **Step 2: Write the launcher**

Create `packaging/mcpb/server/index.js`:

```js
#!/usr/bin/env node
/**
 * The MCPB bundle's entry point. `dist/bin.js` self-executes only when it is process.argv[1],
 * which it is not here, so the launcher calls the exported `main`. `main` reads argv and env
 * itself. Keeping `bin.js` as the importer also keeps `new URL('../ui/workbench.html', ...)`
 * resolving to the workbench inside the installed server package (ADR D-037).
 */
import { main } from './node_modules/@passwerk/server/dist/bin.js';

process.exitCode = await main();
```

- [ ] **Step 3: Write the build script**

Create `packaging/mcpb/scripts/build.mjs`:

```js
#!/usr/bin/env node
/**
 * Builds out/mcpb/passwerk-<version>.mcpb: a Claude Desktop bundle that vendors the release
 * tarballs, so a one-click install never touches the network (spec section 4).
 *
 *   pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm package:mcpb
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.mjs';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const PACK = join(ROOT, 'out', 'pack');
const OUT = join(ROOT, 'out', 'mcpb');
const BUILD = join(OUT, 'build');
const SERVER = join(BUILD, 'server');

const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;

function fail(msg) {
  console.error(`packaging/mcpb: ${msg}`);
  process.exit(1);
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, shell: true, encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

// 1. the three tarballs the server needs; the CLI is not part of an MCP host's surface.
//    Dependency order matters: the @passwerk scope is not on the registry, so each package must
//    already be in node_modules before the next one's install resolves it (as pack-smoke does).
const ORDER = ['rules', 'core', 'server'];
const tarballs = ORDER.map((n) => join(PACK, `passwerk-${n}-${VERSION}.tgz`));
for (const t of tarballs)
  if (!existsSync(t)) fail(`missing ${t} — run pnpm build && pnpm build:mcp-app && pnpm release:pack`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(SERVER, { recursive: true });
writeFileSync(
  join(SERVER, 'package.json'),
  `${JSON.stringify({ name: 'passwerk-mcpb-server', private: true, type: 'module' }, null, 2)}\n`,
);

// 2. --omit=optional keeps pdfjs-dist's native canvas out: it is only used for rendering, never
//    for the text extraction passwerk does, and a platform binary would make the bundle
//    platform-specific. Everything left is pure JavaScript, so one bundle serves all three.
for (const t of tarballs) {
  console.log(`installing ${t}`);
  run('npm', ['install', '--omit=dev', '--omit=optional', '--no-audit', '--no-fund', '--loglevel=error', t], SERVER);
}

// 3. the workbench must have come along inside the server tarball (ADR D-037)
const workbench = join(SERVER, 'node_modules', '@passwerk', 'server', 'ui', 'workbench.html');
if (!existsSync(workbench)) fail('the server tarball has no ui/workbench.html — run pnpm build:mcp-app before pnpm release:pack');

// 4. derive the manifest from the installed server's own registry
const installed = await import(
  new URL('file://' + join(SERVER, 'node_modules', '@passwerk', 'server', 'dist', 'index.js').replaceAll('\\', '/')).href
);
const manifest = buildManifest(JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8')), {
  version: VERSION,
  tools: installed.TOOLS.map((t) => ({ name: t.name, description: t.description })),
  promptNames: installed.PROMPT_NAMES,
});
writeFileSync(join(BUILD, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
copyFileSync(join(HERE, 'icon.png'), join(BUILD, 'icon.png'));
copyFileSync(join(HERE, 'server', 'index.js'), join(SERVER, 'index.js'));

// 5. validate, then pack
console.log(run('npx', ['mcpb', 'validate', join(BUILD, 'manifest.json')], ROOT));
console.log(run('npx', ['mcpb', 'pack', BUILD, join(OUT, `passwerk-${VERSION}.mcpb`)], ROOT));
console.log(`built ${join(OUT, `passwerk-${VERSION}.mcpb`)}`);
```

- [ ] **Step 4: Add the root script**

In the root `package.json` `scripts`, after `"release:smoke"`:

```json
    "package:mcpb": "node packaging/mcpb/scripts/build.mjs",
    "package:smoke": "node packaging/mcpb/scripts/smoke.mjs",
    "package:codex": "node packaging/codex-plugin/scripts/build.mjs"
```

`package:smoke` and `package:codex` point at files created in Tasks 6 and 7; adding all three now keeps the root manifest edited once.

- [ ] **Step 5: Build the bundle and inspect it**

```bash
pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm package:mcpb
```

Expected: `mcpb validate` reports the manifest valid and `mcpb pack` writes `out/mcpb/passwerk-0.1.0.mcpb`.

If `mcpb validate` rejects `manifest_version: "0.4"`, change it to `"0.3"` in `packaging/mcpb/manifest.json` **and** in the Task 3 test, and note the reason in the ADR. The tool decides this value, not the author.

- [ ] **Step 6: Verify the bundle contents by hand, once**

```bash
node -e "const {unzipSync}=require('fflate');const {readFileSync}=require('fs');const z=unzipSync(readFileSync('out/mcpb/passwerk-0.1.0.mcpb'));const k=Object.keys(z);console.log(k.length,'entries');console.log(k.filter(p=>!p.includes('node_modules')).join('\n'));console.log('workbench:', k.some(p=>p.endsWith('ui/workbench.html')));console.log('canvas:', k.some(p=>p.includes('napi-rs')||p.includes('canvas')));"
```

Expected: `manifest.json`, `icon.png`, `server/index.js`, `server/package.json` outside `node_modules`; `workbench: true`; `canvas: false`.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add package.json pnpm-lock.yaml packaging/mcpb/server/index.js packaging/mcpb/scripts/build.mjs
git commit -m "feat(packaging): build the .mcpb bundle from the release tarballs

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 6: The bundle smoke

**Files:**
- Create: `packaging/mcpb/scripts/smoke.mjs`

**Interfaces:**
- Consumes: `out/mcpb/passwerk-<version>.mcpb` from Task 5; `rpcCollect` from Task 2; the fixture `packages/core/test/fixtures/musterwerk/lieferantenerklaerung.pdf`.
- Produces: exit 0 on success, 1 on the first failure. No exports.

- [ ] **Step 1: Write the smoke script**

Create `packaging/mcpb/scripts/smoke.mjs`:

```js
#!/usr/bin/env node
/**
 * Proves the shipped .mcpb actually runs (spec section 5): unzip it, start the launcher the
 * manifest names, complete the MCP handshake, and read a real supplier PDF through the
 * bundled pdfjs-dist — the highest-risk dependency in the tree, because it is a lazy dynamic
 * import with its own asset layout.
 *
 *   pnpm package:mcpb && pnpm package:smoke
 *
 * Sovereignty is deliberately not re-proven here: sovereignty.test.ts and the --network none
 * CI job already cover exactly the code this bundle vendors (ADR D-013).
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { rpcCollect } from '../../../tools/release/stdio-client.mjs';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');
const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;
const BUNDLE = join(ROOT, 'out', 'mcpb', `passwerk-${VERSION}.mcpb`);
const FIXTURES = join(ROOT, 'packages', 'core', 'test', 'fixtures', 'musterwerk');
const CLOCK = '2026-09-09T00:00:00.000Z';

let failed = false;
function check(ok, msg) {
  console.log(`${ok ? 'ok  ' : 'FAIL'}: ${msg}`);
  if (!ok) failed = true;
}

const dir = mkdtempSync(join(tmpdir(), 'passwerk-mcpb-'));
try {
  // 1. unzip
  const zip = unzipSync(readFileSync(BUNDLE));
  for (const [path, bytes] of Object.entries(zip)) {
    if (path.endsWith('/')) continue;
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  console.log(`unzipped ${Object.keys(zip).length} entries into ${dir}`);

  // 2. the manifest ships the right version and the whole tool surface
  const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']));
  check(manifest.version === VERSION, `manifest version ${manifest.version} === ${VERSION}`);
  check(manifest.tools.length === 12, `manifest declares ${manifest.tools.length} tools`);
  check(manifest.server.entry_point === 'server/index.js', 'entry_point is server/index.js');

  // 3. the launcher the manifest names starts and answers
  const bin = join(dir, manifest.server.entry_point);
  const [list, read, ingest] = await rpcCollect({
    bin,
    cwd: dir,
    env: { PASSWERK_ROOT: FIXTURES, PASSWERK_CLOCK: CLOCK },
    timeoutMs: 120000,
    requests: [
      { method: 'tools/list' },
      { method: 'resources/read', params: { uri: 'ui://passwerk/workbench.html' } },
      {
        method: 'tools/call',
        params: {
          name: 'ingest_documents',
          arguments: { paths: [join(FIXTURES, 'lieferantenerklaerung.pdf')] },
        },
      },
    ],
  });

  const names = list.tools.map((t) => t.name).sort();
  check(names.length === 12, `tools/list returned ${names.length} tools`);
  check(
    JSON.stringify(names) === JSON.stringify(manifest.tools.map((t) => t.name).sort()),
    'tools/list matches the manifest',
  );
  check(
    typeof read.contents?.[0]?.text === 'string' && read.contents[0].text.length > 100000,
    `workbench is ${read.contents?.[0]?.text?.length ?? 0} bytes`,
  );

  // 4. the bundled pdfjs-dist really reads a PDF, with provenance
  check(ingest.isError !== true, `ingest_documents did not error: ${JSON.stringify(ingest.content?.[0]?.text ?? '').slice(0, 300)}`);
  const bundle = ingest.structuredContent;
  const doc = bundle?.documents?.[0];
  check(doc?.kind === 'pdf', `document kind is ${doc?.kind}`);
  check((doc?.pages?.length ?? 0) > 0, `document has ${doc?.pages?.length ?? 0} pages`);
  const lines = doc?.pages?.[0]?.lines ?? [];
  check(lines.length > 0, `page 1 has ${lines.length} lines`);
  check(
    lines.some((l) => String(l.text ?? l).includes('MW-EV-2026-000123')),
    'page 1 carries the supplier declaration serial',
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (failed) {
  console.error('\nmcpb smoke FAILED');
  process.exit(1);
}
console.log('\nmcpb smoke passed');
```

- [ ] **Step 2: Run it**

Run: `pnpm package:smoke`
Expected: every line begins `ok  :` and the script ends `mcpb smoke passed`.

The shapes asserted in step 4 (`structuredContent.documents[0].kind`, `.pages[].lines[]`) come from `ingest_documents`' output schema. If a field name differs, read `packages/server/src/tools/ingestDocuments.ts` and correct the assertion — **do not** weaken it to make it pass. The point of this check is that the bundled PDF reader produced real text with provenance.

- [ ] **Step 3: Commit**

Run: `pnpm check`

```bash
git add packaging/mcpb/scripts/smoke.mjs
git commit -m "test(packaging): drive the shipped .mcpb over stdio and read a real PDF

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 7: The Codex plugin

**Files:**
- Create: `packaging/codex-plugin/.codex-plugin/plugin.json`
- Create: `packaging/codex-plugin/.mcp.json`
- Create: `packaging/codex-plugin/marketplace.json`
- Create: `packaging/codex-plugin/scripts/build.mjs`
- Test: `packaging/codex-plugin/test/plugin.test.ts`

**Interfaces:**
- Consumes: `skills/passwerk/` (the single source of the skill).
- Produces: `out/codex-plugin/` containing `.codex-plugin/plugin.json` (with `version` injected), `.mcp.json` and `skills/passwerk/**` copied byte-for-byte.

Format facts, all from spec section 2 — do not deviate: the manifest is camelCase; `hooks` is **rejected** by validation; `apps` must be absent because no `.app.json` exists; plugin names match `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*`; marketplace names match `[A-Za-z0-9_-]+`; every marketplace entry needs `policy.installation`, `policy.authentication` and `category`.

- [ ] **Step 1: Write the failing test**

Create `packaging/codex-plugin/test/plugin.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (p: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));

const plugin = read('../.codex-plugin/plugin.json');
const mcp = read('../.mcp.json');
const marketplace = read('../marketplace.json');

const PLUGIN_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const MARKETPLACE_NAME = /^[A-Za-z0-9_-]+$/;

describe('the Codex plugin manifest', () => {
  it('is named passwerk and matches the plugin name rule', () => {
    expect(plugin.name).toBe('passwerk');
    expect(plugin.name).toMatch(PLUGIN_NAME);
  });

  it('omits version, which the build injects', () => {
    expect(plugin).not.toHaveProperty('version');
  });

  it('declares the skills directory and the MCP server file', () => {
    expect(plugin.skills).toBe('./skills/');
    expect(plugin.mcpServers).toBe('./.mcp.json');
  });

  it('omits hooks, which Codex validation rejects', () => {
    expect(plugin).not.toHaveProperty('hooks');
  });

  it('omits apps, because no .app.json is shipped', () => {
    expect(plugin).not.toHaveProperty('apps');
  });

  it('carries the interface block Codex renders', () => {
    expect(plugin.interface).toMatchObject({
      displayName: 'passwerk',
      developerName: 'Shahriar Bijoy',
      category: 'Productivity',
    });
    expect(typeof plugin.interface.shortDescription).toBe('string');
    expect(typeof plugin.interface.defaultPrompt).toBe('string');
  });
});

describe('the plugin MCP server', () => {
  it('runs the published server through npx', () => {
    expect(mcp.mcpServers.passwerk).toEqual({
      command: 'npx',
      args: ['-y', '@passwerk/server'],
    });
  });
});

describe('the marketplace template', () => {
  it('matches the marketplace name rule and names the plugin', () => {
    expect(marketplace.name).toMatch(MARKETPLACE_NAME);
    expect(marketplace.interface.displayName).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
  });

  it('carries the three fields every entry requires', () => {
    const entry = marketplace.plugins[0];
    expect(entry.name).toBe('passwerk');
    expect(entry.source).toEqual({ source: 'local', path: './plugins/passwerk' });
    expect(entry.policy.installation).toBe('AVAILABLE');
    expect(entry.policy.authentication).toBe('ON_INSTALL');
    expect(entry.category).toBe('Productivity');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packaging/codex-plugin/test/plugin.test.ts`
Expected: FAIL — the three JSON files do not exist.

- [ ] **Step 3: Write the three manifests**

`packaging/codex-plugin/.codex-plugin/plugin.json` (no `version`; the build injects it):

```json
{
  "name": "passwerk",
  "description": "Build and validate EU Digital Battery Passports offline (AAS / IDTA 02035).",
  "keywords": ["battery-passport", "digital-product-passport", "aas", "idta-02035"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "passwerk",
    "shortDescription": "Turn supplier documents into a conformant EU battery passport, offline.",
    "longDescription": "passwerk ingests BOMs, Excel exports, energy bills and supplier declarations, proposes mappings with page and cell provenance, validates the result against the official IDTA 02035 templates and the AAS metamodel, reports the gaps with legal citations in German and English, and emits AAS JSON, AASX, an HTML passport sheet and a GS1 Digital Link QR code. No network calls, no model calls. It reports gaps and cites the regulation; it is not legal advice.",
    "developerName": "Shahriar Bijoy",
    "category": "Productivity",
    "capabilities": [],
    "websiteURL": "https://github.com/ShahriarBijoy/passwerk",
    "defaultPrompt": "Build an EU battery passport from the documents in ./supplier-docs."
  }
}
```

`packaging/codex-plugin/.mcp.json`:

```json
{
  "mcpServers": {
    "passwerk": {
      "command": "npx",
      "args": ["-y", "@passwerk/server"]
    }
  }
}
```

`packaging/codex-plugin/marketplace.json`:

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "passwerk",
      "source": {
        "source": "local",
        "path": "./plugins/passwerk"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packaging/codex-plugin/test/plugin.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the build script**

Create `packaging/codex-plugin/scripts/build.mjs`:

```js
#!/usr/bin/env node
/**
 * Assembles out/codex-plugin/: the manifests plus a copy of skills/passwerk. The skill has one
 * source; copying it here (and asserting the copy in the test) is what keeps the plugin from
 * drifting from the skill Claude Code reads.
 *
 *   pnpm package:codex
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = join(ROOT, 'out', 'codex-plugin');

const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8'),
).version;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, '.codex-plugin'), { recursive: true });

// version is injected, never committed: one source of truth is the server package.
const manifest = JSON.parse(readFileSync(join(HERE, '.codex-plugin', 'plugin.json'), 'utf8'));
const { name, ...rest } = manifest;
writeFileSync(
  join(OUT, '.codex-plugin', 'plugin.json'),
  `${JSON.stringify({ name, version: VERSION, ...rest }, null, 2)}\n`,
);

cpSync(join(HERE, '.mcp.json'), join(OUT, '.mcp.json'));
cpSync(join(ROOT, 'skills', 'passwerk'), join(OUT, 'skills', 'passwerk'), { recursive: true });

console.log(`built ${OUT} (passwerk ${VERSION})`);
console.log('install locally:');
console.log(`  cp -r ${OUT} ~/plugins/passwerk`);
console.log(`  cp ${join(HERE, 'marketplace.json')} ~/.agents/plugins/marketplace.json`);
console.log('  codex plugin add passwerk@personal');
```

- [ ] **Step 6: Write the drift test**

Append to `packaging/codex-plugin/test/plugin.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function tree(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      return statSync(full).isDirectory() ? tree(full, rel) : [rel];
    })
    .sort();
}

describe('the assembled plugin', () => {
  it('carries a byte-identical copy of skills/passwerk', () => {
    execFileSync(process.execPath, [join(root, 'packaging/codex-plugin/scripts/build.mjs')], {
      stdio: 'pipe',
    });
    const source = join(root, 'skills', 'passwerk');
    const copied = join(root, 'out', 'codex-plugin', 'skills', 'passwerk');
    expect(tree(copied)).toEqual(tree(source));
    for (const rel of tree(source)) {
      expect(readFileSync(join(copied, rel))).toEqual(readFileSync(join(source, rel)));
    }
  });

  it('injects the server version into the assembled manifest', () => {
    const built = read('../../../out/codex-plugin/.codex-plugin/plugin.json');
    const serverPkg = read('../../../packages/server/package.json');
    expect(built.version).toBe(serverPkg.version);
    expect(Object.keys(built)[0]).toBe('name');
    expect(Object.keys(built)[1]).toBe('version');
  });
});
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm vitest run packaging/codex-plugin/test/plugin.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 8: Run the full check and commit**

Run: `pnpm check`

```bash
git add packaging/codex-plugin/
git commit -m "feat(packaging): Codex plugin carrying the skill and the passwerk MCP server

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 8: PRIVACY.md and the connector submission checklist

**Files:**
- Create: `PRIVACY.md`
- Create: `docs/connector-submission.md`

**Interfaces:**
- Consumes: the twelve tools' `annotations` in `packages/server/src/tools/*.ts`; `packages/server/src/http.ts` for the transport facts.
- Produces: documents only. Nothing imports them.

- [ ] **Step 1: Read the real annotations before writing about them**

```bash
grep -A6 "annotations: {" packages/server/src/tools/*.ts
```

The checklist must list what each tool actually declares. Do not describe an annotation a tool does not set.

- [ ] **Step 2: Write PRIVACY.md**

Create `PRIVACY.md` at the repository root. It states only what the tests prove:

```markdown
# Privacy

passwerk processes battery documents entirely on the machine that runs it.

## What passwerk sends

Nothing. `@passwerk/core` and `@passwerk/server` make no network calls and no model calls at
runtime. There is no account, no telemetry, no analytics, no crash reporting and no usage
metric of any kind.

This is enforced, not promised:

- `packages/*/test/sovereignty.test.ts` monkey-patches every network API — `net`, `dns`, `tls`,
  `http`, `https`, `fetch`, `WebSocket`, `XMLHttpRequest` — to throw and record, then exercises
  the whole public surface: every MCP tool, resource and prompt, and every CLI command.
- CI runs the suite again inside Docker with `--network none`.
- `apps/web/e2e/sovereignty.spec.ts` proves the browser app issues no request beyond its own
  origin.

## What passwerk stores

- The MCP server keeps ingested documents and drafts in memory, in a bounded per-connection
  session store. Nothing is written to disk unless you ask a tool to emit a file, and then only
  under the directory you configured.
- The web app autosaves your decisions to your browser's IndexedDB, on your device. Document
  bytes are never autosaved.
- The MCPB bundle asks for one folder at install time. That folder is the only place the server
  reads documents from and writes passports to.

## The optional model assist

The web app has an optional mapping assist that is off unless you switch it on and supply your
own API key (ADR D-038). When it is on, and only then, the **browser** sends the labels of the
facts extracted from your documents to the endpoint you configured — Anthropic, or any
OpenAI-compatible base URL including a local Ollama or LM Studio. The model is asked to name
attributes and nothing else; any value it returns is discarded unread. Your key is held in
memory unless you tick "remember on this device", in which case it is stored in IndexedDB on
your device. `@passwerk/core` and `@passwerk/server` are not involved and remain network-free.

## Developer-time downloads

`packages/rules/scripts/fetch.ts` downloads the IDTA templates and schemas when a maintainer
regenerates the bundled artefacts. It never runs at install or at runtime, and every result is
pinned by sha256 in `packages/rules/PROVENANCE.md`.

## Contact

https://github.com/ShahriarBijoy/passwerk/issues
```

- [ ] **Step 3: Write the submission checklist**

Create `docs/connector-submission.md`. Date it 2026-09-09. It is owner-facing and English only.
Cover, in this order:

1. **What is submitted** — `@passwerk/server` over Streamable HTTP; the twelve tools; the
   `ui://passwerk/workbench.html` MCP App.
2. **Transport** — `passwerk-server --http [port]`, default bind `127.0.0.1:3777`,
   `PASSWERK_AUTH_TOKEN` required as a bearer token on `/mcp`, `/healthz` unauthenticated. The
   image is `ghcr.io/shahriarbijoy/passwerk:<version>` (distroless Node 22, non-root, HTTP mode
   only). Record that the reviewed endpoint must be hosted by the owner, and that this is an
   open item.
3. **Tools** — a table of the twelve names with the annotations each one actually declares
   (from step 1), plus the statement that every tool returns `structuredContent` and a readable
   `text` summary, and that every legal claim carries `sources[]` and `isNotLegalAdvice: true`.
4. **Screenshots to attach** — name the files: `docs/screenshots/mcp-app-01-project.png`,
   `mcp-app-03-review.png`, `mcp-app-04-gaps-export.png`, and `docs/media/passwerk-web.gif`.
5. **Privacy** — link `PRIVACY.md`; state that passwerk contacts no external service, which is
   why the MCPB manifest omits `privacy_policies`.
6. **Open items** — the hosted endpoint; `SECURITY.md` does not exist yet; the first npm publish
   and registry listing must be live before submission.

- [ ] **Step 4: Run the full check and commit**

Run: `pnpm check`
(Biome formats Markdown; fix anything it flags with `pnpm lint:fix`.)

```bash
git add PRIVACY.md docs/connector-submission.md
git commit -m "docs: privacy statement and Claude connector submission checklist

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 9: CI, release and install documentation

**Files:**
- Modify: `.github/workflows/ci.yml` (new `packaging` job)
- Modify: `.github/workflows/release.yml` (new `mcpb` job)
- Modify: `AGENTS.md` (commands table)
- Modify: `docs/install/claude-desktop.md`, `docs/install/codex.md`
- Modify: `README.md` (install section)
- Modify: `docs/RELEASE.md`

**Interfaces:**
- Consumes: `package:mcpb`, `package:smoke`, `package:codex` from Task 5.
- Produces: CI coverage on three operating systems; the `.mcpb` attached to the GitHub release.

**Note on version agreement.** The spec proposed extending the release workflow's version loop
to two new files. Because Task 3 and Task 7 derive `version` from
`packages/server/package.json` instead of committing it, there is nothing to check. Do **not**
add the two files to that loop, and say so in the ADR.

- [ ] **Step 1: Add the CI job**

In `.github/workflows/ci.yml`, after the `pack` job:

```yaml
  packaging:
    name: Packaging (${{ matrix.os }})
    needs: test
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build && pnpm build:mcp-app
      - run: pnpm release:pack
      - run: pnpm package:mcpb
      - run: pnpm package:smoke
      - run: pnpm package:codex
      - if: matrix.os == 'ubuntu-latest'
        uses: actions/upload-artifact@v7
        with:
          name: mcpb-bundle
          path: out/mcpb/*.mcpb
          retention-days: 14
```

- [ ] **Step 2: Add the release job**

In `.github/workflows/release.yml`, add an `mcpb` job that `needs: verify`, runs on
`ubuntu-latest`, repeats the build steps above, and uploads
`out/mcpb/passwerk-${{ needs.verify.outputs.version }}.mcpb` as a workflow artifact. Then, in
the job that creates the GitHub release, add the `.mcpb` to the files it attaches beside the
four tarballs. Match the existing pinned-SHA style of that file: every `uses:` there is pinned
to a commit SHA with a version comment, so copy the SHAs already used in `release.yml` rather
than writing `@v4`.

- [ ] **Step 3: Update the commands table**

In `AGENTS.md`, in the fenced command list, after `pnpm e2e`:

```sh
pnpm package:mcpb       # build out/mcpb/passwerk-<version>.mcpb (after build, build:mcp-app, release:pack)
pnpm package:smoke      # unzip that bundle and drive it over stdio
pnpm package:codex      # build out/codex-plugin/ (manifests plus a copy of skills/passwerk)
```

Also add the `packaging` row to the repository map table:

```
| `packaging` (Phase 7c) | | MCPB bundle for Claude Desktop, Codex plugin, connector submission checklist |
```

replacing the existing `packaging` row.

- [ ] **Step 4: Replace the install-doc placeholders**

In `docs/install/claude-desktop.md`, replace the sentence "Phase 7c will ship a one-click MCPB
bundle; until then the JSON configuration below works." with a new first section describing the
bundle: download `passwerk-<version>.mcpb` from the GitHub release, open it, Claude Desktop
shows an install dialog and asks for the document folder, restart. Keep the JSON configuration
below it as the alternative for `npx` and from-source installs.

In `docs/install/codex.md`, replace "Alternatively, install the skill into Codex's skills
directory once Phase 7c ships the `.codex-plugin/plugin.json` bundle." with the real commands:

```sh
pnpm package:codex
cp -r out/codex-plugin ~/plugins/passwerk
cp packaging/codex-plugin/marketplace.json ~/.agents/plugins/marketplace.json
codex plugin add passwerk@personal
```

with a note that on Windows the equivalent paths under the user profile apply, that
`~/.agents/plugins/marketplace.json` is discovered implicitly, and that a new Codex session is
needed to pick up the skill and tools.

Also remove the `<!-- verify: the env sub-table syntax ... -->` comment only if you have
confirmed the syntax against the Codex configuration reference; otherwise leave it.

- [ ] **Step 5: Update README and RELEASE**

In `README.md`, add the `.mcpb` one-click install as the first Claude Desktop option in the
install section, linking the GitHub release.

In `docs/RELEASE.md`, under "Every release", add a step after the workflow watch: download the
`.mcpb` from the release and confirm it installs on macOS and on Windows. Do not add the two
manifests to step 1's version-bump list — they carry no version.

- [ ] **Step 6: Verify the workflows parse and the docs are formatted**

Run: `pnpm lint` and, if `gh` is available, `gh workflow view ci.yml` after pushing. A YAML
syntax error is the most likely mistake here; `pnpm lint` will not catch it, so re-read both
diffs carefully.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ AGENTS.md docs/install/ README.md docs/RELEASE.md
git commit -m "ci(packaging): build and smoke the bundle on three operating systems

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
```

---

### Task 10: ADR D-039, status, and the pull request

**Files:**
- Modify: `docs/DECISIONS.md` (append ADR D-039)
- Modify: `docs/BUILD_PLAN.md` (Phase 7c marked done)
- Modify: `AGENTS.md` (status section)

**Interfaces:**
- Consumes: everything above.
- Produces: the PR.

- [ ] **Step 1: Write ADR D-039**

Append to `docs/DECISIONS.md`, following the shape of D-037 and D-038 (context, decision,
consequences, and a measurements block the owner fills in). It records:

- the MCPB bundle vendors the `rules`, `core` and `server` release tarballs with
  `--omit=dev --omit=optional`, so a one-click install is offline; `--omit=optional` keeps
  `pdfjs-dist`'s native canvas out and the bundle platform-neutral;
- the launcher exists because `dist/bin.js` self-executes only as `argv[1]`, and importing it
  keeps the workbench resolving inside the installed package;
- `version`, `tools` and `prompts` are derived at build time from the server package and its
  registry, so the release workflow's version-agreement loop did not need to grow;
- the Codex plugin does not vendor a runtime and points at `npx -y @passwerk/server`; the skill
  is copied from its single source and the copy is asserted byte-for-byte;
- `privacy_policies` is omitted from the MCPB manifest because passwerk contacts no external
  service;
- the manual measurements, left blank for the owner to fill: the one-click install on macOS and
  on Windows, and `codex plugin add passwerk@personal` in a new Codex session;
- `SECURITY.md` remains an open item.

- [ ] **Step 2: Update the status**

In `AGENTS.md`, add the Phase 7c bullet to the status list and change **Next:** to Phase 8
(proof and pilot: AASX Package Explorer, BatteryPass-Ready, the pilot case study).

In `docs/BUILD_PLAN.md` Phase 7c, add a `**Done (2026-09-09):**` paragraph in the style of the
other phases, and note the design document path.

- [ ] **Step 3: Run everything**

```bash
pnpm check
pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm release:smoke
pnpm package:mcpb && pnpm package:smoke && pnpm package:codex
```

Report the real output. If any command fails, fix it before opening the PR.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/DECISIONS.md docs/BUILD_PLAN.md AGENTS.md
git commit -m "docs: ADR D-039, Phase 7c complete

Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1"
git push -u origin feat/packaging
```

Open the PR with `gh pr create`. The description covers: what ships, the two external formats
and their sources, the derived-version improvement over the spec, what CI proves and on which
operating systems, the two owner measurements still outstanding, and `SECURITY.md` as the
remaining open item. End the description with:

```
https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1
```

- [ ] **Step 5: Hand the owner their two measurements**

Tell the owner exactly what to run, and that the phase is not done until both are recorded in
D-039:

1. download `out/mcpb/passwerk-<version>.mcpb`, open it in Claude Desktop on macOS and on
   Windows, confirm the document-folder prompt, twelve tools, and that *open the passwerk
   workbench* renders the MCP App;
2. `pnpm package:codex`, copy as printed, `codex plugin add passwerk@personal`, then in a new
   session confirm the skill and the tools are present.

---

## Self-Review

**Spec coverage.** Section 3 layout → Tasks 1, 3–7. Section 4.1 vendored tarballs → Task 5.
4.2 launcher → Task 5. 4.3 manifest → Tasks 3, 4. Section 5.1 smoke → Task 6. 5.2 shared client
→ Task 2. 5.3 (no duplicate sovereignty check) → honoured; Task 6's header says why. 5.4 manual
half → Task 10 step 5. Section 6 Codex plugin → Task 7. 6.3 install commands → Task 9 step 4.
Section 7 checklist and privacy → Task 8. Section 8 wiring → Tasks 5 and 9. Section 9 ADR →
Task 10.

**Deviation from the spec, deliberate and flagged in the plan header and in Task 9:** version,
tools and prompts are derived rather than committed and checked, so the release workflow's
agreement loop is unchanged.

**Types.** `rpcCollect` returns results aligned with `requests` (Tasks 2, 6). `buildManifest(base, { version, tools, promptNames })` — same signature in Tasks 3 and 5. `iconPng(): Buffer` —
Tasks 4 and 5.
