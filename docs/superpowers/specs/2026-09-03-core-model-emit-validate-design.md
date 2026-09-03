# Phase 2 design: core model, AAS emitters, validation L1 to L3

Date: 2026-09-03. Status: approved by the owner in session. Branch: `feat/core-model-emit-validate`.

This spec implements `docs/BUILD_PLAN.md` sections 2.2 to 2.4 and Phase 2 (section 7), as
amended by ADRs D-003 to D-006 and D-008. Where this spec and the plan sketch differ (the
attribute-keyed model instead of hand-typed nested objects), a new ADR records the choice.

## 1. Goal and definition of done

`@passwerk/core` gains:

1. the neutral `PassportDraft` model with `Field<T>` provenance (L1, Zod 4),
2. emitters for AAS JSON and AASX covering the three MVP submodels (IDTA 02035-1 Nameplate,
   02035-3 Carbon Footprint, 02035-6 Material Composition),
3. L2 (AAS metamodel verification through `@aas-core-works/aas-core3.0-typescript`) and L3
   (template conformance diff driven by the bundled catalogue),
4. six golden samples and the tests that prove the pipeline.

Definition of done: `validate(emit(sample))` is `valid` for `ev-valid`, `lmt-valid` and
`industrial-valid`; each broken sample yields its documented finding ids; output is
byte-identical across runs; `pnpm check` is green.

Out of scope for this phase: L4 plausibility rules, the gap report, emitters for parts 2, 4,
5 and 7, flat JSON and HTML outputs, ingest, extraction and mapping.

## 2. Package layout

```
packages/core/src/
  index.ts                 public API
  model/
    provenance.ts          Provenance schema
    field.ts               Field<T> factory, FieldStatus
    values.ts              value schema per KB valueKind (decimal, date, enum, document, ...)
    composites.ts          explicit Zod shapes for composite attributes
    attributeIds.ts        AttributeId union derived from @passwerk/rules at module load
    passport.ts            PassportDraft schema, meta, category
  emit/
    ids.ts                 identifier scheme (shell, asset, submodel ids)
    environment.ts         builds the aas-core Environment from a draft
    elements.ts            catalogue-path -> SubmodelElement builders (Property, MLP, SMC, SML, File)
    submodels/
      nameplate.ts         part 1
      carbonFootprint.ts   part 3
      materialComposition.ts  part 6
    aasJson.ts             emitAasJson(): canonical JSON string + re-validation
    aasx.ts                emitAasx(): OPC package with XML inside + re-validation
    canonical.ts           key-sorted, deterministic JSON stringify
  validate/
    finding.ts             Finding, ValidationReport, verdict computation
    schema.ts              L1
    aas.ts                 L2
    template.ts            L3
    index.ts               validate(draft) orchestrator
  samples/
    ev-valid.json, lmt-valid.json, industrial-valid.json
    ev-missing-material-identifier.json, lmt-wrong-date-format.json,
    industrial-bad-decimal.json
    index.ts               typed accessor + expected findings per broken sample
packages/core/test/        one test file per module, snapshots under test/__snapshots__
```

Runtime dependencies added to `@passwerk/core`: `zod` 4.5.4, `decimal.js` 10.6.0,
`@aas-core-works/aas-core3.0-typescript` 1.0.5, `fflate` 0.8.3. All were published more than
three days before 2026-09-03. No `node:*` imports in `src` (D-006).

## 3. Model (L1)

### 3.1 Provenance and Field

```ts
Provenance = { file: string, page?: number, cell?: string, note?: string }
FieldStatus = 'present' | 'missing' | 'conflict' | 'not_applicable'
Field<T> = {
  value?: T,
  unit?: string,
  source: Provenance[]          // default []
  confidence?: number           // 0..1
  status: FieldStatus           // default 'missing'
}
```

Invariant enforced by the schema: `status === 'present'` requires `value` to be set, and
`value` set requires `status` in `present` or `conflict`.

### 3.2 PassportDraft

```ts
PassportDraft = {
  meta: {
    schemaVersion: '1.0',
    category: 'EV' | 'LMT' | 'INDUSTRIAL_GT_2KWH',
    createdAt: string,           // ISO-8601 date-time, injected by the caller
    passportId: string,          // URI, the battery passport identifier (DIN 6.1.2.1)
  },
  attributes: Partial<Record<AttributeId, Field<Value>>>,
}
```

