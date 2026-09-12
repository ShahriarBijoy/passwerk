# PASSWERK — Build Plan for Claude Code

> **The sovereign EU Battery Passport toolkit for AI agents.**
> Drop in a supplier's messy documents → get back a conformant Digital Battery Passport
> (AAS / IDTA 02035) plus a legally-cited gap report. 100 % offline, zero API keys, agent-agnostic.

This file is the single source of truth for building the project. It is written so that
Claude Code (or Codex / OpenCode / Cursor) can execute it phase by phase. It lives at
`docs/BUILD_PLAN.md` and is referenced from `CLAUDE.md` and `AGENTS.md`.

Working name: **passwerk** (German: "Pass" + "Werk"). Rename freely; keep the package scope consistent.


> **Amendments (2026-09-03, see `docs/DECISIONS.md`).** This plan is executed with four
> changes recorded as ADRs: **D-003** Zod 4 instead of Zod 3; **D-004** plain pnpm + `tsc -b`,
> no Turborepo, TypeScript 5.x; **D-005** v1.0 covers **all seven** IDTA 02035 submodels
> (built as a vertical slice on the three MVP submodels first, then the remaining four);
> **D-006** a fully client-side web app (`apps/web`) with QR preview replaces the `site/`
> browser demo and gets its own phase (7a). Where this document and an ADR disagree, the ADR wins.
>
> **Amendment (2026-09-04, D-019).** The web app is the product for suppliers, the MCP server
> plus skill is the AI interface, the CLI is the automation interface. A passwerk **MCP App**
> (interactive UI rendered inside Claude, ChatGPT, Cursor and VS Code) joins the surfaces as
> Phase 7b, and packaging (MCPB, Codex plugin, connector submission) as Phase 7c. §2.5, §5
> and §7 below carry the amended text.

---

## 0. Why this project exists (the pitch you put on your CV)

| Fact | Consequence |
|---|---|
| Reg. (EU) 2023/1542 Art. 77: from **18 Feb 2027** every EV, LMT (e-bike/e-scooter) and industrial >2 kWh battery placed on the EU market needs a Digital Battery Passport | Hard, non-negotiable deadline. First mandatory Digital Product Passport in the world. |
| ~90 data points (Annex XIII, Annex VI Part A; DIN DKE SPEC 99100; EC guidance "data points by category", v1.0 Jul 2026) | The passport is a **data problem**, not a QR-code problem. |
| Germany's IDTA published the 7-part **Digital Battery Passport AAS submodel templates (IDTA 02035-1…-7)** on 18 Feb 2026, jointly with Catena-X | There is an official machine-readable target format. Conformance can be **proven**, not claimed. |
| OEMs (BMW: Catena-X registration mandatory in procurement since Apr 2025; VW: contractual CO₂e limits) push data requests down to Tier-2/Mittelstand suppliers | Thousands of small suppliers must answer, with no tooling. Every commercial vendor (Siemens DPP4.0, SAP, Circulor, Minespider, Circularise, Spherity, Path.Era) sells to OEMs/Tier-1s. |
| Tractus-X `digital-product-pass` reference app was **archived Oct 2025** | The open-source supplier on-ramp is gone. |

**Product promise:** *"Drop in your files, get back a passport that passes, plus a to-do list for what's still missing."*

**Engineering promise (the CV line):** *"Pure TypeScript, offline, agent-agnostic MCP server. Conformance to the official IDTA 02035 templates and the AAS metamodel is enforced as a CI gate by diffing against the official test engine, file by file."*

The blueprint is `kontor-mcp` (e-invoicing): same monorepo shape, same sovereignty proofs, same "fail-honest" validation. Study it once, then don't copy — the domain is different.

---

## 1. Scope

