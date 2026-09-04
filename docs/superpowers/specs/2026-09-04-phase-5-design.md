# Phase 5 design: gap report, obligations, explain, plausibility L4

Status: approved 2026-09-04. Branch `feat/core-gap-obligations-explain-l4`.
Scope: `docs/BUILD_PLAN.md` section 7, Phase 5. Everything lands in `@passwerk/core`;
`@passwerk/rules` gains ten rule definitions and no new code.

## 1. Goal and definition of done

| Deliverable | Done when |
|---|---|
| L4 plausibility | 24 `PW-PLAUS-*` rules implemented, `validate()` reports four layers, property tests green |
| `gapReport` | Per-attribute items, two completeness figures, submodel and data-owner groupings, DE/EN, snapshot per broken sample |
| `checkObligations` | Decision tree over `timeline.json` answers required / not required / insufficient input for seven battery types |
| `explainAttribute` / `explainRule` | Data joins over the KB with no composed legal claims |
| Range fix | The KB `range` is the single source for numeric bands; the three wide percentage attributes are representable |

`pnpm check` green, oracle parity unchanged at 16/16, `docs/CONFORMANCE.md` and
`tools/oracle/expected.json` regenerated if any golden verdict moves.

## 2. Principles carried in from earlier phases

- **Never invent a legal reference.** Every `legalRef` added in this phase is copied verbatim
  from a data point already transcribed in `kb/ec-datapoints.json`. Rules whose grounding is
  arithmetic rather than legal carry `legalRef: null` and say so in their message.
- **Knowledge base is data.** Severity, DE/EN title, message, fix hint, attribute list and
  legal reference live in `kb/rules.json`. Only the arithmetic lives in code.
- **No floats.** Every numeric comparison and every percentage goes through `decimal.js`.
- **Injected clock.** No `Date.now()`. Time comes from `options.asOf`, falling back to
  `draft.meta.createdAt`.
- **Browser-safe.** No `node:*` import at module top level in any new file (ADR D-006).
- **Deterministic.** Findings and report arrays sort by a stable key; re-runs are
  byte-identical.
- **Both languages.** Every user-facing string exists in `de` and `en`.

## 3. Module layout

```
packages/core/src/
  validate/
    plausibility.ts            L4 entry point
    plausibility/context.ts    RuleContext: typed accessors over a draft
    plausibility/checks.ts     CHECKS registry, one function per rule id
  gap/
    report.ts                  gapReport()
    action.ts                  DE/EN suggested-action text per status
  obligations/
    check.ts                   checkObligations()
    types.ts                   battery types, roles, result shape
  explain/
    explain.ts                 explainAttribute(), explainRule(), explain()
```

Dependency direction: `explain` and `obligations` read `@passwerk/rules` only.
`gap` reads `rules` plus the `model` types plus an optional `ValidationReport`.
`plausibility` reads `rules` plus `model`. Nothing new imports an emitter.

## 4. Finding and layer changes

`validate/finding.ts`:

```ts
export type Layer = 'L1' | 'L2' | 'L3' | 'L4';

export interface Finding {
  layer: Layer;
  ruleId: string;
  severity: Severity;
  path: string;
  templatePath?: string;
  attributeId?: string;
  message: { de: string; en: string };
  legalRef?: string;          // new: from kb/rules.json, null becomes undefined
  fixHint?: { de: string; en: string };  // new
}
```

`buildReport` reports `L4` alongside the other three. `ValidationReport.layers` becomes a
four-key record. `tools/oracle/src/expected.ts` reads `layers.L1/L2/L3` only and needs no
change; parity stays defined as `oracle.ok === (L2 errors === 0)` (ADR D-012).

`ValidateOptions` gains:

```ts
export interface ValidateOptions extends EmitOptions {
  /** ISO date used as "now" by L4. Default: draft.meta.createdAt. */
  asOf?: string;
  /** Skip L4. Default false. */
  skipPlausibility?: boolean;
}
```

## 5. L4 engine

### 5.1 Entry point

```ts
export function validatePlausibility(
  draft: PassportDraft,
  options?: { asOf?: string; l1Findings?: readonly Finding[] },
): { findings: Finding[] };
```