`AttributeId` is the union of the 93 ids in `@passwerk/rules` `attributes`, computed once at
module load. Any key that is not a known id is an L1 error (`PW-L1-UNKNOWN-ATTRIBUTE`).

`passportId` is kept in `meta`, and the emitters also write it to the `batteryPassportIdentifier`
attribute element. If the draft carries `attributes.batteryPassportIdentifier` with a different
value, L1 reports `PW-L1-PASSPORT-ID-MISMATCH`.

### 3.3 Value schema per valueKind

The KB `valueKind` selects the Zod schema for `Field.value`:

| valueKind | value schema |
|---|---|
| identifier, text, uri | `string`, non-empty (uri additionally parses as URL or URN) |
| multilingualText | `{ [lang: string]: string }` with at least one entry |
| decimal, percentage | `string` that `decimal.js` parses as finite; percentage additionally 0..100 |
| integer | `string` parsed as finite integer |
| date | `YYYY-MM-DD` |
| dateTime | ISO-8601 date-time with offset |
| boolean | `boolean` |
| enum | `string`; where the template fixes a code list (e.g. `LifeCycleStage`), validated against it |
| document | `{ id: string, title?: string, uri?: string }[]` with at least one entry |
| graphic | `{ fileName: string, contentType: string, bytesBase64?: string, uri?: string }` |
| composite | see 3.4 |

Numbers are never JS `number` in the draft. They are decimal strings so `decimal.js` can
validate and emitters can print them unchanged.

### 3.4 Composite attributes (MVP submodels)

| attributeId | shape |
|---|---|
| manufacturerInformation | `{ name: {[lang]: string}, identifier: string, address?: { street?, zipCode?, cityTown?, nationalCode?, email?, phone?, website? } }`. `AddressInformation` in the IDTA template is a drop-in collection (`smt-dropin-use`) with no children defined; the children belong to the ZVEI Contact Information template, which is not bundled. Address children are therefore emitted by idShort only, without semanticId, until that template is pinned (owner decision, see section 8). |
| batteryChemistry | `{ shortName: string, clearName: string }` |
| criticalRawMaterials | `{ name: string, identifier: string, massKg?: decimalString, location?: { componentName?, componentId? } }[]`; `isCriticalRawMaterial` is emitted as `true` |
| electrodeAndElectrolyteMaterials | same element shape; emitted with `isCriticalRawMaterial: false` unless the same identifier is also listed under critical raw materials |
| hazardousSubstances | `{ name: string, identifier: string, class?: string, concentrationPercent?: decimalString, location?: { componentName?, componentId? }, impacts?: string[] }[]` |

`substanceImpacts` (text) is folded into each hazardous substance's `impacts` when emitting; if
only the flat attribute is present, the emitter attaches it to every substance and L1 warns
(`PW-L1-IMPACT-UNASSIGNED`).

Composite shapes for the other four submodels are added in the phase that implements their
emitters. Until then their attributes accept the generic value for their `valueKind`, and
composite ones accept `unknown` with an L1 warning `PW-L1-COMPOSITE-UNMODELLED`.

## 4. Emit

### 4.1 Identifier scheme

| AAS element | id |
|---|---|
| AssetAdministrationShell | `${passportId}/aas` |
| AssetInformation.globalAssetId | `passportId` |
| Submodel (per part) | `${passportId}/submodels/${templateIdShort}` |

`EmitOptions.ids` may override all three. The scheme is recorded in the new ADR.

### 4.2 Environment construction

`buildEnvironment(draft, options)` returns an aas-core `Environment` with one shell
(`assetKind: Instance`) and one submodel per MVP part for which at least one mapped attribute
has `status: present`. Each submodel copies `idShort`, `semanticId`, `supplementalSemanticIds`
and `administration` (version, revision, templateId) from the bundled template and sets
`kind: Instance`.

Elements are created only through `elements.ts` builders that take a catalogue path and read
`idShort`, `modelType`, `semanticId`, `supplementalSemanticIds`, `valueType` and, for lists,
`typeValueListElement`, `valueTypeListElement`, `semanticIdListElement` from the catalogue.
No semanticId string appears in code. Template qualifiers (`SMT/Cardinality`) are not copied
to instances.

