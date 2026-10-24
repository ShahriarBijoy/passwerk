# passwerk: hosted MCP tasks (Serienlauf) — plan for Claude Code

Written 2026-10-23. Follow it phase by phase; `docs/plans/hosted-tasks-slices.html` orders Phase 9a into vertical slices S0 to S6 and records the corrections found while checking it.
All AGENTS.md and CLAUDE.md rules still apply (one phase = one branch = one PR, ADR for every
non-obvious choice, TDD in `core`, `pnpm check` before every commit, dependencies >= 3 days old).

## Goal

1. **Now (interview demo):** a remote passwerk MCP server on an InstaBox machine that runs a whole
   battery series as one **MCP task**, shown in the Claude Code CLI. The MCP App workbench is shown
   separately in the Claude desktop app with the existing local stdio server.
2. **Later (production):** the same server on a hardened Hetzner VPS with OAuth, then scaled out.

## Decisions already made (record them in ADR D-047)

- **MCP SDK v2.** Claude Code turns a tool call into an MCP task only on protocol revision
  `2026-07-28`. passwerk uses `@modelcontextprotocol/sdk` 1.30.0, which cannot negotiate it.
  Use `@modelcontextprotocol/server` (v2). Pin **2.3.1** (2.4.0 was published 2026-10-23 and fails
  `minimumReleaseAge`). Pin any companion package (`@modelcontextprotocol/node`,
  `@modelcontextprotocol/client` for tests) to a version at least 3 days old.
- **New app `apps/hosted` (`@passwerk/hosted`, private).** `packages/server` stays on SDK 1.x for now
  so the published npm package, the MCPB bundle and the plugins do not change. `apps/hosted`
  imports `@passwerk/core` directly and reuses the SDK-free parts of `@passwerk/server`
  (the `TOOLS` registry, `SessionStore`, the workbench loader) where that is simple.
  Network code lives only in `apps/hosted`; `core` and `server` keep their sovereignty tests.
- **Demo host: InstaBox free machine** (4 vCPU, 8 GiB, HTTPS public port included, no domain or
  reverse proxy needed). Production host: Hetzner VPS (CX23/CX33), hardened with
  `harden.sh` from the Project doc `vps-security.md`.
- **Demo auth: one static bearer token** (`PASSWERK_AUTH_TOKEN`, same as `packages/server` HTTP mode).
  OAuth comes in phase 9b. Never call the demo "production" or "offline" (D-019).
- **PR #48 (`feat/hosted-connector`, Cloudflare Worker + OAuth): do not merge now.** Convert it to a
  draft. Its OAuth design (one scope `mcp`, empty-by-default allowlist checked on every request) is
  reused in 9b; the Worker itself is not the target (CPU limit, 3 MiB bundle cap, SDK 1.x).
  Decide after 9b whether to close it or port it.
- **MCP Apps:** the Claude Code CLI does not render them, and the desktop app and VS Code do not run
  MCP tasks. One server serves both; the demo uses two surfaces.

---

## Phase 9a — interview demo on InstaBox  (branch `feat/hosted-tasks-demo`)

Order matters. Stop after each step, run `pnpm check`, commit.

### 9a.0 ADR D-047
Write the decisions above into `docs/DECISIONS.md` as D-047. Update the AGENTS.md repository map
with `apps/hosted`.

### 9a.1 Skeleton on SDK v2 with a spike task
- `apps/hosted/src/main.ts`: Streamable HTTP on `node:http`, `POST /mcp` with bearer check
  (constant-time compare, as in `packages/server/src/http.ts`), `GET /healthz`.
- Look up the SDK v2 API with context7 or by reading `node_modules/@modelcontextprotocol/server`
  (`McpServer`, `createMcpHandler`, `PerRequestHTTPServerTransport`, `isTaskAugmentedRequestParams`).
  Use the stateless, per-request style of revision 2026-07-28.
- If SDK v2 has no high-level helper for tool tasks, implement the extension by hand:
  answer `tools/call` with a task, and register handlers for `tasks/get`, `tasks/update`,
  `tasks/cancel`. The contract is in the reference section below.
- Spike tool `slow_echo { text, seconds }`: answers as a task, sleeps, completes with the text.
- Tests (Vitest): drive the server with raw JSON-RPC over `fetch` and assert the exact wire shapes:
  task answer only when the request carries the tasks extension, plain result otherwise,
  `tasks/get` shapes, unknown id → `-32602`, cancel.
