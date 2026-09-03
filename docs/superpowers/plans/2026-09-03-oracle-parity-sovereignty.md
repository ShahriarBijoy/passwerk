# Phase 3: oracle parity in CI and the sovereignty proof — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every emitted golden passport is replayed through the official Python `aas-test-engines` oracle in CI with verdict parity against passwerk's L2, a committed conformance report and badge are CI-verified, and a sovereignty test plus a Docker `--network none` job prove zero network attempts.

**Architecture:** `tools/oracle` is a private workspace package: a tsx script emits the twelve golden files with passwerk's expected verdicts, a Python script runs the oracle, diffs, and renders `docs/CONFORMANCE.md` and `docs/conformance-badge.json`. Parity is L2 parity because the oracle checks only the AAS metamodel. The sovereignty test installs socket-level guards in-process; the Docker job is the hard proof.

**Tech Stack:** TypeScript 5.9 strict ESM (NodeNext), tsx 4.23.13, Vitest 4, Biome 2, pnpm 10, Python 3.10+ via uv, `aas-test-engines==1.0.3`, GitHub Actions (`astral-sh/setup-uv@v10`, `actions/upload-artifact@v7`), Docker `node:22-bookworm-slim`.

**Spec:** `docs/superpowers/specs/2026-09-03-oracle-parity-sovereignty-design.md`

## Global Constraints

- No `node:*` imports under `packages/core/src` or `packages/rules/src` (ADR D-006). Tests and `tools/` may use them.
- No network at runtime in `core` or `rules`. The oracle itself is CI/dev tooling and needs the network only to install.
- Parity is defined as `oracle.ok == (passwerk.l2Errors == 0)` per file. Never widen it to "oracle ok" alone.
- Verdicts come only from running the validators; the emit script uses `validate()` and never fabricates a verdict.
- Deterministic output: `expected.json` and `results.json` have sorted keys; `CONFORMANCE.md` differs between runs only on the `Generated:` line.
- Pinned versions only: `aas-test-engines==1.0.3` (PyPI 2025-08-05), `tsx 4.23.13` (already used by rules). Do not bump.
- Conventional Commits; commit as `shahriarbijoy` with trailer `Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V`.
- Run `pnpm check` before every commit that touches `src` or `test`.
- Working directory for all commands: `W:\personal-code\passwerk` (repo root). Shell is PowerShell unless a step says Bash.
- Docs with many backticks are written with the Write tool, not shell heredocs.

---

## File structure

| File | Responsibility |
|---|---|
| `pnpm-workspace.yaml` | add `tools/*` |
| `package.json` (root) | `oracle` script |
| `vitest.config.ts`, `tsconfig.test.json` | include `tools/*/test` and `tools/*/src` |
| `.gitignore` | `tools/oracle/out/`, `.venv/` |
| `tools/oracle/package.json` | `@passwerk/oracle`, private, scripts `emit`, `check`, `oracle` |
| `tools/oracle/tsconfig.json` | build config for `src/` |
| `tools/oracle/src/expected.ts` | pure `buildExpected(reports)`: turns validation reports into the expected-file entries |
| `tools/oracle/src/emit-golden.ts` | writes `out/*.aas.json`, `out/*.aasx`, `out/expected.json` |
| `tools/oracle/test/expected.test.ts` | unit test for `buildExpected` |
| `tools/oracle/pyproject.toml`, `tools/oracle/uv.lock` | Python oracle dependency pin |
| `tools/oracle/oracle.py` | run oracle, parity, render report and badge, exit code |
| `tools/oracle/test_oracle.py` | unittest for parity and rendering |
| `tools/oracle/README.md` | how to run locally |
| `docs/CONFORMANCE.md`, `docs/conformance-badge.json` | committed outputs |
| `packages/core/test/sovereignty.test.ts` | in-process network guards over the whole public surface |
| `packages/core/test/browser-safety.test.ts` | also scan `packages/rules/src` |
| `tools/sovereignty/Dockerfile`, `.dockerignore` | offline test image |
| `.github/workflows/ci.yml` | `oracle` and `sovereignty` jobs |
| `docs/DECISIONS.md` | D-012, D-013 |
| `README.md`, `AGENTS.md` | badge, status, commands |

---

