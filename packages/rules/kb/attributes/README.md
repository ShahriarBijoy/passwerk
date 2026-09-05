# Attribute knowledge base

One JSON file per DIN DKE SPEC 99100 attribute category. Together the files cover all 93 rows of
the Battery Pass Data Attribute Longlist v1.2 (`kb/generated/din-longlist.json`) and, through
`ecDataPoints`, all 71 Commission data points (`kb/ec-datapoints.json`) except the two that the
Commission marks as repetitions (16 and 25).

These files are **authored data**, reviewed by humans. Everything that can be derived from an
official source is *not* stored here but joined at runtime by `@passwerk/rules`:

| Derived at runtime | From |
|---|---|
| Legal references | `ecDataPoints[*].legalRef` + longlist `regulationRef` |
| Applicability per battery category (mandatory / optional / conditional / not_yet_applicable / not_displayed) | `ecDataPoints[0]` (the primary data point), or `applicabilityOverride` when no EC data point exists |
| semanticId, cardinality, AAS value type, template unit | `templatePaths[*]` looked up in `kb/generated/template-catalogue.json` |
| DIN chapter, definition, static/dynamic, granularity, access rights | `din.no` looked up in the longlist |

Not joined at runtime but checked at review time: `pnpm review-sheet` joins every attribute to the
Battery Pass SAMM aspect models (`kb/generated/batterypass-samm.json`) by DIN chapter and IDTA
semanticId name and lists unit, data type, enumeration and range disagreements in
`docs/KB_REVIEW.md` (ADR D-030). Resolve a finding by changing the JSON here, never the script.

## Entry schema

```jsonc
{
  "id": "batteryMass",                      // ^[a-z][A-Za-z0-9]*$, unique across all files
  "din": { "no": 10, "chapter": "6.1.3.6" }, // must match one longlist row exactly
  "ecDataPoints": [10],                      // Commission data point numbers; [0] is primary
  "part": 4,                                 // IDTA 02035 part carrying the value, or null
  "templatePaths": ["4/GeneralInformation/BatteryMass"], // catalogue paths, all within `part`
  "name": { "en": "Battery mass", "de": "Batteriemasse" },
  "synonyms": { "en": ["weight", "..."], "de": ["Gewicht", "..."] }, // >= 2 each, lower-case, as they appear in supplier documents
  "valueKind": "decimal",                    // see vocabulary below
  "unit": "kg",                              // see vocabulary below, or null
  "range": { "min": 0, "max": null },        // plausibility bounds, or null
  "whoTypicallyHasIt": { "en": "...", "de": "..." },
  "explanation": { "en": "...", "de": "..." },  // 1-3 plain sentences for a supplier, not a lawyer
  "applicabilityOverride": null,             // only when ecDataPoints is []; see below
  "verify": false,                           // true = a human must confirm the mapping
  "lastVerified": "2026-09-03"
}
```

`valueKind` vocabulary: `identifier`, `text`, `multilingualText`, `decimal`, `integer`,
`percentage`, `date`, `dateTime`, `boolean`, `enum`, `document`, `uri`, `graphic`, `composite`.

`unit` vocabulary: `kg`, `g`, `Ah`, `kWh`, `Wh`, `V`, `W`, `W/Wh`, `%`, `%/month`, `Ohm`,
`degC`, `min`, `cycles`, `years`, `months`, `kgCO2e/kWh`, `tCO2e`, `C` (C-rate, A/Ah).

`applicabilityOverride` is required when `ecDataPoints` is empty (attributes that exist in DIN
DKE SPEC 99100 but not in the Commission's 71-point matrix):

```jsonc
"applicabilityOverride": {
  "EV": { "status": "not_displayed", "text": "..." },
  "LMT": { "status": "conditional", "text": "..." },
  "INDUSTRIAL_GT_2KWH": { "status": "conditional", "text": "..." },
  "source": "Battery Pass longlist v1.2 row 7 (x = LMT, stationary); Annex VII Part B (1)"
}
```

## Rules for authors

- Never invent a semanticId, legal reference or standard clause. They are joined from the
  generated files; if you cannot find a template element, set `part: null`,
  `templatePaths: []` and `verify: true`.
- German and English are both required for `name`, `synonyms`, `whoTypicallyHasIt` and
  `explanation`. Use the terminology a Mittelstand supplier uses in a BOM or Lieferantenerklärung,
  not the regulation's wording, for synonyms.
- `whoTypicallyHasIt` names the role in the supply chain that usually holds the data (cell
  manufacturer, pack assembler, BMS supplier, importer, EHS department, ...).
- Mark `verify: true` whenever the mapping between DIN row, EC data point and template element is
  a judgement call. `test/attributes.test.ts` enforces the structure; humans review the semantics.