- **Done when:** tests pass and, against a local run, Claude Code (v2.1.304+, terminal CLI) shows
  `1 MCP task` for `slow_echo` and later reports it completed.

### 9a.2 Durable task store
- SQLite file under `PASSWERK_DATA` (default `/data/passwerk.db`). Prefer the built-in `node:sqlite`
  (check it works without a flag on the pinned Node 22 version); otherwise `better-sqlite3`.
- Table `tasks(id, tool, status, status_message, input_requests, input_responses, result, error,
  created_at, last_updated_at, ttl_ms, poll_interval_ms)`. Ids: `ser_` + random, never content-addressed.
- Move `SessionStore` contents (bundles, facts, drafts) to SQLite too, so ids survive a restart.
- **Done when:** a task started before a server restart is still answered after it (completed or
  `failed` with a clear message if the worker died; never `-32602` for a known id).

### 9a.3 `run_series` as a task
- Input: `{ series: string (a server-side demo set name) | documents: inline[], category: 'EV'|..., onConflict: 'ask'|'skip'|'highest_confidence' }`.
- Demo set: generate `demo/series/musterwerk-12/` from the five Musterwerk fixtures in
  `packages/core/test/fixtures/musterwerk/` as 12 models (vary model id, serial, a few values).
  Commit the generator, not hand-edited copies.
- Run the per-model pipeline (ingest → extract → suggest → apply → validate → emit AAS JSON, AASX,
  HTML, gap report) in a `worker_threads` worker so the main thread keeps answering polls.
- `statusMessage`: `Model 4 of 12 · 41 facts · 30 mapped`. `pollIntervalMs` 2000 for the first
  30 s, then 5000.
- Cancel: `tasks/cancel` → `AbortController` → worker stops between steps → status `cancelled`.
- Result: text summary (counts of `valid` / `valid_with_warnings` / `invalid`) plus
  `structuredContent { seriesId, drafts[], reports[] }`. Never claim `valid` without the validators
  (non-negotiable rule).
- **Done when:** the 12-model set completes as one task with progress visible in `/tasks`.

### 9a.4 Questions with `input_required`
- The AI reading step (ADR D-048) holds values it is not sure enough to apply. On
  `musterwerk-complete` it holds 11; confirming all of them gives `valid` at 100 %. `run_series`
  turns them into `inputRequests` (`method: "elicitation/create"`, a form with one required
  `answer` of `apply` or `skip`): one key per held value for a single model, one per held
  attribute across a series, at most 16 keys per task, the 16th covering the rest.
- `tasks/update` with `inputResponses` → once every key is answered, the models that held values
  run again from their recorded readings (no second Jev call), with the confirmed values and
  their document provenance → validate and emit as before.
- `confirm: 'ask' | 'hold'` (default `ask`). `hold` is for headless runs, because Claude Code
  cancels tasks that ask for input outside an interactive terminal. Inline runs always hold.
- The planted `NMC811` / `NMC622` conflict of the first plan is dropped (ADR D-049).
- **Done when:** the held values open dialogs in Claude Code and the confirmed values make the
  passport valid.

### 9a.5 Deploy on InstaBox
- `apps/hosted/Dockerfile` (multi-stage, distroless Node 22, non-root, read-only root, `/data` volume),
  or plain Node with a systemd unit if Docker is awkward there. Either way it must **start on boot**:
  a resumed InstaBox machine can come back without its processes.
- `docs/install/instabox-demo.md`: create machine, copy the repo, build, set `PASSWERK_AUTH_TOKEN`
  (`openssl rand -hex 32`), publish the port, then on the laptop:
  `claude mcp add --transport http passwerk-demo https://<port>-<id>.instabox.tech/mcp --header "Authorization: Bearer <token>"`.
- Unpublish the port after the interview.
- **Done when:** the demo script below runs twice in a row against the InstaBox URL.

### 9a.6 Demo script (`docs/demo/interview.md`, ~5 minutes)
1. **Claude desktop app** (local stdio passwerk, already installed): "Review the Musterwerk passport"
   → `review_passport` opens the workbench (MCP App) → show gaps and the QR carrier.
2. **Claude Code CLI**: "Build the passport for the musterwerk-complete series, category EV"
   → footer shows `1 MCP task` → open `/tasks` to show progress → close it and confirm the held values
   → quit Claude Code → `claude --resume` → the result arrives.