### 1.1 In scope (v1.0)
1. **Ingest** supplier documents: PDF (text + scanned), XLSX/CSV, DOCX, JSON, plain text, images (via host agent's vision, not ours).
2. **Extract** deterministic structure (tables, key-value pairs, units, dates) from those documents — no LLM inside the server.
3. **Map** extracted facts onto the Battery Passport data model (DIN DKE SPEC 99100 attribute list, ~90 attributes) — the *semantic* mapping is done by the **host agent** guided by our prompts/resources; the server offers deterministic helpers and confidence scoring.
4. **Validate** a candidate passport: JSON-Schema → AAS metamodel rules → IDTA 02035 template conformance → passwerk plausibility (units, ranges, checksums, date logic, cross-field consistency).
5. **Emit** the passport as AAS (JSON + AASX package), as flat JSON, and as a human-readable HTML/Markdown "passport sheet".
6. **Gap report**: every missing/invalid field with legal reference (Art./Annex/paragraph), plain DE/EN explanation, "who typically has this data" hint, and fix suggestion.
7. **Obligation check**: decision tree — does *this* battery/company need a passport, which category, which fields are mandatory vs optional vs conditional for that category, which dates apply.
8. **Data carrier**: generate the unique identifier + QR/GS1 Digital Link payload (ISO/IEC 15459, ISO/IEC 18004).
9. **Agent-agnostic delivery**: MCP server (stdio + Streamable HTTP), Claude Code / Codex / OpenCode skill folders, a scriptable CLI, and a plain TypeScript library.

### 1.2 Explicitly out of scope (v1.0)
- Hosting the passport online / registering with the EU DPP Registry (v1.x, behind a clearly separate `publish` package).
- Full Product Carbon Footprint *calculation* (methodology delegated act still pending). We **carry** a PCF value with provenance and validate its structure; we ship an interim GBA/Battery Pass rulebook *calculator* as clearly-labelled `experimental`.
- Any cloud service, telemetry, or account system.

### 1.3 Non-functional requirements
| NFR | Target |
|---|---|
| Offline | Zero outbound network at runtime; proven by test (`sovereignty.test.ts`) and a `--network none` CI job |
| Runtime | Node ≥ 20, pure TS/WASM; no Java, no Python at runtime (Python/Java only as CI oracles) |
| Conformance | 100 % of golden passports pass `aas-test-engines`; 0 diff against IDTA 02035 template structure |
| Determinism | Same input → byte-identical output (stable key ordering, fixed timestamps in tests) |
| Privacy | Nothing stored, nothing logged by default (`PASSWERK_LOG_PAYLOADS=off`) |
| Portability | Linux, macOS, Windows CI; Node 22 & 24 (Node 20 is EOL, ADR D-018) |
| Agent-agnostic | Works in Claude Code, Codex CLI, OpenCode, Cursor, Claude Desktop, MCP Inspector |

---

## 2. Architecture

### 2.1 Layered view

```
┌──────────────────────────────────────────────────────────────────────┐
│  HOST AGENT  (Claude Code · Codex · OpenCode · Claude Desktop · CLI)  │
│  does the *semantic* work: reads extracted tables, decides mappings,  │
│  asks the user, iterates until validate() says "valid"                │
└───────────────┬─────────────────────────────┬────────────────────────┘
                │ MCP (stdio / Streamable HTTP) │ skill files (SKILL.md, AGENTS.md)
┌───────────────▼─────────────────────────────▼────────────────────────┐
│  @passwerk/server         tools · resources · prompts (Zod schemas)   │
│  @passwerk/cli            passwerk audit|extract|emit|obligations     │
├──────────────────────────────────────────────────────────────────────┤
│  @passwerk/core   (MCP-free, pure library — the thing you unit-test)  │
│   ingest → extract → model → validate → gap → emit → carrier          │
├──────────────────────────────────────────────────────────────────────┤
│  @passwerk/rules  (bundled, checksummed, offline)                     │
│   IDTA 02035-1..7 templates · AAS metamodel schemas · DIN DKE SPEC    │
│   99100 attribute KB · EC data-point matrix · legal timeline ·        │
│   code lists · DE/EN explanations                                     │
└──────────────────────────────────────────────────────────────────────┘
```

**Key design decision — where the LLM lives.** The server never calls an LLM. Semantic mapping ("this Excel column `Kobalt rec. %` is `recycledContentCobalt`") is a job for the host agent, which already has a model. The server gives it (a) clean extracted structure, (b) the target schema with descriptions/synonyms, (c) deterministic candidate mappings with confidence scores, and (d) a validator that tells it exactly what is still wrong. This keeps the server sovereign (no API keys), agent-agnostic, and testable. The CLI has an *optional* `chat` mode that runs an Anthropic/OpenAI agent loop for demos — that's the only place a key ever appears.

### 2.2 Core pipeline (inside `@passwerk/core`)

```
files ──► ingest ──► DocumentBundle
                        │  (pages, tables, kv-pairs, provenance: file+page+cell)
                        ▼
                     extract ──► FactSet
                        │  (normalized facts: {path?, value, unit, source, confidence})
                        ▼
              suggestMappings ──► MappingProposal[]     (deterministic: synonyms, units, regex, KB)
                        │
        host agent confirms/edits ──► PassportDraft      (canonical internal model, category-aware)
                        │
                     validate ──► ValidationReport       (4 layers, never lies)
                        │
                     gapReport ──► GapReport             (missing/invalid + law ref + hint)
                        │
                       emit ──► AAS JSON · AASX · flat JSON · HTML sheet
                        │
                     carrier ──► UID + GS1 Digital Link + QR (SVG/PNG)
```

### 2.3 Canonical internal model
Do **not** make the AAS submodel the internal model. Use a neutral `PassportDraft` (typed, Zod-validated) with one field per DIN DKE SPEC 99100 attribute, grouped by the 7 IDTA submodels. Emitters map from `PassportDraft` → AAS submodels (and, later, → Catena-X aspect models). This isolates you from format fragmentation.

```ts
// packages/core/src/model/passport.ts (sketch)
export const BatteryCategory = z.enum(['EV', 'LMT', 'INDUSTRIAL_GT_2KWH']);

export const PassportDraft = z.object({
  meta: z.object({ category: BatteryCategory, schemaVersion: z.literal('1.0'), createdAt: z.string() }),
  identification: z.object({ batteryUniqueId: Field(z.string()), manufacturerName: Field(z.string()), /* … */ }),
  nameplate: z.object({ /* IDTA 02035-1 */ }),
  handoverDocs: z.object({ /* IDTA 02035-2 */ }),
  carbonFootprint: z.object({ /* IDTA 02035-3 */ }),
  technicalData: z.object({ /* IDTA 02035-4 */ }),
  condition: z.object({ /* IDTA 02035-5 */ }),
  materialComposition: z.object({ /* IDTA 02035-6 */ }),
  circularity: z.object({ /* IDTA 02035-7 */ }),
});

// Every leaf is a Field<T>: value + provenance + confidence, so the gap report can say
// "recycledContentCobalt: missing" or "…: 12 % from supplier_decl.pdf p.3, confidence 0.62"
export const Field = <T extends z.ZodTypeAny>(inner: T) => z.object({
  value: inner.optional(),
  unit: z.string().optional(),
  source: z.array(Provenance).default([]),
  confidence: z.number().min(0).max(1).optional(),
  status: z.enum(['present', 'missing', 'conflict', 'not_applicable']).default('missing'),
});
```

### 2.4 Validation layers (the credibility engine)
| Layer | What | Engine | Fails build? |
|---|---|---|---|
| L1 Schema | `PassportDraft` structural validity | Zod | yes |
| L2 AAS metamodel | Emitted AAS JSON is a valid AAS v3.x Environment | `@aas-core-works/aas-core3.0-typescript` `verification.verify()` | yes |
| L3 Template conformance | Emitted submodels match IDTA 02035-x templates: semanticIds, idShorts, cardinalities, value types, mandatory elements per battery category | passwerk template-diff engine (reads bundled template JSON) | yes |
| L4 Plausibility (`PW-PLAUS-*`) | Units/ranges (capacity, voltage, mass), % shares sum ≤ 100, dates ordered, UID format, checksum, cross-field consistency (category ⇄ mandatory set), PCF value present when category requires | passwerk rules | warnings/errors, never overrides L2/L3 |
| **Oracle (CI only)** | Independent proof: run official `aas-test-engines` (Python) on every emitted golden file; diff verdicts against ours | Python in CI, `pnpm oracle` | yes — parity gate |

"Valid" is only ever the real verdict. `emit` re-validates its own output through the same four-layer report as `validate` (L2/L3 on the emitted file, L1/L4 on the draft, one `asOf`; ADR D-026) before returning `valid: true`.

### 2.5 Agent-agnostic delivery — "the best way"
One deterministic engine, several thin surfaces (D-001, D-006, D-019). The hierarchy, amended by D-019:

| Rank | Surface | Who | Why |
|---|---|---|---|
| Product | `apps/web` (client-side, no backend) | Quality / compliance manager at the supplier | Upload files, review mappings, resolve gaps, download the passport. Never a terminal. |
| AI interface | `@passwerk/server` + `skills/passwerk` + MCP App | Consultants and agent users in Claude, Codex, Cursor, OpenCode | Conversational analysis; the host LLM does the semantic step (D-002) |
| Automation | `@passwerk/cli` | Developers, ERP and CI teams | Batch runs, exit codes, ERP integration |
| Foundation | `@passwerk/core` | Anyone building their own agent or UI | Plain library |

MCP is the one protocol every major coding agent speaks (Claude Code, Codex CLI, OpenCode, Cursor, Windsurf, Claude Desktop, Gemini CLI), so it stays the single AI interface. The surfaces:

| Surface | Purpose | Location |
|---|---|---|
| `apps/web` | Static, fully client-side app bundling `@passwerk/core`: ingest, mapping review, gap report, validation, emit, QR preview. Optional bring-your-own-key model call from the browser | `apps/web` |
| `@passwerk/server` (npm, `npx -y @passwerk/server`) | MCP over stdio; `--http` for Streamable HTTP with bearer token; Docker image; session store keyed by bundle / draft id | `packages/server` |
| passwerk MCP App | `ui://` resource served by the server (MCP Apps extension `io.modelcontextprotocol/ui`): the web app's review, gap and export views in an iframe inside Claude, ChatGPT, Cursor, VS Code. Files enter through a file input in the iframe; not rendered by Claude Code or Codex CLI, which use the text tools | `apps/mcp-app` |
| `skills/passwerk/SKILL.md` | Agent Skill (Anthropic skill format) that teaches *any* agent the workflow: ingest → map → validate → fix → emit. Works in Claude Code, Codex (`AGENTS.md` pointer), OpenCode | `skills/passwerk/` |
| `AGENTS.md` + `CLAUDE.md` | Repo-level instructions (Codex reads AGENTS.md, Claude Code reads CLAUDE.md, OpenCode reads both) | repo root |
| `.mcp.json` / `opencode.json` / `.codex/config.toml` examples | One-line install for each agent | `docs/install/` |
| Packages: MCPB (Claude Desktop, local, offline), Codex plugin (`.codex-plugin/plugin.json`: skill + stdio server), Claude connector (remote, directory submission) | One-click install of the same server and skill | `packaging/` |
| `@passwerk/cli` (`passwerk`) | Scriptable, no-LLM: `passwerk audit draft.json` exits 0/1/2; `passwerk extract *.pdf`; optional `chat` demo loop | `packages/cli` |
| `@passwerk/core` (npm) | Plain library for anyone building their own agent/UI | `packages/core` |
| `site/` | Static docs (the browser demo moved to `apps/web`, D-006) | `site/` |

Privacy modes, stated honestly in every README: the web app and the local stdio / MCPB installs process everything on the user's machine; the hosted connector routes tool calls through the AI host and the operator's endpoint and is a convenience mode with an explicit retention policy, never advertised as offline.

---

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x, ESM, strict | Your strength; single runtime for server, CLI, browser demo |
| Monorepo | pnpm workspaces + Turborepo (or plain `pnpm -r`) | Same as kontor; fast, simple |
| Schemas | Zod 3 (+ `zod-to-json-schema` for MCP tool schemas) | One source of truth for validation + tool input schemas |
| MCP | `@modelcontextprotocol/sdk` (TS) — stdio + Streamable HTTP transports | Official SDK |
| AAS | `@aas-core-works/aas-core3.0-typescript` (metamodel, JSON/XML de/serialization, verification); evaluate `basyx-typescript-sdk` for AASX/API helpers | Official, generated from the spec |
| AASX packaging | `jszip` (AASX = OPC zip with `[Content_Types].xml` + rels) | Pure JS |
| PDF text | `pdfjs-dist` (text + layout); tables via `pdf-table-extractor`-style heuristics on text positions | Pure JS; no poppler |
| Scanned PDF / images | **Not** OCR'd by the server (keeps it small). `ingest` returns page images; the host agent's vision reads them. Optional `tesseract.js` (WASM) behind a flag | Sovereign + optional |
| XLSX/CSV | `xlsx` (SheetJS) / `papaparse` | Standard |
| DOCX | `mammoth` | Standard |
| Decimal math | `decimal.js` | Never float for %, kg, kWh |
| Units | `convert-units` or a tiny in-house table (kg/g, kWh/Wh, V, Ah, %) | Deterministic |
| Dates | `date-fns` (no moment) | |
| QR / GS1 | `qrcode` (SVG/PNG), in-house GS1 Digital Link builder (`/01/{GTIN}/21/{serial}` or `/8004/{GIAI}`) | |
| HTML sheet | Template literal → single self-contained HTML (inline CSS) | No framework in core |
| Tests | Vitest; snapshot tests for emitted AAS; property tests (`fast-check`) for plausibility rules | |
| Lint/format | Biome | One tool |
| CI | GitHub Actions: lint → build → test (ubuntu/macos/windows × node 20/22) → sovereignty (`--network none` Docker) → oracle parity (Python `aas-test-engines`) → publish | |
| Docker | Multi-stage, non-root, distroless-ish Node image, amd64+arm64 | |
| Docs site | Astro or VitePress in `site/`; browser demo bundles `@passwerk/core` with Vite | |
| Oracles (dev/CI only) | `aas-test-engines` (Python), AASX Package Explorer (manual), BatteryPass-Ready test environment (manual, record reports) | Independent proof |

---

## 4. Repository layout

```
passwerk/
├── CLAUDE.md                      # Claude Code instructions (points to docs/BUILD_PLAN.md)
├── AGENTS.md                      # Codex / OpenCode instructions (same content, agent-neutral)
├── README.md                      # Product README (pitch, quickstart, tools table, conformance badge)
├── SECURITY.md · CONTRIBUTING.md · CHANGELOG.md · LICENSE (Apache-2.0) · NOTICE
├── .mcp.json                      # Claude Code: registers ./packages/server for this repo
├── docs/
│   ├── BUILD_PLAN.md              # ← this file
│   ├── PRD.md                     # Product requirements (derive from §0–1)
│   ├── DECISIONS.md               # ADR log (D-001 …)
│   ├── CONFORMANCE.md             # Oracle parity results, dated, with commands
│   ├── DATA_MODEL.md              # PassportDraft ⇄ DIN DKE SPEC 99100 ⇄ IDTA 02035 ⇄ Annex XIII mapping table
│   ├── LEGAL_TIMELINE.md          # Every date with primary source
│   └── install/                   # claude-code.md · codex.md · opencode.md · cursor.md · claude-desktop.md
├── skills/
│   └── passwerk/
│       ├── SKILL.md               # Agent skill: the workflow, tool order, stop conditions
│       └── references/            # short cheat-sheets the agent may read (field synonyms, category rules)
├── packages/
│   ├── rules/                     # @passwerk/rules — bundled artefacts + knowledge base
│   │   ├── artefacts/
│   │   │   ├── idta/02035-1..7/   # official template .json + .aasx (pinned version, checksum)
│   │   │   ├── aas/               # AAS v3.x JSON schema
│   │   │   ├── ec/                # EC "data points by category" matrix, transcribed to JSON
│   │   │   └── codelists/         # chemistry codes, country codes, units, hazardous substances list
│   │   ├── kb/
│   │   │   ├── attributes.json    # ~90 attributes: id, name DE/EN, legal ref, category applicability,
│   │   │   │                      #   mandatory/optional/conditional, synonyms DE/EN, unit, who-has-it hint
│   │   │   ├── rules.json         # PW-PLAUS-* rule texts DE/EN + fix hints
│   │   │   └── timeline.json      # legal dates with sources + lastVerified
│   │   ├── PROVENANCE.md          # where each artefact came from, version, sha256, licence
│   │   ├── scripts/fetch.ts       # dev-only: download + checksum artefacts
│   │   └── src/index.ts           # typed accessors (no fs at runtime in browser build → import JSON)
│   ├── core/                      # @passwerk/core — MCP-free library
│   │   └── src/
│   │       ├── ingest/            # pdf.ts · xlsx.ts · csv.ts · docx.ts · text.ts · bundle.ts
│   │       ├── extract/           # tables.ts · kv.ts · units.ts · numbers.ts · facts.ts
│   │       ├── mapping/           # synonyms.ts · scorer.ts · propose.ts
│   │       ├── model/             # passport.ts (Zod) · field.ts · category.ts · provenance.ts
│   │       ├── validate/          # schema.ts · aas.ts · template.ts · plausibility/ (one file per rule) · report.ts
│   │       ├── gap/               # gapReport.ts · explain.ts (DE/EN)
│   │       ├── obligations/       # decisionTree.ts
│   │       ├── emit/              # aasJson.ts · aasx.ts · flatJson.ts · htmlSheet.ts · catenax.ts (v1.x)
│   │       ├── carrier/           # uid.ts · gs1DigitalLink.ts · qr.ts
│   │       ├── samples/           # golden inputs + expected outputs (3 categories × valid/broken)
│   │       └── index.ts
│   │   └── test/                  # unit + snapshot + property + sovereignty.test.ts
│   ├── server/                    # @passwerk/server — MCP
│   │   └── src/
│   │       ├── bin.ts             # entry: stdio by default, --http for Streamable HTTP
│   │       ├── server.ts          # createServer(): registers tools/resources/prompts
│   │       ├── tools/             # one file per tool (see §5)
│   │       ├── resources/         # passwerk://samples, ://reference/attributes, ://reference/rules, ://cheatsheet
│   │       ├── prompts/           # build-passport-interview · audit-supplier-submission · draft-data-request
│   │       ├── http.ts            # Streamable HTTP host, bearer auth, /healthz
│   │       └── logging.ts         # payload logging off by default
│   └── cli/                       # @passwerk/cli — `passwerk` binary
│       └── src/
│           ├── bin.ts
│           ├── commands/          # audit · extract · emit · obligations · tools · chat (optional LLM)
│           └── agentLoop.ts       # chat: Anthropic SDK agent loop printing every tool call
├── tools/
│   ├── oracle/                    # run aas-test-engines on emitted files, diff verdicts, write CONFORMANCE.md
│   └── fixtures/                  # scripts to regenerate golden samples
├── site/                          # docs + browser demo (Vite)
├── Dockerfile · docker-compose.yml · .env.example
├── biome.json · tsconfig.base.json · tsconfig.json · vitest.config.ts
├── pnpm-workspace.yaml · package.json · .nvmrc · .editorconfig · .gitattributes
└── .github/workflows/ci.yml · release.yml
```

---

## 5. MCP surface (contract)

All tools: Zod input schema → JSON schema; return `structuredContent` **and** a readable `text` summary; every output that can be "valid" carries the real verdict; every legal claim carries a `sources[]` array and an `isNotLegalAdvice: true` flag.

### 5.1 Tools
| Tool | Input | Output | Notes |
|---|---|---|---|
| `ingest_documents` | `{ paths: string[] \| inline: {name, base64}[], ocr?: boolean }` | `DocumentBundle` (per file: pages, tables (as 2D arrays with cell refs), kv-pairs, text chunks, page images refs, detected language) | Deterministic. PDFs by path preferred (Claude Desktop won't pass PDF bytes). |
| `extract_facts` | `{ bundle: DocumentBundle \| bundleId }` | `FactSet` (normalized facts with units & provenance) | Pure heuristics. |
| `suggest_mappings` | `{ facts: FactSet, category: BatteryCategory, lang?: 'de'\|'en' }` | `MappingProposal[]` sorted by confidence, each with `attributeId`, `value`, `unit`, `source`, `confidence`, `why` | Synonym KB + unit checks + type checks. The host agent reviews. |
| `apply_mappings` | `{ draft?: PassportDraft, mappings: MappingDecision[] }` | updated `PassportDraft` | Idempotent; conflicts flagged, never silently overwritten. |
| `validate_passport` | `{ draft: PassportDraft, lang? }` | `ValidationReport`: `verdict: valid \| valid_with_warnings \| invalid`, `findings[]` (layer, ruleId, severity, path, message DE/EN, legalRef, fixHint) | L1–L4. |
| `gap_report` | `{ draft, lang? }` | `GapReport`: per attribute `status`, `mandatoryFor`, `legalRef`, `whoTypicallyHasIt`, `suggestedAction`; plus `completeness %` per submodel | The "to-do list". |
| `emit_passport` | `{ draft, targets: ('aas-json'\|'aasx'\|'flat-json'\|'html')[], outDir? }` | file paths (or inline), plus **re-validation verdict** of emitted output | Fail-honest: if L2/L3 fail on output → `valid:false`, still returns files. |
| `check_obligations` | `{ batteryType, capacityKwh?, placedOnMarketDate?, role: manufacturer\|importer\|distributor, ... }` | `ObligationResult`: passportRequired, category, mandatory attribute set, applicable dates, primary sources | Decision tree from `timeline.json`. |
| `explain_attribute` | `{ attributeId \| ruleId, lang? }` | official text, legal ref, DE/EN explanation, synonyms, who-has-it hint, example value | Like kontor's `explain_rule`. |
| `generate_carrier` | `{ draft \| uid, gs1?: {gtin, serial} \| giai, format: 'svg'\|'png', resolverBase? }` | UID string, GS1 Digital Link URI, QR image | Validates UID format. |
| `list_capabilities` | `{}` | versions of bundled templates/standards, KB stats, `lastVerified` dates, sovereignty statement | |

Session state (D-019): every tool that takes a `DocumentBundle`, `FactSet` or `PassportDraft` also accepts the id the server returned for it (`bundleId`, `factSetId`, `draftId`) and every tool that produces one returns its id. The store is in-memory and per connection, so the MCP App iframe and the host model operate on the same objects without re-sending them. Optional `_meta.ui.resourceUri` on `suggest_mappings`, `gap_report` and `emit_passport` points at the MCP App resource; hosts without the extension ignore it.

### 5.2 Resources
- `passwerk://samples/{name}` — golden inputs and drafts (e.g. `industrial-valid`, `ev-missing-pcf`, `lmt-conflicting-mass`)
- `passwerk://reference/attributes` — the full attribute KB (agent reads it to map intelligently)
- `passwerk://reference/rules` — PW-PLAUS rule catalogue
- `passwerk://reference/cheatsheet` — 1-page: categories, dates, mandatory sets
- `passwerk://reference/template/{submodel}` — the IDTA template structure, simplified

### 5.3 Prompts
- `build-passport-interview` — guided flow: category → ingest → map → validate → fix loop → emit
- `audit-supplier-submission` — for an OEM/Tier-1 receiving a draft: validate + gap + accept/review/reject with rationale
- `draft-data-request` — generates the email/list a supplier sends upstream (cell maker) for missing attributes

### 5.4 Agent skill (`skills/passwerk/SKILL.md`) — outline
```
name: passwerk
description: Build or audit an EU Digital Battery Passport from supplier documents using the passwerk MCP tools. Use when the user mentions battery passport, Batteriepass, DPP, IDTA 02035, Annex XIII, or supplier compliance data requests.
---
Workflow (always in this order; never claim validity without validate_passport):
1. check_obligations → confirm category + mandatory set.
2. ingest_documents (paths) → extract_facts → suggest_mappings.
3. Review proposals; for confidence < 0.7 ask the user or look at the source page; apply_mappings.
4. validate_passport → if invalid, read findings, fix via apply_mappings, repeat (max 5 loops, then report).
5. gap_report → present as a to-do list grouped by "who has this data".
6. emit_passport (aas-json + aasx + html) only when verdict is valid or the user accepts warnings.
Stop conditions, honesty rules, DE/EN output rule, and "no legal advice" disclaimer.
```

---

## 6. Knowledge base design (this is where domain value lives)

`packages/rules/kb/attributes.json` — one entry per attribute. Build it from: EC guidance "data points by category" (mandatory/optional/conditional per EV/LMT/industrial), DIN DKE SPEC 99100, Battery Pass Data Attribute Longlist, IDTA 02035 templates. Example entry:

```json
{
  "id": "recycledContentCobalt",
  "submodel": "MaterialComposition",
  "idtaTemplate": "IDTA 02035-6",
  "semanticId": "<from template>",
  "name": { "en": "Recycled cobalt share", "de": "Anteil recyceltes Kobalt" },
  "legalRef": ["Reg (EU) 2023/1542 Art. 8", "Annex XIII 1(…)"],
  "applicability": { "EV": "mandatory", "LMT": "mandatory", "INDUSTRIAL_GT_2KWH": "mandatory" },
  "valueType": "percentage", "unit": "%", "range": [0, 100],
  "synonyms": { "de": ["Kobalt rec.", "Rezyklatanteil Kobalt", "Recyclinganteil Co"], "en": ["recycled Co", "Co recycled content"] },
  "whoTypicallyHasIt": "Cell manufacturer / cathode active material supplier",
  "explanation": { "en": "…", "de": "…" },
  "example": 12.5,
  "lastVerified": "2026-09-01"
}
```

Rules (`rules.json`) follow the same pattern with `PW-PLAUS-001…`. Keep the KB **data**, not code, so non-developers (a BIBA colleague, a Steuerberater-like domain expert) can review it in a PR.

Every artefact in `artefacts/` gets a `PROVENANCE.md` row: URL, version, date, sha256, licence. `pnpm artifacts` re-downloads and verifies; runtime never downloads.

---

## 7. Build phases (each = one Claude Code session, one PR)

Each phase lists: goal · tasks · definition of done · the prompt to start the session.

### Phase 0 — Repo bootstrap (½ day)
- pnpm workspace, TS base config, Biome, Vitest, GitHub Actions skeleton (lint+test on 3 OS × 2 Node), Apache-2.0, `CLAUDE.md`/`AGENTS.md` pointing here, ADR D-001 "why MCP + skill + CLI", D-002 "LLM stays in the host".
- DoD: `pnpm install && pnpm build && pnpm test` green with one placeholder test per package.
- Prompt: *"Read docs/BUILD_PLAN.md §3–4. Bootstrap the monorepo exactly as laid out. No product code yet. Create CI. Commit as 'chore: bootstrap monorepo'."*

### Phase 1 — Rules package: artefacts + KB (2–3 days, mostly domain work)
- `fetch.ts` for IDTA 02035-1..7 templates (JSON + AASX), AAS JSON schema; checksums; `PROVENANCE.md`.
- Transcribe EC data-point matrix → `ec/datapoints.json`; author `attributes.json` (start with the 3 MVP submodels: Nameplate, MaterialComposition, CarbonFootprint; ~35 attributes), `timeline.json`, `rules.json` (first 10 PW-PLAUS rules).
- DoD: `rules.test.ts` asserts every attribute has legalRef, applicability for all 3 categories, DE+EN names; every template checksum matches.
- Prompt: *"Implement @passwerk/rules per §4 and §6. Download and pin the IDTA 02035 templates; if a URL is unknown, stop and ask me rather than guessing. Author attributes.json for the MVP submodels from the EC guidance and DIN DKE SPEC 99100 references I will paste. Mark anything you are unsure of with `"verify": true`."*

### Phase 2 — Core model + validation L1–L3 (3–4 days)
- `PassportDraft` Zod model; `Field<T>` with provenance; category logic.
- Emit `aas-json` for the 3 MVP submodels using aas-core3.0-typescript; `aasx` packaging.
- L2 (aas-core verify) and L3 (template diff: walk template SubmodelElements, check presence/cardinality/type/semanticId in emitted output).
- Golden samples: `industrial-valid`, `ev-valid`, `lmt-valid` + 3 broken variants; snapshot tests.
- DoD: `emit(sample) → validate(output)` = valid for all valid samples; broken samples produce the expected findings.
- Prompt: *"Implement §2.3 model, §2.4 L1–L3, and emit/aasJson + emit/aasx. Golden samples in core/src/samples. Deterministic output (sorted keys, fixed test clock)."*

### Phase 3 — Oracle parity in CI (1–2 days) ← the credibility milestone
- `tools/oracle`: Python venv with `aas-test-engines`; run on every emitted golden file; parse result; diff against our L2/L3 verdict; write `docs/CONFORMANCE.md` with a dated table; fail CI on any mismatch.
- Add `sovereignty.test.ts`: monkey-patch `net`, `dns`, `tls`, `http(s)`, `fetch` to throw+record; run every tool/resource/prompt; assert zero attempts. Add `--network none` Docker CI job.
- DoD: badge "AAS conformance N/N" in README backed by CI artefact.
- Prompt: *"Build the oracle runner and the sovereignty proof per §2.4 and §1.3. CI must fail on any verdict mismatch or any network attempt."*

### Phase 4 — Ingest + extract + mapping (3–4 days)
- PDF (pdfjs) text+tables, XLSX, CSV, DOCX, TXT → `DocumentBundle` with cell/page provenance.
- `extract_facts`: numbers+units, dates, kv pairs, table headers; normalization (decimal comma, `kWh`/`Wh`, `%`).
- `suggest_mappings`: synonym matching (DE/EN, fuzzy), unit compatibility, type compatibility, confidence scoring; `apply_mappings` with conflict detection.
- Test fixtures: realistic fake supplier docs (make them yourself: a German "Lieferantenerklärung" PDF, a BOM xlsx with German headers, an energy bill).
- DoD: on fixtures, ≥ 80 % of present attributes proposed at confidence ≥ 0.7 with correct provenance.
- Prompt: *"Implement ingest/extract/mapping per §2.2. No LLM calls. Every proposal must carry file+page/cell provenance."*

### Phase 5 — Gap report, obligations, explain, plausibility L4 (2–3 days)
- `gap_report` with completeness per submodel, legal refs, who-has-it, DE/EN.
- `check_obligations` decision tree from `timeline.json` (category, capacity, role, date).
- `explain_attribute`; PW-PLAUS rules to ~25 (sum-of-shares, ranges, date order, UID format, PCF present when required, mass consistency).
- DoD: property tests for plausibility rules; gap report snapshot for each broken sample.

### Phase 5b — Hardening, held-out evaluation, KB review sheet (D-024) (2–3 days)
- Three small fix PRs closing the post-Phase-5 review: mapping safety (#10 unsafe composite paths, #13 same-leaf composite conflicts need `override`, #9 label unit factors, #14 KB `range` in proposals); verdict integrity (#11 unresolved conflicts are L1 errors, #12 one validation orchestrator shared by `validate` and both emitters, same `asOf`); ingest bounds (#15 sparse XLSX, OOXML decompression limits, structured limit-exceeded error).
- Held-out evaluation: supplier documents assembled from public datasheets, authored without tuning the synonym index against them. Report precision at confidence ≥ 0.7 (incorrect high-confidence mappings), recall, and correction effort (accept / reject / edit actions to reach `valid`) next to the Musterwerk recall gate.
- `verify: true` review sheet: one generated table of every flagged knowledge-base entry (DE/EN text, legal reference, source, reason for the flag) for a domain expert.
- Conformance wording: badge and README name L2 oracle parity, including expected failures, never certification.
- DoD: issues #9 to #15 closed with regression tests; `pnpm check` and `pnpm oracle` green; held-out numbers and the review sheet committed under `docs/`.

**Order after D-024:** 5b → 7a (minimal upload → review → gaps → export workflow) → 6 → 7 → 7b → 7c → 8.

### Phase 6 — MCP server + skill + CLI (2–3 days)
- Server: tools/resources/prompts per §5; stdio + Streamable HTTP (`PASSWERK_AUTH_TOKEN`), `/healthz`; payload logging off.
- `ingest_documents` accepts inline bytes as well as paths; a session store keyed by `bundleId` / `draftId` (in-memory, per connection) so a later MCP App and the model see the same state (D-019). Tools accept an id or the full object.
- `skills/passwerk/SKILL.md`; install docs for Claude Code (`.mcp.json`), Codex (`config.toml` + `AGENTS.md`), OpenCode (`opencode.json`), Cursor, Claude Desktop; MCP Inspector CLI examples.
- CLI: `audit` (exit codes 0/1/2), `extract`, `emit`, `obligations`, `tools`; optional `chat` (Anthropic SDK agent loop, prints every tool call).
- DoD: end-to-end demo script: `passwerk chat -m "Erstelle einen Batteriepass aus ./fixtures/lieferant-a/*"` reaches `valid` on the valid fixture set and produces a correct gap list on the broken set.
- **Amended by D-031 (2026-09-05).** Two PRs: 6.1 server + skill + install docs (done), 6.2 CLI + demo (done, ADR D-032). `generate_carrier` and the `html` target move to Phase 7. The DoD is measured as in Phase 7a: the tool chain on the Musterwerk fixtures reproduces the recall gate and the gap list; `valid` is proven on the golden drafts. Design: `docs/superpowers/specs/2026-09-05-phase-6-mcp-server-skill-cli-design.md`.

### Phase 7 — Carrier, HTML sheet, Docker, release (2–3 days)
- UID + GS1 Digital Link + QR; HTML passport sheet; Dockerfile (non-root, multi-arch), compose; `site/` static docs; README with GIF demo; publish `@passwerk/*` to npm; submit to the Official MCP Registry.
- DoD: `npx -y @passwerk/server` works from a clean machine; registry listing live.
- **Done (2026-09-06):** carrier (UID, GS1 Digital Link, QR SVG/PNG), HTML sheet, Docker image, release workflow, registry manifest; site/ dropped per D-006; see ADRs D-033, D-034.

### Phase 7a — Web app (D-006, D-019, D-024: runs before Phase 6) (3–4 days)
- First slice (D-024): upload, mapping review, gap report, export. Everything below completes the app afterwards.
- `apps/web`: static Vite app bundling `@passwerk/core` (pdfjs `workerSrc` supplied, D-016). Screens: project (category, role, capacity, date → `check_obligations`), upload, extracted facts with provenance, mapping review (accept / reject / edit, conflicts), gap report grouped by data owner with legal refs, validate, export (AAS JSON, AASX, HTML sheet, gap report, QR).
- Review, gap and export views are built as a shared component library so Phase 7b can reuse them unchanged.
- Optional bring-your-own-key model call from the browser for semantic mapping (D-002 boundary).
- DoD (first slice, D-029): Playwright on the built app, Chromium. Musterwerk track: the five fixtures uploaded and every proposal at confidence >= 0.7 accepted show the verdict, findings and gap items core computes in Node for the same inputs and clock. Golden track: each golden sample imported as draft JSON shows core's verdict and finding ids. Sovereignty: no request leaves the preview origin. Persistence: decisions survive a reload. The documents alone do not reach `valid` (31.9 % of mandatory data points), which is why `valid` is measured on the golden samples.
- **Second slice done (2026-09-07):** project screen (obligations, voluntary category, identifier modes, QR preview), facts screen (edit, map), row editor for array composites (#23), state v2 with derived proposals (ADR D-036).
- **Bring-your-own-key done (2026-09-08, ADR D-038):** an optional assist on the review screen.
  The model names attributes only; values and provenance keep coming from core and the
  documents. Anthropic or any OpenAI-compatible base URL (so Ollama and LM Studio work
  offline), the key in memory unless the reviewer asks for it to be remembered, a disclosure
  panel showing the literal request, and seven guards that turn everything else into a
  displayed discard. **Phase 7a is complete.**
- **Redesign done (2026-09-11, ADR D-040):** the app is a fixed-height instrument in the
  Nothing idiom, six steps (export is now its own screen), bundled Space Grotesk / Space Mono /
  Doto, no toasts; `views/shell` is the design system in code and Phase 7b reuses it unchanged.
  The ten places implementation ruled differently from the approved design — text-contrast
  fixes beyond the plan's own code, the official shadcn registry over ReUI's licence-gated one,
  the sheet's document-level Escape and advance-after-decision behaviour, an owner-requested
  date picker, an instrument-overflow guard that caught a real 875-px-in-735-px grid defect,
  and a grayscale-rendering fix for the Doto hero — are recorded in D-040, along with the
  deferred minors and open owner questions the visual review surfaced.

### Phase 7b — MCP App (D-019) (2–3 days)
- `apps/mcp-app`: the Phase 7a review, gap and export components wrapped in the MCP Apps bridge (`@modelcontextprotocol/ext-apps`), served by `@passwerk/server` as a `ui://` resource referenced from `_meta.ui.resourceUri` on the relevant tools.
- File entry: plain file input inside the iframe; bytes go to `ingest_documents` inline, or `core` runs inside the iframe and only the `FactSet` is sent. Decide after measuring the host's message size limit and confirming the sandbox permits file inputs (both unverified, D-019).
- Verified against Claude Desktop (stdio) and Claude web (Streamable HTTP); Claude Code and Codex CLI fall back to the text tools plus skill.
- DoD: the same fixture run as 7a completes inside Claude Desktop; screenshots for the directory submission.
- **Done (2026-09-08, ADR D-037):** `apps/mcp-app` builds one inlined HTML from the web app's `views`, `workflow`, `i18n` and `components` plus a bridge over `@modelcontextprotocol/ext-apps`; core runs inside the iframe and only the derived draft reaches the server (`validate_passport`, then `updateModelContext` with the draft id). New tool `review_passport` (`_meta.ui.resourceUri`) and resource `ui://passwerk/workbench.html` (empty CSP, injected loader). Playwright drives a dev-only host page against the real server over Streamable HTTP: Musterwerk, golden, model-context and sovereignty tracks. The Claude Desktop measurements (file input, pdf.js worker, payload cap, `downloadFile`) are recorded in D-037 by the owner from the bundled probe. The workbench inherits the Phase 7a redesign unchanged (ADR D-040): the host page in `apps/mcp-app/e2e` asserts a constant 640 px frame across all six steps and that a fullscreen request round-trips.

### Phase 7c — Packaging (D-019) (1–2 days)
- MCPB bundle for Claude Desktop (`manifest.json`, bundled Node server, `user_config` for the working directory); Codex plugin (`.codex-plugin/plugin.json` with the skills directory and the stdio server); Claude connector submission checklist (Streamable HTTP, tool annotations, privacy policy, screenshots).
- DoD: one-click install works on macOS and Windows for MCPB; the plugin loads in Codex CLI from a local marketplace.
- **Done (2026-09-09):** design document `docs/superpowers/specs/2026-09-09-phase-7c-packaging-design.md`.
  `packaging/mcpb` builds a `.mcpb` bundle vendoring the `rules`, `core` and `server` release
  tarballs (`--omit=dev --omit=optional`, offline install, platform-neutral) behind a launcher
  that keeps the MCP App workbench resolving inside the installed package (ADR D-037); its
  manifest's `version`, `tools` and `prompts` are derived at build time from the installed
  server's own registry rather than committed and checked, an improvement over the design
  document that left the release workflow's version-agreement loop unchanged. `packaging/
  codex-plugin` builds a Codex CLI plugin pointing at `npx -y @passwerk/server` with
  `skills/passwerk` copied byte-for-byte from its one source. `PRIVACY.md` and
  `docs/connector-submission.md` are new; CI builds and smokes both packages on Ubuntu, macOS
  and Windows. See ADR D-039 for the corrections made during implementation, including
  `mcpb` 2.1.2's required `prompts[].text`. Two owner measurements are still outstanding and
  recorded blank in D-039: the `.mcpb` one-click install in Claude Desktop on macOS and Windows,
  and `codex plugin add passwerk@personal` in a new Codex session. `SECURITY.md`, left open by
  D-039, was written on 2026-09-10.

### Phase 8 — Proof & pilot (ongoing)
- Run emitted AASX through AASX Package Explorer and the BatteryPass-Ready public test environment; record reports in `CONFORMANCE.md`.
- Pilot with one Northern-German supplier via BIBA; anonymized case study in docs.
- v1.x roadmap: Catena-X aspect-model emitter (`emit/catenax.ts`), `publish` package (hosting + registry), textile/steel DPP reuse of the engine.

---

## 8. Definition of "done" for v1.0 (CV checklist)
- [ ] `npx -y @passwerk/server` runs offline; listed in Official MCP Registry
- [ ] Works in Claude Code, Codex CLI, OpenCode, Claude Desktop (screenshots/GIFs in README)
- [ ] `docs/CONFORMANCE.md`: N/N golden passports pass official `aas-test-engines`, replayed every CI run
- [ ] `sovereignty.test.ts` + `--network none` job green
- [ ] Gap report with legal citations in DE and EN
- [ ] `apps/web` runs the whole workflow client-side; MCP App renders in Claude Desktop
- [ ] One pilot / case study (even anonymized) or a recorded run on realistic fixtures
- [x] Apache-2.0, `PROVENANCE.md`, `SECURITY.md`

---

## 9. Risks and how the plan absorbs them
| Risk | Mitigation baked in |
|---|---|
| PCF methodology delegated act changes | PCF module isolated; value carried with provenance; calculator marked experimental |
| AAS vs Catena-X aspect model fragmentation | Neutral `PassportDraft`; emitters are pluggable; Catena-X emitter planned |
| IDTA templates get a new version | Templates pinned + checksummed; template-diff engine is data-driven; `list_capabilities` reports versions |
| OEM platforms ship free supplier tooling | We are the offline/conformance on-ramp that *feeds* them, not a competitor; pure-TS, embeddable |
| Scanned PDFs | Server returns page images; host agent vision reads them; optional tesseract.js |
| You are one person | Everything is data-driven and tested; scope fenced to 3 MVP submodels first |

---

## 10. Conventions for Claude Code sessions
- Read `docs/BUILD_PLAN.md` at the start of every session; state which phase you are in.
- Never invent a URL, standard version, semanticId or legal reference. If unknown: mark `"verify": true` and ask.
- Every tool returns `structuredContent` + `text`. Every verdict is re-validated. Never return `valid: true` without running the validators.
- No network at runtime. No LLM calls in `core` or `server`.
- Money/quantities: `decimal.js`. Dates: ISO-8601 strings.
- DE and EN for every user-facing string in the KB.
- One PR per phase; update `DECISIONS.md` when you make a non-obvious choice.
- Commit messages: Conventional Commits.

---

## 11. First three prompts to paste into Claude Code

1. **Bootstrap** — *"You are building `passwerk`. Read `docs/BUILD_PLAN.md` fully. Execute Phase 0 exactly as specified. Do not write product code. When done, print the tree and the CI status."*
2. **Rules** — *"Execute Phase 1. Start by listing the artefacts you need with their source URLs and ask me to confirm each one before downloading. Then author `attributes.json` for the three MVP submodels; mark uncertain items with `verify: true`."*
3. **Core** — *"Execute Phase 2. Use `@aas-core-works/aas-core3.0-typescript`. Build the golden samples first, then the emitters, then L2/L3 validation. Show me the first emitted AAS JSON before writing the rest."*

---

*Sources behind the facts in §0 and §6 are in the research report (Reg. (EU) 2023/1542; EC guidance Ares(2026)7579758; DIN DKE SPEC 99100; IDTA 02035-1…7; CEN/CENELEC EN 18216–18223; Commission Implementing Regulation (EU) 2026/1778; BMW/VW supplier requirements). Re-verify dates and template versions before pinning — regulation moves.*