Called by `validate()` after L3, on the parsed draft, whenever L1 produced one. (L1 returns a
draft even when it raised `PW-L1-VALUE` findings; it withholds one only for a structural
failure or an unknown attribute id, and then no later layer runs at all.) L4 runs even when
L2 or L3 found errors: a supplier fixing an AAS-level problem still wants the domain problems
listed in the same pass.

`l1Findings` is how L4 learns which values L1 already rejected. See 5.2.

### 5.2 Rule context

```ts
export interface RuleContext {
  draft: PassportDraft;
  category: BatteryCategory;
  /** ISO date, injected. */
  asOf: string;
  /** presentValue: the value when status is present or conflict, else undefined. */
  value<T>(id: string): T | undefined;
  /** Decimal for decimal/percentage/integer attributes; undefined when absent or unparsable. */
  decimal(id: string): Decimal | undefined;
  /** ISO date string when present and well formed. */
  date(id: string): string | undefined;
  /** The attribute's recordedAt, for the dynamic-data rules. */
  recordedAt(id: string): string | undefined;
}
```

A check never re-validates types or bands. **The context hides every attribute named by an
L1 error finding**, so a value L1 already rejected is simply absent from a check's view. This
is what keeps L4 from reporting the same condition under a second rule id, and it lets a
check assume that any value it can see is well typed and inside its KB band.

When `l1Findings` is not passed — a caller invoking L4 directly on a draft that never went
through L1 — nothing is hidden, and PW-PLAUS-001 acts as the safety net for percentages.

### 5.3 Check registry

```ts
export interface RuleViolation {
  /** Draft path; defaults to `attributes.<attributeId>.value`. */
  path?: string;
  attributeId?: string;
  /** Named placeholder values for the DE/EN message in kb/rules.json. */
  params?: Record<string, string>;
}

export type RuleCheck = (ctx: RuleContext) => RuleViolation[];

export const CHECKS: Record<string, RuleCheck>;
```

Messages interpolate **named** placeholders as authored in `kb/rules.json`
(`{min}`, `{nom}`, `{max}`, `{value}`, ...), not a single `{detail}`. An unresolved
placeholder is a test failure, not a silent passthrough.

Severity, legal reference and fix hint come from the rule record, never from the check.

### 5.4 Determinism

`validatePlausibility` sorts findings by `(ruleId, path, attributeId)`. Each check returns
its violations in the order its attribute list is authored, so the sort is total.

### 5.5 Manifest test

`test/plausibility.manifest.test.ts` asserts:

- `Object.keys(CHECKS)` equals the `kb/rules.json` id set exactly, both directions.
- Every rule has non-empty `de` and `en` for title, message and fix hint.
- Every id in a rule's `attributes` array resolves through `getAttribute`.
- Every placeholder used by a check appears in the rule's message in both languages.

## 6. The ten new rules

All ten are appended to `packages/rules/kb/rules.json` and bump its `lastVerified`.
Legal references are copied verbatim from `kb/ec-datapoints.json`; the two rules whose
grounding is arithmetic carry `legalRef: null`.

