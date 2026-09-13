# passwerk: instructions for coding agents

This file is agent-neutral. Claude Code reads it through `CLAUDE.md`; Codex CLI, OpenCode
and Cursor read it directly. Keep it short. The detail lives in the linked documents.

## What this project is

**passwerk** turns a battery supplier's messy documents (BOMs, Excel exports, energy bills,
supplier declarations) into a conformant EU Digital Battery Passport in the official AAS
format (IDTA 02035-1 to -7) plus a legally cited gap report. Regulation (EU) 2023/1542
Art. 77 makes the passport mandatory for EV, LMT and industrial >2 kWh batteries from
**18 February 2027**. The unserved buyer is the Tier-2 / Mittelstand supplier.

100 % offline, zero API keys, agent-agnostic. The credibility engine is CI: every emitted
passport is replayed through the official `aas-test-engines` oracle, and a sovereignty test
proves zero network calls.

## Read these first, every session

1. `docs/BUILD_PLAN.md`: the single source of truth for scope, architecture, MCP contract,
   knowledge-base design and build phases. **State which phase you are in before you start.**
2. `docs/DECISIONS.md`: the ADR log. D-005 (all 7 submodels), D-006 (web app) and D-019
   (web app is the product, MCP App and packaging phases) amend the plan.
3. `packages/rules/PROVENANCE.md` (from Phase 1): where every bundled artefact comes from.

## Repository map

| Path | Package | Role |
|---|---|---|
| `packages/rules` | `@passwerk/rules` | Bundled, checksummed artefacts + knowledge base (data, not code) |
| `packages/core` | `@passwerk/core` | MCP-free library: ingest, extract, map, validate, gap, emit, carrier |
| `packages/server` | `@passwerk/server` | MCP server, stdio + Streamable HTTP. Adapter only, no domain logic |
| `packages/cli` | `@passwerk/cli` | `passwerk` binary. Adapter only, no domain logic |
| `apps/web` (Phase 7a) | | Client-side web app bundling core, with QR preview. The primary product (ADR D-019) |
| `apps/mcp-app` | `@passwerk/mcp-app` | MCP App: the web app's workflow in the host's iframe, served by the server as `ui://passwerk/workbench.html` (ADR D-037) |
| `packaging` (Phase 7c) | | MCPB bundle for Claude Desktop, Codex plugin, connector submission checklist |
| `skills/passwerk` (Phase 6) | | Agent Skill teaching the ingest, map, validate, fix, emit workflow |
| `tools/oracle` (Phase 3) | | Python `aas-test-engines` runner that writes `docs/CONFORMANCE.md` |

Dependency direction is strict: `rules`, then `core`, then `server`, then `cli`; `web` depends
on `core` only. Never import upward. The CLI imports the server's tool registry (ADR D-031).

## Commands

```sh
pnpm install            # Node >= 22.13 (see .nvmrc), pnpm 10
pnpm build              # tsc -b across all packages
pnpm test               # vitest, all packages
pnpm lint               # biome check
pnpm lint:fix           # biome check --write
pnpm typecheck          # tsc -b plus typecheck of test files
pnpm check              # lint + typecheck + test. Run before every commit
pnpm oracle             # emit golden passports and replay them through aas-test-engines (needs uv)
pnpm heldout            # regenerate the held-out documents and docs/EVALUATION.md (after pnpm build)
pnpm review-sheet       # regenerate docs/KB_REVIEW.md (every verify: true knowledge-base entry)
pnpm build:web          # vite build of apps/web (after pnpm build)
pnpm e2e                # Playwright suite of apps/web (after pnpm build:web; needs Chromium)
pnpm package:mcpb       # build out/mcpb/passwerk-<version>.mcpb (after build, build:mcp-app, release:pack)
pnpm package:smoke      # unzip that bundle and drive it over stdio
pnpm package:codex      # build out/codex-plugin/ (manifests plus a copy of skills/passwerk)
```

