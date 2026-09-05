# Command line: `passwerk` (Phase 6.2)

The `@passwerk/cli` package ships in the second Phase 6 pull request. Until it lands, the
MCP tools above are the only surface; the commands below are the planned contract so agents
and scripts can be written against it.

| Command | Purpose | Exit code |
|---|---|---|
| `passwerk audit <draft.json> [--as-of] [--lang] [--json]` | `validate_passport` on a draft file | 0 valid, 1 valid_with_warnings, 2 invalid, 3 usage |
| `passwerk extract <files...> [--category EV] [--out facts.json]` | ingest and extract; with a category also suggest mappings | 0, 3 |
| `passwerk emit <draft.json> --out <dir> [--targets aas-json,aasx,draft-json]` | emit and re-validate | as `audit` |
| `passwerk gaps <draft.json> [--lang] [--json]` | gap report grouped by data owner | 0 complete, 1 open gaps, 3 usage |
| `passwerk obligations --type EV --role manufacturer [--energy-kwh] [--placed-on-market]` | `check_obligations` | 0 required, 1 not required, 2 insufficient input, 3 usage |
| `passwerk tools` | list the MCP tools | 0 |
| `passwerk chat -m "…"` | optional demo agent loop (needs `ANTHROPIC_API_KEY`; the only place a key appears) | 0, 2 loop bound, 3 |

The server binary is available now: `passwerk-server` (stdio) and
`passwerk-server --http 3777` (Streamable HTTP with `PASSWERK_AUTH_TOKEN`).
