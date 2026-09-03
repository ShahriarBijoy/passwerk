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
2. `docs/DECISIONS.md`: the ADR log. D-005 (all 7 submodels) and D-006 (web app) amend the plan.
3. `packages/rules/PROVENANCE.md` (from Phase 1): where every bundled artefact comes from.

## Repository map

| Path | Package | Role |
|---|---|---|
| `packages/rules` | `@passwerk/rules` | Bundled, checksummed artefacts + knowledge base (data, not code) |
| `packages/core` | `@passwerk/core` | MCP-free library: ingest, extract, map, validate, gap, emit, carrier |
| `packages/server` | `@passwerk/server` | MCP server, stdio + Streamable HTTP. Adapter only, no domain logic |
| `packages/cli` | `@passwerk/cli` | `passwerk` binary. Adapter only, no domain logic |
| `apps/web` (Phase 7a) | | Client-side web app bundling core, with QR preview |
| `skills/passwerk` (Phase 6) | | Agent Skill teaching the ingest, map, validate, fix, emit workflow |
| `tools/oracle` (Phase 3) | | Python `aas-test-engines` runner that writes `docs/CONFORMANCE.md` |

Dependency direction is strict: `rules`, then `core`, then `server`, `cli` and `web`.
Never import upward.

## Commands

```sh
pnpm install            # Node >= 20 (see .nvmrc), pnpm 10
pnpm build              # tsc -b across all packages
pnpm test               # vitest, all packages
pnpm lint               # biome check
pnpm lint:fix           # biome check --write
pnpm typecheck          # tsc -b plus typecheck of test files
pnpm check              # lint + typecheck + test. Run before every commit
pnpm oracle             # emit golden passports and replay them through aas-test-engines (needs uv)
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
- **Next: Phase 4.** Ingest, extract and mapping (`DocumentBundle`, `FactSet`,
  `suggestMappings`), then the part 2 emitter once real files exist.
