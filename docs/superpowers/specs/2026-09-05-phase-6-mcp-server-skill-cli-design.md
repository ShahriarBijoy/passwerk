# Phase 6 design: MCP server, agent skill, CLI

Date: 2026-09-05. Status: approved by the owner in conversation (two PRs, carrier and HTML
deferred to Phase 7, adjusted definition of done, plain `node:http`).

This document refines build plan section 5 (MCP contract) and section 7 (Phase 6) into the
concrete design that the two Phase 6 pull requests implement. Where it departs from the plan,
the departure is listed in section 8 and recorded as an ADR.

## 1. Goal

Expose the deterministic `@passwerk/core` pipeline to any MCP host (Claude Code, Codex CLI,
OpenCode, Cursor, Claude Desktop) through `@passwerk/server`, teach the workflow with an
agent skill, and give scripts and CI a no-LLM `passwerk` binary. The server and the CLI are
adapters (ADR D-001): they hold no domain rule, make no network call at runtime and call no
language model (ADR D-002). The only exception is the optional `passwerk chat` demo command.

## 2. Delivery

Two pull requests, both Phase 6, both off `main`:

| PR | Branch | Contents |
|---|---|---|
| 6.1 | `feat/phase-6-mcp-server` | `@passwerk/server` (tools, resources, prompts, session store, stdio, Streamable HTTP), `skills/passwerk/`, `docs/install/`, root `.mcp.json`, sovereignty coverage, ADR |
| 6.2 | `feat/phase-6-cli` | `@passwerk/cli` (`audit`, `extract`, `emit`, `gaps`, `obligations`, `tools`, `chat`), the demo script, README updates |

Dependency order becomes `rules`, `core`, `server`, `cli`. The CLI imports the server's
tool registry so `passwerk tools` and `passwerk chat` present exactly the tools the MCP host
sees. `apps/web` still depends on `core` only.

## 3. `@passwerk/server`

### 3.1 Layout

```
packages/server/src/
  index.ts          createServer(), registry export, version
  bin.ts            #!/usr/bin/env node: stdio by default, --http [port]
  registry.ts       ToolDefinition type and the ordered list of tools
  session.ts        SessionStore: bounded, content-addressed, per connection
  summary.ts        DE/EN text summaries for every tool result
  fs.ts             FileSystemAdapter interface + node implementation (bin only)
  tools/            one file per tool
  resources/        samples.ts · reference.ts · session.ts
  prompts/          buildPassportInterview.ts · auditSupplierSubmission.ts · draftDataRequest.ts
  http.ts           Streamable HTTP host on node:http, bearer auth, /healthz
  logging.ts        stderr logger, payloads off by default
```

`createServer(options)` builds an `McpServer` from the registry. Options: `fs` (a
`FileSystemAdapter`; omitted means `ingest_documents` accepts inline bytes only), `store`
(a `SessionStore`; default new bounded store), `clock` (ISO date-time string used when a tool
needs "now" and the caller gave no `asOf`; default `new Date().toISOString()` in `bin.ts`,
fixed in tests), `log`.

### 3.2 Tool registry

```ts
interface ToolDefinition<I, O> {
  name: string;
  title: string;
  description: string;           // English, written for the host model
  inputSchema: ZodRawShape;      // Zod 4, converted by the SDK
  outputSchema: ZodRawShape;
  annotations: { readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: false };
  handler(input: I, ctx: ToolContext): Promise<ToolResult<O>>;
}
interface ToolContext { store: SessionStore; fs?: FileSystemAdapter; clock: string; }
interface ToolResult<O> { structured: O; text: { de: string; en: string } }
```

The registry is a plain array. `createServer` registers each entry with `registerTool`;
`content` is one text block in the requested `lang` (default `en`), `structuredContent` is
`structured`. Every tool accepts `lang?: 'de' | 'en'`. The CLI turns the same array into
Anthropic tool definitions and into the `passwerk tools` listing.

Errors: a core `PassportDraftError` or a Zod failure becomes `isError: true` with a text block
describing the findings and, where the input was a draft, the L1 findings in
`structuredContent.findings`. Unknown ids return `isError: true` with the message
`Unknown <kind> id "<id>". Ids live for one connection; re-send the object.`

### 3.3 Session store and ids

In-memory, per connection (per `McpServer` instance), bounded by count (default 256 entries)
and by total canonical-JSON bytes (default 256 MiB), least recently used evicted first. Each
entry kind has its own prefix and id derived from the content hash:

| Kind | Id | Computed over |
|---|---|---|
| `DocumentBundle` | `bnd_` + first 16 hex of sha256 | canonical JSON of the bundle |
| `FactSet` | `fct_` + 16 hex | canonical JSON of the fact set |
| `PassportDraft` | `drf_` + 16 hex | canonical JSON of the draft |