### Task 1: Workspace package `@passwerk/oracle` with `buildExpected`

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json`, `vitest.config.ts`, `tsconfig.test.json`, `.gitignore`
- Create: `tools/oracle/package.json`, `tools/oracle/tsconfig.json`, `tools/oracle/src/expected.ts`
- Test: `tools/oracle/test/expected.test.ts`

**Interfaces:**
- Consumes: `ValidationReport` and `Finding` from `@passwerk/core` (`verdict`, `findings[]`, `layers.L1|L2|L3.errors`).
- Produces:
  ```ts
  export interface ExpectedFile {
    sample: string; file: string; format: 'json' | 'aasx'; sha256: string;
    passwerk: { verdict: Verdict; l1Errors: number; l2Errors: number; l3Errors: number };
    expectedOracleOk: boolean; l2Findings: string[];
  }
  export interface ExpectedFileSet { generatedBy: string; files: ExpectedFile[] }
  export function buildExpected(generatedBy: string, inputs: ExpectedInput[]): ExpectedFileSet
  export interface ExpectedInput { sample: string; format: 'json' | 'aasx'; sha256: string; report: ValidationReport }
  ```

- [ ] **Step 1: Workspace wiring**

`pnpm-workspace.yaml`:
```yaml
packages:
  - packages/*
  - tools/*

patchedDependencies:
  '@aas-core-works/aas-core3.0-typescript@1.0.5': patches/@aas-core-works__aas-core3.0-typescript@1.0.5.patch
```

Root `package.json` scripts, add after `"artefacts"`:
```json
"oracle": "pnpm --filter @passwerk/oracle run oracle"
```

`vitest.config.ts` `include`:
```ts
include: ['packages/*/test/**/*.test.ts', 'packages/*/src/**/*.test.ts', 'tools/*/test/**/*.test.ts'],
```
and add the alias `'@passwerk/oracle': local('./tools/oracle/src/index.ts')` is NOT needed; tests import relative paths.

`tsconfig.test.json` `include`, add `"tools/*/src/**/*.ts"` and `"tools/*/test/**/*.ts"`.

`.gitignore`, append:
```
# Oracle outputs and Python venvs
tools/oracle/out/
.venv/
```

`tools/oracle/package.json`:
```json
{
  "name": "@passwerk/oracle",
  "version": "0.0.0",
  "private": true,
  "description": "CI oracle: replays emitted golden passports through the official aas-test-engines and checks verdict parity",
  "license": "Apache-2.0",
  "type": "module",
  "scripts": {
    "emit": "tsx src/emit-golden.ts",
    "check": "uv run --frozen oracle.py",
    "oracle": "pnpm run emit && pnpm run check"
  },
  "devDependencies": {
    "@passwerk/core": "workspace:*",
    "tsx": "4.23.13"
  }
}
```

`tools/oracle/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../../packages/core" }]
}
```
Do not add `tools/oracle` to root `tsconfig.json` references (it is `noEmit`; `pnpm typecheck` covers it through `tsconfig.test.json`).

Run: `pnpm install`
Expected: lockfile updated with `tools/oracle`, `tsx 4.23.13` resolved (already in the store).

- [ ] **Step 2: Write the failing test**

`tools/oracle/test/expected.test.ts`:
```ts
import type { Finding, ValidationReport } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { buildExpected } from '../src/expected.js';

function finding(layer: 'L1' | 'L2' | 'L3', path: string): Finding {
  return {
    layer,
    ruleId: `PW-${layer}-X`,
    severity: 'error',
    path,
    message: { de: 'x', en: 'x' },
  };
}

function report(findings: Finding[]): ValidationReport {
  const count = (layer: 'L1' | 'L2' | 'L3') => findings.filter((f) => f.layer === layer).length;
  return {
    verdict: findings.length ? 'invalid' : 'valid',
    findings,
    layers: {
      L1: { ran: true, errors: count('L1'), warnings: 0 },
      L2: { ran: true, errors: count('L2'), warnings: 0 },
      L3: { ran: true, errors: count('L3'), warnings: 0 },
    },
  };
}