Tests import workspace packages by name (`@passwerk/core`). Vitest aliases them to `src/`,
so no build is needed before `pnpm test`.

## Non-negotiable rules

- **Never invent** a URL, standard version, semanticId, template idShort or legal reference.
  If you are not certain, mark the entry `"verify": true` in the KB and ask the owner.
- **No network at runtime** in `core` or `server`. Downloads happen only in dev scripts
  (`packages/rules/scripts/fetch.ts`) and results are pinned with sha256.
- **No LLM calls** in `core` or `server` (ADR D-002).
- **Never return `valid: true` without running the validators.** `emit` re-validates its own
  output. Verdicts are `valid`, `valid_with_warnings` or `invalid`, never "probably fine".
- Every MCP tool returns `structuredContent` **and** a readable `text` summary. Every legal
  claim carries `sources[]` and `isNotLegalAdvice: true`.
- `core` must stay browser-safe (ADR D-006): no `node:*` imports at module top level, and
  filesystem access only through an injected adapter.
- Quantities and money use `decimal.js`, never floats. Dates are ISO-8601 strings.
- Every user-facing string in the knowledge base exists in **both German and English**.
- Deterministic output: sorted keys, injected clock in tests, byte-identical re-runs.
- Knowledge base entries are **data** (JSON), not code, so domain experts can review PRs.

## Working conventions

- One phase = one branch = one PR. Branch prefixes: `chore/`, `feat/`, `fix/`, `docs/`.
- Conventional Commits (`feat(core): ...`, `chore(rules): ...`, `docs: ...`).
- Add an ADR to `docs/DECISIONS.md` whenever you make a non-obvious choice.
- TypeScript strict, ESM, `.js` extensions in relative imports (NodeNext resolution).
- Tests live in `packages/<name>/test/`. Golden samples live in `packages/core/src/samples/`.
- Dependency versions must be at least 3 days old (pnpm `minimumReleaseAge` is enforced).
- Prefer small, reviewable PRs. Run `pnpm check` before committing.
- Ask rather than guess when a plan step is unclear or an artefact source is unknown.

## Status

- **Phase 0 (bootstrap): done.**
- **Phase 1 (`@passwerk/rules`): done.** 31 artefacts pinned (24 bundled), EC v2.0 matrix
  transcribed (71 data points), template catalogue (211 elements) and DIN longlist (93 rows)
  generated, 93 attributes authored DE/EN (25 flagged `verify: true` for human review), 15
  plausibility rules, 22 timeline events, typed accessors. See ADRs D-008 and D-009.
