# Workflow reference: calls and what to read

Ids (`bundleId`, `factSetId`, `draftId`) are content hashes. They live for one connection;
if a tool answers `Unknown … id`, re-send the object.

## 1. check_obligations

```json
{ "batteryType": "EV", "role": "manufacturer", "placedOnMarketDate": "2027-06-01", "lang": "de" }
```

Read: `verdict` (`required` | `not_required` | `insufficient_input`), `category`,
`mandatoryAttributes`, `conditionalAttributes`, `missingInput`, `timeline[]`, `sources[]`.

## 2. ingest_documents, extract_facts, suggest_mappings

```json
{ "paths": ["./supplier-docs"] }
{ "bundle": { "bundleId": "bnd_…" } }
{ "facts": { "factSetId": "fct_…" }, "category": "EV", "minConfidence": 0.7 }
```

Read from ingest: `documents[]` (`name`, `format`, `pages`, `tables`, `lang`, `error?`) and
`errors[]` (paths that could not be read). From extract: `facts.facts[]` (`label`, `value`,
`unit`, `source`). From suggest: `proposals[]` sorted by confidence, each with
`attributeId`, `value`, `unit`, `path` (composite leaf), `source[]`, `confidence`, `why`
(DE/EN) and `checks` (label score, unit and kind compatibility); `counts.atLeast07`.

## 3. apply_mappings

First call, with the accepted proposals copied through unchanged:

```json
{
  "meta": { "category": "EV", "passportId": "urn:example:battery:MW-EV-2026-000123" },
  "mappings": [
    { "attributeId": "ratedCapacity", "value": "94.5", "unit": "Ah", "source": [{ "file": "lieferantenerklaerung.pdf", "page": 1 }], "confidence": 0.93 }
  ]
}
```

Later calls: `{ "draft": { "draftId": "drf_…" }, "mappings": [...] }`. A manual value is a
decision without `source`. Read: `applied`, `conflicts[]` (`attributeId`, `path?`, `existing`,
`incoming`); the new `draftId`. Composite attributes take a `path` such as `name.de`.

## 4. validate_passport

```json
{ "draft": { "draftId": "drf_…" }, "lang": "de" }
```

Read: `verdict`, `findings[]` with `layer` (L1 schema, L2 AAS meta-model, L3 IDTA template,
L4 plausibility), `ruleId`, `path`, `attributeId?`, `message` (DE/EN), `legalRef?`,
`fixHint?`; `layers` with error and warning counts. Fix through `apply_mappings` and
re-validate. `explain_attribute` with a rule id explains a PW-PLAUS finding.

## 5. gap_report

Read: `completeness.mandatory` and `.overall` (`present`, `total`, `percent`), `items[]`
(`attributeId`, `name`, `status`, `bucket` required | conditional | deferred | optional,
`legalRefs`, `whoTypicallyHasIt`, `suggestedAction`, `findings`), `bySubmodel[]`,
`byDataOwner[]`. Items with `verify: true` carry a knowledge-base entry still to be checked
by a domain expert; say so.

To close open gaps from facts without the structured content (a text-only host such as
Claude Desktop), call `gap_report(detail:'full', bucket:['required','conditional'],
status:['missing','invalid'])`, then `suggest_mappings(attributeIds: <those ids>,
detail:'full')`, then `apply_mappings` with each accepted proposal's `source` copied through
unchanged. `detail:'full'` prints every filtered item or proposal as one line with
provenance, no cap and no "… N more"; a `status`/`bucket` filter narrows `items` but never
the completeness figures, and `structured.filter` echoes what was applied.

## 6. emit_passport

```json
{ "draft": { "draftId": "drf_…" }, "targets": ["aas-json", "aasx", "draft-json"], "outDir": "./out" }
```

Without `outDir` the files come back as base64 in `files[].bytes`. Read: `verdict` (the
re-validation of the emitted output), `findings[]`, `files[]` (`target`, `name`, `size`,
`path` or `bytes`).

## 7. generate_carrier

```json
{ "draft": { "draftId": "drf_…" }, "format": "svg" }
{ "uid": "https://passport.example/battery/1", "gs1": { "gtin": "4006381333931", "serial": "MW-EV-2026-000123" }, "resolverBase": "https://id.example.com", "format": "png", "outDir": "./out" }
```

Read: `uid`, `digitalLink` (when built), `payload` (what the QR encodes), `image` (`name`,
`size`, `path` or base64 `bytes`), `sources[]`. A wrong GTIN check digit or a non-https
identifier is an error result with a DE/EN message, never a crash.