Per-submodel emitters map attributes to catalogue paths:

- Nameplate (part 1): the ten scalar attributes, `Markings` from the graphic and text
  attributes (one `Markings__NN__` SMC per marking), `EUDeclarationOfConformity` and
  `ResultsOfTestReportsProvingCompliance` lists from the document attributes.
- Carbon Footprint (part 3): one `ProductCarbonFootprint` SMC from the decimal, enum and
  document attributes; the four life-cycle share attributes fill `LifeCyclePhases`.
- Material Composition (part 6): `BatteryChemistry` SMC; `BatteryMaterials` list merged from
  `criticalRawMaterials` and `electrodeAndElectrolyteMaterials`; `HazardousSubstances` list.

### 4.3 Outputs

```ts
emitAasJson(draft, options?): EmitResult<string>
emitAasx(draft, options?): EmitResult<Uint8Array>
EmitResult<T> = { output: T, environment: Environment, verdict, findings: Finding[] }
```

- AAS JSON: aas-core `jsonization.toJsonable(environment)` printed by `canonical.ts`
  (recursively sorted keys, two-space indent, trailing newline).
- AASX: an OPC zip with `[Content_Types].xml`, `_rels/.rels`, `aasx/aasx-origin`,
  `aasx/_rels/aasx-origin.rels` and `aasx/passwerk/passwerk.aas.json` (the same canonical
  JSON). Entry order and timestamps are fixed (1980-01-01) so bytes are stable.
  Amendment after approval: the TypeScript AAS SDK ships no XML serialiser, and the official
  test engine dispatches AASX parts by file extension and accepts `.json` parts, so the
  package carries JSON. XML packaging would require an XML serialiser verified against the
  AAS XSD, which is not bundled. Recorded in ADR D-011.
- Both re-run L1, L2 and L3 on their own output before returning. For AASX the JSON part is
  unzipped and parsed back first. `verdict` is never derived from the draft alone.

## 5. Validation

### 5.1 Finding and report

```ts
Finding = {
  layer: 'L1' | 'L2' | 'L3',
  ruleId: string,               // PW-L1-*, PW-L2-AAS-CORE, PW-L3-*
  severity: 'error' | 'warning',
  path: string,                 // draft path (L1) or submodel idShort path (L2, L3)
  templatePath?: string,        // catalogue path when known
  attributeId?: string,
  message: { de: string, en: string },
}
ValidationReport = {
  verdict: 'valid' | 'valid_with_warnings' | 'invalid',
  findings: Finding[],
  layers: { L1: LayerResult, L2: LayerResult, L3: LayerResult },
}
LayerResult = { ran: boolean, errors: number, warnings: number }
```

Verdict: `invalid` if any error, else `valid_with_warnings` if any warning, else `valid`.
Messages exist in German and English; texts live in `validate/messages.ts` keyed by ruleId.

### 5.2 L1 schema

`validateSchema(draft)` runs `PassportDraft.safeParse`, then per attribute the value schema
for its `valueKind`, then the cross-checks from section 3. Zod issues become findings with the
issue path.

### 5.3 L2 AAS metamodel

`validateAas(environmentJson)` parses with aas-core `jsonization.environmentFromJsonable`
(deserialisation errors are findings) and runs `verification.verifyEnvironment`. Each
verification error becomes `PW-L2-AAS-CORE` with the library's path and message; the German
text is a fixed prefix plus the original message.

### 5.4 L3 template conformance

`validateTemplate(environmentJson)` for each submodel:

1. Resolve the template by the submodel's `semanticId` against `templates[].submodelSemanticId`.
   Unknown: `PW-L3-UNKNOWN-SUBMODEL` (error).
2. Walk the catalogue elements of that part in path order. For each catalogue path, collect the
   instance elements at the equivalent position (list children are matched positionally by
   `semanticId` or, when the template list has none, by type).