3. Talk track: why tasks (long jobs leave the chat), why SDK v2, how it scales (stateless API +
   Postgres queue + workers), why EU hosting.
- Rehearsal checklist: start the machine 15 minutes before (free plan pauses after 30 idle minutes
  and after 8 running hours); run `slow_echo` once to warm it; Claude Code updated; a fallback
  recording of a good run.

---

## Phase 9b — production on Hetzner  (later; branch per step)

1. VPS: Hetzner CX23/CX33, run `harden.sh setup` then `lockdown` (Project doc `vps-security.md`):
   Tailscale-only admin, public 443 only, Caddy in front, Docker ports bound to 127.0.0.1.
2. OAuth: hosted IdP (Clerk or WorkOS AuthKit, GitHub login). Server = resource server only:
   RFC 9728 metadata at `/.well-known/oauth-protected-resource`, JWT check via JWKS on every request,
   scope `mcp`, allowlist. First confirm the IdP supports DCR or CIMD for MCP clients.
3. Tasks scoped to the token's subject: another user's task id answers `-32602`.
4. `passwerk push` in `packages/cli`: run ingest + extract locally, upload only the FactSet
   (no document bytes through the model or to the server).
5. `/review/:id`: the workbench as a page outside an MCP host, for Claude Code users.
6. Add the server as a custom connector in claude.ai so the desktop app gets the workbench and the
   CLI gets tasks from one URL.

## Phase 9c — scale (when users arrive)

Stateless API nodes behind a load balancer, Postgres (tasks, store index, queue via pg-boss),
workers on dedicated servers scaled on queue depth plus hourly cloud servers for peaks,
S3-compatible object storage, per-account concurrency caps, adaptive `pollIntervalMs`.
See Project doc `scaling-50k.md`.

## Phase 9d — move `packages/server` to SDK v2

After 9b. Port the stdio + HTTP server, keep tool names and output shapes, re-run the MCPB and
plugin packaging, then decide on PR #48.

---

## Reference: what Claude Code expects from a task server

Source: code.claude.com/docs/en/mcp, "MCP tasks for server authors" (read 2026-10-23).

- Answer `tools/call` with a task **only** if the request has `"io.modelcontextprotocol/tasks": {}`
  under `params._meta["io.modelcontextprotocol/clientCapabilities"].extensions`. Otherwise Claude
  gets `Unsupported result type 'task' for tools/call`.
- Task answer = the JSON-RPC `result`: `resultType: "task"`, `taskId`, `status`, `createdAt`,
  `lastUpdatedAt`, `ttlMs` (may be `null`); optional `statusMessage`, `pollIntervalMs`. No `content`.
- Send it before the 60-second per-request timer ends: accept, answer, then work.
- `taskId`: max 128 printable ASCII characters, no spaces; must work on a new connection after resume.
- `status`: `working` | `input_required` | `completed` | `failed` | `cancelled`.
- `tasks/get` answer: `resultType: "complete"` plus the task fields; on `completed`, the normal
  `tools/call` result in top-level `result`; on `failed`, top-level `error: { code, message, data }`.
- `pollIntervalMs` is clamped to 250–30000 (default 2000) and re-read from each `tasks/get`.
  A response without `statusMessage` clears the old one in `/tasks`.
- `input_required`: `inputRequests` maps your keys to `{ method, params }`; Claude Code answers each
  key once with `tasks/update { taskId, inputResponses }`. Max 16 keys. `elicitation/create` works only
  in interactive terminal sessions; `roots/list` works everywhere.
  Answers may arrive in one `tasks/update` or several; keys beyond 16 per task are ignored; in a
  non-interactive session (`claude -p`) Claude Code cancels a task that asks (read 2026-10-24).
- `tasks/update` answer: an empty acknowledgement with `resultType: "complete"`; the client polls
  `tasks/get` for the new state (tasks extension, SEP-2663, "Response" under `tasks/update`).
- Unknown task id: JSON-RPC error `-32602`. `tasks/cancel` arrives when the user stops the task.
  Claude Code does not use `tasks/result`, `tasks/list` or task notifications.
- Client side: Claude Code v2.1.304+, terminal CLI (or Agent SDK / GitHub Actions), claude.ai login
  (not Bedrock), call from the main conversation (not a subagent), not `MCP_SDK_GENERATION=v1`.