| id | severity | check | placeholders | legalRef |
|---|---|---|---|---|
| PW-PLAUS-016 | warning | When `ratedCapacity`, `nominalVoltage` and `certifiedUsableBatteryEnergy` are all present, the declared energy is within 20 % of `ratedCapacity × nominalVoltage / 1000` kWh. Catches Wh/kWh and cell/pack confusion. | `{declared} {derived}` | `BR Annex XIII 1(g), 1(h)` |
| PW-PLAUS-017 | warning | `carbonFootprintShareRawMaterials + Manufacturing + Distribution + EndOfLife` is within 1 pp of 100, when at least three of the four are present. | `{sum}` | null (arithmetic; the four share attributes are `verify: true`) |
| PW-PLAUS-018 | error | Sum of `massKg` over `criticalRawMaterials` and `electrodeAndElectrolyteMaterials` does not exceed `batteryMass`. | `{sum} {mass}` | `BR Annex VI Part A (5), Annex XIII 1(b)` |
| PW-PLAUS-019 | error | Sum of `concentrationPercent` over `hazardousSubstances` does not exceed 100. | `{sum}` | `BR Annex VI Part A (8)` |
| PW-PLAUS-020 | error | Each remaining value is at most its original: `remainingCapacity ≤ ratedCapacity`, `remainingUsableBatteryEnergy ≤ certifiedUsableBatteryEnergy`, `remainingRoundTripEnergyEfficiency ≤ initialRoundTripEnergyEfficiency`. One violation per pair. | `{remaining} {original} {pair}` | `BR Annex XIII 4(a)` |
| PW-PLAUS-021 | warning | `roundTripEnergyEfficiencyAt50PercentCycleLife ≤ initialRoundTripEnergyEfficiency`. | `{later} {initial}` | `BR Annex XIII 1(n)` |
| PW-PLAUS-022 | warning | When `ratedCapacity`, `remainingCapacity` and `capacityFade` are all present, `capacityFade` is within 1 pp of `(1 - remaining/rated) * 100`. | `{declared} {derived}` | `BR Annex XIII 4(a)` |
| PW-PLAUS-023 | warning | `numberOfFullCycles ≤ expectedLifetimeCycles`. | `{cycles} {expected}` | `BR Annex XIII 1(j), 4(d)` |
| PW-PLAUS-024 | warning | When `carbonFootprintPerFunctionalUnit` is present, `carbonFootprintGeneralInformation.calculationMethods` and `carbonFootprintStudyLink` are present too. One violation per missing companion. | `{missing}` | `BR Annex XIII 1(c)` |
| PW-PLAUS-025 | warning | Sum of `timeInExtremeHighTemperature`, `timeInExtremeLowTemperature`, `timeChargingInExtremeHighTemperature`, `timeChargingInExtremeLowTemperature` (minutes) does not exceed the minutes between `dateOfPuttingIntoService` and `asOf`. Skipped when `dateOfPuttingIntoService` is absent. | `{minutes} {ageMinutes}` | `BR Annex XIII 4(d)` |

**PW-PLAUS-003 needs no amendment.** Its authored message already covers the full semantics
("is in the future, before 2000, or after the date of putting into service"); only the
implementation was missing. Nothing in its data changes.

**PW-PLAUS-013 is removed** (ADR D-023). It was authored to fire on a *missing* deferred
attribute, which is reassurance rather than a defect: implemented as written it would emit a
dozen warnings on every draft and no passport could ever reach `valid`. Its DE/EN text moves
to the gap report's `deferred` bucket, where the reassurance belongs. The catalogue therefore
holds **24** rules, not 25.

**PW-PLAUS-012 is scoped by template cardinality** (ADR D-023). The Commission marks the
state-of-health data points `not_displayed` for EV while IDTA 02035-5 declares the same blocks
with cardinality `One`, so an EV passport cannot satisfy both. The rule stays silent where the
template forces the element to be present and keeps its teeth where the element is
`ZeroToOne`.

Rule-to-layer boundary: the KB `range` is enforced once, by L1 (section 7). No PW-PLAUS rule
re-checks a band, because the context hides anything L1 rejected (section 5.2). PW-PLAUS-001
remains in the catalogue as the percentage safety net for callers who run L4 on a draft that
never went through L1; every other rule reasons about relationships between values, which is
the part a per-field schema cannot express.

Each check skips silently when any attribute it needs is absent: L4 never reports a missing
value, which is the gap report's job.

## 7. KB range as the single source for value bands

`model/values.ts` today maps `valueKind: 'percentage'` to a hardcoded 0–100 `PercentString`.
Three attributes are authored wider and are therefore unrepresentable:

| attribute | KB range | L1 allows today |
|---|---|---|
| `evolutionOfSelfDischarge` | −100 … 1000 | 0 … 100 |
| `internalResistanceIncrease` | 0 … 1000 | 0 … 100 |
| `carbonFootprintShareEndOfLife` | −100 … 100 | 0 … 100 |

Change:

```ts
/** The Zod schema for Field.value given the attribute. */
export function valueSchemaFor(attribute: Attribute): z.ZodType;

/** Kept for callers that have only a kind (no band applied). */
export function valueSchemaForKind(kind: ValueKind): z.ZodType;
```

