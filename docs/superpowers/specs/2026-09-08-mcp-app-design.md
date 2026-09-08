# Phase 7b design: the passwerk MCP App (`apps/mcp-app`)

Status: approved in conversation 2026-09-08. Branch `feat/mcp-app`.
Scope: `docs/BUILD_PLAN.md` section 7, Phase 7b, as amended by ADR D-019. One new package
(`apps/mcp-app`), one new tool and one new resource in `@passwerk/server`, one small
refactor in `apps/web` (the shell takes its platform hooks as a prop), one ADR (D-037), the
build plan status, `AGENTS.md`, the README and the install docs. No change to
`@passwerk/core` or `@passwerk/rules` beyond what a red test forces.

Out of scope: bring-your-own-key (own PR), Phase 7c packaging, ChatGPT-specific behaviour,
the hosted connector.

## 1. Goal and definition of done

A user of Claude Desktop (stdio) or Claude web (Streamable HTTP) asks Claude to review or
build a battery passport. Claude calls `review_passport`; the host renders the passwerk
workbench inline: the web app's project, upload, facts, review and gaps/export screens in
the host's theme and language. The user drops documents into the file input, accepts
proposals and fixes gaps exactly as in `apps/web`. Every change is synced to the server as a
draft id, so Claude can continue in text (`gap_report`, `emit_passport`) on the same draft.
Claude Code and Codex CLI never render the UI and behave as today.

