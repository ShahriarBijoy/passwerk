---
name: passwerk
description: Build or audit an EU Digital Battery Passport from supplier documents using the passwerk MCP tools. Use when the user mentions battery passport, Batteriepass, DPP, IDTA 02035, Annex XIII, Regulation (EU) 2023/1542 or supplier compliance data requests.
---

# passwerk: build or audit an EU battery passport

passwerk is an offline MCP server. It reads supplier documents (PDF, XLSX, CSV, DOCX, TXT),
extracts facts, proposes mappings onto the passport attributes, validates a draft on four
layers and emits the official AAS files (IDTA 02035). It makes no network and no model
calls; you do the semantic work. Before the first call, read `list_capabilities` once.

## Workflow (always in this order)

1. **`check_obligations`**: battery type, role, energy in kWh, placed-on-market date. Confirm
   the category (EV, LMT, INDUSTRIAL_GT_2KWH) and the mandatory attribute set. Stop on
   `not_required` and say why. Ask for missing input on `insufficient_input`.
2. **`ingest_documents`** with `paths` (a directory or files; preferred) or `inline` base64.
   Then **`extract_facts`** with the returned `bundleId`, then **`suggest_mappings`** with the
   `factSetId` and the confirmed category.
3. **Review the proposals.** Accept those at confidence >= 0.7. Below that, ask the user or
   read the source page (`ingest_documents` with `detail: "full"`, or the
   `passwerk://session/bundle/{id}` resource). Then **`apply_mappings`**: pass `meta`
   (category, passportId) the first time, the returned `draftId` afterwards. Show every
   conflict to the user; set `override: true` only when the user decides.
4. **`validate_passport`** on the `draftId`. On `invalid`, read the findings (layer, rule id,
   path, message, fix hint), fix them through `apply_mappings`, validate again. At most five
   loops, then report where things stand. `explain_attribute` with an attribute or rule id
   explains what a finding means and who typically has the data.
5. **`gap_report`**: present it as a to-do list grouped by `byDataOwner` (who typically has the
   data), each item with its legal reference. Do not estimate missing values.
6. **`emit_passport`** (`aas-json`, `aasx`, `draft-json`, `html`) only when the verdict is `valid`
   or the user explicitly accepts `valid_with_warnings`. Quote the re-validation verdict. The
   `html` target is the human-readable sheet (DE and EN inside; `htmlLang` picks the opening
   language); the AAS files stay authoritative.
7. **`generate_carrier`** after the emit: the QR code of the passport identifier (SVG or PNG),
   or of a GS1 Digital Link when the user supplies `gs1` (GTIN plus serial, or GIAI) and
   `resolverBase`. It says nothing about validity.

Every tool accepts `lang: "de" | "en"` for its text summary. Pass the user's language.

## Stop conditions

- The category is unknown and the user cannot supply battery type, energy or date.
- `ingest_documents` reports an error for every document.
- A conflict the user has not decided.
- Five validation loops without reaching `valid` or `valid_with_warnings`.

## Honesty rules

- Never call a draft valid, conformant or complete unless `validate_passport` returned `valid`
  or `valid_with_warnings`. Quote the verdict verbatim, with error and warning counts.
- Never invent a value, a legal reference, a semanticId or a template idShort. Every legal
  statement comes from the tool output's `sources[]` and `legalRefs`.
- Say once, explicitly, that the output is not legal advice (`isNotLegalAdvice: true`).
- Answer in the user's language, German or English.

## References

- `references/workflow.md`: example calls and what to read from each result.
- `references/resources.md`: which `passwerk://` resource answers which question.
- `references/cli.md`: the `passwerk` command line for batch runs and CI.
