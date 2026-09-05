"""
passwerk oracle: replay emitted golden passports through the official aas-test-engines and
check verdict parity against passwerk's own L2 verdict (ADR D-012).

Parity rule: the oracle checks the AAS metamodel only (it knows no IDTA 02035 template), so it
must report ok exactly when passwerk's L2 (aas-core verification) has zero errors. Any
mismatch is a passwerk bug until proven otherwise. Exit code 1 on any mismatch.

Inputs:  out/expected.json (written by src/emit-golden.ts) and the files it lists.
Outputs: out/results.json, docs/CONFORMANCE.md, docs/conformance-badge.json.
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
    "Recorded by hand (BUILD_PLAN Phase 8): AASX Package Explorer, BatteryPass-Ready test "
    "environment. Add a row per run.\n\n"
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
        results[entry["file"]] = {
            "ok": result.ok(),
            "level": result.level.name,
            "errors": flatten_errors(result.to_dict(), []),
        }
    return results


def parity_rows(expected: dict, results: dict) -> list[dict]:
    rows = []
    for entry in expected["files"]:
        res = results.get(entry["file"])
        if res is None:
            # A file the oracle never saw is never parity, whatever passwerk expected.
            res = {"ok": False, "level": "MISSING", "errors": ["no oracle result"]}
            parity = False
        else:
            parity = res["level"] != "CRITICAL" and res["ok"] == entry["expectedOracleOk"]
        rows.append(
            {
                "sample": entry["sample"],
                "file": entry["file"],
                "format": entry["format"],
                "l2Errors": entry["passwerk"]["l2Errors"],
                "verdict": entry["passwerk"]["verdict"],
                "oracleOk": res["ok"],
                "oracleLevel": res["level"],
                "oracleErrors": list(res["errors"]),
                "parity": parity,
            }
        )
    return rows


def render_badge(rows: list[dict]) -> dict:
    passed = sum(1 for r in rows if r["parity"])
    total = len(rows)
    return {
        "schemaVersion": 1,
        "label": "AAS L2 oracle parity",
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
        parity = "yes" if r["parity"] else "NO"
        msgs = _cell("; ".join(r["oracleErrors"]))
        lines.append(f"| {r['sample']} | {r['format']} | {l2} | {oracle} | {parity} | {msgs} |")
    lines += ["", PARITY_PROSE.rstrip(), "", manual_section.rstrip(), ""]
    return "\n".join(lines)


def extract_manual_section(text: str) -> str:
    idx = text.find(MANUAL_HEADING)
    if idx < 0:
        return DEFAULT_MANUAL
    return text[idx:].rstrip() + "\n"


def main() -> int:
    expected = json.loads((OUT / "expected.json").read_text(encoding="utf-8"))
    oracle_version = pkg_version("aas-test-engines")
    results = run_oracle(expected)
    (OUT / "results.json").write_text(
        json.dumps(
            {"oracle": {"name": "aas-test-engines", "version": oracle_version}, "files": results},
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    rows = parity_rows(expected, results)
    for r in rows:
        mark = "ok      " if r["parity"] else "MISMATCH"
        print(f"{mark} {r['file']}: passwerk L2 errors={r['l2Errors']} oracle={r['oracleLevel']}")

    meta = {
        "generated": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "oracle": f"aas-test-engines {oracle_version}",
        "passwerk": expected["generatedBy"],
    }
    previous = REPORT.read_text(encoding="utf-8") if REPORT.exists() else ""
    REPORT.write_text(render_report(rows, meta, extract_manual_section(previous)), encoding="utf-8", newline="\n")
    BADGE.write_text(json.dumps(render_badge(rows), indent=2) + "\n", encoding="utf-8", newline="\n")

    passed = sum(1 for r in rows if r["parity"])
    print(f"parity {passed}/{len(rows)}; wrote {REPORT} and {BADGE}")
    return 0 if passed == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
