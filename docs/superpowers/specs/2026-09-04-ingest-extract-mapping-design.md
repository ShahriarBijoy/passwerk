# Phase 4 design: ingest, extract, mapping and the part 2 emitter

Date: 2026-09-04. Status: approved by the owner in session ("i trust u"). Branch:
`feat/core-ingest-extract-mapping`.

This spec implements BUILD_PLAN section 2.2 up to `suggestMappings` and `apply_mappings`, and
closes ADR D-014 by emitting Handover Documentation (IDTA 02035-2) from explicitly classified
documents. Everything stays inside `@passwerk/core`, browser-safe (ADR D-006), with no LLM and
no network (ADR D-002, D-013). The MCP tools that wrap these functions are Phase 6.

## 1. Goal and definition of done

A supplier's files (PDF, XLSX, CSV, DOCX, TXT) become a `DocumentBundle` with page and cell
provenance, then a `FactSet` of normalised label-value-unit facts, then confidence-scored
`MappingProposal[]` onto knowledge-base attribute ids that a host agent accepts through
`applyMappings`.

Definition of done:

1. `ingest`, `extractFacts`, `suggestMappings`, `applyMappings`, `newDraft`,
   `documentRefFromIngest` and `emitHandoverDocumentation` exist, are exported and are covered
   by the sovereignty test.
2. On the committed Musterwerk fixtures at least 80 % of the expected attributes are proposed
   at confidence >= 0.7 with the expected value and provenance, and every proposal at
   confidence >= 0.9 is an expected one (no confident nonsense).
3. Every reader is tested against a fixture it did not generate (hand-checked expectations).
4. Valid golden samples carry at least one classified document, so part 2 is emitted and
   `validate(sample).verdict` stays `valid`; a new broken sample
   `ev-document-without-classification` shows how an unclassified document is reported.
5. `pnpm check` green, snapshots updated, oracle parity kept (CI regenerates
   `docs/CONFORMANCE.md`), `browser-safety.test.ts` unchanged and green.

Out of scope: OCR (textless pages are reported, never guessed), Catena-X, L4 plausibility, gap
report, MCP wiring, composite list attributes from BOM tables (`criticalRawMaterials`,
`hazardousSubstances`, ...): their table facts are extracted and handed to the host agent, but
no proposal is made because deciding which BOM row is an Article 8 material is semantic work.

## 2. Approach

Mapping is a **label scorer over a synonym index** built from the knowledge base: attribute
names, authored synonyms and template concept names (DE and EN). Unit and value-kind checks
then raise or cap the confidence. Every proposal explains itself in DE and EN. Domain knowledge
stays in `packages/rules` JSON; the code only normalises and scores.

Rejected: one regex per attribute (brittle, moves domain knowledge into code) and any layout
model (no weights, no LLM).

## 3. Public types (`packages/core/src/ingest/types.ts`, `extract/types.ts`, `mapping/types.ts`)

All types are Zod objects; the inferred TypeScript types are exported alongside. Keys are
emitted sorted (`canonical.ts` conventions) so bundles and fact sets are byte-stable.

### 3.1 Input

```ts
InputFile = { name: string; bytes: Uint8Array; contentType?: string }
```

Bytes only, never a path. `cli` and `server` read files through their own adapters.

### 3.2 DocumentBundle

```ts
DocumentBundle = { documents: IngestedDocument[] }
IngestedDocument = {
  name: string
  format: 'pdf' | 'xlsx' | 'csv' | 'docx' | 'txt' | 'unsupported'
  contentType: string               // detected, e.g. application/pdf
  sha256: string                    // of the input bytes (Web Crypto, async)
  lang: 'de' | 'en'                 // majority over pages; 'de' on a tie
  pages: Page[]
  error?: { code: 'unsupported' | 'encrypted' | 'corrupt' | 'undecodable'; message: string }
}
Page = {
  number: number                    // 1-based; XLSX: sheet index; DOCX/CSV/TXT: always 1
  title?: string                    // XLSX sheet name
  lang: 'de' | 'en'
  textless: boolean                 // PDF page with no text layer, or empty sheet
  lines: Line[]
  tables: Table[]
}
Line = { text: string; segments: string[]; source: Provenance }   // segments = column-like runs
Table = {
  index: number                     // 1-based within the page
  rows: Cell[][]
  source: Provenance                // file + page (+ cell of the top-left corner for XLSX)
}
Cell = { text: string; ref: string; source: Provenance }
```