- **Phase 2 (`@passwerk/core` model + emit + L1-L3): done.** Attribute-keyed `PassportDraft`
  (ADR D-010), AAS JSON and AASX emitters for IDTA 02035-1/-3/-6 driven by the template
  catalogue, L2 via aas-core verification, L3 template diff, six golden samples. See ADR D-011
  for the AAS engine choices (JSON inside the AASX, pnpm patch for the SDK's ESM build).
- **Phase 3 (oracle parity + sovereignty): done.** `tools/oracle` (`@passwerk/oracle`, tsx plus
  Python `aas-test-engines` 1.0.3 via uv) proves 12/12 L2 verdict parity on every CI run and
  writes `docs/CONFORMANCE.md` plus the README badge JSON. `sovereignty.test.ts` guards every
  network API over the whole public surface; CI also runs the suite in Docker with
  `--network none`. See ADRs D-012 and D-013.
- **Phase 3b (emitters for parts 4, 5, 7): done.** Technical Data, Product Condition and
  Circularity emitters, `Field.recordedAt`, five new composites, extended golden samples plus
  `lmt-missing-state-of-charge`; oracle parity 14/14. Part 2 waits for ingest (ADR D-014);
  emitter conventions in ADR D-015.
- **Phase 4 (ingest, extract, mapping, part 2): done.** Readers for PDF (pdfjs-dist, lazily
  loaded), XLSX and DOCX (fflate plus fast-xml-parser over the OOXML parts), CSV (delimiter
  sniffing, windows-1252 fallback) and TXT, all producing a `DocumentBundle` with page, line,
  table and cell provenance. `extractFacts` normalises labelled values (numbers, units,
  dates) into a `FactSet`; `suggestMappings` scores candidates against the KB synonym index
  with DE/EN explanations, and `applyMappings` folds accepted decisions into a `PassportDraft`
  with conflict detection. Musterwerk fixtures (five deterministic supplier documents) back
  the recall gate at 32/34 = 94.1 % of expected attributes proposed at confidence >= 0.7 (the
  two misses are attributes marked `not_displayed` for EV). The IDTA 02035-2 (Handover
  Documentation) emitter runs behind an explicit VDI 2770 classification, raising
  `PW-L1-DOCUMENT-UNCLASSIFIED` for unclassified documents; see ADRs D-016 and D-017. Oracle
  parity 16/16.
- **Phase 5 (gap report, obligations, explain, L4): done.** L4 plausibility is a full verdict
  layer over 24 `PW-PLAUS` rules (ADR D-020): rules stay data in `kb/rules.json`, checks are a
  registry keyed by rule id, and L4's context hides any attribute L1 rejected so a bad value is
  reported once. Numeric bands now come from the knowledge-base `range` rather than a hardcoded
  0-100 (ADR D-021). `gapReport` buckets every attribute as required, conditional, deferred or
  optional, reports mandatory and overall completeness, and groups by submodel and by data
  owner. `checkObligations` answers required / not required / insufficient input for seven
  battery types, citing Article 77(1) only (ADR D-022). `explainAttribute` and `explainRule`
  join the knowledge base without composing a single new claim. Where IDTA and the Commission
  disagree, the template wins the file and the guidance wins the advice (ADR D-023).
- **Phase 7a, first slice (`apps/web`): done.** Vite, React, Tailwind and shadcn/ui in three
  layers (`workflow`, `views`, `app`) with a tested import boundary (ADR D-029). Start, upload,
  review (accept, reject, edit, manual values, composite leaves), gaps and export (AAS JSON,
  AASX, draft JSON, gap report JSON), DE/EN chrome, IndexedDB autosave without document bytes.
  Playwright proves browser results equal core's Node results on the Musterwerk fixtures and
  the golden samples, and that no request leaves the origin. `pnpm --filter @passwerk/web dev`
  to run it.
- **Battery Pass SAMM cross-check: done.** The consortium's seven SAMM aspect models (v1.2.0,
  Performance 1.2.1) are pinned beside the longlist and indexed into
  `kb/generated/batterypass-samm.json`; `pnpm review-sheet` joins every attribute to them by DIN
  chapter and IDTA semanticId name and lists unit, type, enum and range disagreements in
  `docs/KB_REVIEW.md` for human review. Dev-time only, never loaded at runtime (ADR D-030).
- **Phase 6.1 (`@passwerk/server`, skill, install docs): done.** Ten MCP tools (ingest, extract,
  suggest, apply, validate, gap report, emit, obligations, explain, capabilities) over a bounded
  content-addressed session store, seven resources, three prompts, stdio and Streamable HTTP
  (`PASSWERK_AUTH_TOKEN`, `/healthz`), an injected file-system adapter with an optional root,
  and the sovereignty proof over the whole server surface. `skills/passwerk/SKILL.md`,
  `docs/install/` and the root `.mcp.json`. `generate_carrier` and the `html` target wait for
  Phase 7 (ADR D-031).
