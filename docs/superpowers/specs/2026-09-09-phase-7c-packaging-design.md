# Phase 7c design: packaging (MCPB bundle, Codex plugin, connector submission)

Date: 2026-09-09. Status: approved by the owner in conversation (vendored tarballs in the
MCPB bundle, cross-platform stdio smoke, `npx` for the Codex plugin, checklist plus
`PRIVACY.md`, `packaging/*` as workspace packages).

This document refines build plan section 7 (Phase 7c) into the design that one pull request
implements. It is the last phase before Phase 8 (proof and pilot). Departures from the plan
are listed in section 9 and recorded as ADR D-039.

## 1. Goal

Turn the four published packages into three things a stranger can install without reading the
repository:

1. a `.mcpb` bundle Claude Desktop installs with one click, on macOS and Windows, **offline**;
2. a Codex plugin that carries `skills/passwerk` and the MCP server, installable from a local
   marketplace;
3. a dated checklist and privacy statement for the Claude connector directory submission.

Nothing in this phase adds a domain rule, a network call or a model call. `core` and `server`
are untouched except for one shared test helper (section 5.2).

## 2. External formats (sources)

Both manifest formats are external specifications. Per `AGENTS.md` they are transcribed from
primary sources, never guessed. Retrieved 2026-09-09:

| Format | Source | What was taken |
|---|---|---|
| MCPB | `https://github.com/anthropics/mcpb` `README.md` and `MANIFEST.md` | required/optional manifest fields, `server.type` values, `user_config` types, `${__dirname}` / `${DOCUMENTS}` substitution, `compatibility`, the `mcpb` CLI verbs |
| MCPB CLI | npm `@anthropic-ai/mcpb`, latest 2.1.2 published 2025-12-04 | `mcpb validate`, `mcpb pack`; clears the 3-day `minimumReleaseAge` floor |
| Codex plugin | `openai/codex`, `codex-rs/core-plugins/src/manifest.rs` (the deserializer itself) | field names and camelCase mapping: `name`, `version`, `description`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, `interface` |
| Codex plugin | `openai/codex`, `codex-rs/skills/src/assets/samples/plugin-creator/` (`SKILL.md`, `scripts/create_basic_plugin.py`, `references/installing-and-updating.md`) | the scaffold's manifest shape, marketplace entry shape and required `policy` fields, the name regexes, `codex plugin add <plugin>@<marketplace>` |

`manifest_version` is `"0.3"` or `"0.4"` per `MANIFEST.md`. The build pins whichever value
`mcpb validate` accepts from CLI 2.1.2 and the manifest test asserts it, so the choice is
proven rather than assumed.

Two facts recorded because they shaped the design:

- Codex's `plugin-creator` states that validation **rejects** a `hooks` key in
  `plugin.json`, and that `apps` and `mcpServers` must be absent unless their companion files
  exist. The manifest therefore declares only `skills` and `mcpServers`.
- Plugin names must match `[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*`; marketplace names must match
  `[A-Za-z0-9_-]+`. `passwerk` and `personal` both pass.

## 3. Delivery

One pull request, branch `feat/packaging`, off `main`.

```
packaging/mcpb/                    @passwerk/mcpb-bundle   (private, not published)
  manifest.json                    hand-authored MCPB manifest
  icon.png
  server/index.js                  thin launcher copied into the bundle
  scripts/build.mjs                assemble -> mcpb validate -> mcpb pack
  scripts/smoke.mjs                unzip the .mcpb and drive it over stdio
  test/manifest.test.ts
packaging/codex-plugin/            @passwerk/codex-plugin  (private, not published)
  .codex-plugin/plugin.json
  .mcp.json
  marketplace.json                 local-marketplace template
  scripts/build.mjs                assemble out/codex-plugin/
  test/plugin.test.ts
tools/release/stdio-client.mjs     shared JSON-RPC stdio client (extracted, section 5.2)
docs/connector-submission.md
PRIVACY.md
```

