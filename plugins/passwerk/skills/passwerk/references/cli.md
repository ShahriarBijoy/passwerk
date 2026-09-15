# Command line: `passwerk`

`@passwerk/cli` is the scriptable entry point for batch runs and CI. Every command calls the
same tool of `@passwerk/server` in-process (`passwerk tools` lists them), so the CLI and an
MCP host see identical verdicts. No command touches the network; the only exception is the
optional `chat` demo, which calls Anthropic with the key from `ANTHROPIC_API_KEY`.

Build once (`pnpm build`), then run `node packages/cli/dist/bin.js …` or, after `pnpm link`
or an install, `passwerk …`.

| Command | Purpose | Exit code |
|---|---|---|
| `passwerk audit <draft.json> [--as-of <iso>] [--lang de\|en] [--json]` | `validate_passport`: all four layers, every finding with rule id, path, fix hint and legal reference | 0 valid, 1 valid_with_warnings, 2 invalid, 3 usage or unreadable input |
| `passwerk extract <files or dirs...> [--category EV\|LMT\|INDUSTRIAL_GT_2KWH] [--out facts.json] [--lang] [--json]` | `ingest_documents` and `extract_facts`; with a category also `suggest_mappings` (all proposals, the `>= 0.7` count in the summary) | 0; 3 when no document could be read or the category is unknown |
| `passwerk emit <draft.json> --out <dir> [--targets aas-json,aasx,draft-json,html] [--as-of] [--lang] [--json]` | `emit_passport`: writes the files and re-validates them. Fail-honest: files are written even when the verdict is `invalid` | as `audit` |
| `passwerk carrier [draft.json] [--uid <https>] [--gtin <d> --serial <s> \| --giai <g>] [--resolver-base <https>] [--format svg\|png] --out <file> [--lang] [--json]` | `generate_carrier`: the QR code of the identifier, or of a GS1 Digital Link | 0; 3 usage or carrier input error (bad GTIN, non-https identifier) |
| `passwerk gaps <draft.json> [--as-of] [--lang] [--json]` | `gap_report` grouped by who typically has the data, with legal references and the suggested action. Deferred data points (not yet applicable) are counted, not listed | 0 no open `required` item, 1 open required items, 3 usage |
| `passwerk obligations --type <batteryType> --role <role> [--energy-kwh <decimal>] [--placed-on-market <date>] [--as-of <date>] [--lang] [--json]` | `check_obligations` (Article 77(1) only, not legal advice) | 0 required, 1 not_required, 2 insufficient_input, 3 usage |
| `passwerk tools [--json]` | the server registry: name, title, description, input keys, annotations | 0 |
| `passwerk chat -m "<task>" [--model claude-sonnet-5] [--max-turns 20] [--root <dir>] [--lang]` | demo agent loop over the registry; every tool call and its one-line result are printed | 0 the model ended its turn, 2 not finished (turn bound reached, or the response stopped with `max_tokens`, `refusal`, ...), 3 missing key or usage |

`--json` prints the tool's structured result as canonical JSON (sorted keys, byte-identical
across runs). `--lang` picks the language of the text output; German is `de`.

## Examples

```sh
node packages/cli/dist/bin.js obligations --type INDUSTRIAL --role importer --energy-kwh 5 --placed-on-market 2027-06-01
node packages/cli/dist/bin.js extract ./supplier-docs --category EV --out facts.json
node packages/cli/dist/bin.js audit passport.draft.json --lang de
node packages/cli/dist/bin.js gaps passport.draft.json --json | jq '.byDataOwner'
node packages/cli/dist/bin.js emit passport.draft.json --out ./dist-passport --targets aas-json,aasx
node packages/cli/dist/bin.js carrier passport.draft.json --out passport.qr.svg
ANTHROPIC_API_KEY=… node packages/cli/dist/bin.js chat --lang de --root . -m "Erstelle einen Batteriepass aus ./supplier-docs"
```

In CI, `audit` and `gaps` are the gates: `audit … || exit` fails the build on `invalid`
(exit 2) and lets warnings through (exit 1) if you treat 1 as success.

## Demo

`packages/cli/scripts/demo.sh` (POSIX) and `demo.ps1` (PowerShell) run the Phase 6 definition
of done from the repository root after `pnpm build`: obligations, extract on the Musterwerk
fixtures, audit of the golden drafts, a gap report, an emit, and the chat demo when a key is
set. The scripted equivalent of the chat run (a fake client walking the same tool chain) is
`packages/cli/test/chat.test.ts` and runs in CI.

`chat` sends the body of `SKILL.md` as its system prompt. The copy lives in
`packages/cli/src/chat/skill.ts`, regenerated with `pnpm --filter @passwerk/cli sync-skill`;
a test fails when the two diverge.

The server binary is `passwerk-server` (stdio) and `passwerk-server --http 3777` (Streamable
HTTP with `PASSWERK_AUTH_TOKEN`); see `docs/install/`.
