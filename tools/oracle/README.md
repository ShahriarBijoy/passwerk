# tools/oracle

Replays every emitted golden passport through the official `aas-test-engines` (Python) and
checks verdict parity against passwerk's own L2 verdict. Writes `docs/CONFORMANCE.md` and
`docs/conformance-badge.json`. CI runs this on every push and pull request and fails on any
mismatch or any drift of the committed report and badge.

## Run locally

Requires Node 22.13+, pnpm 10 and [uv](https://docs.astral.sh/uv/).

    pnpm build
    cd tools/oracle && uv sync --frozen && cd ../..
    pnpm oracle

`pnpm oracle` runs `emit` (tsx, writes `out/`) and then `check` (`uv run --frozen oracle.py`).
Exit code 1 means a verdict mismatch. Treat it as a passwerk bug until proven otherwise.

## Parity rule

`aas-test-engines` checks the AAS 3.0 metamodel only. It does not know the IDTA 02035
battery passport templates, so it cannot see passwerk's L1 (draft rules) or L3 (template
diff). The oracle must therefore say ok exactly when passwerk's L2 (aas-core verification)
has zero errors. All six golden samples, valid and broken, in JSON and AASX, form the set of
twelve files, so agreement is proven in both directions. See ADR D-012.

## Files

| File | Role |
|---|---|
| `src/expected.ts` | `buildExpected`: turns validation reports into `out/expected.json` entries |
| `src/emit-golden.ts` | writes `out/<sample>.aas.json`, `out/<sample>.aasx`, `out/expected.json` |
| `oracle.py` | runs the oracle, computes parity, renders report and badge, sets the exit code |
| `pyproject.toml`, `uv.lock` | pins `aas-test-engines==1.0.3` |

## Tests

    cd tools/oracle && uv run --frozen python -m unittest -v
    pnpm vitest run tools/oracle