`percentage` and `decimal` build a `DecimalString` refined by the attribute's `range`;
`percentage` with `range: null` keeps 0–100. `integer` gains the same treatment over
`IntegerString`. All other kinds are unchanged. `validate/schema.ts` passes the attribute it
already resolved. `PercentString` stays exported for the composite shapes in
`model/composites.ts`, which are per-field and not attribute-keyed.

This makes L1 the single enforcement point for numeric bands, so nothing outside a reviewed
band reaches the emitted AAS file, and no PW-PLAUS rule needs to restate the check. A test
asserts the three attributes above now accept their full authored range and that a value past
the band is still rejected.

## 8. Gap report

```ts
export type GapBucket = 'required' | 'conditional' | 'deferred' | 'optional';
export type GapStatus = 'present' | 'missing' | 'invalid' | 'conflict' | 'not_applicable';

export interface GapItem {
  attributeId: string;
  name: LangText;
  status: GapStatus;
  bucket: GapBucket;
  applicability: ApplicabilityStatus;   // effective status for the draft's category
  applicabilityText?: string;           // the Commission's wording when not plain mandatory
  part: number | null;
  submodelIdShort: string | null;
  legalRefs: string[];
  whoTypicallyHasIt: LangText;
  explanation: LangText;
  suggestedAction: LangText;
  sources: Provenance[];
  confidence?: number;
  /** Rule ids from the passed ValidationReport that name this attribute. */
  findings: string[];
  verify: boolean;
}

export interface Completeness {
  present: number;
  total: number;
  /** Decimal string with one fractional digit, e.g. "72.3". Never a float. */
  percent: string;
}

export interface GapReport {
  category: BatteryCategory;
  asOf: string;
  completeness: { mandatory: Completeness; overall: Completeness };
  items: GapItem[];
  bySubmodel: {
    part: number | null;
    submodelIdShort: string | null;
    completeness: Completeness;
    attributeIds: string[];
  }[];
  byDataOwner: { owner: LangText; attributeIds: string[] }[];
  isNotLegalAdvice: true;
  sources: string[];
}

export function gapReport(
  draft: PassportDraft,
  options?: { report?: ValidationReport; asOf?: string },
): GapReport;
```

Bucketing from the attribute's effective applicability for the draft's category:

| applicability | bucket | counts toward |
|---|---|---|
| `mandatory` | `required` | `completeness.mandatory` and `completeness.overall` |
| `conditional` | `conditional` | `completeness.overall` only |
| `optional` | `optional` | neither |
| `not_yet_applicable` | `deferred` | neither |
| `not_displayed` | `deferred` | neither |

`not_yet_applicable` is never reported as a gap (ADR D-008). Deferred items still appear in
`items[]` so a user can see why they are not being asked for them.

`status`, in this precedence order: `invalid` when the passed report has an **error** finding
naming the attribute (an invalid value is not a filled field); else `conflict` when the field
status is `conflict`; else `not_applicable` when the field says so; else `present` when the
field status is `present`; else `missing`. Only `present` counts toward completeness.

`suggestedAction` is generated DE/EN engine text from `gap/action.ts`, keyed on
`(status, bucket)` and interpolating `whoTypicallyHasIt` as a colon-led holder clause after a
full stop (the KB's `whoTypicallyHasIt` strings are themselves complete sentences, so they
cannot be spliced mid-clause). It is a workflow instruction, not a legal claim: "Request this
value. Typical data holder: The cell manufacturer holds this value." / "Diesen Wert anfordern.
Typischer Datenhalter: Der Zellhersteller hält diesen Wert."


