# Privacy

passwerk processes battery documents entirely on the machine that runs it.

## What passwerk sends

Nothing, by default. `@passwerk/core` and `@passwerk/server` make no network calls and no
model calls at runtime. There is no account, no telemetry, no analytics, no crash reporting
and no usage metric of any kind.

This is enforced, not promised:

- `packages/core/test/sovereignty.test.ts`, `packages/server/test/sovereignty.test.ts` and
  `packages/cli/test/sovereignty.test.ts` install a socket-level guard
  (`packages/core/test/helpers/networkGuard.ts`) that replaces `net.Socket.prototype.connect`,
  `tls.connect`, every `dns` lookup/resolve function (callback and promise forms), `http`/`https`
  `request`/`get`, and the global `fetch` with a function that records the attempt and throws.
  A single network call anywhere in the exercised surface — every MCP tool, resource and
  prompt, and every CLI command — fails the test.
- CI runs the whole test suite again inside a Docker container started with `--network none`
  (`.github/workflows/ci.yml`, job `sovereignty`).
- `apps/web/e2e/sovereignty.spec.ts` drives the web app through a full Musterwerk run —
  upload, map, review, export — and asserts that every request stays on the app's own origin
  and that no `navigator.sendBeacon` call fires.

## What passwerk stores

- The MCP server keeps ingested documents and drafts in memory only, in a per-connection
  session store bounded to 256 entries and 256 MiB with least-recently-used eviction
  (`packages/server/src/session.ts`). Nothing is written to disk unless you ask `emit_passport`
  or `generate_carrier` to write into an output directory; by default both return the file
  bytes inline instead. When a directory is given, and when the server was started with
  `--root`/`PASSWERK_ROOT`, writes are confined to that directory (`packages/server/src/fs.ts`).
- The web app autosaves your workflow decisions (mappings, edits, gap state) to your browser's
  IndexedDB on your device, debounced 300 ms after each change
  (`apps/web/src/app/persistence.ts`). The saved state does not include the uploaded document
  bytes.
- The MCPB bundle asks for one folder at install time (`documents_directory` in
  `packaging/mcpb/manifest.json`, wired to `PASSWERK_ROOT`). That folder is the only place the
  bundled server may read documents from or write passports to.

## The optional model assist

The web app has an optional mapping assist that is off unless you switch it on and supply your
own API key (ADR D-038 in `docs/DECISIONS.md`). When it is on, and only then, the **browser**
sends the labels, values, units and languages of the extracted facts — never the supplier's
file names, which core's fact ids would otherwise carry — to the endpoint you configured:
Anthropic, or any OpenAI-compatible base URL, including a local Ollama or LM Studio. The model
is asked to name an attribute id and nothing else; any `value`, `unit` or `confidence` it
returns is discarded unread. An accepted suggestion takes its value from core's own proposal
and its provenance from the fact, so nothing in an emitted passport can originate in the model.
Your key is held in memory unless you tick "remember on this device", in which case it is
stored in its own IndexedDB record. `@passwerk/core` and `@passwerk/server` are not involved in
the assist and remain network-free; `apps/mcp-app` ships no endpoint at all.

## Developer-time downloads

`packages/rules/scripts/fetch.ts` downloads the IDTA templates, AAS specifications and related
artefacts when a maintainer regenerates the bundled knowledge base. It never runs at install
time or at runtime, and every downloaded file is pinned by its sha256 in
`packages/rules/PROVENANCE.md`.

## Contact

https://github.com/ShahriarBijoy/passwerk/issues