Content addressing makes re-running a step with the same input return the same id and keeps
tool output byte-identical across runs. The store exposes `put(kind, value): id`,
`get(kind, id)`, `has`, `stats()`.

Tool inputs use a union: `bundle: DocumentBundle | { bundleId: string }` and so on. Tool
outputs always carry the id of what they produced, and the full object unless a `detail`
option says otherwise.

### 3.4 Tools

All tools return `structuredContent` and a DE/EN text summary. `asOf` is accepted wherever
core takes it; it defaults to `draft.meta.createdAt` (core's default) so output is
deterministic without a clock.

| Tool | Input | Output (`structuredContent`) | Notes |
|---|---|---|---|
| `ingest_documents` | `{ paths?: string[], inline?: { name, base64 }[], detail?: 'summary' \| 'full', limits?: Partial<IngestLimits>, lang? }` | `{ bundleId, documents: DocumentSummary[], bundle?: DocumentBundle }` | `paths` need the fs adapter; a directory expands to its supported files (non-recursive, sorted by name); unsupported files land in the bundle with their `error`. `paths` outside `PASSWERK_ROOT` (when set) are refused. Default `detail` is `summary`. |
| `extract_facts` | `{ bundle: DocumentBundle \| { bundleId }, lang? }` | `{ factSetId, facts: FactSet }` | Pure `extractFacts`. |
| `suggest_mappings` | `{ facts: FactSet \| { factSetId }, category: BatteryCategory, minConfidence?: number, lang? }` | `{ proposals: MappingProposal[], factSetId }` | `suggestMappings`, sorted as core sorts. `minConfidence` filters, default 0. |
| `apply_mappings` | `{ draft?: PassportDraft \| { draftId }, meta?: { category, passportId, createdAt? }, mappings: MappingDecision[], lang? }` | `{ draftId, draft, applied, conflicts }` | Either `draft` or `meta` is required; `meta` creates a new draft through `newDraft` with `createdAt` defaulting to `ctx.clock`. Conflicts are returned, never resolved silently (D-025). |
| `validate_passport` | `{ draft: PassportDraft \| { draftId }, asOf?, skipPlausibility?, lang? }` | `ValidationReport & { draftId }` | `validate` from core, L1 to L4. |
| `gap_report` | `{ draft: PassportDraft \| { draftId }, asOf?, lang? }` | `GapReport & { draftId }` | Runs `validate` first and passes the report, as the web app does. |
| `emit_passport` | `{ draft: PassportDraft \| { draftId }, targets: ('aas-json' \| 'aasx' \| 'draft-json')[], outDir?: string, asOf?, lang? }` | `{ draftId, verdict, findings, files: { target, name, bytes?: base64, path?: string, size }[] }` | Verdict is the emitter's own re-validation (D-026). `outDir` needs the fs adapter and writes files; otherwise bytes come back inline. Files are returned even when the verdict is `invalid`. |
| `check_obligations` | `ObligationInput & { lang? }` | `ObligationResult` | Straight through. |
| `explain_attribute` | `{ id: string, lang? }` | `AttributeExplanation \| RuleExplanation` | `explain(id)`; unknown id is `isError`. |
| `list_capabilities` | `{ lang? }` | `Capabilities & { server: { name, version, transports, session: stats } }` | `listCapabilities()` from rules plus the server's own data. |

`generate_carrier` and the `html` emit target are not registered in Phase 6; they arrive with
their core modules in Phase 7.

`DocumentSummary` is `{ name, format, contentType, sha256, lang, pages, tables, lines, error? }`
computed from the bundle without re-reading anything.

### 3.5 Resources

| URI | Content | MIME |
|---|---|---|
| `passwerk://samples` | list of golden sample names, valid and broken, with one-line descriptions | `application/json` |
| `passwerk://samples/{name}` | the golden `PassportDraftInput` | `application/json` |
| `passwerk://reference/attributes` | every knowledge-base attribute (id, name DE/EN, valueKind, unit, applicability, legalRefs, synonyms, whoTypicallyHasIt, verify) | `application/json` |
| `passwerk://reference/rules` | the PW-PLAUS catalogue (id, severity, title, message, fixHint, attributes, legalRef) | `application/json` |
| `passwerk://reference/cheatsheet` | one page, DE and EN: categories, key dates from the timeline, mandatory attribute counts per category, the workflow order and the confidence rule | `text/markdown` |
| `passwerk://reference/template/{part}` | the catalogue entries for one IDTA 02035 part (path, idShort, semanticId, cardinality, valueType) | `application/json` |
| `passwerk://session/{kind}/{id}` | a stored bundle, fact set or draft in full | `application/json` |

Resource text is canonical JSON so re-reads are byte-identical. The cheat sheet is generated
from the knowledge base at request time, not hand-written, so it cannot drift.

### 3.6 Prompts

| Name | Arguments | Message |
|---|---|---|
| `build-passport-interview` | `category?`, `lang?` | The guided flow: confirm category with `check_obligations`, ingest, extract, suggest, review proposals under 0.7 with the user, apply, validate, fix loop (max 5), gap report grouped by data owner, emit only on `valid` or accepted warnings. |
| `audit-supplier-submission` | `lang?` | For a receiving OEM or Tier-1: validate, gap report, then accept, review or reject with the rationale drawn from findings and gaps. |
| `draft-data-request` | `lang?` | Turn a gap report into the request a supplier sends upstream, grouped by data owner, citing the legal references the report carries. |

Every prompt ends with the honesty rules: no validity claim without `validate_passport`,
DE/EN according to the user's language, and the `isNotLegalAdvice` disclaimer.

### 3.7 Transports

`bin.ts` parses `--http [port]`, `--host`, `--root <dir>` (or `PASSWERK_ROOT`), `--version`.

- **stdio** (default): one `McpServer`, one store, `StdioServerTransport`. Nothing is written
  to stdout except protocol frames; the logger writes to stderr.
- **Streamable HTTP**: `node:http` server, default host `127.0.0.1`, default port 3777.
  Requires `PASSWERK_AUTH_TOKEN`; without it the process exits with code 2 and a message.
  Every request to `/mcp` must carry `Authorization: Bearer <token>`; otherwise 401 with a
  JSON-RPC error body. `GET /healthz` returns `{ "status": "ok", "name", "version" }` without
  auth. One `McpServer` plus one store per MCP session (`Mcp-Session-Id`), created on
  `initialize`, removed on `DELETE` or transport close. DNS rebinding protection is on when
  the host is loopback.
- Payload logging is off; `PASSWERK_LOG_PAYLOADS=1` logs tool names with input and output
  sizes and, at `debug`, the payloads themselves. Nothing is logged by default beyond startup
  and errors.

### 3.8 File system adapter

```ts
interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  stat(path: string): Promise<{ kind: 'file' | 'directory' | 'missing' }>;
  readDir(path: string): Promise<string[]>;
  resolve(path: string): string;   // absolute, normalised
}
```

`bin.ts` injects the Node implementation. Tests inject an in-memory one. When a root is
configured, `resolve` refuses paths that escape it. `core` is never touched by `node:fs`.

## 4. Agent skill and install docs

`skills/passwerk/SKILL.md` follows the outline in build plan section 5.4: frontmatter with
`name` and `description`, the workflow in order, the confidence rule (ask or look at the
source page below 0.7), the fix loop bound, stop conditions, honesty rules, DE/EN rule and
the disclaimer. `skills/passwerk/references/` holds `workflow.md` (the tool order with example
calls and what to read from each result), `resources.md` (which `passwerk://` resource answers
which question) and `cli.md` (the `passwerk` commands for batch work). The skill never lists
attribute ids or legal references itself; it points at the resources so it cannot go stale.

`docs/install/` gains one page per host: `claude-code.md` (root `.mcp.json`), `codex.md`
(`~/.codex/config.toml` plus an `AGENTS.md` pointer to the skill), `opencode.md`
(`opencode.json`), `cursor.md` (`.cursor/mcp.json`), `claude-desktop.md`
(`claude_desktop_config.json`), `http.md` (the Streamable HTTP mode with the token) and
`inspector.md` (MCP Inspector CLI examples). Any config key not confirmed from the host's own
documentation is marked `<!-- verify -->` in the page rather than guessed.

The root `.mcp.json` registers the built server (`node packages/server/dist/bin.js`).

## 5. `@passwerk/cli`

commander 15. `src/index.ts` exports `run(argv, io): Promise<number>` where `io` is
`{ stdout, stderr, fs, env, clock }`, so tests call commands in-process; `bin.ts` wires the real
streams and exits with the returned code.

| Command | Behaviour | Exit code |
|---|---|---|
| `audit <draft.json>` `[--as-of] [--lang] [--json]` | `validate`; prints verdict and findings | 0 `valid`, 1 `valid_with_warnings`, 2 `invalid`, 3 usage or unreadable input |
| `extract <files...>` `[--category] [--out facts.json] [--json]` | ingest and `extractFacts`; with `--category` also `suggestMappings` | 0, 3 |
| `emit <draft.json>` `--out <dir>` `[--targets aas-json,aasx,draft-json] [--as-of]` | writes files, prints the re-validation verdict | same as `audit` |
| `gaps <draft.json>` `[--as-of] [--lang] [--json]` | `gapReport`, grouped by data owner in text mode | 0 when mandatory completeness is 100 %, else 1; 3 on usage |
| `obligations` `--type --role [--energy-kwh] [--placed-on-market] [--as-of] [--lang] [--json]` | `checkObligations` | 0 `required`, 1 `not_required`, 2 `insufficient_input`, 3 usage |
| `tools` `[--json]` | lists the server registry: name, title, description, input keys | 0 |
| `chat -m <message>` `[--model] [--max-turns] [--root] [--lang]` | Anthropic SDK agent loop over the registry, in process; every tool call and result summary is printed | 0 finished, 2 loop bound reached, 3 missing key or usage |

`chat` imports `@anthropic-ai/sdk` lazily inside the command so no other command loads it. The
key is read from `ANTHROPIC_API_KEY` only. The default model is `claude-sonnet-5`. The system
prompt is the skill's workflow text, read from `skills/passwerk/SKILL.md` at build time
(copied into the package by the build) so the CLI and the skill cannot diverge.

The demo script `packages/cli/scripts/demo.sh` (and `.ps1`) runs the definition of done.

## 6. Testing

Test-driven throughout (`superpowers:test-driven-development`).

- **Server, protocol level.** `InMemoryTransport.createLinkedPair()` with an SDK `Client`.
  Every tool is called through `callTool`; `structuredContent` is parsed with the tool's own
  output schema; the text block exists in both languages; results are byte-identical across
  two calls. Golden samples: `validate_passport` and `emit_passport` report core's verdict for
  each valid and broken sample. Musterwerk: `ingest_documents` (paths through the in-memory
  fs and inline base64), `extract_facts`, `suggest_mappings` at 0.7, `apply_mappings` and
  `gap_report` reproduce the counts in `packages/core/test/fixtures/musterwerk/expected.json`.
  Ids round-trip: the id returned by one tool is accepted by the next; an unknown id is
  `isError`. Store eviction and the byte cap are unit-tested.
- **Resources and prompts.** Every resource reads; templates resolve; the cheat sheet contains
  the timeline dates from the knowledge base; every prompt renders in `de` and `en`.
- **HTTP.** Starts on an ephemeral port: `/healthz` is 200 without auth, `/mcp` is 401 without
  the bearer, a full `initialize` plus `list_capabilities` round trip succeeds with it, a
  second session gets its own store, missing token at startup exits 2.
- **Sovereignty.** `packages/core/test/sovereignty.test.ts` gains the server: build it with
  the in-memory fs, call every tool, read every resource, render every prompt, assert zero
  network attempts. The Docker `--network none` job runs the same suite.
- **CLI.** `run()` with captured streams and the in-memory fs: exit codes on the golden
  samples, `extract` on Musterwerk, `emit` writes three files, `obligations` verdicts,
  `tools` lists ten tools, `chat` without a key exits 3 without loading the SDK. The agent
  loop is tested with a fake client that scripts tool calls; no test contacts Anthropic.
- **Definition of done (adjusted).** `passwerk chat -m "Erstelle einen Batteriepass aus
  packages/core/test/fixtures/musterwerk/*"` must apply the expected Musterwerk mappings and
  report the gap list; `valid` is proven on the golden drafts through `audit` and through
  `chat` on an imported golden draft. This replaces the plan's `./fixtures/lieferant-a/*`,
  which does not exist, and honours the Phase 7a finding that the documents alone reach about a
  third of the mandatory data points. The demo script is not part of CI because it needs a key;
  its scripted equivalent (fake client) is.

## 7. Determinism, safety, limits

- Canonical JSON everywhere a payload is serialised; ids from content hashes; `asOf` defaults
  to the draft's `createdAt`. The only wall-clock use is `ctx.clock` for a new draft's
  `createdAt` when the caller gives none, and `bin.ts` is the only place it is read.
- Ingest limits are core's `DEFAULT_INGEST_LIMITS`; the HTTP mode caps the request body at
  the same `maxInputBytes` plus base64 overhead.
- `paths` are resolved through the adapter and refused outside the configured root; no glob
  expansion in the server (the host or the CLI expands).
- No `node:*` import in `core`; the server's Node-only modules (`fs.ts`, `http.ts`, `bin.ts`)
  are not imported by `index.ts`, so `createServer` itself stays runtime-neutral for Phase 7b.

## 8. Departures from the build plan

1. `generate_carrier` and the `html` emit target wait for Phase 7 (no core module yet).
2. Emit targets are `aas-json`, `aasx`, `draft-json`; the plan's `flat-json` is the draft JSON
   the web app already exports under that name.
3. Phase 6 ships as two PRs.
4. The definition of done is measured as in section 6.
5. The CLI depends on the server for the tool registry (new edge in the dependency order).
6. `gaps` is added to the CLI; `explain` is not (the resources and the web app cover it).

These become ADR D-031 in `docs/DECISIONS.md`.