`pnpm-workspace.yaml` gains `packaging/*`. Both packages are `"private": true` with no
runtime dependencies; `@anthropic-ai/mcpb` is a root devDependency. Build output goes to
`out/`, already git-ignored. Neither package is added to the npm release.

Dependency direction is unchanged: packaging consumes built artefacts, and no package imports
it.

## 4. The MCPB bundle

### 4.1 What goes inside

The bundle vendors the three release tarballs the server needs (`rules`, `core`, `server`;
the CLI is not part of an MCP host's surface) rather than calling `npx` at run time. A bundle
that fetched from npm on first run would contradict the project's headline claim, and would
not work at all before the first publish.

```
passwerk-<version>.mcpb   (zip)
  manifest.json
  icon.png
  server/
    index.js
    node_modules/
      @passwerk/server    dist/ + ui/workbench.html
      @passwerk/core  @passwerk/rules
      pdfjs-dist  zod  decimal.js  fflate  fast-xml-parser  qrcode-generator
      @aas-core-works/...  (already inlined into core's dist/vendor, D-034)
```

`scripts/build.mjs` runs after `pnpm build && pnpm build:mcp-app && pnpm release:pack` and:

1. creates `out/mcpb/build/server/` with a minimal private `package.json`;
2. installs `out/pack/passwerk-{rules,core,server}-<version>.tgz` **one at a time in
   dependency order**, with `--omit=dev --omit=optional --no-audit --no-fund`. The ordering
   requirement is the same one `pack-smoke.mjs` documents: the `@passwerk` scope is not on the
   registry yet, so each package must already be in `node_modules` before the next resolves it.
   `--omit=optional` is new and load-bearing: `pdfjs-dist` optionally pulls a native canvas
   used only for rendering, never for the text extraction passwerk does, and a Linux-built
   binary would make the bundle non-portable. Everything remaining is pure JavaScript, so one
   bundle serves darwin, win32 and linux;
3. copies `manifest.json`, `icon.png` and `server/index.js`;
4. runs `mcpb validate` then `mcpb pack`, writing `out/mcpb/passwerk-<version>.mcpb`.

The bundle is not claimed to be byte-reproducible: `mcpb pack` writes zip timestamps and npm
may vary tree layout. Determinism in this project is a property of emitted passports, not of
the installer.

### 4.2 The launcher

`packages/server/dist/bin.js` self-executes only when it is `process.argv[1]`, so importing it
from another entry point would start nothing. `server/index.js` is therefore three lines:

```js
#!/usr/bin/env node
import { main } from './node_modules/@passwerk/server/dist/bin.js';
process.exitCode = await main();
```

`main` reads `process.argv.slice(2)` and `process.env` itself, so the launcher passes nothing
along. Because `bin.js` resolves the workbench as `new URL('../ui/workbench.html',
import.meta.url)`, the MCP App keeps resolving to
`server/node_modules/@passwerk/server/ui/workbench.html` inside the bundle, and
`review_passport` works in Claude Desktop with no extra wiring. This is why `pnpm
build:mcp-app` must run before `release:pack` — `ui/` is in the server's `files` list but is a
build product.

### 4.3 The manifest

Authored by hand, version-checked by test. Substantive fields:

```json
{
  "manifest_version": "0.4",
  "name": "passwerk",
  "display_name": "passwerk",
  "version": "0.1.0",
  "description": "Offline EU Digital Battery Passport toolkit ...",
  "author": { "name": "Shahriar Bijoy", "url": "https://github.com/ShahriarBijoy" },
  "license": "Apache-2.0",
  "icon": "icon.png",
  "repository": { "type": "git", "url": "https://github.com/ShahriarBijoy/passwerk" },
  "homepage": "https://github.com/ShahriarBijoy/passwerk#readme",
  "documentation": "https://github.com/ShahriarBijoy/passwerk/tree/main/docs",
  "support": "https://github.com/ShahriarBijoy/passwerk/issues",
  "server": {
    "type": "node",
    "entry_point": "server/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/server/index.js"],
      "env": { "PASSWERK_ROOT": "${user_config.documents_directory}" }
    }
  },
  "tools_generated": false,
  "prompts_generated": false,
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
    "runtimes": { "node": ">=22.13" }
  }
}
```

`tools` lists the twelve registry tools with their descriptions, in registry order:
`ingest_documents`, `extract_facts`, `suggest_mappings`, `apply_mappings`,
`validate_passport`, `gap_report`, `review_passport`, `emit_passport`, `generate_carrier`,
`check_obligations`, `explain_attribute`, `list_capabilities`. `prompts` lists the three named by `PROMPT_NAMES`:
`build-passport-interview`, `audit-supplier-submission`, `draft-data-request`.

`PASSWERK_ROOT` becomes a required `directory` so Claude Desktop asks at install time and the
server's injected filesystem adapter is always rooted. `PASSWERK_AUTH_TOKEN` is absent by
design: the bundle is stdio only.

`privacy_policies` is **omitted**. `MANIFEST.md` describes it as privacy policy URLs for
external services, and passwerk contacts none. `docs/connector-submission.md` states that
positively rather than filling the field with a URL that would imply a third party exists.

### 4.4 Decisions this section closes

- Vendored tarballs over an esbuild single file: `pdfjs-dist` is a lazy dynamic import,
  `@passwerk/rules` loads every artefact through `with { type: 'json' }` import attributes, and
  the AAS SDK is already an inlined vendor build. A bundler has three chances to be subtly
  wrong here and the npm layout has none.
- Vendored tarballs over `npx`: offline is the product claim.

## 5. Proving the bundle

### 5.1 What the smoke does

`scripts/smoke.mjs` takes the built `.mcpb`, unzips it with `fflate` (already a workspace
dependency, so no new package) into a temp directory, and:

1. parses `manifest.json` from the archive and asserts the version and the twelve tool names
   equal the server registry's;
2. spawns `node <tmp>/server/index.js` and completes the stdio handshake: `initialize`,
   `tools/list` returns the twelve, `resources/read` of `ui://passwerk/workbench.html` returns
   non-empty HTML;
3. calls `ingest_documents` on `packages/core/test/fixtures/musterwerk/lieferantenerklaerung.pdf`
   with `PASSWERK_ROOT` set to the fixture directory, and asserts page and line provenance come
   back. The bundled `pdfjs-dist` is the highest-risk thing in the tree — a lazily imported
   dependency with its own asset layout — so the smoke aims at it directly rather than at a
   tool that would pass with a broken PDF reader;
4. removes the temp directory on every path, success or failure, and exits 1 on the first
   failure.

`PASSWERK_CLOCK` is set so the run is reproducible.

### 5.2 The shared stdio client

`tools/release/pack-smoke.mjs` already contains a correct newline-delimited JSON-RPC client
that frames across `data` chunks and always kills the child before settling. Writing a second
one for the bundle would be duplicating the subtle part. That helper moves to
`tools/release/stdio-client.mjs` and both scripts import it. `pack-smoke.mjs` keeps its
behaviour and its own assertions; this is a move, not a rewrite, and `pnpm release:smoke` must
stay green to prove it.

### 5.3 What the smoke deliberately does not do

It does not re-prove sovereignty. `sovereignty.test.ts` guards every network API over the whole
server surface and CI runs the suite in Docker with `--network none` (ADR D-013); both cover
exactly the code the bundle vendors. A weaker in-process check inside the smoke would add
confidence in appearance only.

### 5.4 The manual half

CI cannot click. The DoD's "one-click install works on macOS and Windows" is measured the way
ADR D-037 measured the Claude Desktop host: the owner installs the built `.mcpb` on each OS,
confirms the `documents_directory` prompt appears, that the twelve tools are listed, and that
`review_passport` renders the workbench, and the results are written into D-039. The PR is not
claimed done until those measurements exist.

## 6. The Codex plugin

### 6.1 Contents

`.codex-plugin/plugin.json`, in the shape Codex's own scaffold emits:

```json
{
  "name": "passwerk",
  "version": "0.1.0",
  "description": "Build and validate EU Digital Battery Passports offline (AAS / IDTA 02035).",
  "keywords": ["battery-passport", "digital-product-passport", "aas", "idta-02035"],
  "skills": "./skills/",
  "mcpServers": "./.mcp.json",
  "interface": {
    "displayName": "passwerk",
    "shortDescription": "...",
    "longDescription": "...",
    "developerName": "Shahriar Bijoy",
    "category": "Productivity",
    "capabilities": [],
    "websiteURL": "https://github.com/ShahriarBijoy/passwerk",
    "defaultPrompt": "Build an EU battery passport from the documents in ./supplier-docs."
  }
}
```

No `hooks` key (rejected by validation), no `apps` key (no `.app.json` exists).

`.mcp.json` uses the published package, matching `docs/install/codex.md`:

```json
{ "mcpServers": { "passwerk": { "command": "npx", "args": ["-y", "@passwerk/server"] } } }
```

The plugin does not vendor a runtime. Codex plugins have no bundled-runtime convention
equivalent to MCPB's, a marketplace entry is a checkout rather than an installer artefact, and
the offline guarantee is carried by the MCPB bundle and by `docs/install/codex.md`'s
from-source variant. `PASSWERK_ROOT` is not set in the plugin's `.mcp.json`: there is no
install-time prompt to fill it, and the server defaults to the working directory.

`marketplace.json` ships as a template for the local install, with the three fields Codex
requires on every entry:

```json
{
  "name": "personal",
  "interface": { "displayName": "Personal" },
  "plugins": [
    {
      "name": "passwerk",
      "source": { "source": "local", "path": "./plugins/passwerk" },
      "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
      "category": "Productivity"
    }
  ]
}
```

### 6.2 The skill is copied, never duplicated

`skills/passwerk/` stays the single source. `scripts/build.mjs` assembles
`out/codex-plugin/` by copying `.codex-plugin/`, `.mcp.json` and `skills/passwerk` into it,
and `test/plugin.test.ts` asserts every copied file is byte-identical to its source. A skill
edit that forgets the plugin cannot pass `pnpm check`.

### 6.3 Proof

CI has no `codex` binary. Automated: manifest shape, both name regexes, version agreement,
the required `policy` and `category` fields, and the byte-identical skill copy. Manual: the
owner runs

```sh
pnpm package:codex
cp -r out/codex-plugin ~/plugins/passwerk        # Windows: the user-profile equivalent
codex plugin add passwerk@personal
```

with `marketplace.json` seeded at `~/.agents/plugins/marketplace.json`, confirms the skill and
the twelve tools appear in a new session, and the result goes into D-039. `docs/install/codex.md`
gets these commands, replacing its "once Phase 7c ships" placeholder.

## 7. Connector submission and privacy

`docs/connector-submission.md`, dated, DE/EN not required (it is owner-facing, English):

- transport: Streamable HTTP via `passwerk-server --http`, bearer token in
  `PASSWERK_AUTH_TOKEN`, `/healthz`, and the `ghcr.io/shahriarbijoy/passwerk` image as the
  hosting path;
- the twelve tools with their existing `annotations` (`readOnlyHint`, `destructiveHint`,
  `idempotentHint`, `openWorldHint`) as the directory expects them, and the note that every
  tool returns `structuredContent` plus a text summary;
- screenshots to attach, named: the workbench in Claude Desktop, the gap report, an emitted
  passport sheet;
- privacy: link to `PRIVACY.md`;
- open items, honestly listed, including that the hosted endpoint the directory reviews is the
  owner's to run.

`PRIVACY.md` at the repository root states what is true and short: no network calls at
runtime, no model calls, no telemetry, no analytics, no account; documents are read locally and
never transmitted; the only outbound traffic in the whole project is the developer-time
artefact fetch in `packages/rules/scripts/fetch.ts`. It cites `sovereignty.test.ts` and the
`--network none` CI job rather than asking to be believed.

**Open item, not in scope.** Build plan section 8 lists `SECURITY.md` in the v1.0 checklist and
the repository has none. A connector submission will want one. It stays an open item, recorded
here and in the PR description, at the owner's direction.

## 8. Wiring

Root scripts:

```
package:mcpb    node packaging/mcpb/scripts/build.mjs
package:codex   node packaging/codex-plugin/scripts/build.mjs
package:smoke   node packaging/mcpb/scripts/smoke.mjs
```

added to the `AGENTS.md` commands table with their prerequisites (`pnpm build`,
`pnpm build:mcp-app`, `pnpm release:pack` before `package:mcpb`).

**Version agreement.** The release workflow's verify step already compares four
`package.json` versions against `server.json` and the tag. It gains
`packaging/mcpb/manifest.json` and `packaging/codex-plugin/.codex-plugin/plugin.json`. The
same agreement is asserted by Vitest so it fails in `pnpm check`, not only at release.
`docs/RELEASE.md` step 1 gains both files.

**CI.** A `packaging` job on `ubuntu-latest`, `macos-latest` and `windows-latest` runs
`pnpm build && pnpm build:mcp-app && pnpm release:pack && pnpm package:mcpb && pnpm
package:smoke`, and uploads the `.mcpb` as an artefact.

**Release.** An `mcpb` job builds the bundle on `ubuntu-latest` and attaches
`passwerk-<version>.mcpb` to the GitHub release beside the four tarballs.

**Install docs.** `docs/install/claude-desktop.md` loses "Phase 7c will ship a one-click MCPB
bundle; until then …" and gains the download-and-open instructions; `docs/install/codex.md`
loses its placeholder and gains section 6.3's commands. `README.md` names the bundle in the
install section.

## 9. Departures from the build plan, and the ADR

| Plan text | This design | Why |
|---|---|---|
| "bundled Node server" | vendored npm tarballs, `--omit=optional`, thin launcher | `pdfjs-dist` optional native canvas would make the bundle platform-specific; a bundler would have to get lazy imports and JSON import attributes right for no gain |
| `.codex-plugin/plugin.json` "with the skills directory and the stdio server" | same, plus a `marketplace.json` template and a copy-and-verify build | Codex installs plugins through a marketplace entry; a hand-copied skill would drift |
| — | `manifest_version` pinned to whatever `mcpb validate` accepts | `MANIFEST.md` permits `0.3` and `0.4`; the tool decides, not the author |

**ADR D-039** records: the MCPB bundle vendors the release tarballs so a one-click install is
offline; the Codex plugin does not vendor and points at `npx`; the one-click and
`codex plugin add` results are owner measurements recorded in the ADR, as in D-037; the shared
stdio client is extracted rather than duplicated.

## 10. Definition of done

- [ ] `pnpm check` green, including the new manifest, plugin and version-agreement tests
- [ ] `pnpm package:mcpb && pnpm package:smoke` green on ubuntu, macos and windows in CI
- [ ] `pnpm release:smoke` still green after the stdio client extraction
- [ ] `pnpm package:codex` produces `out/codex-plugin/` with a byte-identical skill copy
- [ ] owner measurement: the `.mcpb` installs with one click on macOS and on Windows, prompts
      for the document folder, lists twelve tools, renders the workbench; recorded in D-039
- [ ] owner measurement: `codex plugin add passwerk@personal` loads the skill and the tools in
      a new Codex session; recorded in D-039
- [ ] `docs/connector-submission.md` and `PRIVACY.md` committed; install docs and `README.md`
      placeholders replaced; `docs/RELEASE.md` updated
- [ ] ADR D-039 in `docs/DECISIONS.md`; build plan Phase 7c marked done; `SECURITY.md` listed
      as the remaining open item