| Deliverable | Done when |
|---|---|
| `review_passport` tool | Twelfth tool; optional draft and facts refs in, draft id, draft, facts, report and gap out, with a DE/EN text summary; carries `_meta.ui.resourceUri`; read-only, idempotent |
| `ui://passwerk/workbench.html` resource | Served with mime `text/html;profile=mcp-app`, an empty CSP (no connect or resource domains) and `prefersBorder: true`; fail-honest when the workbench is not built |
| `apps/mcp-app` | Single-file HTML built by Vite from the web app's `views`, `workflow`, `i18n` and `components` plus its own shell; theme and language from the host context; no IndexedDB |
| Sync | After each decision (debounced 1 s) the derived draft is stored through `validate_passport` and the model context is updated with verdict, completeness and draft id |
| Exports | Built in the iframe; handed to the host's `downloadFile` when advertised, otherwise the export panel names the draft id and tells the user to ask Claude for `emit_passport` |
| Tests | Vitest for the server tool and resource, the bridge (against the SDK's own `AppBridge`) and the import boundary; Playwright with a dev-only host page against the real server: Musterwerk track, golden track, model-context track, sovereignty |
| Claude Desktop | The Musterwerk run completes inside Claude Desktop; screenshots in `docs/screenshots/`; the D-019 facts (file input, payload cap) and the pdf.js worker result recorded in ADR D-037 |
| Records | ADR D-037; Phase 7b status in the build plan and `AGENTS.md`; README, install docs and `SKILL.md` name the twelfth tool |

`pnpm check` green, oracle parity unchanged at 16/16, `pnpm build:web && pnpm e2e` green,
`pnpm build:mcp-app && pnpm e2e:mcp-app` green, `pnpm release:pack && pnpm release:smoke`
green with the workbench resource readable from the installed tarball.

## 2. Principles

Carried in from the web app specs: core is the only domain logic; only inputs are state; no
network from the iframe, no telemetry; no floats; injected clock; bilingual chrome; no
`useEffect`; dependency ages (3 days). Three additions:

- **The server stays dependency-lean.** `@passwerk/server` does not depend on
  `@modelcontextprotocol/ext-apps`. It writes the two literals the MCP Apps spec defines (the
  mime type and the `_meta.ui` shape) and a test in the monorepo asserts they equal the SDK's
  constants. Only `apps/mcp-app` depends on the SDK.
- **The iframe is the web app.** Documents are ingested and the passport is derived inside
  the iframe by `@passwerk/core`, as in `apps/web`. Only the derived `PassportDraft` travels
  to the server (D-019: "ingested by core inside the iframe itself so documents never leave
  the browser").
- **The model sees what the user sees.** The draft the model can address by id is always the
  last draft the workbench derived, never an older one. The sync is idempotent because the
  session store is content-addressed (same draft, same id).

## 3. Server (`@passwerk/server`)

### 3.1 `review_passport`

```
input:  { draft?: DraftRef, facts?: FactsRef }          (+ lang, added by the wrapper)
output: { draftId?, draft?, factSetId?, facts?, report?, gap? }  (+ error)
```

- With `draft`: resolves it (storing an inline draft), runs `validate` and `gapReport` with
  the server clock as `asOf`, returns everything. With `facts`: resolves and returns them too.
- Without either: returns `{}` with the text "Workbench opened. Upload documents or import a
  draft in the workbench." (DE/EN). The workbench then starts on the project screen.
- Annotations: `readOnlyHint: true`, `idempotentHint: true`.
- Description tells the model when to call it: "Opens the interactive passwerk workbench in
  hosts that render MCP Apps (Claude Desktop, Claude web). Pass the current draft so the user
  reviews it visually; the workbench keeps the draft id in sync. Hosts without a UI receive
  the same data as text."
- `ToolDefinition` gains an optional `ui?: { resourceUri: string }`. `createServer` passes it
  as `_meta: { ui: { resourceUri, visibility: ['model', 'app'] } }` to `registerTool`
  (SDK 1.30 accepts `_meta`). Only `review_passport` sets it.

### 3.2 The resource

- URI `ui://passwerk/workbench.html`, name `workbench`, title "passwerk workbench", mime
  `text/html;profile=mcp-app`. Listed beside the existing static resources.
- Content `_meta.ui`: `{ csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true }`.
  Empty arrays are stated, not omitted, so the sovereignty claim is explicit on the wire.
- `ServerOptions.ui?: { html(): Promise<string> }`. `server.ts` stays free of `node:fs`;
  `bin.ts` injects `readFile(new URL('../ui/workbench.html', import.meta.url))`, which
  resolves to `packages/server/ui/workbench.html` both in the repo and in the tarball.
- Without a loader, or when the loader rejects, the read fails with an MCP error whose
  message is "The passwerk workbench is not built. Run `pnpm build:mcp-app` (or install a
  release build)." The tool still works as a text tool.

### 3.3 Twelve tools

`packages/cli/test/tools.test.ts` expects twelve. `README.md`, `docs/install/*.md`,
`skills/passwerk/SKILL.md` (the skill test requires every tool named) and
`packages/server/server.json` are updated. The CLI needs no other change: `review_passport`
is a read-only tool like `validate_passport` and appears in `passwerk tools`.

## 4. `apps/mcp-app`

### 4.1 Package

`@passwerk/mcp-app`, private. Vite 8 with `@vitejs/plugin-react`, `@tailwindcss/vite` and
`vite-plugin-singlefile` 2.3.3. The alias `@` points at `apps/web/src` so
`@/components/ui/*` and `@/lib/utils` resolve exactly as they do in the web app. Tailwind
gets `@source "../../web/src"` so the reused views' classes are generated.

Scripts: `build` (vite build, then copy `dist/workbench.html` to
`packages/server/ui/workbench.html`), `e2e`, `clean`. Root scripts: `build:mcp-app`,
`e2e:mcp-app`. `packages/server/ui/` is gitignored and listed in the server's `files`.

Dependencies mirror `apps/web` (same pinned versions, so pnpm resolves one React) plus
`@modelcontextprotocol/ext-apps` 1.7.5 and, for the e2e host page only,
`@modelcontextprotocol/sdk` 1.30.0.

### 4.2 Files

```
apps/mcp-app/
  index.html                 the entry the singlefile plugin inlines
  src/main.tsx               boot: store, bridge, React root
  src/bridge.ts              host adapter over ext-apps `App`: seed, sync, download
  src/host.ts                theme and language from the host context
  src/index.css              imports ../../web/src/index.css, adds @source
  test/boundary.test.ts      import rules (section 4.6)
  test/bridge.test.ts        App <-> AppBridge <-> real server, in memory
  e2e/host/index.html        dev-only host page (section 5.3)
  e2e/host/host.ts
  e2e/*.spec.ts
  vite.config.ts, vite.host.config.ts, playwright.config.ts, tsconfig.json
```

### 4.3 The web shell takes a `platform` prop

The one change in `apps/web`: `App` gets

```ts
export interface Platform {
  download(file: ExportFile): void;
  clearPersisted(): void;
  pdfWorkerSrc?: string;
}
```

`apps/web/src/main.tsx` passes the browser implementation (`downloadFile`, `clearState`, the
`?url` worker import). `App.tsx` stops importing `persistence.ts` and `download.ts`, so the
MCP App can import `app/App.tsx`, `app/clock.ts`, `app/ErrorBoundary.tsx` and
`app/useStore.ts` without pulling in `idb-keyval`. The web app's own tests and Playwright
runs are unchanged in behaviour.

### 4.4 Boot and seeding (`main.tsx`, `bridge.ts`)

1. `new App({ name: 'passwerk workbench', version })`; handlers registered before
   `connect()`.
2. `ontoolresult`: `seedActions(structuredContent, now)` returns the reducer actions:
   `setLanguage` from the host locale (`de*` gives `de`, anything else `en`); when a draft is
   present, `importDraft` (the reducer already derives the project from `draft.meta`) and,
   when facts are present, `filesIngested` with summaries taken from `facts.documents` and
   the facts themselves; then `goTo('review')` when a draft was given, otherwise the state
   stays on the project screen. `ontoolinput` is ignored: the input is a reference, the
   result carries the data.
3. `onhostcontextchanged`: theme `dark` toggles the `dark` class on `<html>` (the web app's
   Tailwind variant); a locale change dispatches `setLanguage`.
4. `Platform` for the iframe: `download` goes through `hostDownload` (section 4.5),
   `clearPersisted` is a no-op, `pdfWorkerSrc` is the `?url` import, which the singlefile
   build turns into a data URL. If the host CSP rejects that worker, pdf.js falls back to its
   main-thread worker; the Claude Desktop run records which path ran (section 6).
5. Render `<ErrorBoundary><App store platform /></ErrorBoundary>` into `#root`.

### 4.5 Sync and export (`bridge.ts`)

- `attachSync(app, store, { asOf, debounceMs: 1000 })`: subscribes to the store; on change,
  after the debounce, derives the state with the web workflow's `derive`; if the canonical
  JSON of the draft differs from the last synced one, calls
  `validate_passport({ draft })` through `app.callServerTool`, keeps the returned `draftId`,
  and, when the host advertises `updateModelContext`, sends
  `{ content: [{ type: 'text', text }], structuredContent: { draftId, verdict, mandatoryCompleteness } }`
  where `text` is one DE/EN sentence: verdict, mandatory completeness, count of open required
  gaps, draft id. A sync that fails is retried on the next change and never throws into the
  UI; the last error is exposed for the export panel.
- `hostDownload(app, file)`: when `getHostCapabilities()?.downloadFile` is present, calls
  `app.downloadFile({ contents: [{ type: 'resource', resource: { uri: 'passwerk://export/<name>', blob, mimeType } }] })`.
  Otherwise it shows a toast (sonner, DE/EN): "This host cannot save files. Ask Claude to run
  emit_passport for draft <id> with an outDir." The draft id shown is the last synced one.
- The bridge is written against a small `HostLink` interface (`callServerTool`,
  `updateModelContext`, `downloadFile`, `getHostCapabilities`, `getHostContext`) that
  `App` satisfies structurally, so tests can pass the real `App` or a fake.

### 4.6 Boundary

`apps/mcp-app/src` may import from `apps/web/src`: `views`, `workflow`, `i18n`,
`components`, `lib`, and `app/{App,clock,ErrorBoundary,useStore}`. Forbidden:
`app/persistence.ts`, `app/download.ts`, `main.tsx`, `idb-keyval`, `node:*`. The web app's
own boundary test is unchanged.

## 5. Tests

### 5.1 Server (Vitest)

- `tools/list` shows `review_passport` with `_meta.ui.resourceUri === 'ui://passwerk/workbench.html'`
  and visibility model and app; no other tool has `_meta.ui`.
- `review_passport` with the `ev-valid` sample returns `draftId`, the sample draft, a
  `valid` report and a gap with 100 % mandatory completeness; with `{ draftId }` of a stored
  draft it returns the same; with nothing it returns `{}` and the "workbench opened" text;
  with a broken sample it is fail-honest (`PW-L1` findings).
- `resources/list` contains the workbench URI; `resources/read` with a stub loader returns
  the HTML, the mime type and `_meta.ui` with both CSP arrays empty and `prefersBorder: true`;
  without a loader the read rejects with the "not built" message.
- The mime literal and the `_meta` shape equal `RESOURCE_MIME_TYPE` and the SDK's
  `McpUiResourceMeta` field names (a monorepo test importing ext-apps; the server package
  itself does not).
- Sovereignty: the new tool and resource are covered by the existing surface test.

### 5.2 Bridge (Vitest, jsdom)

`App` and the SDK's `AppBridge` are joined with `InMemoryTransport.createLinkedPair()`; the
`AppBridge` wraps a real `Client` connected to `createServer()` over a second in-memory pair.

- Seeding: a tool result with the `ev-valid` draft produces `importDraft` and `goTo('review')`;
  with facts it also produces `filesIngested`; with `{}` it produces only `setLanguage`.
- Sync: a `decide` action leads, after the debounce (fake timers), to one
  `validate_passport` call and one `updateModelContext` with the same `draftId` the server's
  store now holds; two identical drafts sync once; an unchanged language toggle syncs nothing.
- Download: with `downloadFile` advertised the request reaches the bridge with the file's
  name, blob and mime; without it a toast is requested and nothing is sent.
- Theme: `dark` adds the class, `light` removes it.

### 5.3 Playwright (`apps/mcp-app/e2e`)

A dev-only host page (`e2e/host`, built by `vite.host.config.ts` into `dist-host/`, never
shipped) does what the SDK's `basic-host` does: connects a `Client` over
`StreamableHTTPClientTransport` to `/mcp` on its own origin, lists tools, calls
`review_passport`, reads the resource, loads the HTML into a sandboxed iframe
(`allow-scripts allow-same-origin allow-forms`) and drives an `AppBridge` over
`PostMessageTransport`. It renders every `updateModelContext` payload and its own MCP session
id into `data-testid` elements.

`playwright.config.ts` starts two web servers: `vite preview` of `dist-host/` with
`preview.proxy['/mcp']` pointed at the passwerk server, and
`node packages/server/dist/bin.js --http 3778` with a fixed test token. The proxy keeps every
browser request on the preview origin.

Tracks:

- **Musterwerk**: the five fixtures uploaded through the file input inside the iframe; every
  proposal at confidence >= 0.7 accepted; the verdict, findings and gap items equal core's
  Node results for the same inputs and the pinned clock (the helpers from `apps/web/e2e` are
  reused).
- **Golden**: `review_passport` with each golden sample's draft renders the workbench on the
  review step with core's verdict and finding ids.
- **Model context**: after the Musterwerk decisions, the last `updateModelContext` payload
  names a draft id; a Node MCP client attached to the same session id calls
  `gap_report({ draftId })` and gets the same gap items the iframe shows.
- **Sovereignty**: every request the page makes stays on the preview origin.

### 5.4 Claude Desktop (manual, owner)

Config snippet and checklist in `docs/install/claude-desktop.md`. The owner runs the
Musterwerk flow once, takes the screenshots for the directory submission, and reports: does
the file input open the OS picker; does PDF ingest run (worker or fallback); what payload
size `callServerTool` accepts (the probe in section 6); is `downloadFile` advertised.

## 6. Order of work and the probe

1. Web `Platform` refactor (tests unchanged, `pnpm check` green).
2. Server: `review_passport`, resource, `ServerOptions.ui`, twelve-tool docs, tests.
3. Probe: a throwaway `probe.html` built through the same singlefile pipeline and copied to
   `packages/server/ui/workbench.html`, so `review_passport` in Claude Desktop shows it. It
   prints host capabilities and context, offers a file input and reports the bytes read,
   tries a worker from a data URL and from a blob URL, calls `ingest_documents` with inline
   payloads of 1, 4 and 16 MB and reports success and latency, and calls `downloadFile` with
   a small text file. The owner runs it and pastes the output; it is deleted before the PR.
4. `apps/mcp-app`: package, bridge with tests, shell, build and copy, boundary test.
5. Playwright host page and the four tracks; CI job.
6. Docs: ADR D-037 with the probe's measured facts, build plan, `AGENTS.md`, README, install
   docs, `SKILL.md`, `server.json`.
7. Claude Desktop run with screenshots; `pnpm check`; PR.

If the probe shows the pdf.js worker and its main-thread fallback both blocked, ingest inside
the iframe falls back to `ingest_documents` with inline bytes followed by `extract_facts`,
and the facts are seeded through `filesIngested`. That path is designed here and implemented
only if needed; it is recorded either way in D-037.

## 7. CI and release

- The `web` job also runs `pnpm build:mcp-app && pnpm e2e:mcp-app` (same Chromium cache).
- The `pack` job runs `pnpm build:mcp-app` before `pnpm release:pack`; `pack-smoke.mjs`
  reads `ui://passwerk/workbench.html` over stdio from the installed server and asserts the
  mime type and a non-empty body.
- `release.yml` builds the workbench before publishing `@passwerk/server`.
- The tarball grows by the workbench size (about 4 MB uncompressed); D-037 records the
  measured number.

## 8. Risks

| Risk | Handling |
|---|---|
| Host CSP blocks the inlined pdf.js worker | pdf.js main-thread fallback; if that is blocked too, section 6's inline-bytes path |
| Host caps `callServerTool` payloads below a full draft | A draft is tens of kilobytes; the probe measures the cap; recorded in D-037 |
| `downloadFile` not advertised by Claude Desktop | Export panel names the draft id and points at `emit_passport` with `outDir`; the local stdio server writes files |
| A 4 MB resource is slow to load | Measured in the Claude Desktop run; if unacceptable, pdf.js can be split out of the resource behind the inline-bytes path |
| Two React copies through the alias | Same pinned versions in both packages; pnpm resolves one store path; a smoke render in the bridge test would fail loudly otherwise |
