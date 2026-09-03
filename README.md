# passwerk

![CI](https://github.com/ShahriarBijoy/passwerk/actions/workflows/ci.yml/badge.svg)
![AAS conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/conformance-badge.json)

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

Conformance is proven, not claimed: every emitted passport is replayed through the official
`aas-test-engines` oracle in CI, and a sovereignty test proves zero network calls.

## Status

**Phase 3b of 8 done: six of seven submodel emitters.** `@passwerk/rules` (artefacts and
knowledge base) and `@passwerk/core` (model, AAS JSON and AASX emitters for IDTA 02035-1, -3,
-4, -5, -6 and -7, validation L1 to L3) are implemented. Every emitted golden passport is
replayed through the official `aas-test-engines` on every CI run with 14/14 verdict parity
(`docs/CONFORMANCE.md`), and a sovereignty test plus a `--network none` Docker job prove zero
network calls. Next: ingest, extraction and mapping. See `docs/BUILD_PLAN.md` and
`docs/DECISIONS.md`.

## Packages

| Package | Role |
|---|---|
| `@passwerk/rules` | Bundled, checksummed IDTA 02035 templates, AAS schemas, EC data-point matrix, attribute knowledge base (DE/EN), legal timeline |
| `@passwerk/core` | MCP-free library: ingest, extract, map, validate (4 layers), gap report, emit AAS JSON / AASX / HTML, data carrier (UID, GS1 Digital Link, QR) |
| `@passwerk/server` | MCP server over stdio and Streamable HTTP |
| `@passwerk/cli` | `passwerk audit | extract | emit | obligations` with CI-friendly exit codes |

## Development

Requires Node 20 or newer and pnpm 10.

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