describe('buildExpected', () => {
  it('expects the oracle to pass exactly when L2 has zero errors', () => {
    const set = buildExpected('@passwerk/core 0.0.0', [
      { sample: 'b', format: 'json', sha256: 'bb', report: report([finding('L2', '/submodels/0')]) },
      { sample: 'a', format: 'aasx', sha256: 'aa', report: report([finding('L3', '/x'), finding('L1', 'attributes.y')]) },
    ]);
    expect(set.generatedBy).toBe('@passwerk/core 0.0.0');
    expect(set.files.map((f) => f.file)).toEqual(['a.aasx', 'b.aas.json']);
    expect(set.files[0]).toEqual({
      sample: 'a',
      file: 'a.aasx',
      format: 'aasx',
      sha256: 'aa',
      passwerk: { verdict: 'invalid', l1Errors: 1, l2Errors: 0, l3Errors: 1 },
      expectedOracleOk: true,
      l2Findings: [],
    });
    expect(set.files[1]?.expectedOracleOk).toBe(false);
    expect(set.files[1]?.l2Findings).toEqual(['/submodels/0: x']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tools/oracle`
Expected: FAIL, cannot resolve `../src/expected.js`.

- [ ] **Step 4: Implement `expected.ts`**

```ts
import type { ValidationReport, Verdict } from '@passwerk/core';

export type OracleFormat = 'json' | 'aasx';

export interface ExpectedInput {
  sample: string;
  format: OracleFormat;
  sha256: string;
  report: ValidationReport;
}

export interface ExpectedFile {
  sample: string;
  file: string;
  format: OracleFormat;
  sha256: string;
  passwerk: { verdict: Verdict; l1Errors: number; l2Errors: number; l3Errors: number };
  /** Parity rule: the oracle checks the metamodel only, so it must pass iff L2 is clean. */
  expectedOracleOk: boolean;
  l2Findings: string[];
}

export interface ExpectedFileSet {
  generatedBy: string;
  files: ExpectedFile[];
}

export function fileNameFor(sample: string, format: OracleFormat): string {
  return format === 'json' ? `${sample}.aas.json` : `${sample}.aasx`;
}

export function buildExpected(generatedBy: string, inputs: ExpectedInput[]): ExpectedFileSet {
  const files = inputs
    .map(({ sample, format, sha256, report }) => ({
      sample,
      file: fileNameFor(sample, format),
      format,
      sha256,
      passwerk: {
        verdict: report.verdict,
        l1Errors: report.layers.L1.errors,
        l2Errors: report.layers.L2.errors,
        l3Errors: report.layers.L3.errors,
      },
      expectedOracleOk: report.layers.L2.errors === 0,
      l2Findings: report.findings
        .filter((f) => f.layer === 'L2' && f.severity === 'error')
        .map((f) => `${f.path}: ${f.message.en}`),
    }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return { generatedBy, files };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tools/oracle`
Expected: PASS (1 test). Then `pnpm lint` and `pnpm typecheck` green.

- [ ] **Step 6: Commit**

```
git add pnpm-workspace.yaml package.json pnpm-lock.yaml vitest.config.ts tsconfig.test.json .gitignore tools/oracle
git commit -m "chore(oracle): workspace package with buildExpected parity rule"
```

---

### Task 2: `emit-golden.ts` writes the twelve golden files

**Files:**
- Create: `tools/oracle/src/emit-golden.ts`

**Interfaces:**
- Consumes: `buildExpected`, `fileNameFor` from Task 1; `validate`, `getSample`, `packAasx`, `VALID_SAMPLE_NAMES`, `BROKEN_SAMPLE_NAMES` from `@passwerk/core` (built `dist`).
- Produces: `tools/oracle/out/<sample>.aas.json`, `<sample>.aasx`, `expected.json` (2-space JSON, sorted keys via `buildExpected`'s fixed key order).

- [ ] **Step 1: Implement**

```ts
/**
 * Emit every golden sample as AAS JSON and AASX into out/ together with passwerk's own
 * verdict, so oracle.py can check verdict parity. Runs after `pnpm build`.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROKEN_SAMPLE_NAMES,
  getSample,
  packAasx,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { createRequire } from 'node:module';
import { buildExpected, type ExpectedInput, fileNameFor } from './expected.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'out');
const require = createRequire(import.meta.url);
const coreVersion = (require('@passwerk/core/package.json') as { version: string }).version;

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const inputs: ExpectedInput[] = [];
for (const sample of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
  const report = validate(getSample(sample));
  if (!report.aasJson) {
    console.error(`emit-golden: ${sample} produced no AAS JSON (L1 schema failure); cannot oracle-check`);
    process.exit(1);
  }
  const aasx = packAasx(report.aasJson);
  writeFileSync(join(OUT, fileNameFor(sample, 'json')), report.aasJson);
  writeFileSync(join(OUT, fileNameFor(sample, 'aasx')), aasx);
  inputs.push({ sample, format: 'json', sha256: sha256(report.aasJson), report });
  inputs.push({ sample, format: 'aasx', sha256: sha256(aasx), report });
  console.log(`${sample}: ${report.verdict} (L2 errors ${report.layers.L2.errors})`);
}

const expected = buildExpected(`@passwerk/core ${coreVersion}`, inputs);
writeFileSync(join(OUT, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
console.log(`wrote ${expected.files.length} entries to ${join(OUT, 'expected.json')}`);
```

`@passwerk/core/package.json` is not in core's `exports`, so the `createRequire` line fails. Add to `packages/core/package.json` `exports`: `"./package.json": "./package.json"`.

- [ ] **Step 2: Run it**

Run: `pnpm build; pnpm --filter @passwerk/oracle run emit; Get-ChildItem tools/oracle/out`
Expected: six lines of verdicts (three `valid`, three `invalid`), 13 files in `out/`. Open `out/expected.json`: 12 entries, `expectedOracleOk` false only for `industrial-bad-decimal.*` and `lmt-wrong-date-format.*`.

- [ ] **Step 3: Lint, typecheck, commit**

Run: `pnpm lint; pnpm typecheck`
```
git add tools/oracle/src/emit-golden.ts packages/core/package.json
git commit -m "feat(oracle): emit golden passports with passwerk verdicts for the oracle"
```

---

### Task 3: `oracle.py` runs `aas-test-engines`, checks parity, renders report and badge

**Files:**
- Create: `tools/oracle/pyproject.toml`, `tools/oracle/uv.lock`, `tools/oracle/oracle.py`, `tools/oracle/test_oracle.py`, `tools/oracle/README.md`

**Interfaces:**
- Consumes: `out/expected.json` (Task 2 shape).
- Produces: `out/results.json`, `docs/CONFORMANCE.md`, `docs/conformance-badge.json`; exit 0 on full parity, 1 otherwise. Pure functions `parity_rows(expected, results)`, `render_report(rows, meta, manual_section)`, `render_badge(rows)`, `extract_manual_section(text)`.

- [ ] **Step 1: Python project**

`tools/oracle/pyproject.toml`:
```toml
[project]
name = "passwerk-oracle"
version = "0.0.0"
description = "Replays passwerk's emitted golden passports through the official aas-test-engines"
requires-python = ">=3.10"
dependencies = ["aas-test-engines==1.0.3"]

[tool.uv]
package = false
```

Run (Bash): `cd tools/oracle && uv lock && uv sync --frozen`
Expected: `uv.lock` created, `.venv` created (gitignored). `uv run --frozen python -c "import aas_test_engines; print('ok')"` prints `ok`.

- [ ] **Step 2: Write the failing unit tests**

`tools/oracle/test_oracle.py`:
```python
import unittest

from oracle import extract_manual_section, parity_rows, render_badge, render_report

EXPECTED = {
    "generatedBy": "@passwerk/core 0.0.0",
    "files": [
        {"sample": "a", "file": "a.aas.json", "format": "json", "sha256": "x",
         "passwerk": {"verdict": "valid", "l1Errors": 0, "l2Errors": 0, "l3Errors": 0},
         "expectedOracleOk": True, "l2Findings": []},
        {"sample": "b", "file": "b.aasx", "format": "aasx", "sha256": "y",
         "passwerk": {"verdict": "invalid", "l1Errors": 1, "l2Errors": 1, "l3Errors": 0},
         "expectedOracleOk": False, "l2Findings": ["/submodels/0: bad date"]},
    ],
}
RESULTS = {
    "a.aas.json": {"ok": True, "level": "INFO", "errors": []},
    "b.aasx": {"ok": False, "level": "ERROR", "errors": ["Value '1.2.2026' is not a 'xs:date' @ X"]},
}


class ParityTests(unittest.TestCase):
    def test_parity_true_when_oracle_agrees_in_both_directions(self):
        rows = parity_rows(EXPECTED, RESULTS)
        self.assertEqual([r["parity"] for r in rows], [True, True])

    def test_parity_false_when_oracle_passes_a_file_we_reject(self):
        results = dict(RESULTS)
        results["b.aasx"] = {"ok": True, "level": "INFO", "errors": []}
        rows = parity_rows(EXPECTED, results)
        self.assertEqual([r["parity"] for r in rows], [True, False])

    def test_critical_is_never_parity(self):
        results = dict(RESULTS)
        results["b.aasx"] = {"ok": False, "level": "CRITICAL", "errors": ["Internal error"]}
        rows = parity_rows(EXPECTED, results)
        self.assertFalse(rows[1]["parity"])

    def test_missing_result_is_not_parity(self):
        rows = parity_rows(EXPECTED, {"a.aas.json": RESULTS["a.aas.json"]})
        self.assertEqual([r["parity"] for r in rows], [True, False])


class RenderTests(unittest.TestCase):
    def test_badge(self):
        rows = parity_rows(EXPECTED, RESULTS)
        self.assertEqual(render_badge(rows), {
            "schemaVersion": 1, "label": "AAS conformance", "message": "2/2", "color": "brightgreen"})
        rows[0]["parity"] = False
        self.assertEqual(render_badge(rows)["color"], "red")
        self.assertEqual(render_badge(rows)["message"], "1/2")

    def test_report_has_header_table_and_manual_section(self):
        rows = parity_rows(EXPECTED, RESULTS)
        text = render_report(rows, {"generated": "2026-09-03T00:00:00Z", "oracle": "aas-test-engines 1.0.3",
                                    "passwerk": "@passwerk/core 0.0.0"}, "## Manual oracle runs\n\n| x |\n")
        self.assertIn("Generated: 2026-09-03T00:00:00Z", text)
        self.assertIn("Parity: 2/2", text)
        self.assertIn("| a | json | 0 errors | ok | yes |  |", text)
        self.assertIn("| b | aasx | 1 error | ERROR | yes | Value '1.2.2026' is not a 'xs:date' @ X |", text)
        self.assertTrue(text.rstrip().endswith("| x |"))

    def test_extract_manual_section_keeps_hand_written_rows_and_defaults(self):
        self.assertEqual(extract_manual_section("# x\n\n## Manual oracle runs\n\nkept\n"),
                         "## Manual oracle runs\n\nkept\n")
        self.assertIn("| Tool | Version | Date | Result |", extract_manual_section(""))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run tests to verify they fail**

Run (Bash): `cd tools/oracle && uv run --frozen python -m unittest -v`
Expected: ImportError, no module `oracle`.

- [ ] **Step 4: Implement `oracle.py`**

```python
"""
passwerk oracle: replay emitted golden passports through the official aas-test-engines and
check verdict parity against passwerk's own L2 verdict.

Parity rule: the oracle checks the AAS metamodel only (it knows no IDTA 02035 template), so it
must report ok exactly when passwerk's L2 (aas-core verification) has zero errors. Any
mismatch is a passwerk bug until proven otherwise. Exit code 1 on any mismatch.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from importlib.metadata import version as pkg_version
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
DOCS = HERE.parent.parent / "docs"
REPORT = DOCS / "CONFORMANCE.md"
BADGE = DOCS / "conformance-badge.json"
MANUAL_HEADING = "## Manual oracle runs"
DEFAULT_MANUAL = (
    f"{MANUAL_HEADING}\n\n"
    "Recorded by hand (BUILD_PLAN Phase 8). Add a row per run.\n\n"
    "| Tool | Version | Date | Result |\n|---|---|---|---|\n"
)

PARITY_PROSE = """## What parity means

`aas-test-engines` checks the AAS 3.0 metamodel and its constraints. It does not know the
IDTA 02035 battery passport templates, so it cannot check template conformance (passwerk L3)
or draft-level rules (passwerk L1). Parity therefore means: the oracle reports **ok** exactly
when passwerk's **L2** (aas-core verification of the emitted JSON) reports zero errors, and
reports an error exactly when L2 does. Broken golden samples stay in the set so that
agreement is proven in both directions. A CRITICAL oracle result (internal error) never
counts as parity.

Every file is emitted by `tools/oracle/src/emit-golden.ts` from the golden drafts in
`packages/core/src/samples` and checked by `tools/oracle/oracle.py`. CI regenerates this
report on every run and fails if anything but the `Generated:` line differs.
"""


def flatten_errors(result: dict, out: list[str]) -> list[str]:
    """Collect ERROR (2) and CRITICAL (3) leaf messages from an AasTestResult.to_dict() tree."""
    if result["l"] >= 2 and not result["s"]:
        out.append(result["m"])
    for sub in result["s"]:
        flatten_errors(sub, out)
    return out


def run_oracle(expected: dict) -> dict:
    from aas_test_engines import file as aas_file

    results = {}
    for entry in expected["files"]:
        path = OUT / entry["file"]
        if entry["format"] == "json":
            with path.open("r", encoding="utf-8") as fh:
                result = aas_file.check_json_file(fh, version="3.0")
        else:
            with path.open("rb") as fh:
                result = aas_file.check_aasx_file(fh, version="3.0")
        tree = result.to_dict()
        results[entry["file"]] = {
            "ok": result.ok(),
            "level": result.level.name,
            "errors": flatten_errors(tree, []),
        }
    return results


def parity_rows(expected: dict, results: dict) -> list[dict]:
    rows = []
    for entry in expected["files"]:
        res = results.get(entry["file"])
        if res is None:
            res = {"ok": False, "level": "MISSING", "errors": ["no oracle result"]}
        parity = res["level"] != "CRITICAL" and res["ok"] == entry["expectedOracleOk"]
        rows.append({
            "sample": entry["sample"],
            "file": entry["file"],
            "format": entry["format"],
            "l2Errors": entry["passwerk"]["l2Errors"],
            "verdict": entry["passwerk"]["verdict"],
            "oracleOk": res["ok"],
            "oracleLevel": res["level"],
            "oracleErrors": list(res["errors"]),
            "parity": parity,
        })
    return rows


def render_badge(rows: list[dict]) -> dict:
    passed = sum(1 for r in rows if r["parity"])
    total = len(rows)
    return {
        "schemaVersion": 1,
        "label": "AAS conformance",
        "message": f"{passed}/{total}",
        "color": "brightgreen" if passed == total and total > 0 else "red",
    }


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def render_report(rows: list[dict], meta: dict, manual_section: str) -> str:
    passed = sum(1 for r in rows if r["parity"])
    lines = [
        "# AAS conformance",
        "",
        f"Generated: {meta['generated']}",
        f"Oracle: {meta['oracle']}",
        f"passwerk: {meta['passwerk']}",
        f"Parity: {passed}/{len(rows)}",
        "",
        "| Sample | Format | passwerk L2 | Oracle | Parity | Oracle messages |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        n = r["l2Errors"]
        l2 = f"{n} error" if n == 1 else f"{n} errors"
        oracle = "ok" if r["oracleOk"] else r["oracleLevel"]
        msgs = _cell("; ".join(r["oracleErrors"]))
        lines.append(f"| {r['sample']} | {r['format']} | {l2} | {oracle} | {'yes' if r['parity'] else 'NO'} | {msgs} |")
    lines += ["", PARITY_PROSE.rstrip(), "", manual_section.rstrip(), ""]
    return "\n".join(lines)


def extract_manual_section(text: str) -> str:
    idx = text.find(MANUAL_HEADING)
    if idx < 0:
        return DEFAULT_MANUAL
    return text[idx:].rstrip() + "\n"


def main() -> int:
    expected = json.loads((OUT / "expected.json").read_text(encoding="utf-8"))
    results = run_oracle(expected)
    (OUT / "results.json").write_text(
        json.dumps({"oracle": {"name": "aas-test-engines", "version": pkg_version("aas-test-engines")},
                    "files": results}, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    rows = parity_rows(expected, results)
    for r in rows:
        mark = "ok " if r["parity"] else "MISMATCH"
        print(f"{mark} {r['file']}: passwerk L2 errors={r['l2Errors']} oracle={r['oracleLevel']}")

    meta = {
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "oracle": f"aas-test-engines {pkg_version('aas-test-engines')}",
        "passwerk": expected["generatedBy"],
    }
    previous = REPORT.read_text(encoding="utf-8") if REPORT.exists() else ""
    REPORT.write_text(render_report(rows, meta, extract_manual_section(previous)), encoding="utf-8")
    BADGE.write_text(json.dumps(render_badge(rows), indent=2) + "\n", encoding="utf-8")

    passed = sum(1 for r in rows if r["parity"])
    print(f"parity {passed}/{len(rows)}; wrote {REPORT} and {BADGE}")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: Run unit tests, then the real thing**

Run (Bash): `cd tools/oracle && uv run --frozen python -m unittest -v`
Expected: 7 tests PASS.

Run: `pnpm oracle`
Expected: 12 lines starting with `ok `, then `parity 12/12`, exit 0. `docs/CONFORMANCE.md` and `docs/conformance-badge.json` exist. Run `pnpm oracle` a second time and `git diff docs/` shows only the `Generated:` line changed.

- [ ] **Step 6: README for the tool**

`tools/oracle/README.md` (Write tool):
```markdown
# tools/oracle

Replays every emitted golden passport through the official `aas-test-engines` (Python) and
checks verdict parity against passwerk's own L2 verdict. Writes `docs/CONFORMANCE.md` and
`docs/conformance-badge.json`. CI runs this on every push and pull request.

## Run locally

Requires Node 20+, pnpm 10 and [uv](https://docs.astral.sh/uv/).

    pnpm build
    cd tools/oracle && uv sync --frozen && cd ../..
    pnpm oracle

`pnpm oracle` = `emit` (tsx, writes `out/`) then `check` (`uv run --frozen oracle.py`).
Exit code 1 means a verdict mismatch: treat it as a passwerk bug until proven otherwise.

## Parity rule

The oracle checks the AAS metamodel only. It must say ok exactly when passwerk's L2 has zero
errors. See ADR D-012.

## Tests

    cd tools/oracle && uv run --frozen python -m unittest -v
    pnpm vitest run tools/oracle
```

- [ ] **Step 7: Commit**

```
git add tools/oracle docs/CONFORMANCE.md docs/conformance-badge.json
git commit -m "feat(oracle): aas-test-engines runner with L2 verdict parity, report and badge"
```

---

### Task 4: Sovereignty test and extended browser-safety scan

**Files:**
- Create: `packages/core/test/sovereignty.test.ts`
- Modify: `packages/core/test/browser-safety.test.ts`

**Interfaces:**
- Consumes: the full public API of `@passwerk/core` and `@passwerk/rules` (dynamic import).
- Produces: nothing; a test.

- [ ] **Step 1: Extend browser-safety to rules**

Replace the `SRC` constant and the test body:
```ts
const ROOTS = [
  join(import.meta.dirname, '..', 'src'),
  join(import.meta.dirname, '..', '..', 'rules', 'src'),
];

describe('browser safety (ADR D-006)', () => {
  it('core/src and rules/src never import node:* modules', () => {
    for (const file of ROOTS.flatMap(walk)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]node:/);
      expect(text, file).not.toMatch(/import\(\s*['"]node:/);
      expect(text, file).not.toMatch(/require\(\s*['"]node:/);
    }
  });
});
```

Run: `pnpm vitest run packages/core/test/browser-safety.test.ts`
Expected: PASS.

- [ ] **Step 2: Write the sovereignty test (it must pass on first run; the self-check proves the guards bite)**

`packages/core/test/sovereignty.test.ts`:
```ts
/**
 * Sovereignty proof (BUILD_PLAN 1.3, ADR D-013): the whole public surface of core and rules
 * runs with zero network attempts. Guards sit at the socket and resolver level so that http,
 * https, tls, undici/fetch and any transitive library are all caught. The Docker
 * `--network none` CI job is the hard proof; this test is the fast, cross-platform one.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

interface Attempt {
  api: string;
  target: string;
}

const attempts: Attempt[] = [];
const restores: Array<() => void> = [];

function guard<T extends object, K extends keyof T>(obj: T, key: K, api: string): void {
  const original = obj[key];
  const blocked = (...args: unknown[]) => {
    attempts.push({ api, target: String(args[0] ?? '') });
    throw new Error(`passwerk sovereignty: network attempt via ${api}`);
  };
  (obj as Record<K, unknown>)[key] = blocked;
  restores.push(() => {
    (obj as Record<K, unknown>)[key] = original;
  });
}

beforeAll(() => {
  guard(net.Socket.prototype, 'connect', 'net.Socket.prototype.connect');
  guard(tls, 'connect', 'tls.connect');
  guard(dns, 'lookup', 'dns.lookup');
  guard(dns, 'resolve', 'dns.resolve');
  guard(dns, 'resolve4', 'dns.resolve4');
  guard(dns, 'resolve6', 'dns.resolve6');
  guard(dns.promises, 'lookup', 'dns.promises.lookup');
  guard(dns.promises, 'resolve', 'dns.promises.resolve');
  guard(dns.promises, 'resolve4', 'dns.promises.resolve4');
  guard(dns.promises, 'resolve6', 'dns.promises.resolve6');
  guard(http, 'request', 'http.request');
  guard(http, 'get', 'http.get');
  guard(https, 'request', 'https.request');
  guard(https, 'get', 'https.get');
  guard(globalThis, 'fetch', 'fetch');
});

afterAll(() => {
  for (const restore of restores.reverse()) restore();
});

describe('sovereignty: zero network attempts', () => {
  it('the guards record and block a real attempt (self-check)', async () => {
    await expect(fetch('http://127.0.0.1:9/')).rejects.toThrow('passwerk sovereignty');
    expect(() => http.get('http://127.0.0.1:9/')).toThrow('passwerk sovereignty');
    expect(attempts.map((a) => a.api)).toEqual(['fetch', 'http.get']);
    attempts.length = 0;
  });

  it('loading and exercising the whole public surface of rules and core makes no attempt', async () => {
    vi.resetModules();
    const rules = await import('@passwerk/rules');
    const core = await import('@passwerk/core');

    // rules: every accessor over every id
    expect(rules.artefactManifest.artefacts.length).toBeGreaterThan(0);
    expect(rules.templates.length).toBe(7);
    for (const attribute of rules.attributes) {
      expect(rules.getAttribute(attribute.id)).toBeDefined();
      for (const path of attribute.templatePaths) rules.getTemplateElement(path);
    }
    for (const template of rules.templateCatalogue.templates) {
      rules.getTemplate(template.part);
      for (const element of template.elements) {
        rules.getTemplateElement(element.path);
        rules.getAttributesForTemplatePath(element.path);
      }
    }
    for (const point of rules.ecDataPoints.dataPoints) rules.getEcDataPoint(point.number);
    for (const rule of rules.plausibilityRules) rules.getRule(rule.id);
    for (const category of rules.BATTERY_CATEGORIES) {
      rules.getAttributesForCategory(category);
      rules.getTimeline(category);
    }
    rules.getTimeline();
    rules.listCapabilities();

    // core: every entry point over every sample, JSON and AASX
    for (const name of [...core.VALID_SAMPLE_NAMES, ...core.BROKEN_SAMPLE_NAMES]) {
      const draft = core.getSample(name);
      const report = core.validate(draft);
      expect(report.aasJson).toBeDefined();
      const jsonable = JSON.parse(report.aasJson as string);
      core.validateSchema(draft);
      core.validateAas(jsonable);
      core.validateTemplate(jsonable);
      core.validateEnvironmentJson(jsonable);
      if (report.layers.L1.errors === 0) {
        core.emitAasJson(draft);
        const aasx = core.emitAasx(draft);
        core.readAasxEnvironment(aasx.output);
      }
      core.readAasxEnvironment(core.packAasx(report.aasJson as string));
    }

    expect(attempts).toEqual([]);
  });
});
```

If a rules accessor name or property used above does not exist (check `packages/rules/src/index.ts` and `types.ts`: `artefactManifest.artefacts`, `templateCatalogue.templates[].part/.elements[].path`, `ecDataPoints.dataPoints[].number`, `attribute.templatePaths`), adjust the test to the real names. Do not add exports to `src` for the test's sake.

- [ ] **Step 3: Run**

Run: `pnpm vitest run packages/core/test/sovereignty.test.ts`
Expected: 2 tests PASS. If the second test throws `passwerk sovereignty`, that is a real finding: stop, use systematic-debugging, and report which API and target. Do not loosen the guards.

Also run: `pnpm test` to be sure the restored guards leave other test files intact (each vitest file runs in its own worker, so they do).

- [ ] **Step 4: Commit**

```
git add packages/core/test/sovereignty.test.ts packages/core/test/browser-safety.test.ts
git commit -m "test(core): sovereignty proof with socket-level network guards over the whole public surface"
```

---

### Task 5: Docker `--network none` image and CI jobs

**Files:**
- Create: `tools/sovereignty/Dockerfile`, `.dockerignore`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Dockerfile and ignore file**

`tools/sovereignty/Dockerfile`:
```dockerfile
# CI-only image: installs dependencies with the network on, then CI runs the container with
# `--network none` so the whole test suite is proven to make zero network calls (ADR D-013).
FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "test"]
```

`.dockerignore`:
```
.git
node_modules
**/node_modules
**/dist
coverage
tools/oracle/out
tools/oracle/.venv
*.tsbuildinfo
docs/research-passwerk.md
```

Run (local check, Docker Desktop must be running):
`docker build -f tools/sovereignty/Dockerfile -t passwerk-sovereignty .; docker run --rm --network none passwerk-sovereignty`
Expected: vitest summary with all files passed, exit 0. If Docker is not running locally, say so in the final report and rely on CI.

- [ ] **Step 2: CI jobs**

Replace the trailing comment block in `.github/workflows/ci.yml` with:
```yaml
  oracle:
    name: Oracle parity (aas-test-engines)
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - uses: astral-sh/setup-uv@v10
        with:
          enable-cache: true
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: uv sync --frozen
        working-directory: tools/oracle
      - run: pnpm oracle
      - name: Committed report and badge must match the fresh run
        run: |
          git diff --exit-code -- docs/conformance-badge.json
          git diff -I '^Generated: ' --exit-code -- docs/CONFORMANCE.md
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: oracle-parity
          path: |
            tools/oracle/out
            docs/CONFORMANCE.md
            docs/conformance-badge.json
          retention-days: 30

  sovereignty:
    name: Sovereignty (--network none)
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -f tools/sovereignty/Dockerfile -t passwerk-sovereignty .
      - run: docker run --rm --network none passwerk-sovereignty
```

`git diff -I` needs git 2.30+; ubuntu-latest has it. Verify locally: `git diff -I '^Generated: ' --exit-code -- docs/CONFORMANCE.md` after a second `pnpm oracle` run exits 0.

- [ ] **Step 3: Commit**

```
git add tools/sovereignty .dockerignore .github/workflows/ci.yml
git commit -m "ci: oracle parity and --network none sovereignty gates"
```

---

### Task 6: ADRs, README badge and status, AGENTS.md

**Files:**
- Modify: `docs/DECISIONS.md` (append), `README.md`, `AGENTS.md`

- [ ] **Step 1: ADRs (Write tool or Edit)**

Append to `docs/DECISIONS.md`:
```markdown
## D-012: Oracle parity is L2 parity; the Python oracle is pinned through uv (2026-09-03)

**Context.** `aas-test-engines` 1.0.3 checks the AAS 3.0 metamodel and constraints and knows
two ZVEI templates, none of the IDTA 02035 battery templates. It cannot see passwerk's L1
(draft rules) or L3 (template diff). The report must be committed and CI-verified, but a
dated report is never byte-identical across runs.

**Decision.** Parity per emitted file is `oracle.ok == (L2 errors == 0)`; CRITICAL never
counts. All six golden samples, valid and broken, in both JSON and AASX, form the set (12
files), so agreement is proven in both directions. `tools/oracle` is a private workspace
package: tsx emits the files with passwerk's verdicts, `oracle.py` (pinned
`aas-test-engines==1.0.3` via `pyproject.toml` + `uv.lock`) runs the oracle and renders
`docs/CONFORMANCE.md` and a shields.io endpoint `docs/conformance-badge.json`. CI regenerates
both and fails on any difference except the `Generated:` line. The hand-kept "Manual oracle
runs" section survives regeneration.

**Consequences.** The README badge is backed by a file CI verifies on every run. When
`aas-test-engines` learns the IDTA 02035 templates, parity can be widened to L3 in one place.

## D-013: Sovereignty is proven twice: socket-level guards in-process, Docker offline in CI (2026-09-03)

**Decision.** `packages/core/test/sovereignty.test.ts` patches `net.Socket.prototype.connect`,
the `dns` resolvers, `tls.connect`, `http`/`https` request and get, and `globalThis.fetch`
to record and throw, then dynamically imports `rules` and `core` and exercises every public
accessor and entry point over every golden sample. A self-check asserts the guards bite.
CI additionally builds `tools/sovereignty/Dockerfile` and runs `pnpm test` with
`--network none`, which catches anything the guards cannot (child processes, native code).

**Consequences.** Fast, cross-platform evidence on every `pnpm test`; a hard proof on every
CI run. Phase 6 extends the exercised surface to every MCP tool, resource and prompt.
```

- [ ] **Step 2: README**

Under the title line add the badge:
```markdown
![CI](https://github.com/ShahriarBijoy/passwerk/actions/workflows/ci.yml/badge.svg)
![AAS conformance](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ShahriarBijoy/passwerk/main/docs/conformance-badge.json)
```
Replace the Status section:
```markdown
## Status

**Phase 3 of 8 done: oracle parity in CI.** `@passwerk/rules` (artefacts + knowledge base) and
`@passwerk/core` (model, AAS JSON/AASX emitters for IDTA 02035-1/-3/-6, validation L1 to L3)
are implemented. Every emitted golden passport is replayed through the official
`aas-test-engines` on every CI run with 12/12 verdict parity (`docs/CONFORMANCE.md`), and a
sovereignty test plus a `--network none` Docker job prove zero network calls. Next: the
remaining four submodel emitters, then ingest and mapping. See `docs/BUILD_PLAN.md` and
`docs/DECISIONS.md`.
```
In Development add `pnpm oracle     # replay golden passports through aas-test-engines (needs uv)`.

- [ ] **Step 3: AGENTS.md**

Commands block: add `pnpm oracle             # emit golden passports and replay them through aas-test-engines (needs uv)`.
Status: after the Phase 2 bullet add:
```markdown
- **Phase 3 (oracle parity + sovereignty): done.** `tools/oracle` (`@passwerk/oracle`, tsx +
  Python `aas-test-engines` 1.0.3 via uv) proves 12/12 L2 verdict parity on every CI run and
  writes `docs/CONFORMANCE.md` plus the README badge JSON. `sovereignty.test.ts` guards every
  network API over the whole public surface; CI also runs the suite in Docker with
  `--network none`. See ADRs D-012 and D-013.
- **Next: Phase 3b.** The remaining four submodel emitters (parts 2, 4, 5, 7), then Phase 4
  ingest, extract and mapping.
```
Keep the existing "Next: Phase 3" bullet removed.

- [ ] **Step 4: Full check and commit**

Run: `pnpm check` and `pnpm oracle` (both must be green; report real output).
```
git add docs/DECISIONS.md README.md AGENTS.md
git commit -m "docs: Phase 3 ADRs D-012 and D-013, conformance badge, status update"
```

- [ ] **Step 5: Push and open the PR**

```
git push -u origin feat/oracle-parity-and-sovereignty
gh pr create --title "feat: Phase 3 oracle parity in CI and sovereignty proof" --body-file <body written with the Write tool; ends with https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V>
```
Then watch CI (`gh pr checks --watch`) and fix anything red before reporting done.