Ordering: `items` by DIN longlist number (the KB's own order); `bySubmodel` by part with the
null-part bucket last; `byDataOwner` grouped on the **English** `whoTypicallyHasIt` string and
sorted by it, carrying the DE/EN pair as the group's `owner`. `percent` is computed with
`decimal.js` and rounded half-up to one decimal; `total: 0` yields `"0.0"`.

## 9. Obligations

```ts
export const BATTERY_TYPES = [
  'EV', 'LMT', 'INDUSTRIAL', 'STATIONARY_BATTERY_ENERGY_STORAGE',
  'PORTABLE', 'SLI', 'OTHER',
] as const;
export type BatteryType = (typeof BATTERY_TYPES)[number];

export const ROLES = [
  'manufacturer', 'authorised_representative', 'importer',
  'distributor', 'fulfilment_service_provider', 'other',
] as const;
export type Role = (typeof ROLES)[number];

export interface ObligationInput {
  batteryType: BatteryType;
  /** Battery energy in kWh as a decimal string. Decides the industrial 2 kWh threshold. */
  energyKwh?: string;
  /** ISO date the battery is or was placed on the market / put into service. */
  placedOnMarketDate?: string;
  role: Role;
  /** ISO date used as "now". Falls back to placedOnMarketDate; if both are absent the
   *  verdict is insufficient_input, because no date means no answer about a dated duty. */
  asOf?: string;
}

export type ObligationVerdict = 'required' | 'not_required' | 'insufficient_input';

export interface ObligationResult {
  verdict: ObligationVerdict;
  reason: LangText;
  /** Which input would settle an insufficient_input verdict. */
  missingInput: string[];
  /** The passport category to model against, when one applies. */
  category: BatteryCategory | null;
  mandatoryAttributes: string[];
  conditionalAttributes: string[];
  deferredAttributes: string[];
  timeline: {
    id: string;
    date: string;
    dateRule: 'fixed' | 'latest_of';
    alternative?: string;
    title: LangText;
    legalRef: string;
    status: TimelineStatus;
    note?: LangText;
    /** True when the event's date is on or before asOf. */
    inEffect: boolean;
    verify: boolean;
  }[];
  roleGuidance: LangText;
  sources: string[];
  isNotLegalAdvice: true;
}

export function checkObligations(input: ObligationInput): ObligationResult;
```

Decision tree, evaluated in order:

1. `PORTABLE`, `SLI`, `OTHER` → `not_required`. Reason cites Article 77(1), which names LMT
   batteries, industrial batteries above 2 kWh and electric vehicle batteries.
2. `EV` → category `EV`. `LMT` → category `LMT`.
3. `INDUSTRIAL` and `STATIONARY_BATTERY_ENERGY_STORAGE` → category `INDUSTRIAL_GT_2KWH`
   when `energyKwh > 2`; `not_required` when `energyKwh ≤ 2`; `insufficient_input` with
   `missingInput: ['energyKwh']` when absent. Stationary storage carries an explicit DE/EN
   note that it is treated as an industrial battery for the attribute set.
4. Date gate: when the effective date (`placedOnMarketDate ?? asOf`) is before the
   `battery-passport` timeline event's date, the verdict is `not_required` with a reason
   naming that date. Neither the date nor the event id is hardcoded; both are read from
   `timeline.json`.
5. `insufficient_input` when neither `placedOnMarketDate` nor `asOf` is given.

Citation policy: every claim cites `BR Article 77(1), Annex XIII`, taken from the
`battery-passport` event's `legalRef`. No Article 3 definition numbers are cited, because the
KB does not contain them and this project does not guess legal references. The type labels
themselves are DE/EN engine text.

`timeline[]` is the events for the resolved category, `verify` carried through unchanged so a
caller can see which entries are unconfirmed. `roleGuidance` is DE/EN engine text keyed on
`role`, describing who is responsible for making the passport available, and states plainly
that it is not legal advice.

## 10. Explain

```ts
export interface AttributeExplanation {
  kind: 'attribute';
  id: string;
  name: LangText;
  definition: string;            // DIN longlist row definition, verbatim
  explanation: LangText;
  synonyms: { de: string[]; en: string[] };
  whoTypicallyHasIt: LangText;
  valueKind: ValueKind;
  unit: string | null;
  range: { min: number | null; max: number | null } | null;
  applicability: Record<BatteryCategory, ApplicabilityCell>;
  applicabilitySource: 'ec' | 'override';
  legalRefs: string[];
  dynamic: boolean;
  template: {
    path: string;
    part: number;
    submodelIdShort: string;
    idShort: string | null;
    semanticId: string | null;
    cardinality: Cardinality;
    valueType: string | null;
    exampleValue: string | null;
  }[];
  relatedRules: string[];
  verify: boolean;
  lastVerified: string;
  isNotLegalAdvice: true;
}

export interface RuleExplanation {
  kind: 'rule';
  id: string;
  severity: 'error' | 'warning';
  title: LangText;
  message: LangText;
  fixHint: LangText;
  attributes: { id: string; name: LangText }[];
  legalRef: string | null;
  isNotLegalAdvice: true;
}

export function explainAttribute(id: string): AttributeExplanation | undefined;
export function explainRule(id: string): RuleExplanation | undefined;
export function explain(id: string): AttributeExplanation | RuleExplanation | undefined;
```

`explain` dispatches on the `PW-` prefix. `explainRule` also answers for the engine rule ids
in `validate/messages.ts` (`PW-L1-*`, `PW-L2-*`, `PW-L3-*`), returning their DE/EN message
with `legalRef: null` and an empty attribute list, so an agent can look up any finding it
receives. Every field is copied from the knowledge base; no sentence is composed.

## 11. Testing

TDD per feature: the failing test against the golden sample first, then the implementation
(`superpowers:test-driven-development`, required by CLAUDE.md for `core`).

New test files:

| File | Covers |
|---|---|
| `test/plausibility.manifest.test.ts` | registry ↔ `rules.json` 1:1, DE/EN completeness, placeholder coverage |
| `test/plausibility.rules.test.ts` | one focused case per rule id, positive and negative |
| `test/plausibility.property.test.ts` | fast-check invariants, fixed seed |
| `test/gap.test.ts` | bucketing, completeness arithmetic, groupings, DE/EN |
| `test/gap.snapshot.test.ts` | a committed snapshot per broken sample |
| `test/obligations.test.ts` | the decision tree, every battery type and both sides of the threshold and the date gate |
| `test/explain.test.ts` | joins, unknown ids, `PW-L*` passthrough |
| `test/model.values.test.ts` (extend) | the three wide attributes are representable; bands still bite |

Property-test invariants (`fast-check`, seed fixed in the test file so runs are reproducible):

1. No check fires on a draft with no attributes.
2. No check throws on any draft whose values pass L1.
3. L4 never reports an attribute that L1 rejected: for any draft, no finding's `attributeId`
   appears in the L1 error set.
4. `validatePlausibility` is idempotent and order-independent: shuffling the attribute
   insertion order does not change the finding list.
5. `gapReport` totals are consistent: `present ≤ total`, and the bucket partition covers
   every KB attribute exactly once.

`fast-check` is added as a **root devDependency**, pinned to a release at least three days
old (pnpm `minimumReleaseAge`).

Sovereignty: `test/sovereignty.test.ts` is extended to exercise `validatePlausibility`,
`gapReport`, `checkObligations`, `explainAttribute` and `explainRule` over every golden
sample, so the new surface is covered by the zero-network proof (ADR D-013).

## 12. Fallout to handle inside this phase

- `pnpm oracle` regenerates `tools/oracle/expected.json` and `docs/CONFORMANCE.md` if any
  golden sample's overall verdict moves once L4 runs. Parity itself is L2-only and stays
  16/16.
- Golden samples that trip a new rule are corrected in the sample data, not by weakening the
  rule; a sample that is *meant* to trip a rule gets a new broken-sample entry instead.
- `src/index.ts` re-exports the four new areas.
- `AGENTS.md` status section updated to "Phase 5 done", next phase named.

## 13. ADRs to write

- **D-020**: L4 is a full verdict layer; rules stay data, checks are a code registry keyed by
  rule id, with a 1:1 manifest test.
- **D-021**: the knowledge-base `range` is the single source for numeric bands; L1 derives
  its schema from the attribute rather than the value kind.
- **D-022**: `checkObligations` accepts a wider battery-type vocabulary than the three
  passport categories so it can answer "no passport needed", and cites only Article 77(1),
  because the KB holds no Article 3 definitions and this project does not guess references.
- **D-023**: where IDTA and the Commission disagree, the template wins the emitted file and
  the guidance wins the advice; PW-PLAUS-013 is removed as misfiled.

## 14. Out of scope

MCP tool wrappers for these four functions (Phase 6), the HTML gap sheet (Phase 7), carrier
and QR (Phase 7), and any change to the emitters.