- **Phase 6.2 (`@passwerk/cli`, demo script): done.** `passwerk audit | extract | emit | gaps |
  obligations | tools | chat` over the server registry, run in-process with injected io
  (`run(argv, io)`), exit codes per spec section 5, canonical `--json`, DE/EN text. `chat` is
  a manual Anthropic tool loop with an injected client (default `claude-sonnet-5`, key from
  `ANTHROPIC_API_KEY` only, SDK imported lazily, system prompt synced from `SKILL.md`); the
  scripted Musterwerk chain and the golden drafts prove the definition of done in CI, and the
  demo scripts run it for real. Sovereignty proof over every command. See ADR D-032.
- **Phase 7 (carrier, HTML sheet, release): done.** `packages/core/src/carrier` builds the
  unique identifier (`meta.passportId`, an absolute https URI, PW-PLAUS-008 already applies),
  the GS1 Digital Link (`/01/{gtin}/21/{serial}` or `/8004/{giai}`, mod-10 GTIN check,
  `kb/carrier.json` with `verify: true`, listed in `docs/KB_REVIEW.md`) and the QR code as SVG
  or PNG (`qrcode-generator`, in-house SVG/PNG rendering, `jsqr` dev-only decode proof).
  `emitHtml` (`packages/core/src/emit/htmlSheet.ts`) is one more fail-honest emitter: a
  self-contained DE/EN HTML passport sheet with no JavaScript. `generate_carrier` is the
  server's eleventh tool, `emit_passport` gains the `html` target and `htmlLang`, the CLI gains
  `passwerk carrier`, and the web export list gains the HTML sheet and the QR. Core imports the
  AAS SDK only through `src/vendor/aasCore.ts`, and `packages/core/scripts/bundle-vendor.mjs`
  inlines the patched SDK into `dist/vendor/aasCore.js` so a published `@passwerk/core` needs no
  pnpm patch of its own; `pnpm release:pack` and `pnpm release:smoke`
  (`tools/release/pack-smoke.mjs`) prove the four package tarballs install and run, and CI
  gained `pack` and `docker` jobs beside the existing `--network none` sovereignty job.
  `Dockerfile` (distroless Node 22,
  non-root, HTTP mode only), `docker-compose.yml`, `.github/workflows/release.yml` (npm trusted
  publishing, GHCR amd64/arm64, `mcp-publisher`) and `packages/server/server.json`
  (`io.github.ShahriarBijoy/passwerk`) are new; the owner's one-time and per-release steps are
  in `docs/RELEASE.md`. See ADRs D-033 and D-034.
