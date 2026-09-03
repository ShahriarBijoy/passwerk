# Architecture Decision Records

One entry per non-obvious choice. Newest at the bottom. Status is `accepted` unless noted.
Format: context, decision, consequences. Keep each under about 15 lines.

## D-001: Deliver as MCP server + agent skill + CLI + library (2026-09-03)

**Context.** The product must work inside whichever coding agent a supplier already uses
(Claude Code, Codex CLI, OpenCode, Cursor, Claude Desktop) and also in scripts and CI.

**Decision.** The MCP server is the primary interface. Around it: an Agent Skill
(`skills/passwerk/SKILL.md`) that teaches the workflow, a no-LLM CLI with exit codes,
and the plain `@passwerk/core` library for anyone building their own agent or UI.

**Consequences.** One core, several thin surfaces. All product logic lives in `core`;
`server` and `cli` are adapters and must contain no domain rules.

## D-002: The LLM lives in the host agent, never in the server (2026-09-03)

**Context.** Semantic mapping (deciding that the Excel column `Kobalt rec. %` is
`recycledContentCobalt`) needs a model. Putting one inside the server would require API
keys, break offline operation and tie the project to one vendor.

**Decision.** `core` and `server` make zero LLM calls. They provide deterministic extraction,
the target schema with synonyms, confidence-scored candidate mappings, and a validator that
says exactly what is still wrong. The host agent does the semantic step. The only places a
model key may appear are the optional `passwerk chat` demo command in `cli` and the optional
bring-your-own-key mode of the web app (D-006).

**Consequences.** Sovereign (no keys, no network), agent-agnostic, unit-testable. The
`sovereignty.test.ts` gate enforces this from Phase 3 on.

## D-003: Zod 4 (2026-09-03)

**Context.** The build plan said Zod 3. Zod 4 is current and the MCP TypeScript SDK supports it.

**Decision.** Use Zod 4 everywhere. Tool input schemas derive from the same Zod objects as
runtime validation.

**Consequences.** Slightly different API surface from Zod 3 docs. JSON Schema conversion is
built in (`z.toJSONSchema`), so no `zod-to-json-schema` dependency.

## D-004: Plain pnpm workspaces + `tsc -b`, no Turborepo, TypeScript 5.x (2026-09-03)

**Context.** Four small packages with a linear dependency graph (rules, then core, then
server and cli).

**Decision.** pnpm workspaces with TypeScript project references (`tsc -b` at the root) for
builds, a single root Vitest config that aliases `@passwerk/*` to `src/`, and Biome for lint
and format. Pin TypeScript 5.9.x. The 7.x native-port line stays out until its tooling
(project references, declaration emit, editor support) is proven.

**Consequences.** No task-runner config to maintain. Revisit if builds exceed about 30 s.
Dependency versions must also respect the owner's pnpm `minimumReleaseAge` of 3 days.

## D-005: Full scope, all 7 IDTA 02035 submodels, built as a vertical slice first (2026-09-03)

**Context.** The build plan fenced v1.0 to three MVP submodels (Nameplate, Material
Composition, Carbon Footprint). The owner wants the complete passport.

**Decision.** Target all seven submodels for v1.0. Design the knowledge base, the
`PassportDraft` model and the template-diff engine for seven from day one, and pin all seven
official templates in Phase 1. Implement the pipeline end to end on the three MVP submodels
first so the oracle CI gate exists early (Phase 3), then fill in Handover Documentation,
Technical Data, Product Condition and Circularity before Phase 6.

**Consequences.** Phases 1, 2 and 5 grow. The attribute KB is about 90 entries, not 35.
Nothing in the architecture changes.

## D-006: A client-side web app is a first-class delivery surface (2026-09-03)

**Context.** Suppliers without a coding agent need a UI: drop files, review mappings, see the
gap report, preview the passport and the QR code.

**Decision.** Add `apps/web`: a static, fully client-side app bundling `@passwerk/core`.
Ingest, extract, mapping suggestions, validation, gap report, AAS/AASX emit and QR preview
all run in the browser. Semantic mapping is done either manually (a UI driven by core's
deterministic suggestions) or through an optional bring-your-own-key model call made
directly from the browser. No backend, no telemetry.

**Consequences.** `core` must stay browser-safe: no `node:fs` at module top level, file
input as bytes, filesystem access only behind an injected adapter used by `cli` and
`server`. Replaces the "browser demo in `site/`" item and gets its own build phase (7a).

## D-007: The build plan is committed, the market research stays local (2026-09-03)

**Decision.** `docs/BUILD_PLAN.md` is versioned so every agent session and contributor reads
the same source of truth. `docs/research-passwerk.md` contains personal career context and
stays in `.gitignore`.
