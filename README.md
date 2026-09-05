# Passwerk
**Offline EU Battery Passport Compiler.**

![CI](https://github.com/ShahriarBijoy/passwerk/actions/workflows/ci.yml/badge.svg)
![AAS L2 oracle parity](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/conformance-badge.json)

**The sovereign EU Battery Passport toolkit for AI agents.**

Drop in a supplier's messy documents (BOMs, Excel exports, energy bills, supplier
declarations). Get back a conformant Digital Battery Passport in the official AAS format
(IDTA 02035-1 to -7) plus a legally cited gap report of what is still missing.

100 % offline. Zero API keys. Agent-agnostic: an MCP server for Claude Code, Codex, OpenCode,
Cursor and Claude Desktop, a scriptable CLI, a plain TypeScript library, and a client-side
web app with QR preview.

## Why

Regulation (EU) 2023/1542, Art. 77: from **18 February 2027** every EV, light-means-of-transport
and industrial >2 kWh battery placed on the EU market needs a Digital Battery Passport. The
passport is roughly 90 data points scattered across a supplier's ERP, spreadsheets and PDFs.
Every commercial platform sells to OEMs and Tier-1s. passwerk is the on-ramp for the Tier-2
and Mittelstand supplier who receives the data request and has no tooling to answer it.

Every emitted golden passport is replayed through the official `aas-test-engines` oracle in
CI, which checks the AAS 3.0 metamodel (passwerk's L2). The badge reports verdict parity with
that oracle, expected failures included. It is not a certification of battery-passport
compliance; template (L3) and plausibility (L4) checks are passwerk's own. A sovereignty test
proves zero network calls.

## Status

**Phase 5 of 8 done: gap report, obligations, `explain` and L4 plausibility.**
`@passwerk/rules` (artefacts and knowledge base, now with 24 plausibility rules as reviewable
JSON) and `@passwerk/core` (model, AAS JSON and AASX emitters for all seven IDTA 02035 parts,
validation L1 to L4, readers for PDF, XLSX, CSV, DOCX and TXT, fact extraction,
confidence-scored mapping suggestions, a gap report with legal references and who-has-it per
attribute, an obligations decision tree, and DE/EN explanations for every attribute and rule)
are implemented. Every emitted golden passport is replayed through the official
`aas-test-engines` on every CI run with 16/16 L2 verdict parity, four of them expected failures
both sides reject (`docs/CONFORMANCE.md`), and a
sovereignty test plus a `--network none` Docker job prove zero network calls. Mapping quality on
unseen supplier documents is measured, not asserted: `docs/EVALUATION.md` scores the pipeline on
six documents transcribed from public datasheets (recall, precision and correction effort next to
the authored-fixture gate). Next: Phase 5b hardening (ADR D-024), then a minimal web workflow, then
the MCP server, agent skill and CLI. See `docs/BUILD_PLAN.md` and `docs/DECISIONS.md`.

## Packages

| Package | Role |
|---|---|
| `@passwerk/rules` | Bundled, checksummed IDTA 02035 templates, AAS schemas, EC data-point matrix, attribute knowledge base (DE/EN), legal timeline |
| `@passwerk/core` | MCP-free library: ingest, extract, map, validate (4 layers), gap report, emit AAS JSON / AASX / HTML, data carrier (UID, GS1 Digital Link, QR) |
| `@passwerk/server` | MCP server over stdio and Streamable HTTP |
| `@passwerk/cli` | `passwerk audit | extract | emit | obligations` with CI-friendly exit codes |

## Development

Requires Node 22.13 or newer and pnpm 10.

```sh
pnpm install
pnpm check      # lint + typecheck + test
pnpm build
pnpm oracle     # replay golden passports through aas-test-engines (needs uv)
```

Contributor instructions for humans and coding agents live in `AGENTS.md` and `CLAUDE.md`.

## Not legal advice

passwerk cites the regulation and the standards it implements, but it is a tool, not a
lawyer. Every legal claim it emits carries its sources and an `isNotLegalAdvice: true` flag.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. Bundled third-party artefacts are documented with
their sources, versions, checksums and licences in `packages/rules/PROVENANCE.md`.