`Provenance` is unchanged (`{ file, page?, cell?, note? }`). Conventions for `cell`:

| Reader | `cell` | Example |
|---|---|---|
| XLSX | `<sheet>!<A1>` | `Stammdaten!B7` |
| CSV | `R<row>C<col>` (1-based, header row is row 1) | `R3C2` |
| PDF table | `T<table>:R<row>C<col>` with `page` set | `T1:R2C3` |
| DOCX table | `T<table>:R<row>C<col>` | `T2:R4C2` |
| PDF or DOCX line | none; `note` = `line <n>` | |

### 3.3 FactSet

```ts
FactSet = { facts: Fact[]; tables: TableFact[]; documents: DocumentSummary[] }
Fact = {
  id: string                        // `${name}#${page}:${n}`, stable across runs
  label: string                     // as written ("Nennkapazität:")
  labelKey: string                  // normalised (see 5.3)
  raw: string                       // value as written ("94,5 Ah")
  value?: string                    // normalised: decimal string, ISO date, "true"/"false", URI or trimmed text
  kind: 'decimal' | 'integer' | 'date' | 'boolean' | 'uri' | 'text'
  unit?: string                     // canonical KB unit after conversion (kg, Ah, kWh, %, ...)
  rawUnit?: string                  // as written ("Wh", "g", "°C")
  lang: 'de' | 'en'
  shape: 'kv' | 'header-cell' | 'sheet-pair'
  rowLabel?: string                 // header-cell: first column of the row, when it is a label
  source: Provenance
}
TableFact = { id: string; headers: string[]; rows: string[][]; source: Provenance; lang: 'de' | 'en' }
DocumentSummary = { name: string; format; contentType; lang; pages: number; sha256; error? }
```

### 3.4 Mapping

```ts
MappingProposal = {
  attributeId: string
  value: unknown                    // normalised leaf value, or a partial composite object (3.5)
  unit?: string
  path?: string                     // sub-path inside a composite value, e.g. "name.de"
  source: Provenance[]
  confidence: number                // 0..1, two decimals
  factId: string
  why: { de: string; en: string }
  checks: {
    label: number                   // best label similarity 0..1
    matched: string                 // the index entry that matched
    unit: 'match' | 'converted' | 'missing' | 'mismatch' | 'n/a'
    kind: 'ok' | 'mismatch' | 'n/a'
  }
}
MappingDecision = {
  attributeId: string
  value: unknown
  unit?: string
  path?: string
  source?: Provenance[]
  confidence?: number
  recordedAt?: string
  override?: boolean                // replace an existing different value instead of flagging a conflict
}
ApplyResult = {
  draft: PassportDraft
  applied: number
  conflicts: { attributeId: string; existing: unknown; incoming: unknown; source: Provenance[] }[]
}
```

### 3.5 DocumentRef (model/values.ts), extended

```ts
DocumentRef = {
  id, title?, uri?                  // unchanged
  classification?: { classId: string; className: MultilingualText; system: string }
  languages?: string[]              // ISO 639-1
  version?: string
  fileName?: string
  contentType?: string
  domainId?: string                 // issuer of `id`; defaults to meta.passportId in the emitter
}
```

## 4. Ingest (`packages/core/src/ingest/`)

`ingest(files: InputFile[]): Promise<DocumentBundle>`; documents keep input order. A bad file
never throws: the document gets `error` and zero pages.

| File | Role |
|---|---|
| `index.ts` | `ingest`, format detection (extension, then magic bytes: `%PDF`, `PK`), dispatch |
| `pdf.ts` | pdfjs-dist legacy build, loaded lazily with `await import()`; `getTextContent` per page; lines by y-clustering (tolerance = half the median item height), segments by x-gap (> 1.5 median char width); tables from >= 2 consecutive lines with >= 2 segments whose segment starts align within 8 pt; `verbosity: 0`, `isEvalSupported: false`, `disableFontFace: true`; encrypted -> `error.encrypted` |
| `xlsx.ts` | fflate `unzipSync` + fast-xml-parser: `xl/workbook.xml` + rels for sheet order and names, `xl/sharedStrings.xml`, `xl/styles.xml` (cellXfs numFmtId, custom formats containing y/m/d), each sheet's cells with `r` refs; types `s`, `str`, `inlineStr`, `b`, `n`; date-formatted serials become ISO dates (1900 system); one page per sheet, one table = the used range, plus one line per row |
| `csv.ts` | BOM strip; UTF-8, falling back to `windows-1252` when the UTF-8 decode yields U+FFFD; delimiter sniffing on the first 5 lines (`;`, `,`, tab); RFC 4180 quotes; one page, one table, one line per row |
| `docx.ts` | fflate + fast-xml-parser on `word/document.xml`: `w:p` -> lines (runs joined, `w:tab` -> segment break), `w:tbl` -> tables; one page |
| `txt.ts` | decode like CSV; lines; segments split on 2+ spaces or a tab |
| `lang.ts` | DE/EN by stop-word counts per page (`der die und nicht mit für von ist` vs `the and of for with is to`); document lang = majority |
| `types.ts` | Zod schemas of 3.1 and 3.2 |

`documentRefFromIngest(doc: IngestedDocument): DocumentRef` returns
`{ id: name, title: name without extension, languages: [lang], fileName, contentType }` for the
host agent to attach to a document attribute, classification still to be supplied.

## 5. Extract (`packages/core/src/extract/`)

`extractFacts(bundle: DocumentBundle): FactSet`. Pure and synchronous.

### 5.1 Fact shapes

- **kv**: a line whose text matches `^(.{2,80}?)\s*:\s*(.+)$`, or a line with exactly two
  segments where the first has no digits. Label = left, raw = right.
- **sheet-pair**: any table row (XLSX, CSV, PDF, DOCX) with exactly two non-empty cells whose
  first cell has no digits, or a table whose first column ends in `:`.
- **header-cell**: a table whose first row is all non-empty text and has >= 2 columns; every
  data cell becomes a fact with label = header, `rowLabel` = first cell of the row when it has no
  digits. The same table is also emitted whole as a `TableFact`.

### 5.2 Value normalisation (`numbers.ts`, `units.ts`, `dates.ts`)

- Numbers: strip spaces and narrow no-break spaces; `1.234,56` -> `1234.56`; `1,234.56` ->
  `1234.56`; a single `,` -> decimal point; a single `.` followed by exactly three digits is a
  thousands separator when the page language is `de`, otherwise a decimal point; result is a
  decimal string that `isDecimalString` accepts; integers keep no fraction. `raw` is always kept.
- Units: a table in `units.ts` maps written forms to the KB unit vocabulary with an optional
  conversion factor applied through decimal.js: `Wh` -> `kWh` (/1000), `MWh` -> `kWh` (x1000),
  `g` -> `kg`, `t` -> `kg`, `mAh` -> `Ah`, `kW` -> `W`, `mΩ`/`mOhm` -> `Ohm`, `h`/`Std.` ->
  `min`, `°C`/`℃`/`degC` -> `degC`, `Zyklen`/`cycles` -> `cycles`, `Jahre`/`years` -> `years`,
  `Monate`/`months` -> `months`, `kg CO2e/kWh` and `kg CO2-Äq./kWh` -> `kgCO2e/kWh`, `t CO2e` ->
  `tCO2e`, `0,5C`/`0.5 C` -> `C`, `%`. A value with a unit suffix in the label
  (`Batteriemasse [kg]`, `Kapazität (Ah)`) takes that unit when the value has none.
- Dates: `dd.mm.yyyy`, `yyyy-mm-dd`, `d. <German month> yyyy`, `<English month> d, yyyy` ->
  ISO `YYYY-MM-DD`. Slash forms are ambiguous and stay text.
- Booleans: `ja/nein/yes/no/true/false`. URIs: `isUri`. Everything else is `text`.

## 6. Mapping (`packages/core/src/mapping/`)

### 6.1 Synonym index (`index.ts`)

Built once per process from `@passwerk/rules`:

| Source | Weight |
|---|---|
| `name.de`, `name.en` | 1.00 |
| `synonyms.de[]`, `synonyms.en[]` | 0.95 |
| template concept `preferredName` / `shortName` (de, en) of the attribute's leaf `templatePaths` | 0.80 |
| the attribute id split at camel-case boundaries | 0.70 |

### 6.2 Label normalisation (`normalize.ts`)

Lower-case; NFKD; `ä ö ü ß` -> `ae oe ue ss`; strip bracketed unit suffixes and a trailing `:`;
non-alphanumerics -> spaces; drop stop words (`der die das des dem den ein eine the a an of
in von im and und für for pro per`); collapse whitespace. Tokens are the split result.

### 6.3 Scoring (`scorer.ts`)

For a fact and an index entry:

- `label` = 1.0 on identical normalised strings; else the Dice coefficient of token sets;
  else, when all entry tokens are contained in the label tokens, 0.9 x (entry tokens / label
  tokens) (so `rezyklatanteil kobalt post consumer` still hits `rezyklatanteil kobalt` weakly).
  The entry score is `label x weight`; the attribute score is the best entry.
- `unit` factor: attribute and fact units equal or converted -> 1.0; attribute has a unit, fact
  none -> 0.85; fact has a unit, attribute none -> 0.6; incompatible -> 0.3; both none -> 1.0.
- `kind` factor: fact value parses as the attribute's `valueKind` (decimal, percentage in
  0..100, integer, date, boolean, uri) -> 1.0; fails -> 0.4; textual kinds (identifier, text,
  enum, multilingualText, document, composite) -> 1.0 (`n/a`).
- `confidence = round2(label x unit x kind)`; proposals below 0.3 are dropped. Proposals are
  sorted by confidence desc, then attributeId, then factId. Every fact may yield several
  proposals; the host agent decides.

`why` is rendered in DE and EN from `checks`, for example: "Beschriftung „Nennkapazität“
entspricht Synonym „nennkapazität“ (1.00); Einheit Ah passt; Wert ist eine Dezimalzahl."

### 6.4 Composites

Composite attributes are proposed only at their primary entry point, from a fixed structural
table in code (not domain data):

| attributeId | `path` | value |
|---|---|---|
| `manufacturerInformation` | `name.<lang>` | the fact text |
| `batteryChemistry` | `shortName` | the fact text |

All other composites are never proposed; their table facts are available to the host. A
decision with `path` deep-sets into the composite value object; a decision without `path` on a
composite attribute replaces the whole object.

### 6.5 applyMappings (`apply.ts`)

`newDraft(meta: PassportMeta): PassportDraft` creates an empty draft.
`applyMappings(draft, decisions): ApplyResult` is pure (returns a new draft), deterministic and
idempotent:

- Missing field -> `status: 'present'`, value, unit, source, confidence, recordedAt.
- Same value again (deep equal) -> sources merged (deduplicated), nothing else changes.
- Different value, no `override` -> the existing value stays, `status: 'conflict'`, the incoming
  source is appended, and the conflict is listed in `conflicts`.
- `override: true` -> incoming replaces, `status: 'present'`.
- Unknown attributeId or a value that fails the attribute's value schema -> the decision is
  rejected with a thrown `Error` naming the id (a host bug, not data).

## 7. Part 2 emitter (`emit/submodels/handoverDocumentation.ts`)

Wired into `buildEnvironment` between parts 1 and 3. Collects every present `document`-kind
attribute in KB order, then each `DocumentRef` in array order. Only refs **with**
`classification` are emitted; the submodel is omitted when none exist (so nothing changes for
drafts without classified documents). Per document:

- `DocumentClassifications[0]`: `ClassName` (MultiLanguageProperty from `className`),
  `ClassId`, `ClassificationSystem`.
- `DocumentIds[0]`: `DocumentDomainId` = `domainId ?? meta.passportId`, `DocumentIdentifier` =
  `id`, `DocumentIsPrimary` = `true`.
- `DocumentVersions[0]`: `Language[]` = `languages ?? Object.keys(title)` (fallback `['en']`),
  `Version` when present, `Title` = `title` in the first language of `languages` (else the
  attribute's KB name in DE and EN), `DigitalFiles[0]` = `File(contentType ??
  'application/octet-stream', uri ?? fileName)` only when `uri` or `fileName` exists;
  otherwise `DigitalFiles` is left out and L3 reports the gap.

A document without classification is not silently dropped: `validateSchema` (L1) emits a new
warning `PW-L1-DOCUMENT-UNCLASSIFIED` naming attribute and document id, so the verdict becomes
`valid_with_warnings` and the gap is visible. Recorded in ADR D-017.

## 8. Fixtures (`tools/fixtures/`, committed to `packages/core/test/fixtures/musterwerk/`)

A private workspace package `@passwerk/fixtures` (tsx, pdf-lib, fflate) with `generate.ts`
writes five deterministic files (fixed dates, no random ids, fixed zip mtimes) for the fictional
Musterwerk Batteriesysteme GmbH:

| File | Content | Exercises |
|---|---|---|
| `lieferantenerklaerung.pdf` | German supplier declaration: manufacturer block, chemistry, rated capacity, voltages, mass, recycled shares, warranty, dates | PDF kv lines and a table, decimal comma, units |
| `stueckliste.xlsx` | Sheet `Stammdaten` (two-column pairs), sheet `Stückliste` (BOM header table with `Kobalt rec. %` style columns), sheet `Leistung` (SoH, cycles, temperatures with `[Einheit]` headers) | XLSX shared strings, date serials, per-cell provenance |
| `energierechnung.pdf` | Energy bill in kWh and EUR | negative control: facts extracted, nothing proposed >= 0.7 |
| `datasheet-en.csv` | English technical data sheet with `;` delimiter and Windows-1252 bytes | CSV sniffing, encoding, EN synonyms |
| `handover-notes.docx` | Two paragraphs and one table listing documents (title, language, version) | DOCX lines and tables |

`expected.json` lists, per file, the expected `(attributeId, value, unit?, source)` triples.
`tools/fixtures/test/regenerate.test.ts` regenerates in memory and asserts byte equality with
the committed files (the D-009 pattern).

## 9. Tests (`packages/core/test/`)

- `ingest.<format>.test.ts`: one per reader over its fixture, asserting lines, tables, refs,
  language, and the error paths (truncated bytes, wrong extension, unsupported format). The
  encrypted-PDF path is covered by a minimal hand-written encrypted PDF committed under
  `test/fixtures/edge/`, since pdf-lib cannot encrypt.
- `extract.numbers|units|dates|facts.test.ts`: table-driven unit tests.
- `mapping.normalize|scorer|propose|apply.test.ts`: including idempotence and conflict cases.
- `mapping.recall.test.ts`: the definition-of-done metric from `expected.json`.
- `emit.handoverDocumentation.test.ts`, golden snapshots, new broken sample.
- `sovereignty.test.ts`: extended to run ingest, extract and mapping over every fixture.

## 10. Dependencies

`@passwerk/core`: `pdfjs-dist` 6.3.289 (2026-08-29), `fast-xml-parser` 5.11.1 (2026-08-27).
`@napi-rs/canvas` is an optional dependency of pdfjs-dist and is not installed
(`pnpm.neverBuiltDependencies` untouched; if pnpm complains, add it to
`pnpm.ignoredOptionalDependencies`).
`tools/fixtures`: `pdf-lib` 1.17.1, `tsx`, `fflate`.

## 11. ADRs

- **D-016**: ingest takes bytes, never paths; pdfjs-dist legacy build and hand-rolled
  OOXML readers over fflate and fast-xml-parser instead of SheetJS or exceljs; OCR out of scope.
- **D-017**: part 2 documents are emitted only with an explicit VDI 2770 classification
  supplied in the draft; no class table is bundled until a verified source exists; unclassified
  documents produce an L1 warning.
