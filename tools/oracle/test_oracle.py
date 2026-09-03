"""Unit tests for the pure parts of oracle.py. Run: uv run --frozen python -m unittest -v"""

import unittest

from oracle import extract_manual_section, flatten_errors, parity_rows, render_badge, render_report

EXPECTED = {
    "generatedBy": "@passwerk/core 0.0.0",
    "files": [
        {
            "sample": "a",
            "file": "a.aas.json",
            "format": "json",
            "sha256": "x",
            "passwerk": {"verdict": "valid", "l1Errors": 0, "l2Errors": 0, "l3Errors": 0},
            "expectedOracleOk": True,
            "l2Findings": [],
        },
        {
            "sample": "b",
            "file": "b.aasx",
            "format": "aasx",
            "sha256": "y",
            "passwerk": {"verdict": "invalid", "l1Errors": 1, "l2Errors": 1, "l3Errors": 0},
            "expectedOracleOk": False,
            "l2Findings": ["/submodels/0: bad date"],
        },
    ],
}
RESULTS = {
    "a.aas.json": {"ok": True, "level": "INFO", "errors": []},
    "b.aasx": {"ok": False, "level": "ERROR", "errors": ["Value '1.2.2026' is not a 'xs:date' @ X"]},
}
META = {
    "generated": "2026-09-03T00:00:00Z",
    "oracle": "aas-test-engines 1.0.3",
    "passwerk": "@passwerk/core 0.0.0",
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

    def test_parity_false_when_oracle_rejects_a_file_we_accept(self):
        results = dict(RESULTS)
        results["a.aas.json"] = {"ok": False, "level": "ERROR", "errors": ["boom"]}
        rows = parity_rows(EXPECTED, results)
        self.assertEqual([r["parity"] for r in rows], [False, True])

    def test_critical_is_never_parity(self):
        results = dict(RESULTS)
        results["b.aasx"] = {"ok": False, "level": "CRITICAL", "errors": ["Internal error"]}
        rows = parity_rows(EXPECTED, results)
        self.assertFalse(rows[1]["parity"])

    def test_missing_result_is_not_parity(self):
        rows = parity_rows(EXPECTED, {"a.aas.json": RESULTS["a.aas.json"]})
        self.assertEqual([r["parity"] for r in rows], [True, False])
        self.assertEqual(rows[1]["oracleLevel"], "MISSING")


class FlattenTests(unittest.TestCase):
    def test_collects_error_and_critical_leaves_only(self):
        tree = {
            "m": "Check",
            "l": 2,
            "s": [
                {"m": "Check meta model", "l": 0, "s": []},
                {
                    "m": "Check constraints",
                    "l": 2,
                    "s": [{"m": "Value 'x' is not a 'xs:date'", "l": 2, "s": []}],
                },
                {"m": "Internal error: boom", "l": 3, "s": []},
                {"m": "Just a warning", "l": 1, "s": []},
            ],
        }
        self.assertEqual(
            flatten_errors(tree, []), ["Value 'x' is not a 'xs:date'", "Internal error: boom"]
        )


class RenderTests(unittest.TestCase):
    def test_badge(self):
        rows = parity_rows(EXPECTED, RESULTS)
        self.assertEqual(
            render_badge(rows),
            {"schemaVersion": 1, "label": "AAS conformance", "message": "2/2", "color": "brightgreen"},
        )
        rows[0]["parity"] = False
        self.assertEqual(render_badge(rows)["color"], "red")
        self.assertEqual(render_badge(rows)["message"], "1/2")

    def test_report_has_header_table_and_manual_section(self):
        rows = parity_rows(EXPECTED, RESULTS)
        text = render_report(rows, META, "## Manual oracle runs\n\n| x |\n")
        self.assertIn("Generated: 2026-09-03T00:00:00Z\n", text)
        self.assertIn("Oracle: aas-test-engines 1.0.3\n", text)
        self.assertIn("Parity: 2/2\n", text)
        self.assertIn("| a | json | 0 errors | ok | yes |  |\n", text)
        self.assertIn(
            "| b | aasx | 1 error | ERROR | yes | Value '1.2.2026' is not a 'xs:date' @ X |\n", text
        )
        self.assertIn("## What parity means", text)
        self.assertTrue(text.endswith("## Manual oracle runs\n\n| x |\n"))

    def test_report_escapes_pipes_in_oracle_messages(self):
        results = dict(RESULTS)
        results["b.aasx"] = {"ok": False, "level": "ERROR", "errors": ["a | b"]}
        text = render_report(parity_rows(EXPECTED, results), META, "## Manual oracle runs\n")
        self.assertIn("| a \\| b |", text)

    def test_extract_manual_section_keeps_hand_written_rows_and_defaults(self):
        self.assertEqual(
            extract_manual_section("# x\n\n## Manual oracle runs\n\nkept\n"),
            "## Manual oracle runs\n\nkept\n",
        )
        self.assertIn("| Tool | Version | Date | Result |", extract_manual_section(""))


if __name__ == "__main__":
    unittest.main()