3. Checks, each a rule id:
   - `PW-L3-MISSING` cardinality `One`/`OneToMany` but no instance element (error);
   - `PW-L3-TOO-MANY` more than `max` instances (error). Not applied to item templates
     inside a `SubmodelElementList`: the IDTA templates qualify list items inconsistently
     ("One" on `3/.../LifeCyclePhase`, "OneToMany" on `1/Markings/Markings__00__`), so only
     the minimum and the list's own cardinality are enforced there;
   - `PW-L3-MODEL-TYPE` instance `modelType` differs (error);
   - `PW-L3-SEMANTIC-ID` instance `semanticId` first key differs (error);
   - `PW-L3-VALUE-TYPE` Property `valueType` differs (error);
   - `PW-L3-LIST-TYPE` list `typeValueListElement`/`valueTypeListElement` differ (error);
   - `PW-L3-UNKNOWN-ELEMENT` instance idShort not in the template (warning);
   - `PW-L3-SUBMODEL-ID-SHORT` submodel idShort differs from the template (warning).
   Cardinalities with `raw === null` are treated as `ZeroToMany`. Collections whose template
   element carries the `smt-dropin-use` supplemental semanticId are opaque: their children are
   not checked and raise no `PW-L3-UNKNOWN-ELEMENT`.
4. Category applicability is not an L3 concern (it belongs to L4 and the gap report).

### 5.5 Orchestrator

`validate(draft, options?)`: L1; if L1 has errors, stop with `L2.ran = L3.ran = false`.
Otherwise emit the AAS JSON in memory and run L2 and L3 on it. Returns the report and the
emitted JSON string so callers can keep it.

## 6. Golden samples and tests

Six drafts under `src/samples/`, all values fictional (company names like
"Musterwerk Batteriesysteme GmbH", a `$comment` says so):

| name | category | intent |
|---|---|---|
| ev-valid | EV | full nameplate, material composition, carbon footprint |
| lmt-valid | LMT | nameplate and materials, no carbon footprint submodel |
| industrial-valid | INDUSTRIAL_GT_2KWH | full set, several markings, several hazardous substances |
| ev-missing-material-identifier | EV | one battery material without `identifier`: L1 error, and if forced through emit, `PW-L3-MISSING` on `BatteryMaterialIdentifier` |
| lmt-wrong-date-format | LMT | `manufacturingDate` `01.03.2026`: L1 error `PW-L1-VALUE` |
| industrial-bad-decimal | INDUSTRIAL_GT_2KWH | `carbonFootprintPerFunctionalUnit` `"61,2"`: L1 error `PW-L1-VALUE` |

`samples/index.ts` exports each draft plus `expectedFindings: string[]` for broken ones.

Tests (Vitest, TDD per module):

- `model.test.ts`: Field invariants, value schemas per kind, unknown attribute id, composites.
- `emit.aasJson.test.ts`: snapshot per valid sample; semanticIds in output all exist in the
  catalogue; `passportId` appears as asset id and `URIOfTheProduct`.
- `emit.aasx.test.ts`: zip entry list and rels match the expected layout; XML round-trips
  through aas-core; two emits are byte-identical.
- `validate.aas.test.ts`: a hand-broken environment (invalid `valueType`) fails L2.
- `validate.template.test.ts`: removing a mandatory element, changing a semanticId, adding a
  stray element each produce exactly the expected rule id.
- `golden.test.ts`: the definition of done from section 1.
- `browser-safety.test.ts`: `src` contains no `node:` import specifiers.

## 7. Determinism

Callers inject `createdAt`; no `Date.now()` in `src`. JSON output is canonical (section 4.3).
AASX entries have fixed timestamps and order. Element ordering follows catalogue path order.
List children keep draft order.

## 8. Decisions to record (ADR)

- D-010: attribute-keyed `PassportDraft` (KB grain) instead of hand-typed nested objects;
  composites get explicit shapes; identifier scheme; numbers are decimal strings.
- D-011: `@aas-core-works/aas-core3.0-typescript` as the AAS engine; AASX carries JSON (no
  XML serialiser in the SDK); the SDK's ESM build has extensionless relative imports that
  plain Node cannot resolve, fixed with a committed pnpm patch; instances never set idShort
  on direct children of a SubmodelElementList (constraint AASd-120, which the official
  templates themselves violate because they are templates).
- Open question for the owner (not blocking): pin the ZVEI / IDTA Contact Information template
  in `@passwerk/rules` so `AddressInformation` children get official semanticIds. Until then
  they are emitted without semanticId and flagged `verify` in the emitter's source comment.