- **Phase 7a, second slice (`apps/web`): done.** Project screen (obligations check, voluntary
  category, four identifier modes, QR preview), facts screen (edit, map to attribute), row
  editor for array composites (closes #23), state v2 with derived proposals, obligations result,
  meta, base draft, validation and QR (ADR D-036); `checkObligations` now names a pre-2027
  battery's passport category instead of `null`. Playwright covers the project, facts, row
  editor and QR tracks.
- **Phase 7b (`apps/mcp-app`): done.** The workbench is the web app inside the host's iframe: one
  inlined HTML built from `apps/web/src` (`views`, `workflow`, `i18n`, `components`; the shell
  takes its platform hooks as a prop) plus a bridge over `@modelcontextprotocol/ext-apps`. Core
  runs in the iframe; the derived draft is stored through `validate_passport` one second after
  the last decision and the model learns the draft id through `updateModelContext`; exports go
  through the host's `downloadFile` or fall back to `emit_passport`. The server gains the twelfth
  tool `review_passport` (`_meta.ui.resourceUri`) and `ui://passwerk/workbench.html` (empty CSP,
  `ServerOptions.ui` loader, no SDK dependency), `PASSWERK_CLOCK`, and ships `ui/` in the
  tarball and the Docker image. Playwright runs a dev-only host page against the real server over
  Streamable HTTP (Musterwerk, golden, model-context, sovereignty). `pnpm build:mcp-app`,
  `pnpm e2e:mcp-app`. The Claude Desktop measurements go into ADR D-037 from the probe
  (`pnpm --filter @passwerk/mcp-app probe`).
- **Phase 7a, bring-your-own-key (`apps/web`): done.** An optional mapping assist on the review
  screen (ADR D-038), inside the D-002 boundary: `core` and `server` still make zero model calls
  and zero network calls. The model returns attribute ids and nothing else — a value, unit or
  confidence it volunteers is discarded unread, and an accepted suggestion takes its value from
  `proposalValue` and its provenance from the fact. Facts travel as per-run tokens, never core's
  ids, which embed the file name. Seven guards (unknown attribute, not offered for the category,
  unknown fact, bad leaf, value refused, duplicate, already decided) become counted, displayed
  discards. Second opinions mark a proposal row and decide nothing. Anthropic or any
  OpenAI-compatible base URL (Ollama, LM Studio), plain `fetch`, key in memory unless
  "remember on this device" is ticked, and then in its own IndexedDB record. The assist is a
  `Platform` capability; `apps/mcp-app` supplies none, and its sovereignty spec proves the built
  workbench carries no endpoint. `apps/web/e2e/sovereignty.spec.ts` is unchanged and still green.
- **Phase 7c (packaging): done, two owner measurements outstanding.** `packaging/mcpb` builds a
  `.mcpb` bundle for Claude Desktop that vendors the `rules`, `core` and `server` release
  tarballs with `npm install --omit=dev --omit=optional` (the CLI is not vendored; omitting
  `optional` keeps `pdfjs-dist`'s native canvas out and the bundle platform-neutral), a launcher
  that imports `dist/bin.js`'s exported `main` so the MCP App workbench keeps resolving inside
  the installed package (ADR D-037), and a manifest whose `version`, `tools` and `prompts` are
  derived at build time from the installed server's own registry and `dist/prompts/texts.js`
  rather than committed and checked, which is why the release workflow's version-agreement loop
  did not need to grow. `packaging/codex-plugin` builds a Codex CLI plugin that points at `npx -y
  @passwerk/server` (no vendored runtime) and copies `skills/passwerk` byte-for-byte from its one
  source on every build. `PRIVACY.md` and `docs/connector-submission.md` are new. CI builds and
  smokes both packages on `ubuntu-latest`, `macos-latest` and `windows-latest`. See ADR D-039 for
  the corrections found during implementation (`mcpb` 2.1.2's required `prompts[].text`, the
  derived-manifest improvement over the design document, the skill-copy guarantee's true scope)
  and the two owner measurements the ADR leaves blank: the `.mcpb` one-click install on macOS and
  Windows, and `codex plugin add passwerk@personal` in a new Codex session. `SECURITY.md`, the
  item D-039 left open, was written on 2026-09-10 (reporting channel, the three load-bearing
  promises, five trust boundaries, supply chain).
- **Workbench redesign: done (2026-09-11).** `apps/web` and `apps/mcp-app` are a fixed-height
  instrument in the Nothing idiom (dark-first, mono-caps labels, bundled Space Grotesk / Space
  Mono / Doto) instead of a scrolling document, with six steps (export is now its own screen)
  and no toasts. `views/shell` is the reusable design system both apps share; see ADR D-040 for
  the ten places implementation ruled against the approved design.
- **Server tool detail and filters: done (2026-09-12).** `suggest_mappings` gains `attributeIds`
  and `gap_report` gains `status`/`bucket` filters; both gain the `ingest_documents`-style
  `detail: 'summary' | 'full'` switch, so a text-only host (Claude Desktop shows a tool's text,
  not its `structuredContent`) can close gaps from extracted facts without guessing: `full`
  prints every filtered proposal or item as one line with provenance or legal reference, no cap.
  Completeness stays unfiltered and says so. The default output is unchanged. See ADR D-042.
- **Next:** Phase 8, proof and pilot (AASX Package Explorer and the BatteryPass-Ready public
  test environment against `docs/CONFORMANCE.md`; a pilot case study with a Northern-German
  supplier via BIBA).
