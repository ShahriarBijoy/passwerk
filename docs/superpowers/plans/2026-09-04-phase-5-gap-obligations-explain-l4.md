# Phase 5 Implementation Plan: gap report, obligations, explain, plausibility L4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@passwerk/core` a fourth validation layer (domain plausibility), a gap report that tells a supplier what is missing and who has it, an obligations decision tree, and an attribute/rule explainer.

**Architecture:** `kb/rules.json` stays reviewable data (severity, DE/EN texts, attribute list, legal reference); the arithmetic lives in a `CHECKS` registry in code keyed by rule id, with a manifest test asserting the two key sets are 1:1. `validate()` runs L1→L4 and L4's context hides any attribute L1 already rejected, so a bad value is reported once. Gap, obligations and explain are pure joins over `@passwerk/rules` plus an optional `ValidationReport`.

**Tech Stack:** TypeScript 5.9 strict ESM (NodeNext, `.js` extensions in relative imports), Zod 4, decimal.js 10.6, Vitest 4, Biome 2, fast-check 4.9.0 (new root devDependency).

**Spec:** `docs/superpowers/specs/2026-09-04-phase-5-design.md`

## Global Constraints

- Node >= 22.13, pnpm 10. Run `pnpm check` (lint + typecheck + test) before every commit.
- `core` is browser-safe: **no `node:*` import at any module top level** (ADR D-006). `test/browser-safety.test.ts` enforces this.
- **No network, no LLM call** in `core` (D-002, D-013).
- Quantities and percentages use `decimal.js`, never JS floats. Dates are ISO-8601 strings and compare lexicographically — never construct a `Date` for ordering.
- **Injected clock.** No `Date.now()`, no `new Date()` without an argument. Time comes from `options.asOf ?? draft.meta.createdAt`.
- Every user-facing string exists in **both `de` and `en`**.
- Deterministic output: sorted arrays, stable keys, byte-identical re-runs.
- **Never invent** a legal reference, semanticId or article number. Every `legalRef` added here is copied verbatim from a data point already in `packages/rules/kb/ec-datapoints.json`. Rules grounded in arithmetic carry `legalRef: null`.
- Conventional Commits. Commit as `shahriarbijoy <shahriarbijoy@gmail.com>` (use `git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit`). End every commit message with `Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V`.
- Branch: `feat/core-gap-obligations-explain-l4` (already created, spec already committed as `7d44069`).
- Tests import workspace packages **by name** (`@passwerk/core`, `@passwerk/rules`); vitest aliases them to `src/`, so no build is needed before `pnpm test`.

## File Structure

| Path | Responsibility |
|---|---|
| `packages/core/src/validate/finding.ts` | **Modify.** `Layer` gains `'L4'`; `Finding` gains `legalRef?`, `fixHint?`; `buildReport` reports four layers. |
| `packages/core/src/validate/index.ts` | **Modify.** `ValidateOptions` gains `asOf?`, `skipPlausibility?`; `validate()` runs L4. |
| `packages/core/src/model/values.ts` | **Modify.** `valueSchemaFor(attribute)` derives numeric bands from the KB `range`; `valueSchemaForKind(kind)` kept for band-less callers. |
| `packages/core/src/validate/schema.ts` | **Modify.** Passes the resolved `Attribute` to `valueSchemaFor`. |
| `packages/core/src/validate/plausibility.ts` | **Create.** L4 entry point: interpolation, finding construction, deterministic ordering. |
| `packages/core/src/validate/plausibility/context.ts` | **Create.** `RuleContext` with typed accessors; hides attributes L1 rejected. |
| `packages/core/src/validate/plausibility/checks.ts` | **Create.** `CHECKS` registry, one function per rule id. |
| `packages/rules/kb/rules.json` | **Modify.** Remove PW-PLAUS-013, add PW-PLAUS-016…025, bump `lastVerified`. |
| `packages/core/src/gap/report.ts` | **Create.** `gapReport()`. |
| `packages/core/src/gap/action.ts` | **Create.** DE/EN suggested-action text keyed on `(status, bucket)`. |
| `packages/core/src/obligations/types.ts` | **Create.** Battery types, roles, input and result shapes. |
| `packages/core/src/obligations/check.ts` | **Create.** `checkObligations()`. |
| `packages/core/src/explain/explain.ts` | **Create.** `explainAttribute()`, `explainRule()`, `explain()`. |
| `packages/core/src/index.ts` | **Modify.** Re-export the four new areas. |
| `packages/core/src/samples/*.json` | **Modify.** Corrected where a rule legitimately bites (Task 8). |
| `packages/core/test/*.test.ts` | **Create/modify.** One file per area; see Task list. |
| `docs/DECISIONS.md` | **Modify.** ADR D-023 (Task 5). |
| `AGENTS.md` | **Modify.** Status section (Task 13). |

---

### Task 1: L4 plumbing

Adds the fourth layer with an empty rule set, so every later task has somewhere to plug in. Nothing changes behaviourally yet.

**Files:**
- Modify: `packages/core/src/validate/finding.ts`
- Modify: `packages/core/src/validate/index.ts`
- Create: `packages/core/src/validate/plausibility.ts`
- Test: `packages/core/test/validate.test.ts` (modify), `packages/core/test/plausibility.test.ts` (create)

**Interfaces:**
- Consumes: `PassportDraft` from `../model/passport.js`; `validateSchema` from `./schema.js`.
- Produces: `Layer = 'L1'|'L2'|'L3'|'L4'`; `Finding.legalRef?: string`; `Finding.fixHint?: {de,en}`; `validatePlausibility(draft, options?): { findings: Finding[] }`; `ValidateOptions.asOf?: string`; `ValidateOptions.skipPlausibility?: boolean`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/plausibility.test.ts`:

```ts
import { samples, validate, validatePlausibility } from '@passwerk/core';
import { PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('L4 plumbing', () => {
  it('reports four layers and stays valid for the valid samples', () => {
    const r = validate(samples['lmt-valid']);
    expect(r.layers.L4).toEqual({ ran: true, errors: 0, warnings: 0 });
  });

  it('does not run L4 when asked to skip it', () => {
    const r = validate(samples['lmt-valid'], { skipPlausibility: true });
    expect(r.layers.L4.ran).toBe(false);
  });

  it('returns no findings for a draft with no attributes', () => {
    const draft = PassportDraft.parse({
      meta: {
        schemaVersion: '1.0',
        category: 'EV',
        createdAt: '2026-09-03T12:00:00Z',
        passportId: 'https://example.org/bp/1',
      },
      attributes: {},
    });
    expect(validatePlausibility(draft).findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/plausibility.test.ts`
Expected: FAIL — `validatePlausibility` is not exported, `r.layers.L4` is undefined.

- [ ] **Step 3: Extend `Finding` and `buildReport`**

In `packages/core/src/validate/finding.ts` change the `Layer` union and the `Finding` interface, and add `L4` to `buildReport`:

```ts
export type Layer = 'L1' | 'L2' | 'L3' | 'L4';
```

Add to `Finding`, after `message`:

```ts
  /** Legal reference from the knowledge base. Never composed by the engine. */
  legalRef?: string;
  /** DE/EN hint on how to fix the finding, from the knowledge base. */
  fixHint?: { de: string; en: string };
```

And in `buildReport`, add the fourth entry to the `layers` object:

```ts
      L4: layerResult(findings, 'L4', ran.L4),
```

- [ ] **Step 4: Create the L4 entry point**

Create `packages/core/src/validate/plausibility.ts`:

```ts
import { getRule, type PlausibilityRule } from '@passwerk/rules';
import type { PassportDraft } from '../model/passport.js';
import { createContext } from './plausibility/context.js';
import { CHECKS, type RuleViolation } from './plausibility/checks.js';
import type { Finding } from './finding.js';

export interface PlausibilityOptions {
  /** ISO date-time used as "now". Default: draft.meta.createdAt. */
  asOf?: string;
  /** L1's findings. Attributes L1 rejected are hidden from every check. */
  l1Findings?: readonly Finding[];
}

/** Replace the named placeholders a rule authored, e.g. "{min} V". */
function interpolate(text: string, params: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.hasOwn(params, key) ? params[key] : whole,
  );
}

function toFinding(rule: PlausibilityRule, violation: RuleViolation): Finding {
  const params = violation.params ?? {};
  return {
    layer: 'L4',
    ruleId: rule.id,
    severity: rule.severity,
    path:
      violation.path ??
      (violation.attributeId ? `attributes.${violation.attributeId}.value` : 'attributes'),
    ...(violation.attributeId ? { attributeId: violation.attributeId } : {}),
    message: {
      de: interpolate(rule.message.de, params),
      en: interpolate(rule.message.en, params),
    },
    ...(rule.legalRef ? { legalRef: rule.legalRef } : {}),
    fixHint: rule.fixHint,
  };
}

/**
 * L4: domain plausibility. Rules are data (@passwerk/rules kb/rules.json); the arithmetic
 * is the CHECKS registry. A check never reports a missing value: that is the gap report's
 * job, and it never re-checks a value L1 rejected, because the context hides it.
 */
export function validatePlausibility(
  draft: PassportDraft,
  options: PlausibilityOptions = {},
): { findings: Finding[] } {
  const ctx = createContext(draft, options);
  const findings: Finding[] = [];
  for (const [ruleId, check] of Object.entries(CHECKS)) {
    const rule = getRule(ruleId);
    if (!rule) throw new Error(`@passwerk/core: no knowledge-base rule for ${ruleId}`);
    for (const violation of check(ctx)) findings.push(toFinding(rule, violation));
  }
  findings.sort(
    (a, b) =>
      a.ruleId.localeCompare(b.ruleId) ||
      a.path.localeCompare(b.path) ||
      (a.attributeId ?? '').localeCompare(b.attributeId ?? ''),
  );
  return { findings };
}
```

- [ ] **Step 5: Create the context and an empty registry**

Create `packages/core/src/validate/plausibility/context.ts`:

```ts
import type { BatteryCategory } from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type { AnyFieldValue } from '../../model/field.js';
import { getField, type PassportDraft, presentValue } from '../../model/passport.js';
import type { Finding } from '../finding.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface RuleContext {
  draft: PassportDraft;
  category: BatteryCategory;
  /** ISO date-time treated as "now". Injected; never Date.now(). */
  asOf: string;
  /** The value when the field is present or in conflict and L1 did not reject it. */
  value<T>(id: string): T | undefined;
  /** The value as a Decimal, or undefined when absent or not a decimal string. */
  decimal(id: string): Decimal | undefined;
  /** The value as an ISO date (YYYY-MM-DD), or undefined. */
  date(id: string): string | undefined;
  /** The field's recordedAt, or undefined. */
  recordedAt(id: string): string | undefined;
}

export function createContext(
  draft: PassportDraft,
  options: { asOf?: string; l1Findings?: readonly Finding[] } = {},
): RuleContext {
  // A value L1 rejected is untrustworthy: hide it so no L4 rule restates an L1 finding.
  const hidden = new Set(
    (options.l1Findings ?? [])
      .filter((f) => f.layer === 'L1' && f.severity === 'error' && f.attributeId)
      .map((f) => f.attributeId as string),
  );
  const field = (id: string): AnyFieldValue | undefined =>
    hidden.has(id) ? undefined : getField(draft, id);

  const value = <T>(id: string): T | undefined =>
    hidden.has(id) ? undefined : presentValue<T>(draft, id);

  return {
    draft,
    category: draft.meta.category,
    asOf: options.asOf ?? draft.meta.createdAt,
    value,
    decimal(id) {
      const raw = value<unknown>(id);
      if (typeof raw !== 'string') return undefined;
      try {
        const d = new Decimal(raw);
        return d.isFinite() ? d : undefined;
      } catch {
        return undefined;
      }
    },
    date(id) {
      const raw = value<unknown>(id);
      return typeof raw === 'string' && ISO_DATE_RE.test(raw) ? raw : undefined;
    },
    recordedAt(id) {
      return field(id)?.recordedAt;
    },
  };
}
```

Create `packages/core/src/validate/plausibility/checks.ts`:

```ts
import { getRule } from '@passwerk/rules';
import type { RuleContext } from './context.js';

export interface RuleViolation {
  /** Draft path. Defaults to `attributes.<attributeId>.value`. */
  path?: string;
  attributeId?: string;
  /** Values for the named placeholders the rule's DE/EN message uses. */
  params?: Record<string, string>;
}

export type RuleCheck = (ctx: RuleContext) => RuleViolation[];

/** The attribute ids a rule declares in the knowledge base. */
export function ruleAttributes(ruleId: string): readonly string[] {
  const rule = getRule(ruleId);
  if (!rule) throw new Error(`@passwerk/core: unknown rule ${ruleId}`);
  return rule.attributes;
}

/** One check per PW-PLAUS rule id. Keys must match kb/rules.json exactly (see manifest test). */
export const CHECKS: Record<string, RuleCheck> = {};
```

- [ ] **Step 6: Wire L4 into `validate()`**

In `packages/core/src/validate/index.ts`, add the import, extend the options type and run L4:

```ts
import { validatePlausibility } from './plausibility.js';

export interface ValidateOptions extends EmitOptions {
  /** ISO date-time used as "now" by L4. Default: draft.meta.createdAt. */
  asOf?: string;
  /** Skip L4 (domain plausibility). Default false. */
  skipPlausibility?: boolean;
}
```

Replace the body of `validate` after the L1 early return with:

```ts
  const jsonable = environmentToJsonable(buildEnvironment(l1.draft, options));
  const rest = validateEnvironmentJson(jsonable);
  const runL4 = options.skipPlausibility !== true;
  const l4 = runL4
    ? validatePlausibility(l1.draft, { asOf: options.asOf, l1Findings: l1.findings }).findings
    : [];
  const report = buildReport([...l1.findings, ...rest.findings, ...l4], {
    L1: true,
    L2: true,
    L3: true,
    L4: runL4,
  });
  return { ...report, aasJson: canonicalJson(jsonable) };
```

And in the L1 early return, pass `L4: false`:

```ts
  if (!l1.draft) return buildReport(l1.findings, { L1: true, L2: false, L3: false, L4: false });
```

- [ ] **Step 7: Fix the existing layer assertion**

In `packages/core/test/validate.test.ts`, the first test asserts `r.layers` with three keys. Add the fourth:

```ts
      expect(r.layers).toEqual({
        L1: { ran: true, errors: 0, warnings: 0 },
        L2: { ran: true, errors: 0, warnings: 0 },
        L3: { ran: true, errors: 0, warnings: 0 },
        L4: { ran: true, errors: 0, warnings: 0 },
      });
```

- [ ] **Step 8: Export from the package entry point**

In `packages/core/src/index.ts`, add next to the other `validate/` exports (keep the list alphabetical):

```ts
export * from './validate/plausibility.js';
```

- [ ] **Step 9: Run the full check**

Run: `pnpm check`
Expected: PASS. If `tools/oracle` fails to typecheck because `ValidationReport.layers` gained a key, that is expected only if it enumerates the keys — `expected.ts` reads `layers.L1/L2/L3` by name, so it should compile untouched.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/validate packages/core/src/index.ts packages/core/test/plausibility.test.ts packages/core/test/validate.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): add L4 plausibility layer plumbing

Layer gains L4, Finding gains legalRef and fixHint, validate() runs a
(currently empty) rule registry and reports four layers. L4 receives L1's
findings so a value L1 rejected is hidden from every check.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 2: Knowledge-base range becomes the single source for numeric bands (ADR D-021)

`valueKind: 'percentage'` is hardcoded to 0–100, so `evolutionOfSelfDischarge` (−100…1000), `internalResistanceIncrease` (0…1000) and `carbonFootprintShareEndOfLife` (−100…100) cannot hold their authored values.

**Files:**
- Modify: `packages/core/src/model/values.ts`
- Modify: `packages/core/src/validate/schema.ts`
- Test: `packages/core/test/model.values.test.ts` (modify)

**Interfaces:**
- Consumes: `Attribute` from `@passwerk/rules`.
- Produces: `valueSchemaFor(attribute: Attribute): z.ZodType`; `valueSchemaForKind(kind: ValueKind): z.ZodType`. `PercentString` stays exported.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/model.values.test.ts`:

```ts
import { getAttribute } from '@passwerk/rules';
import { valueSchemaFor, valueSchemaForKind } from '@passwerk/core';

describe('valueSchemaFor uses the knowledge-base range (D-021)', () => {
  it('accepts the full authored band for the three wide percentage attributes', () => {
    const cases: [string, string][] = [
      ['evolutionOfSelfDischarge', '640'],
      ['internalResistanceIncrease', '150'],
      ['carbonFootprintShareEndOfLife', '-12.5'],
    ];
    for (const [id, value] of cases) {
      const attribute = getAttribute(id);
      expect(attribute, id).toBeDefined();
      expect(valueSchemaFor(attribute!).safeParse(value).success, id).toBe(true);
    }
  });

  it('still rejects a value past the authored band', () => {
    const attribute = getAttribute('internalResistanceIncrease')!;
    expect(valueSchemaFor(attribute).safeParse('1001').success).toBe(false);
  });

  it('keeps 0..100 for a percentage attribute with no authored range', () => {
    const attribute = getAttribute('stateOfCharge')!;
    expect(valueSchemaFor(attribute).safeParse('101').success).toBe(false);
    expect(valueSchemaFor(attribute).safeParse('99.5').success).toBe(true);
  });

  it('applies the band to decimal attributes too', () => {
    const attribute = getAttribute('batteryMass')!; // 0 .. 10000 kg
    expect(valueSchemaFor(attribute).safeParse('10001').success).toBe(false);
    expect(valueSchemaFor(attribute).safeParse('412.5').success).toBe(true);
  });

  it('valueSchemaForKind stays band-less for callers that hold only a kind', () => {
    expect(valueSchemaForKind('decimal').safeParse('99999999').success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/model.values.test.ts`
Expected: FAIL — `valueSchemaFor` does not accept an `Attribute`, `valueSchemaForKind` is not exported.

- [ ] **Step 3: Implement in `values.ts`**

Rename the existing function and add the attribute-aware one. Replace the final block of `packages/core/src/model/values.ts`:

```ts
/** The Zod schema for Field.value given only the value kind, with no numeric band applied. */
export function valueSchemaForKind(kind: ValueKind): z.ZodType {
  return BY_KIND[kind];
}

function banded(
  base: z.ZodType<string>,
  range: { min: number | null; max: number | null } | null,
  fallback: { min: number; max: number } | null,
): z.ZodType {
  const min = range?.min ?? fallback?.min ?? null;
  const max = range?.max ?? fallback?.max ?? null;
  if (min === null && max === null) return base;
  const label = `expected a value between ${min ?? '-inf'} and ${max ?? 'inf'}`;
  return base.refine((s: string) => {
    const d = new Decimal(s);
    return (min === null || d.gte(min)) && (max === null || d.lte(max));
  }, label);
}

/**
 * The Zod schema for Field.value given the resolved attribute. Numeric bands come from the
 * knowledge base (ADR D-021), never from a hardcoded constant: `percentage` with no authored
 * range keeps 0..100, everything else uses what the domain expert authored.
 */
export function valueSchemaFor(attribute: Attribute): z.ZodType {
  switch (attribute.valueKind) {
    case 'percentage':
      return banded(DecimalString, attribute.range, { min: 0, max: 100 });
    case 'decimal':
      return banded(DecimalString, attribute.range, null);
    case 'integer':
      return banded(IntegerString, attribute.range, null);
    default:
      return BY_KIND[attribute.valueKind];
  }
}
```

Add `import type { Attribute, ValueKind } from '@passwerk/rules';` at the top (replacing the existing `ValueKind`-only type import).

- [ ] **Step 4: Update the one caller**

In `packages/core/src/validate/schema.ts`, the non-composite branch already holds the resolved `attribute`. Change:

```ts
    const r = valueSchemaFor(attribute.valueKind).safeParse(field.value);
```

to:

```ts
    const r = valueSchemaFor(attribute).safeParse(field.value);
```

- [ ] **Step 5: Run the full check**

Run: `pnpm check`
Expected: PASS. If a golden sample now fails L1 because a value sits outside its authored band, that is a real defect in the sample: fix the sample value, not the band.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/model/values.ts packages/core/src/validate/schema.ts packages/core/test/model.values.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): derive numeric bands from the knowledge base (D-021)

valueSchemaFor takes the resolved Attribute instead of the bare ValueKind,
so evolutionOfSelfDischarge, internalResistanceIncrease and
carbonFootprintShareEndOfLife can finally hold their authored ranges.
valueSchemaForKind stays for callers that hold only a kind.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 3: Rule engine proof — checks 001 and 002, plus the manifest test

Proves the registry, the named-placeholder interpolation and the deterministic ordering with the two simplest rules.

**Files:**
- Modify: `packages/core/src/validate/plausibility/checks.ts`
- Test: `packages/core/test/plausibility.manifest.test.ts` (create), `packages/core/test/plausibility.rules.test.ts` (create)

**Interfaces:**
- Consumes: `RuleContext`, `RuleViolation`, `RuleCheck`, `ruleAttributes` from Task 1.
- Produces: `CHECKS['PW-PLAUS-001']`, `CHECKS['PW-PLAUS-002']`.

- [ ] **Step 1: Write the failing rule test**

Create `packages/core/test/plausibility.rules.test.ts`:

```ts
import { validatePlausibility } from '@passwerk/core';
import { PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const META = {
  schemaVersion: '1.0' as const,
  category: 'EV' as const,
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://example.org/bp/1',
};

/** Build a draft holding just the attributes a rule needs. */
export function draftWith(
  attributes: Record<string, { value: unknown; recordedAt?: string }>,
  category: 'EV' | 'LMT' | 'INDUSTRIAL_GT_2KWH' = 'EV',
): PassportDraft {
  return PassportDraft.parse({
    meta: { ...META, category },
    attributes: Object.fromEntries(
      Object.entries(attributes).map(([id, f]) => [
        id,
        { value: f.value, status: 'present', source: [], ...(f.recordedAt ? { recordedAt: f.recordedAt } : {}) },
      ]),
    ),
  });
}

export function ruleIds(draft: PassportDraft, asOf?: string): string[] {
  return validatePlausibility(draft, asOf ? { asOf } : {}).findings.map((f) => f.ruleId);
}

describe('PW-PLAUS-001 percentage band', () => {
  it('fires when a listed percentage is above 100', () => {
    const findings = validatePlausibility(draftWith({ stateOfCharge: { value: '140' } })).findings;
    const f = findings.find((x) => x.ruleId === 'PW-PLAUS-001');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect(f?.attributeId).toBe('stateOfCharge');
    expect(f?.message.en).toContain('stateOfCharge');
    expect(f?.message.en).toContain('140');
    expect(f?.message.de).not.toContain('{');
    expect(f?.fixHint?.de).toBeTruthy();
  });

  it('is quiet for a value inside the band', () => {
    expect(ruleIds(draftWith({ stateOfCharge: { value: '70' } }))).not.toContain('PW-PLAUS-001');
  });

  it('is hidden when L1 already rejected the value', () => {
    const draft = draftWith({ stateOfCharge: { value: '140' } });
    const l1 = [
      {
        layer: 'L1' as const,
        ruleId: 'PW-L1-VALUE',
        severity: 'error' as const,
        path: 'attributes.stateOfCharge.value',
        attributeId: 'stateOfCharge',
        message: { de: 'x', en: 'x' },
      },
    ];
    expect(validatePlausibility(draft, { l1Findings: l1 }).findings).toEqual([]);
  });
});

describe('PW-PLAUS-002 voltage ordering', () => {
  it('fires when the three voltages are not ascending', () => {
    const draft = draftWith({
      minimumVoltage: { value: '400' },
      nominalVoltage: { value: '300' },
      maximumVoltage: { value: '450' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-002');
    expect(f?.message.en).toBe(
      'Minimum 400 V, nominal 300 V and maximum 450 V are not in ascending order.',
    );
    expect(f?.legalRef).toBe('BR Annex XIII 1(h)');
  });

  it('is quiet when ordered, and when a voltage is missing', () => {
    const ok = draftWith({
      minimumVoltage: { value: '300' },
      nominalVoltage: { value: '400' },
      maximumVoltage: { value: '450' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-002');
    expect(ruleIds(draftWith({ nominalVoltage: { value: '400' } }))).not.toContain('PW-PLAUS-002');
  });
});
```

- [ ] **Step 2: Write the failing manifest test**

Create `packages/core/test/plausibility.manifest.test.ts`. It asserts one direction now (every check maps to a rule) and gains the reverse assertion in Task 7:

```ts
import { CHECKS } from '@passwerk/core';
import { getRule, plausibilityRules } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('plausibility manifest', () => {
  it('every check key is a knowledge-base rule', () => {
    for (const id of Object.keys(CHECKS)) expect(getRule(id), id).toBeDefined();
  });

  it('every rule carries DE and EN title, message and fix hint', () => {
    for (const rule of plausibilityRules) {
      for (const field of ['title', 'message', 'fixHint'] as const) {
        expect(rule[field].de.length, `${rule.id}.${field}.de`).toBeGreaterThan(0);
        expect(rule[field].en.length, `${rule.id}.${field}.en`).toBeGreaterThan(0);
      }
    }
  });

  it('every rule names only attributes that exist in the knowledge base', () => {
    for (const rule of plausibilityRules) {
      for (const id of rule.attributes) expect(getAttributeExists(id), `${rule.id}: ${id}`).toBe(true);
    }
  });

  it('DE and EN messages use the same placeholder set', () => {
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const rule of plausibilityRules) {
      expect(placeholders(rule.message.de), rule.id).toEqual(placeholders(rule.message.en));
    }
  });
});
```

Add the helper import at the top of that file:

```ts
import { getAttribute } from '@passwerk/rules';
const getAttributeExists = (id: string) => getAttribute(id) !== undefined;
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts packages/core/test/plausibility.manifest.test.ts`
Expected: FAIL — `CHECKS` is not exported from `@passwerk/core`, and no rule fires.

- [ ] **Step 4: Export the registry and implement the two checks**

In `packages/core/src/index.ts` add, alphabetically among the `validate/` exports:

```ts
export * from './validate/plausibility/checks.js';
export * from './validate/plausibility/context.js';
```

In `packages/core/src/validate/plausibility/checks.ts`, replace the empty registry with:

```ts
export const CHECKS: Record<string, RuleCheck> = {
  /** Listed percentages must lie between 0 and 100. */
  'PW-PLAUS-001': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-001')) {
      const d = ctx.decimal(id);
      if (d === undefined) continue;
      if (d.gte(0) && d.lte(100)) continue;
      out.push({ attributeId: id, params: { attribute: id, value: d.toString() } });
    }
    return out;
  },

  /** minimum <= nominal <= maximum voltage. Needs all three to say anything. */
  'PW-PLAUS-002': (ctx) => {
    const min = ctx.decimal('minimumVoltage');
    const nom = ctx.decimal('nominalVoltage');
    const max = ctx.decimal('maximumVoltage');
    if (min === undefined || nom === undefined || max === undefined) return [];
    if (min.lte(nom) && nom.lte(max)) return [];
    return [
      {
        attributeId: 'nominalVoltage',
        params: { min: min.toString(), nom: nom.toString(), max: max.toString() },
      },
    ];
  },
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts packages/core/test/plausibility.manifest.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src packages/core/test
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): L4 rule engine with PW-PLAUS-001 and 002

Named-placeholder interpolation from the knowledge base, deterministic
ordering, and a manifest test that keeps rules.json and the check registry
in step.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 4: Checks 003 to 008

**Files:**
- Modify: `packages/core/src/validate/plausibility/checks.ts`
- Test: `packages/core/test/plausibility.rules.test.ts` (extend)

**Interfaces:**
- Consumes: `draftWith`, `ruleIds` exported by `plausibility.rules.test.ts` in Task 3.
- Produces: `CHECKS['PW-PLAUS-003'…'PW-PLAUS-008']`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/plausibility.rules.test.ts`:

```ts
describe('PW-PLAUS-003 manufacturing date', () => {
  it('fires when manufacturing is after putting into service', () => {
    const draft = draftWith({
      manufacturingDate: { value: '2026-07-01' },
      dateOfPuttingIntoService: { value: '2026-06-15' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-003');
  });
  it('fires when manufacturing is in the future', () => {
    expect(ruleIds(draftWith({ manufacturingDate: { value: '2027-01-01' } }))).toContain(
      'PW-PLAUS-003',
    );
  });
  it('fires when manufacturing is before 2000', () => {
    expect(ruleIds(draftWith({ manufacturingDate: { value: '1998-05-01' } }))).toContain(
      'PW-PLAUS-003',
    );
  });
  it('is quiet for a plausible pair', () => {
    const draft = draftWith({
      manufacturingDate: { value: '2026-02-10' },
      dateOfPuttingIntoService: { value: '2026-06-15' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-003');
  });
});

describe('PW-PLAUS-004 battery mass', () => {
  it('warns for an EV battery of 3 kg', () => {
    expect(ruleIds(draftWith({ batteryMass: { value: '3' } }, 'EV'))).toContain('PW-PLAUS-004');
  });
  it('accepts 3.2 kg for an LMT battery', () => {
    expect(ruleIds(draftWith({ batteryMass: { value: '3.2' } }, 'LMT'))).not.toContain(
      'PW-PLAUS-004',
    );
  });
});

describe('PW-PLAUS-005 industrial 2 kWh threshold', () => {
  it('fires when capacity times voltage is not above 2 kWh', () => {
    const draft = draftWith(
      { ratedCapacity: { value: '10' }, nominalVoltage: { value: '48' } },
      'INDUSTRIAL_GT_2KWH',
    );
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-005');
    expect(f?.message.en).toContain('0.48 kWh');
  });
  it('is quiet above the threshold and for other categories', () => {
    const big = draftWith(
      { ratedCapacity: { value: '280' }, nominalVoltage: { value: '800' } },
      'INDUSTRIAL_GT_2KWH',
    );
    expect(ruleIds(big)).not.toContain('PW-PLAUS-005');
    const ev = draftWith({ ratedCapacity: { value: '10' }, nominalVoltage: { value: '48' } }, 'EV');
    expect(ruleIds(ev)).not.toContain('PW-PLAUS-005');
  });
});

describe('PW-PLAUS-006 battery status vocabulary', () => {
  it('accepts the five values case- and hyphen-insensitively', () => {
    for (const v of ['Original', 'repurposed', 'RE-USED', 'reused', 'Remanufactured', 'waste']) {
      expect(ruleIds(draftWith({ batteryStatus: { value: v } })), v).not.toContain('PW-PLAUS-006');
    }
  });
  it('fires for anything else', () => {
    expect(ruleIds(draftWith({ batteryStatus: { value: 'refurbished' } }))).toContain(
      'PW-PLAUS-006',
    );
  });
});

describe('PW-PLAUS-007 category agreement', () => {
  it('fires when the attribute disagrees with the draft category', () => {
    expect(ruleIds(draftWith({ batteryCategory: { value: 'LMT' } }, 'EV'))).toContain(
      'PW-PLAUS-007',
    );
  });
  it('is quiet when they agree', () => {
    expect(ruleIds(draftWith({ batteryCategory: { value: 'EV' } }, 'EV'))).not.toContain(
      'PW-PLAUS-007',
    );
  });
});

describe('PW-PLAUS-008 passport identifier', () => {
  it('fires for a non-https identifier', () => {
    const draft = PassportDraft.parse({
      meta: { ...META, passportId: 'urn:uuid:not-resolvable' },
      attributes: {
        batteryPassportIdentifier: {
          value: 'urn:uuid:not-resolvable',
          status: 'present',
          source: [],
        },
      },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-008');
  });
  it('is quiet for an https identifier', () => {
    expect(
      ruleIds(draftWith({ batteryPassportIdentifier: { value: 'https://example.org/bp/1' } })),
    ).not.toContain('PW-PLAUS-008');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: FAIL — none of PW-PLAUS-003…008 fire.

- [ ] **Step 3: Implement the six checks**

Add to the `CHECKS` object in `packages/core/src/validate/plausibility/checks.ts`, and add `import type { BatteryCategory } from '@passwerk/rules';` plus the two constants above the registry:

```ts
/** Typical pack masses per category, as stated in the PW-PLAUS-004 message. */
const MASS_RANGES: Record<BatteryCategory, { min: number; max: number }> = {
  LMT: { min: 1, max: 50 },
  EV: { min: 100, max: 1500 },
  INDUSTRIAL_GT_2KWH: { min: 10, max: 50000 },
};

/** The five statuses of BR Annex XIII 4(c), normalised for comparison. */
const BATTERY_STATUSES = new Set(['original', 'repurposed', 'reused', 'remanufactured', 'waste']);

const normaliseStatus = (s: string): string => s.trim().toLowerCase().replaceAll('-', '');
```

Registry entries:

```ts
  /** Manufacturing date: not in the future, not before 2000, not after putting into service. */
  'PW-PLAUS-003': (ctx) => {
    const mfg = ctx.date('manufacturingDate');
    if (mfg === undefined) return [];
    const svc = ctx.date('dateOfPuttingIntoService');
    const today = ctx.asOf.slice(0, 10);
    const implausible = mfg > today || mfg < '2000-01-01' || (svc !== undefined && mfg > svc);
    if (!implausible) return [];
    return [
      {
        attributeId: 'manufacturingDate',
        params: { manufacturingDate: mfg, dateOfPuttingIntoService: svc ?? '-' },
      },
    ];
  },

  /** Battery mass within the typical band for the category. */
  'PW-PLAUS-004': (ctx) => {
    const mass = ctx.decimal('batteryMass');
    if (mass === undefined) return [];
    const band = MASS_RANGES[ctx.category];
    if (mass.gte(band.min) && mass.lte(band.max)) return [];
    return [
      { attributeId: 'batteryMass', params: { value: mass.toString(), category: ctx.category } },
    ];
  },

  /** An industrial battery in passport scope must exceed 2 kWh. */
  'PW-PLAUS-005': (ctx) => {
    if (ctx.category !== 'INDUSTRIAL_GT_2KWH') return [];
    const capacity = ctx.decimal('ratedCapacity');
    const voltage = ctx.decimal('nominalVoltage');
    if (capacity === undefined || voltage === undefined) return [];
    const energy = capacity.times(voltage).div(1000);
    if (energy.gt(2)) return [];
    return [
      {
        attributeId: 'ratedCapacity',
        params: {
          capacity: capacity.toString(),
          voltage: voltage.toString(),
          energy: energy.toDecimalPlaces(3).toString(),
        },
      },
    ];
  },

  /** Battery status is one of the five defined values. */
  'PW-PLAUS-006': (ctx) => {
    const status = ctx.value<unknown>('batteryStatus');
    if (typeof status !== 'string') return [];
    if (BATTERY_STATUSES.has(normaliseStatus(status))) return [];
    return [{ attributeId: 'batteryStatus', params: { value: status } }];
  },

  /** The batteryCategory attribute matches the category the draft is validated as. */
  'PW-PLAUS-007': (ctx) => {
    const value = ctx.value<unknown>('batteryCategory');
    if (typeof value !== 'string') return [];
    if (value.trim().toUpperCase() === ctx.category) return [];
    return [
      { attributeId: 'batteryCategory', params: { draftCategory: ctx.category, value } },
    ];
  },

  /** The passport identifier must be an absolute https URI a QR code can resolve. */
  'PW-PLAUS-008': (ctx) => {
    const value = ctx.value<unknown>('batteryPassportIdentifier');
    if (typeof value !== 'string') return [];
    if (/^https:\/\/\S+$/.test(value)) return [];
    return [{ attributeId: 'batteryPassportIdentifier', params: { value } }];
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/validate/plausibility/checks.ts packages/core/test/plausibility.rules.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): PW-PLAUS-003 to 008

Date ordering, mass band per category, the industrial 2 kWh threshold,
the status vocabulary, category agreement and the https passport
identifier.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 5: Checks 009 to 015, remove PW-PLAUS-013, ADR D-023

Two knowledge-base problems surface here and are resolved in this task.

**Problem 1 — PW-PLAUS-012 versus the IDTA template.** The Commission's v2.0 guidance marks the state-of-health data points `not_displayed` for EV, but IDTA 02035-5 declares the same blocks with cardinality `One`. An EV passport therefore cannot satisfy both: leaving `remainingCapacity` out makes L3 report `PW-L3-MISSING`, and filling it makes PW-PLAUS-012 warn. Resolution: 012 stays quiet for an attribute whose template element is mandatory (`cardinality.min >= 1`), because the supplier has no choice there, and keeps its teeth where the element is optional (`ZeroToOne`), where leaving it empty is a real option.

**Problem 2 — PW-PLAUS-013 is misfiled.** Its authored message fires on a *missing* attribute ("{attribute} is missing; this is not a gap as of February 2027…"). That is reassurance, not a defect: implemented as authored it would emit 12 to 16 warnings on every draft and no passport could ever be `valid`. Reassurance about deferred data points is the gap report's `deferred` bucket. Resolution: remove the rule from `kb/rules.json` and carry its DE/EN text into `gap/action.ts` (Task 10). The catalogue then holds 24 rules, not 25.

**Files:**
- Modify: `packages/core/src/validate/plausibility/checks.ts`
- Modify: `packages/rules/kb/rules.json` (remove PW-PLAUS-013)
- Modify: `docs/DECISIONS.md` (add D-023)
- Test: `packages/core/test/plausibility.rules.test.ts` (extend)

**Interfaces:**
- Consumes: `draftWith`, `ruleIds` from Task 3; `getAttribute` from `@passwerk/rules`.
- Produces: `CHECKS['PW-PLAUS-009'…'PW-PLAUS-012']`, `CHECKS['PW-PLAUS-014']`, `CHECKS['PW-PLAUS-015']`. No `PW-PLAUS-013`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/plausibility.rules.test.ts`:

```ts
describe('PW-PLAUS-009 CAS numbers', () => {
  it('accepts a valid CAS number and rejects a bad check digit', () => {
    const ok = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4' }] },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-009');
    const bad = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-9' }] },
    });
    expect(ruleIds(bad)).toContain('PW-PLAUS-009');
  });
  it('rejects a trade name', () => {
    const draft = draftWith({
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: 'CoSulfate-A' }] },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-009');
  });
});

describe('PW-PLAUS-010 recycled shares per material', () => {
  it('fires when pre and post consumer exceed 100 % together', () => {
    const draft = draftWith({
      recycledCobaltPreConsumer: { value: '60' },
      recycledCobaltPostConsumer: { value: '55' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-010');
    expect(f?.message.en).toContain('115');
    expect(f?.message.en).toContain('Cobalt');
  });
  it('is quiet at exactly 100 % and when one side is missing', () => {
    const at100 = draftWith({
      recycledCobaltPreConsumer: { value: '40' },
      recycledCobaltPostConsumer: { value: '60' },
    });
    expect(ruleIds(at100)).not.toContain('PW-PLAUS-010');
    expect(ruleIds(draftWith({ recycledCobaltPreConsumer: { value: '90' } }))).not.toContain(
      'PW-PLAUS-010',
    );
  });
});

describe('PW-PLAUS-011 LastUpdate on dynamic values', () => {
  it('fires when a dynamic value has no recordedAt', () => {
    expect(ruleIds(draftWith({ numberOfFullCycles: { value: '412' } }))).toContain('PW-PLAUS-011');
  });
  it('fires when recordedAt is in the future', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2027-01-01T00:00:00Z' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-011');
  });
  it('is quiet with a past recordedAt', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2026-08-30T18:30:00Z' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-011');
  });
});

describe('PW-PLAUS-012 not-displayed data points (D-023)', () => {
  it('warns for an optional template element the Commission says not to display', () => {
    // capacityThresholdForExhaustion is ZeroToOne in IDTA 02035-4 and not_displayed for
    // INDUSTRIAL_GT_2KWH, so the supplier can leave it out.
    const draft = draftWith(
      { capacityThresholdForExhaustion: { value: '80' } },
      'INDUSTRIAL_GT_2KWH',
    );
    expect(ruleIds(draft)).toContain('PW-PLAUS-012');
  });
  it('stays quiet when the template makes the element mandatory', () => {
    // remainingCapacity is not_displayed for EV but its IDTA 02035-5 block is cardinality One:
    // omitting it would make L3 fail, so the supplier has no choice and we do not nag.
    const draft = draftWith(
      { remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' } },
      'EV',
    );
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-012');
  });
});

describe('PW-PLAUS-013 is not a validation rule', () => {
  it('is absent from the catalogue and the registry', async () => {
    const { getRule } = await import('@passwerk/rules');
    const { CHECKS } = await import('@passwerk/core');
    expect(getRule('PW-PLAUS-013')).toBeUndefined();
    expect(CHECKS['PW-PLAUS-013']).toBeUndefined();
  });
});

describe('PW-PLAUS-014 internal resistance unit', () => {
  it('fires for a pack resistance of 85 Ohm', () => {
    const draft = draftWith({
      initialInternalResistance: { value: { cellOhm: '0.0012', packOhm: '85' } },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-014');
  });
  it('is quiet for milliohm-scale values', () => {
    const draft = draftWith({
      initialInternalResistance: { value: { cellOhm: '0.0012', packOhm: '0.085' } },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-014');
  });
});

describe('PW-PLAUS-015 idle temperature range', () => {
  it('fires when the lower boundary is not below the upper', () => {
    const draft = draftWith({
      temperatureRangeIdleLowerBoundary: { value: '45' },
      temperatureRangeIdleUpperBoundary: { value: '-20' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-015');
  });
  it('is quiet for a well-ordered range', () => {
    const draft = draftWith({
      temperatureRangeIdleLowerBoundary: { value: '-20' },
      temperatureRangeIdleUpperBoundary: { value: '45' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-015');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: FAIL — none of 009…015 fire, and `getRule('PW-PLAUS-013')` still returns a rule.

- [ ] **Step 3: Remove PW-PLAUS-013 from the knowledge base**

Delete the whole `PW-PLAUS-013` object from the `rules` array in `packages/rules/kb/rules.json` and set `"lastVerified": "2026-09-04"`. Keep the remaining ids unrenumbered — a rule id is a stable identifier, never a position.

Verify the file still parses and holds 14 rules:

Run: `node -e "const r=require('./packages/rules/kb/rules.json');console.log(r.rules.length, r.rules.map(x=>x.id).join(','))"`
Expected: `14` and no `PW-PLAUS-013` in the list.

- [ ] **Step 4: Implement the six checks**

Add these helpers above the registry in `packages/core/src/validate/plausibility/checks.ts`, extending the `@passwerk/rules` import with `getAttribute`:

```ts
/** CAS registry number: NN..N-NN-C, where C is a modulo-10 weighted check digit. */
export function isCasNumber(value: string): boolean {
  const match = /^(\d{2,7})-(\d{2})-(\d)$/.exec(value);
  if (!match) return false;
  const digits = `${match[1]}${match[2]}`.split('').reverse();
  const sum = digits.reduce((acc, digit, index) => acc + Number(digit) * (index + 1), 0);
  return sum % 10 === Number(match[3]);
}

/** The four materials with a recycled-content obligation, with their attribute pair. */
const RECYCLED_PAIRS: { material: string; pre: string; post: string }[] = [
  { material: 'Nickel', pre: 'recycledNickelPreConsumer', post: 'recycledNickelPostConsumer' },
  { material: 'Cobalt', pre: 'recycledCobaltPreConsumer', post: 'recycledCobaltPostConsumer' },
  { material: 'Lithium', pre: 'recycledLithiumPreConsumer', post: 'recycledLithiumPostConsumer' },
  { material: 'Lead', pre: 'recycledLeadPreConsumer', post: 'recycledLeadPostConsumer' },
];

/** Above this, an internal resistance in ohms is almost certainly stated in milliohms. */
const INTERNAL_RESISTANCE_OHM_LIMIT = 10;

/** True when the template forces the element to be present, so the supplier has no choice. */
function templateForcesPresence(attributeId: string): boolean {
  const attribute = getAttribute(attributeId);
  if (!attribute) return false;
  return attribute.templateElements.some(
    (element) => element.cardinality.min !== null && element.cardinality.min >= 1,
  );
}
```

Registry entries:

```ts
  /** Material identifiers should be CAS registry numbers. */
  'PW-PLAUS-009': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-009')) {
      const items = ctx.value<{ identifier?: unknown }[]>(id);
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const identifier = item?.identifier;
        if (typeof identifier !== 'string' || isCasNumber(identifier)) continue;
        out.push({ attributeId: id, params: { value: identifier } });
      }
    }
    return out;
  },

  /** Pre- and post-consumer recycled shares of one material must not exceed 100 % together. */
  'PW-PLAUS-010': (ctx) => {
    const out: RuleViolation[] = [];
    for (const { material, pre, post } of RECYCLED_PAIRS) {
      const preShare = ctx.decimal(pre);
      const postShare = ctx.decimal(post);
      if (preShare === undefined || postShare === undefined) continue;
      const sum = preShare.plus(postShare);
      if (sum.lte(100)) continue;
      out.push({
        attributeId: pre,
        params: {
          material,
          pre: preShare.toString(),
          post: postShare.toString(),
          sum: sum.toString(),
        },
      });
    }
    return out;
  },

  /** A dynamic value needs a LastUpdate timestamp that is not in the future. */
  'PW-PLAUS-011': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-011')) {
      if (ctx.value(id) === undefined) continue;
      const recordedAt = ctx.recordedAt(id);
      if (recordedAt !== undefined && recordedAt <= ctx.asOf) continue;
      out.push({ attributeId: id, params: { attribute: id, timestamp: recordedAt ?? '-' } });
    }
    return out;
  },

  /**
   * Data points the Commission marks 'not to be filled/displayed' should be empty — unless
   * the IDTA template makes the element mandatory, in which case the supplier has no choice
   * and we stay quiet (ADR D-023).
   */
  'PW-PLAUS-012': (ctx) => {
    const out: RuleViolation[] = [];
    for (const id of ruleAttributes('PW-PLAUS-012')) {
      if (ctx.value(id) === undefined) continue;
      const attribute = getAttribute(id);
      if (attribute?.applicability[ctx.category].status !== 'not_displayed') continue;
      if (templateForcesPresence(id)) continue;
      out.push({ attributeId: id, params: { attribute: id, category: ctx.category } });
    }
    return out;
  },

  /** An internal resistance above 10 ohms is almost certainly stated in milliohms. */
  'PW-PLAUS-014': (ctx) => {
    const value = ctx.value<Record<string, unknown>>('initialInternalResistance');
    if (typeof value !== 'object' || value === null) return [];
    const out: RuleViolation[] = [];
    for (const key of ['cellOhm', 'moduleOhm', 'packOhm']) {
      const raw = value[key];
      if (typeof raw !== 'string') continue;
      let ohms: Decimal;
      try {
        ohms = new Decimal(raw);
      } catch {
        continue;
      }
      if (!ohms.isFinite() || ohms.lte(INTERNAL_RESISTANCE_OHM_LIMIT)) continue;
      out.push({
        attributeId: 'initialInternalResistance',
        path: `attributes.initialInternalResistance.value.${key}`,
        params: { value: ohms.toString() },
      });
    }
    return out;
  },

  /** The idle temperature range must have its lower boundary below the upper. */
  'PW-PLAUS-015': (ctx) => {
    const lower = ctx.decimal('temperatureRangeIdleLowerBoundary');
    const upper = ctx.decimal('temperatureRangeIdleUpperBoundary');
    if (lower === undefined || upper === undefined || lower.lt(upper)) return [];
    return [
      {
        attributeId: 'temperatureRangeIdleLowerBoundary',
        params: { lower: lower.toString(), upper: upper.toString() },
      },
    ];
  },
```

Add `import { Decimal } from 'decimal.js';` to the top of `checks.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: PASS. The `PW-PLAUS-012` "mandatory template element" case depends on `cardinality.min` being `1` for `5/RemainingCapacity/RemainingCapacityValue`. If the catalogue stores `min: null` for `raw: "One"`, use `element.cardinality.raw === 'One'` instead and note it in the code comment.

- [ ] **Step 6: Write ADR D-023**

Append to `docs/DECISIONS.md`:

```markdown
## D-023: Where the IDTA template and the Commission guidance disagree, the template wins the file and the guidance wins the advice (2026-09-04)

**Context.** The Commission's v2.0 guidance marks the state-of-health data points (61-66)
"not to be filled/displayed" for EV batteries as of February 2027. IDTA 02035-5 declares the
same blocks (`RemainingCapacity`, `RemainingPowerCapability`,
`RemainingRoundTripEnergyEfficiency`, `EvolutionOfSelfDischarge`) with cardinality `One`. An
EV passport cannot satisfy both: omitting the block makes L3 report `PW-L3-MISSING`, filling
it makes PW-PLAUS-012 warn. Separately, PW-PLAUS-013 was authored to fire on a *missing*
deferred attribute, which would have emitted a dozen warnings on every draft and made
`valid` unreachable.

**Decision.** PW-PLAUS-012 stays silent for an attribute whose template element is mandatory,
and keeps its teeth where the element is `ZeroToOne` and the supplier can genuinely leave it
out. The emitted file therefore always follows the template (L3 stays authoritative for
conformance) and the advice follows the guidance wherever the supplier has a choice.
PW-PLAUS-013 is removed from `kb/rules.json`; reassurance that a deferred data point is not a
gap belongs to the gap report's `deferred` bucket, not to a validation finding. The catalogue
holds 24 rules.

**Consequences.** No golden sample is warned about a value the template obliges it to carry.
The conflict is recorded rather than papered over, and is worth raising with IDTA when the
templates are next revised. L4 never reports a missing value, which keeps the layer boundary
with the gap report clean.
```

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/validate/plausibility/checks.ts packages/core/test/plausibility.rules.test.ts packages/rules/kb/rules.json docs/DECISIONS.md
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): PW-PLAUS-009 to 015; drop 013 (ADR D-023)

CAS check digits, recycled-share sums, LastUpdate on dynamic values, the
not-displayed rule scoped to elements the template leaves optional, the
milliohm heuristic and the idle temperature order.

PW-PLAUS-013 fired on a missing attribute, which is reassurance rather
than a defect; its text moves to the gap report's deferred bucket.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 6: New rules PW-PLAUS-016 to 020

Every `legalRef` below is copied verbatim from a data point already transcribed in `packages/rules/kb/ec-datapoints.json`. The two rules whose grounding is arithmetic rather than legal carry `legalRef: null` and say so in the `$comment` of the rules file.

The three tolerances (20 % for 016, 1 percentage point for 017 and 022) are engineering judgement, not values stated in the Regulation. They are named constants in one place so a domain reviewer can tune them.

**Files:**
- Modify: `packages/rules/kb/rules.json`
- Modify: `packages/core/src/validate/plausibility/checks.ts`
- Test: `packages/core/test/plausibility.rules.test.ts` (extend)

**Interfaces:**
- Consumes: `draftWith`, `ruleIds` from Task 3; `RECYCLED_PAIRS` is not reused here.
- Produces: `CHECKS['PW-PLAUS-016'…'PW-PLAUS-020']`, and the exported tolerance constants `ENERGY_COHERENCE_TOLERANCE`, `SHARE_SUM_TOLERANCE_PP`, `CAPACITY_FADE_TOLERANCE_PP`.

- [ ] **Step 1: Add the five rule definitions to the knowledge base**

Append these objects to the `rules` array in `packages/rules/kb/rules.json`, after `PW-PLAUS-015`:

```json
    {
      "id": "PW-PLAUS-016",
      "severity": "warning",
      "title": {
        "en": "Certified usable energy must fit rated capacity and nominal voltage",
        "de": "Zertifizierte nutzbare Energie muss zu Nennkapazität und Nennspannung passen"
      },
      "message": {
        "en": "Declared {declared} kWh differs by more than 20 % from the {derived} kWh implied by rated capacity and nominal voltage.",
        "de": "Angegebene {declared} kWh weichen um mehr als 20 % von den aus Nennkapazität und Nennspannung berechneten {derived} kWh ab."
      },
      "fixHint": {
        "en": "Usually Wh reported as kWh, or cell values reported as pack values. State pack-level figures in kWh.",
        "de": "Häufig werden Wh als kWh oder Zellwerte als Packwerte angegeben. Werte auf Packebene und in kWh angeben."
      },
      "attributes": ["certifiedUsableBatteryEnergy", "ratedCapacity", "nominalVoltage"],
      "legalRef": "BR Annex XIII 1(g), 1(h)"
    },
    {
      "id": "PW-PLAUS-017",
      "severity": "warning",
      "title": {
        "en": "The life-cycle carbon footprint shares should add up to 100 %",
        "de": "Die Anteile am CO2-Fußabdruck sollten zusammen 100 % ergeben"
      },
      "message": {
        "en": "The life-cycle shares add up to {sum} % instead of 100 %.",
        "de": "Die Lebenszyklus-Anteile ergeben zusammen {sum} % statt 100 %."
      },
      "fixHint": {
        "en": "Take all four shares from the same life-cycle assessment; mixing studies rarely adds up.",
        "de": "Alle vier Anteile aus derselben Ökobilanz übernehmen; gemischte Studien ergeben selten 100 %."
      },
      "attributes": [
        "carbonFootprintShareRawMaterials",
        "carbonFootprintShareManufacturing",
        "carbonFootprintShareDistribution",
        "carbonFootprintShareEndOfLife"
      ],
      "legalRef": null
    },
    {
      "id": "PW-PLAUS-018",
      "severity": "error",
      "title": {
        "en": "The material masses must not exceed the battery mass",
        "de": "Die Summe der Materialmassen darf die Batteriemasse nicht überschreiten"
      },
      "message": {
        "en": "The declared material masses add up to {sum} kg but the battery mass is {mass} kg.",
        "de": "Die angegebenen Materialmassen ergeben zusammen {sum} kg, die Batteriemasse ist mit {mass} kg angegeben."
      },
      "fixHint": {
        "en": "Check whether masses were given per cell instead of per pack, or whether the battery mass is too low.",
        "de": "Prüfen, ob Massen je Zelle statt je Pack angegeben wurden oder ob die Batteriemasse zu niedrig ist."
      },
      "attributes": ["batteryMass", "criticalRawMaterials", "electrodeAndElectrolyteMaterials"],
      "legalRef": "BR Annex VI Part A (5), Annex XIII 1(b)"
    },
    {
      "id": "PW-PLAUS-019",
      "severity": "error",
      "title": {
        "en": "Hazardous substance concentrations must not exceed 100 % together",
        "de": "Die Konzentrationen der Gefahrstoffe dürfen zusammen 100 % nicht überschreiten"
      },
      "message": {
        "en": "The declared concentrations add up to {sum} %.",
        "de": "Die angegebenen Konzentrationen ergeben zusammen {sum} %."
      },
      "fixHint": {
        "en": "State each concentration as a mass share of the whole pack, from section 3 of the safety data sheet.",
        "de": "Jede Konzentration als Massenanteil am Gesamtpack angeben, aus Abschnitt 3 des Sicherheitsdatenblatts."
      },
      "attributes": ["hazardousSubstances"],
      "legalRef": "BR Annex VI Part A (8)"
    },
    {
      "id": "PW-PLAUS-020",
      "severity": "error",
      "title": {
        "en": "Remaining values must not exceed their original counterparts",
        "de": "Restwerte dürfen ihre Ausgangswerte nicht überschreiten"
      },
      "message": {
        "en": "{pair}: the remaining value {remaining} is greater than the original value {original}.",
        "de": "{pair}: Restwert {remaining} ist größer als der Ausgangswert {original}."
      },
      "fixHint": {
        "en": "Remaining values come from the battery management system, original values from the data sheet; bring both to the same level and unit.",
        "de": "Restwerte stammen aus dem Batteriemanagementsystem, Ausgangswerte aus dem Datenblatt; beide auf dieselbe Ebene und Einheit bringen."
      },
      "attributes": [
        "remainingCapacity",
        "ratedCapacity",
        "remainingUsableBatteryEnergy",
        "certifiedUsableBatteryEnergy",
        "remainingRoundTripEnergyEfficiency",
        "initialRoundTripEnergyEfficiency"
      ],
      "legalRef": "BR Annex XIII 4(a)"
    },
```

Also extend the `$comment` of `packages/rules/kb/rules.json` with one sentence:

```
Rules with "legalRef": null are arithmetic consistency checks, not legal requirements. The numeric tolerances used by PW-PLAUS-016, 017 and 022 are engineering judgement, not values stated in the Regulation; they are named constants in @passwerk/core.
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/test/plausibility.rules.test.ts`:

```ts
describe('PW-PLAUS-016 energy coherence', () => {
  it('fires when the declared energy is off by more than 20 %', () => {
    // 195 Ah x 400 V = 78 kWh; 7.5 kWh is a factor of ten out.
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      nominalVoltage: { value: '400' },
      certifiedUsableBatteryEnergy: { value: '7.5' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-016');
  });
  it('accepts a realistic usable fraction', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      nominalVoltage: { value: '400' },
      certifiedUsableBatteryEnergy: { value: '75' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-016');
  });
});

describe('PW-PLAUS-017 carbon footprint shares', () => {
  it('fires when the four shares do not add up to 100', () => {
    const draft = draftWith({
      carbonFootprintShareRawMaterials: { value: '40' },
      carbonFootprintShareManufacturing: { value: '30' },
      carbonFootprintShareDistribution: { value: '5' },
      carbonFootprintShareEndOfLife: { value: '5' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-017');
    expect(f?.message.en).toContain('80');
    expect(f?.legalRef).toBeUndefined();
  });
  it('is quiet within a percentage point, and when fewer than three shares are present', () => {
    const ok = draftWith({
      carbonFootprintShareRawMaterials: { value: '54.5' },
      carbonFootprintShareManufacturing: { value: '35' },
      carbonFootprintShareDistribution: { value: '8' },
      carbonFootprintShareEndOfLife: { value: '2.2' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-017');
    const sparse = draftWith({
      carbonFootprintShareRawMaterials: { value: '54.5' },
      carbonFootprintShareManufacturing: { value: '35' },
    });
    expect(ruleIds(sparse)).not.toContain('PW-PLAUS-017');
  });
});

describe('PW-PLAUS-018 material mass sum', () => {
  it('fires when the materials outweigh the battery', () => {
    const draft = draftWith({
      batteryMass: { value: '10' },
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4', massKg: '8' }] },
      electrodeAndElectrolyteMaterials: {
        value: [{ name: 'Graphite', identifier: '7782-42-5', massKg: '5' }],
      },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-018');
    expect(f?.severity).toBe('error');
    expect(f?.message.en).toContain('13');
  });
  it('is quiet when the materials fit', () => {
    const draft = draftWith({
      batteryMass: { value: '412.5' },
      criticalRawMaterials: { value: [{ name: 'Cobalt', identifier: '7440-48-4', massKg: '12' }] },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-018');
  });
});

describe('PW-PLAUS-019 hazardous substance concentrations', () => {
  it('fires above 100 % in total', () => {
    const draft = draftWith({
      hazardousSubstances: {
        value: [
          { name: 'Nickel', identifier: '7440-02-0', concentrationPercent: '70' },
          { name: 'Cobalt', identifier: '7440-48-4', concentrationPercent: '45' },
        ],
      },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-019');
  });
  it('is quiet for a realistic set', () => {
    const draft = draftWith({
      hazardousSubstances: {
        value: [{ name: 'Nickel', identifier: '7440-02-0', concentrationPercent: '12.5' }],
      },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-019');
  });
});

describe('PW-PLAUS-020 remaining versus original', () => {
  it('fires once per violated pair', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '210', recordedAt: '2026-08-30T18:30:00Z' },
      initialRoundTripEnergyEfficiency: { value: '92' },
      remainingRoundTripEnergyEfficiency: { value: '95', recordedAt: '2026-08-30T18:30:00Z' },
    });
    const hits = validatePlausibility(draft).findings.filter((x) => x.ruleId === 'PW-PLAUS-020');
    expect(hits).toHaveLength(2);
    expect(hits[0]?.message.en).toContain('remainingCapacity');
  });
  it('is quiet when every remaining value is at or below its original', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-020');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: FAIL — none of 016…020 fire.

- [ ] **Step 4: Implement the five checks**

Add above the registry in `packages/core/src/validate/plausibility/checks.ts`:

```ts
/**
 * Tolerances. These are engineering judgement, not values stated in the Regulation: they
 * decide how noisy L4 feels on real supplier data. Tune here, in one place.
 */
export const ENERGY_COHERENCE_TOLERANCE = 0.2; // 20 % of the derived energy
export const SHARE_SUM_TOLERANCE_PP = 1; // percentage points around 100
export const CAPACITY_FADE_TOLERANCE_PP = 1; // percentage points

/** Remaining/original attribute pairs checked by PW-PLAUS-020. */
const REMAINING_PAIRS: { remaining: string; original: string }[] = [
  { remaining: 'remainingCapacity', original: 'ratedCapacity' },
  { remaining: 'remainingUsableBatteryEnergy', original: 'certifiedUsableBatteryEnergy' },
  {
    remaining: 'remainingRoundTripEnergyEfficiency',
    original: 'initialRoundTripEnergyEfficiency',
  },
];

/** Sum the massKg entries of a composite material list. */
function sumMassKg(items: unknown): Decimal | undefined {
  if (!Array.isArray(items)) return undefined;
  let total = new Decimal(0);
  let seen = false;
  for (const item of items) {
    const raw = (item as { massKg?: unknown })?.massKg;
    if (typeof raw !== 'string') continue;
    try {
      const d = new Decimal(raw);
      if (!d.isFinite()) continue;
      total = total.plus(d);
      seen = true;
    } catch {
      /* a malformed mass is L1's problem, not L4's */
    }
  }
  return seen ? total : undefined;
}
```

Registry entries:

```ts
  /** Certified usable energy must be within tolerance of rated capacity times nominal voltage. */
  'PW-PLAUS-016': (ctx) => {
    const capacity = ctx.decimal('ratedCapacity');
    const voltage = ctx.decimal('nominalVoltage');
    const declared = ctx.decimal('certifiedUsableBatteryEnergy');
    if (capacity === undefined || voltage === undefined || declared === undefined) return [];
    const derived = capacity.times(voltage).div(1000);
    if (derived.isZero()) return [];
    if (declared.minus(derived).abs().div(derived).lte(ENERGY_COHERENCE_TOLERANCE)) return [];
    return [
      {
        attributeId: 'certifiedUsableBatteryEnergy',
        params: {
          declared: declared.toString(),
          derived: derived.toDecimalPlaces(3).toString(),
        },
      },
    ];
  },

  /** The four life-cycle shares should add up to about 100 %. */
  'PW-PLAUS-017': (ctx) => {
    const ids = ruleAttributes('PW-PLAUS-017');
    const shares = ids.map((id) => ctx.decimal(id)).filter((d) => d !== undefined);
    if (shares.length < 3) return [];
    const sum = shares.reduce((acc, d) => acc.plus(d), new Decimal(0));
    if (sum.minus(100).abs().lte(SHARE_SUM_TOLERANCE_PP)) return [];
    return [
      {
        attributeId: 'carbonFootprintShareRawMaterials',
        params: { sum: sum.toDecimalPlaces(2).toString() },
      },
    ];
  },

  /** The declared material masses must not outweigh the battery. */
  'PW-PLAUS-018': (ctx) => {
    const mass = ctx.decimal('batteryMass');
    if (mass === undefined) return [];
    const parts = [
      sumMassKg(ctx.value('criticalRawMaterials')),
      sumMassKg(ctx.value('electrodeAndElectrolyteMaterials')),
    ].filter((d) => d !== undefined);
    if (parts.length === 0) return [];
    const sum = parts.reduce((acc, d) => acc.plus(d), new Decimal(0));
    if (sum.lte(mass)) return [];
    return [
      {
        attributeId: 'batteryMass',
        params: { sum: sum.toDecimalPlaces(3).toString(), mass: mass.toString() },
      },
    ];
  },

  /** Hazardous substance concentrations must not exceed 100 % together. */
  'PW-PLAUS-019': (ctx) => {
    const items = ctx.value<{ concentrationPercent?: unknown }[]>('hazardousSubstances');
    if (!Array.isArray(items)) return [];
    let sum = new Decimal(0);
    let seen = false;
    for (const item of items) {
      const raw = item?.concentrationPercent;
      if (typeof raw !== 'string') continue;
      try {
        const d = new Decimal(raw);
        if (!d.isFinite()) continue;
        sum = sum.plus(d);
        seen = true;
      } catch {
        /* malformed concentration is L1's problem */
      }
    }
    if (!seen || sum.lte(100)) return [];
    return [
      { attributeId: 'hazardousSubstances', params: { sum: sum.toDecimalPlaces(2).toString() } },
    ];
  },

  /** No remaining value may exceed its original counterpart. */
  'PW-PLAUS-020': (ctx) => {
    const out: RuleViolation[] = [];
    for (const { remaining, original } of REMAINING_PAIRS) {
      const now = ctx.decimal(remaining);
      const then = ctx.decimal(original);
      if (now === undefined || then === undefined || now.lte(then)) continue;
      out.push({
        attributeId: remaining,
        params: {
          pair: `${remaining} / ${original}`,
          remaining: now.toString(),
          original: then.toString(),
        },
      });
    }
    return out;
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/rules/kb/rules.json packages/core/src/validate/plausibility/checks.ts packages/core/test/plausibility.rules.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(rules,core): PW-PLAUS-016 to 020

Energy coherence against capacity times voltage, the carbon-share sum,
material masses against the battery mass, hazardous concentrations, and
remaining values against their originals. Tolerances are named constants
and flagged in the rules file as engineering judgement.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 7: New rules PW-PLAUS-021 to 025, and the full 1:1 manifest assertion

**Files:**
- Modify: `packages/rules/kb/rules.json`
- Modify: `packages/core/src/validate/plausibility/checks.ts`
- Test: `packages/core/test/plausibility.rules.test.ts` (extend), `packages/core/test/plausibility.manifest.test.ts` (extend)

**Interfaces:**
- Consumes: `CAPACITY_FADE_TOLERANCE_PP` from Task 6.
- Produces: `CHECKS['PW-PLAUS-021'…'PW-PLAUS-025']`. After this task `Object.keys(CHECKS)` and the `kb/rules.json` id set are equal (24 ids).

- [ ] **Step 1: Add the five rule definitions**

Append to the `rules` array in `packages/rules/kb/rules.json`:

```json
    {
      "id": "PW-PLAUS-021",
      "severity": "warning",
      "title": {
        "en": "Round trip efficiency must not rise over cycle life",
        "de": "Der Round-Trip-Wirkungsgrad darf über die Lebensdauer nicht steigen"
      },
      "message": {
        "en": "Efficiency at 50 % of cycle-life ({later} %) is above the initial value ({initial} %).",
        "de": "Der Wirkungsgrad bei 50 % der Zyklenlebensdauer ({later} %) liegt über dem Anfangswert ({initial} %)."
      },
      "fixHint": {
        "en": "The two values are often swapped in data sheets; the initial value is the higher one.",
        "de": "Die beiden Werte werden in Datenblättern oft vertauscht; der Anfangswert ist der höhere."
      },
      "attributes": [
        "initialRoundTripEnergyEfficiency",
        "roundTripEnergyEfficiencyAt50PercentCycleLife"
      ],
      "legalRef": "BR Annex XIII 1(n)"
    },
    {
      "id": "PW-PLAUS-022",
      "severity": "warning",
      "title": {
        "en": "Capacity fade must agree with rated and remaining capacity",
        "de": "Der Kapazitätsverlust muss zu Nennkapazität und Restkapazität passen"
      },
      "message": {
        "en": "Declared capacity fade {declared} % differs from the {derived} % implied by rated and remaining capacity.",
        "de": "Angegebener Kapazitätsverlust {declared} % weicht von den aus Nenn- und Restkapazität berechneten {derived} % ab."
      },
      "fixHint": {
        "en": "Compute fade as (1 - remaining / rated) x 100 from the same measurement.",
        "de": "Kapazitätsverlust als (1 - Restkapazität / Nennkapazität) x 100 aus derselben Messung berechnen."
      },
      "attributes": ["capacityFade", "ratedCapacity", "remainingCapacity"],
      "legalRef": "BR Annex XIII 4(a)"
    },
    {
      "id": "PW-PLAUS-023",
      "severity": "warning",
      "title": {
        "en": "The cycle count must not exceed the expected lifetime in cycles",
        "de": "Die Zyklenzahl darf die erwartete Lebensdauer nicht überschreiten"
      },
      "message": {
        "en": "{cycles} full cycles exceed the expected lifetime of {expected} cycles.",
        "de": "{cycles} gefahrene Vollzyklen überschreiten die erwartete Lebensdauer von {expected} Zyklen."
      },
      "fixHint": {
        "en": "Either the expected lifetime is set too low or the counter is counting partial cycles.",
        "de": "Entweder ist die erwartete Lebensdauer zu niedrig angesetzt oder der Zähler zählt Teilzyklen."
      },
      "attributes": ["numberOfFullCycles", "expectedLifetimeCycles"],
      "legalRef": "BR Annex XIII 1(j), 4(d)"
    },
    {
      "id": "PW-PLAUS-024",
      "severity": "warning",
      "title": {
        "en": "A declared carbon footprint needs its calculation method and study",
        "de": "Ein angegebener CO2-Fußabdruck braucht Berechnungsmethode und Studie"
      },
      "message": {
        "en": "A carbon footprint is declared but {missing} is missing.",
        "de": "Der CO2-Fußabdruck ist angegeben, aber {missing} fehlt."
      },
      "fixHint": {
        "en": "Ask the provider of the life-cycle assessment for the calculation method and a link to the study.",
        "de": "Berechnungsmethode und Verweis auf die Studie beim Anbieter der Ökobilanz anfordern."
      },
      "attributes": [
        "carbonFootprintPerFunctionalUnit",
        "carbonFootprintGeneralInformation",
        "carbonFootprintStudyLink"
      ],
      "legalRef": "BR Annex XIII 1(c)"
    },
    {
      "id": "PW-PLAUS-025",
      "severity": "warning",
      "title": {
        "en": "Time in extreme temperature must not exceed the age of the battery",
        "de": "Die Zeiten in Extremtemperatur dürfen das Alter der Batterie nicht überschreiten"
      },
      "message": {
        "en": "The extreme-temperature times add up to {minutes} minutes but the battery has been in service for only {ageMinutes} minutes.",
        "de": "Die Extremtemperaturzeiten ergeben zusammen {minutes} Minuten, die Batterie ist seit Inbetriebnahme aber erst {ageMinutes} Minuten in Betrieb."
      },
      "fixHint": {
        "en": "Usually hours reported as minutes. Convert the battery management system values to minutes.",
        "de": "Häufig werden Stunden als Minuten angegeben. Werte des Batteriemanagementsystems in Minuten umrechnen."
      },
      "attributes": [
        "timeInExtremeHighTemperature",
        "timeInExtremeLowTemperature",
        "timeChargingInExtremeHighTemperature",
        "timeChargingInExtremeLowTemperature",
        "dateOfPuttingIntoService"
      ],
      "legalRef": "BR Annex XIII 4(d)"
    }
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/test/plausibility.rules.test.ts`:

```ts
describe('PW-PLAUS-021 efficiency over cycle life', () => {
  it('fires when the later value is higher', () => {
    const draft = draftWith({
      initialRoundTripEnergyEfficiency: { value: '88' },
      roundTripEnergyEfficiencyAt50PercentCycleLife: { value: '92' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-021');
  });
  it('is quiet when efficiency degrades', () => {
    const draft = draftWith({
      initialRoundTripEnergyEfficiency: { value: '92' },
      roundTripEnergyEfficiencyAt50PercentCycleLife: { value: '88' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-021');
  });
});

describe('PW-PLAUS-022 capacity fade coherence', () => {
  it('fires when the declared fade does not match the capacities', () => {
    // (1 - 150/200) x 100 = 25 %, not 2 %.
    const draft = draftWith({
      ratedCapacity: { value: '200' },
      remainingCapacity: { value: '150', recordedAt: '2026-08-30T18:30:00Z' },
      capacityFade: { value: '2' },
    });
    const f = validatePlausibility(draft).findings.find((x) => x.ruleId === 'PW-PLAUS-022');
    expect(f?.message.en).toContain('25');
  });
  it('is quiet within a percentage point', () => {
    const draft = draftWith({
      ratedCapacity: { value: '195' },
      remainingCapacity: { value: '194', recordedAt: '2026-08-30T18:30:00Z' },
      capacityFade: { value: '0' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-022');
  });
});

describe('PW-PLAUS-023 cycle count', () => {
  it('fires above the expected lifetime', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '4200', recordedAt: '2026-08-30T18:30:00Z' },
      expectedLifetimeCycles: { value: '3000' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-023');
  });
  it('is quiet below it', () => {
    const draft = draftWith({
      numberOfFullCycles: { value: '412', recordedAt: '2026-08-30T18:30:00Z' },
      expectedLifetimeCycles: { value: '3000' },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-023');
  });
});

describe('PW-PLAUS-024 carbon footprint companions', () => {
  it('fires once per missing companion', () => {
    const draft = draftWith({ carbonFootprintPerFunctionalUnit: { value: '61.2' } });
    const hits = validatePlausibility(draft).findings.filter((x) => x.ruleId === 'PW-PLAUS-024');
    expect(hits).toHaveLength(2);
  });
  it('is quiet when both companions are present', () => {
    const draft = draftWith({
      carbonFootprintPerFunctionalUnit: { value: '61.2' },
      carbonFootprintGeneralInformation: { value: { calculationMethods: ['PEFCR 2023'] } },
      carbonFootprintStudyLink: {
        value: [{ id: 'cf-study', title: 'LCA study', uri: 'https://example.org/lca.pdf' }],
      },
    });
    expect(ruleIds(draft)).not.toContain('PW-PLAUS-024');
  });
});

describe('PW-PLAUS-025 extreme temperature time', () => {
  it('fires when the times exceed the age since putting into service', () => {
    // In service since 2026-08-31, asOf 2026-09-03: about 4320 minutes.
    const draft = draftWith({
      dateOfPuttingIntoService: { value: '2026-08-31' },
      timeInExtremeHighTemperature: { value: '50000', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(draft)).toContain('PW-PLAUS-025');
  });
  it('is quiet for a plausible exposure and when the service date is unknown', () => {
    const ok = draftWith({
      dateOfPuttingIntoService: { value: '2026-01-01' },
      timeInExtremeHighTemperature: { value: '120', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(ok)).not.toContain('PW-PLAUS-025');
    const noDate = draftWith({
      timeInExtremeHighTemperature: { value: '50000', recordedAt: '2026-09-01T00:00:00Z' },
    });
    expect(ruleIds(noDate)).not.toContain('PW-PLAUS-025');
  });
});
```

Append to `packages/core/test/plausibility.manifest.test.ts`:

```ts
  it('the registry and the rule catalogue are exactly 1:1', () => {
    const ruleIdsInKb = plausibilityRules.map((r) => r.id).sort();
    expect(Object.keys(CHECKS).sort()).toEqual(ruleIdsInKb);
  });

  it('no finding leaves an unresolved placeholder', async () => {
    const { brokenSamples, samples, validate } = await import('@passwerk/core');
    const drafts = [
      ...Object.values(samples),
      ...Object.values(brokenSamples).map((b) => b.draft),
    ];
    for (const draft of drafts) {
      for (const finding of validate(draft).findings) {
        expect(finding.message.de, finding.ruleId).not.toMatch(/\{\w+\}/);
        expect(finding.message.en, finding.ruleId).not.toMatch(/\{\w+\}/);
      }
    }
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts packages/core/test/plausibility.manifest.test.ts`
Expected: FAIL — 021…025 do not fire and the 1:1 assertion reports five missing keys.

- [ ] **Step 4: Implement the five checks**

Add above the registry in `checks.ts`:

```ts
/** Minutes in a day, for the age arithmetic of PW-PLAUS-025. */
const MINUTES_PER_DAY = 1440;

/** Whole days between two ISO dates, computed from the calendar, never from a Date object. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const toDays = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number);
    // Days since the epoch by the civil-from-days algorithm: no Date, no timezone.
    const year = m <= 2 ? y - 1 : y;
    const era = Math.floor(year / 400);
    const yoe = year - era * 400;
    const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
    const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
    return era * 146097 + doe - 719468;
  };
  return toDays(toIsoDate) - toDays(fromIsoDate);
}
```

Registry entries:

```ts
  /** Round trip efficiency must not rise between the initial value and 50 % of cycle life. */
  'PW-PLAUS-021': (ctx) => {
    const initial = ctx.decimal('initialRoundTripEnergyEfficiency');
    const later = ctx.decimal('roundTripEnergyEfficiencyAt50PercentCycleLife');
    if (initial === undefined || later === undefined || later.lte(initial)) return [];
    return [
      {
        attributeId: 'roundTripEnergyEfficiencyAt50PercentCycleLife',
        params: { later: later.toString(), initial: initial.toString() },
      },
    ];
  },

  /** Declared capacity fade must match the rated and remaining capacities. */
  'PW-PLAUS-022': (ctx) => {
    const rated = ctx.decimal('ratedCapacity');
    const remaining = ctx.decimal('remainingCapacity');
    const declared = ctx.decimal('capacityFade');
    if (rated === undefined || remaining === undefined || declared === undefined) return [];
    if (rated.isZero()) return [];
    const derived = new Decimal(1).minus(remaining.div(rated)).times(100);
    if (declared.minus(derived).abs().lte(CAPACITY_FADE_TOLERANCE_PP)) return [];
    return [
      {
        attributeId: 'capacityFade',
        params: {
          declared: declared.toString(),
          derived: derived.toDecimalPlaces(2).toString(),
        },
      },
    ];
  },

  /** The cycle count must not exceed the expected lifetime in cycles. */
  'PW-PLAUS-023': (ctx) => {
    const cycles = ctx.decimal('numberOfFullCycles');
    const expected = ctx.decimal('expectedLifetimeCycles');
    if (cycles === undefined || expected === undefined || cycles.lte(expected)) return [];
    return [
      {
        attributeId: 'numberOfFullCycles',
        params: { cycles: cycles.toString(), expected: expected.toString() },
      },
    ];
  },

  /** A declared carbon footprint needs its calculation method and a link to the study. */
  'PW-PLAUS-024': (ctx) => {
    if (ctx.value('carbonFootprintPerFunctionalUnit') === undefined) return [];
    const out: RuleViolation[] = [];
    const general = ctx.value<{ calculationMethods?: unknown }>('carbonFootprintGeneralInformation');
    const methods = general?.calculationMethods;
    if (!Array.isArray(methods) || methods.length === 0) {
      out.push({
        attributeId: 'carbonFootprintGeneralInformation',
        params: { missing: 'carbonFootprintGeneralInformation.calculationMethods' },
      });
    }
    const study = ctx.value<unknown[]>('carbonFootprintStudyLink');
    if (!Array.isArray(study) || study.length === 0) {
      out.push({
        attributeId: 'carbonFootprintStudyLink',
        params: { missing: 'carbonFootprintStudyLink' },
      });
    }
    return out;
  },

  /** Extreme-temperature exposure cannot exceed the time the battery has been in service. */
  'PW-PLAUS-025': (ctx) => {
    const inService = ctx.date('dateOfPuttingIntoService');
    if (inService === undefined) return [];
    const ids = [
      'timeInExtremeHighTemperature',
      'timeInExtremeLowTemperature',
      'timeChargingInExtremeHighTemperature',
      'timeChargingInExtremeLowTemperature',
    ];
    const values = ids.map((id) => ctx.decimal(id)).filter((d) => d !== undefined);
    if (values.length === 0) return [];
    const minutes = values.reduce((acc, d) => acc.plus(d), new Decimal(0));
    const ageDays = daysBetween(inService, ctx.asOf.slice(0, 10));
    if (ageDays < 0) return []; // a service date after asOf is PW-PLAUS-003's business
    const ageMinutes = new Decimal(ageDays).times(MINUTES_PER_DAY);
    if (minutes.lte(ageMinutes)) return [];
    return [
      {
        attributeId: 'timeInExtremeHighTemperature',
        params: { minutes: minutes.toString(), ageMinutes: ageMinutes.toString() },
      },
    ];
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/plausibility.rules.test.ts packages/core/test/plausibility.manifest.test.ts`
Expected: PASS, including the 1:1 assertion over 24 ids.

- [ ] **Step 6: Run the full check**

Run: `pnpm check`
Expected: the plausibility tests pass. `test/validate.test.ts` and `test/golden.test.ts` may now FAIL because the golden samples trip real rules — that is the subject of Task 8. If so, commit this task with the plausibility tests green and note the failing golden tests in the commit body.

- [ ] **Step 7: Commit**

```bash
git add packages/rules/kb/rules.json packages/core/src/validate/plausibility/checks.ts packages/core/test
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(rules,core): PW-PLAUS-021 to 025; registry is 1:1 with the catalogue

Efficiency monotonicity, capacity-fade coherence, cycle count against
expected lifetime, carbon footprint companions and extreme-temperature
exposure against the age of the battery. The manifest test now asserts
the check registry and kb/rules.json hold the same 24 ids.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 8: Golden sample audit and oracle regeneration

With all 24 checks live, the golden samples meet L4 for the first time. Analysis of the current samples predicts these hits; confirm each one before acting on it.

| Sample | Rule | Why | Fix |
|---|---|---|---|
| `ev-valid` | PW-PLAUS-011 ×16 | 16 dynamic attributes carry a value but no `recordedAt`; the part 5 emitter has been filling `LastUpdate` from `meta.createdAt`, which fabricates a measurement time | Add a real `recordedAt` to each dynamic field in the sample |
| `lmt-valid` | PW-PLAUS-011 ×1 | `numberOfFullCycles` has no `recordedAt` | Same |
| `industrial-valid` | PW-PLAUS-012 ×1 | `capacityThresholdForExhaustion` is `not_displayed` for INDUSTRIAL and `ZeroToOne` in the template, so it can be left out | Remove the attribute from the sample |
| `industrial-valid` | PW-PLAUS-012 | `certifiedUsableBatteryEnergy` is `not_displayed` and `ZeroToOne`, but it is **not** in rule 012's authored attribute list, so no finding | No change |

**The rule is never weakened to make a sample pass.** A sample that trips a rule is either wrong (fix the data) or is a useful broken case (move it to `brokenSamples`).

**Files:**
- Modify: `packages/core/src/samples/ev-valid.json`, `lmt-valid.json`, `industrial-valid.json`
- Modify: `tools/oracle/expected.json`, `docs/CONFORMANCE.md`, `docs/conformance-badge.json` (regenerated, not hand-edited)
- Test: `packages/core/test/validate.test.ts`, `packages/core/test/golden.test.ts` (should pass unmodified once the samples are correct)

**Interfaces:**
- Consumes: everything from Tasks 1 to 7.
- Produces: golden samples that reach `valid` on all four layers.

- [ ] **Step 1: See exactly what fires**

Run:

```bash
node --experimental-strip-types -e "
import('./packages/core/src/index.ts').then(({ samples, validate }) => {
  for (const [name, draft] of Object.entries(samples)) {
    const r = validate(draft);
    console.log(name, r.verdict);
    for (const f of r.findings) console.log('  ', f.ruleId, f.attributeId ?? '', '|', f.message.en);
  }
});
"
```

If `--experimental-strip-types` cannot resolve the workspace alias, use a scratch vitest file instead:

```bash
pnpm vitest run packages/core/test/validate.test.ts --reporter=verbose
```

Record the actual list. Work from that, not from the table above.

- [ ] **Step 2: Add `recordedAt` to every dynamic field in the valid samples**

For each attribute that PW-PLAUS-011 named, add a `recordedAt` to that field in the sample JSON. Use timestamps that are before `meta.createdAt` (`2026-09-03T12:00:00Z`) and vary them a little so the samples read like real telemetry rather than a copy-paste, for example:

```json
    "remainingCapacity": {
      "value": "194",
      "status": "present",
      "source": [{ "file": "bms-export.csv", "cell": "B12" }],
      "recordedAt": "2026-08-31T06:00:00Z"
    },
```

Keep the existing `source` arrays untouched.

- [ ] **Step 3: Remove the not-displayed attribute from `industrial-valid`**

Delete the `capacityThresholdForExhaustion` entry from `packages/core/src/samples/industrial-valid.json`. Confirm L3 does not then report `PW-L3-MISSING`: its template element is `ZeroToOne`, so it must not.

- [ ] **Step 4: Verify the valid samples reach `valid` on four layers**

Run: `pnpm vitest run packages/core/test/validate.test.ts packages/core/test/golden.test.ts packages/core/test/samples.test.ts`
Expected: PASS, with `L4: { ran: true, errors: 0, warnings: 0 }` for all three valid samples.

If a sample still warns, decide deliberately: fix the data, or — if the case is genuinely instructive — add a new entry to `brokenSamples` with the rule id in `expectedFindings` and leave the valid sample clean.

- [ ] **Step 5: Record the L4 expectations of the broken samples**

The five broken samples may now produce L4 findings on top of their existing ones. Extend each `expectedFindings` array in `packages/core/src/samples/index.ts` with any `PW-PLAUS-*` id that the sample legitimately produces, and update the comment above it to say why. Do not add an id the sample does not actually produce — `samples.test.ts` only checks the `PW-L1-` subset, so add an assertion for the L4 subset too:

```ts
  it('broken samples produce the PW-PLAUS findings they declare', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      const produced = validate(draft).findings.map((f) => f.ruleId);
      for (const id of expectedFindings.filter((e) => e.startsWith('PW-PLAUS-'))) {
        expect(produced, name).toContain(id);
      }
    }
  });
```

Add `validate` to that file's import from `@passwerk/core`.

- [ ] **Step 6: Regenerate the oracle artefacts**

Oracle parity is defined as `oracle.ok === (L2 errors === 0)` (ADR D-012) and L4 cannot change L2, so parity stays 16/16. But `expected.json` records the overall `verdict`, and `docs/CONFORMANCE.md` renders it, so both regenerate if any verdict moved.

Run: `pnpm oracle`
Expected: 16/16 parity. `docs/CONFORMANCE.md` and `docs/conformance-badge.json` are rewritten; review the diff and confirm the only changes are verdict-related, with the hand-kept "Manual oracle runs" section intact.

If `uv` or Python is unavailable in this environment, say so and leave the artefacts untouched rather than hand-editing them; CI regenerates and verifies them.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/samples packages/core/test/samples.test.ts tools/oracle/expected.json docs/CONFORMANCE.md docs/conformance-badge.json
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "fix(core): golden samples satisfy L4

Dynamic values in the valid samples carry a real recordedAt instead of
letting the part 5 emitter fabricate LastUpdate from meta.createdAt, and
industrial-valid no longer fills a data point the Commission marks 'not
to be displayed' and the template leaves optional. Oracle parity is
unchanged at 16/16 (L2 parity, D-012).

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 9: Property tests for the plausibility layer

**Files:**
- Modify: `package.json` (root devDependency)
- Test: `packages/core/test/plausibility.property.test.ts` (create)

**Interfaces:**
- Consumes: `validatePlausibility`, `validateSchema`, `CHECKS`, `PassportDraft`; `attributes` from `@passwerk/rules`.
- Produces: nothing importable; a regression net for the invariants the registry must hold.

- [ ] **Step 1: Add fast-check**

Run:

```bash
pnpm add -D -w fast-check@4.9.0
```

Version 4.9.0 was published 2026-07-08, comfortably past the `minimumReleaseAge` of three days. If pnpm rejects it, pin the previous release rather than adding an exclusion.

- [ ] **Step 2: Write the property tests**

Create `packages/core/test/plausibility.property.test.ts`:

```ts
import { CHECKS, PassportDraft, validatePlausibility, validateSchema } from '@passwerk/core';
import { attributes, BATTERY_CATEGORIES } from '@passwerk/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Fixed seed: property tests must be as reproducible as every other output in this project.
const RUN = { seed: 20260904, numRuns: 300 } as const;

const META = {
  schemaVersion: '1.0' as const,
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://example.org/bp/1',
};

/** Attributes whose value is a plain decimal or integer string: easy to generate. */
const NUMERIC = attributes.filter(
  (a) => a.valueKind === 'decimal' || a.valueKind === 'integer' || a.valueKind === 'percentage',
);

const categoryArb = fc.constantFrom(...BATTERY_CATEGORIES);

/** A draft holding a random subset of numeric attributes with random in-band values. */
const draftArb = fc
  .tuple(
    categoryArb,
    fc.uniqueArray(fc.integer({ min: 0, max: NUMERIC.length - 1 }), { maxLength: 12 }),
    fc.array(fc.integer({ min: -2000, max: 20000 }), { minLength: 12, maxLength: 12 }),
  )
  .map(([category, indices, numbers]) => {
    const entries = indices.map((index, i) => {
      const attribute = NUMERIC[index];
      const raw = numbers[i % numbers.length];
      const value = attribute.valueKind === 'integer' ? String(raw) : `${raw}.5`;
      return [attribute.id, { value, status: 'present', source: [] }];
    });
    return { meta: { ...META, category }, attributes: Object.fromEntries(entries) };
  });

describe('L4 properties', () => {
  it('never fires on a draft with no attributes', () => {
    fc.assert(
      fc.property(categoryArb, (category) => {
        const draft = PassportDraft.parse({ meta: { ...META, category }, attributes: {} });
        expect(validatePlausibility(draft).findings).toEqual([]);
      }),
      RUN,
    );
  });

  it('never throws, whatever the draft holds', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        expect(() => validatePlausibility(parsed.data)).not.toThrow();
      }),
      RUN,
    );
  });

  it('never reports an attribute that L1 rejected', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const l1 = validateSchema(input);
        if (!l1.draft) return;
        const rejected = new Set(
          l1.findings.filter((f) => f.severity === 'error').map((f) => f.attributeId),
        );
        const findings = validatePlausibility(l1.draft, { l1Findings: l1.findings }).findings;
        for (const finding of findings) {
          expect(rejected.has(finding.attributeId), finding.ruleId).toBe(false);
        }
      }),
      RUN,
    );
  });

  it('is independent of attribute insertion order', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        const reversed = PassportDraft.parse({
          meta: input.meta,
          attributes: Object.fromEntries(Object.entries(input.attributes).reverse()),
        });
        expect(validatePlausibility(reversed).findings).toEqual(
          validatePlausibility(parsed.data).findings,
        );
      }),
      RUN,
    );
  });

  it('produces findings only for rules that exist, with both languages filled', () => {
    fc.assert(
      fc.property(draftArb, (input) => {
        const parsed = PassportDraft.safeParse(input);
        if (!parsed.success) return;
        for (const finding of validatePlausibility(parsed.data).findings) {
          expect(Object.keys(CHECKS)).toContain(finding.ruleId);
          expect(finding.layer).toBe('L4');
          expect(finding.message.de.length).toBeGreaterThan(0);
          expect(finding.message.en.length).toBeGreaterThan(0);
          expect(finding.message.de).not.toMatch(/\{\w+\}/);
          expect(finding.message.en).not.toMatch(/\{\w+\}/);
        }
      }),
      RUN,
    );
  });
});
```

- [ ] **Step 3: Run the property tests**

Run: `pnpm vitest run packages/core/test/plausibility.property.test.ts`
Expected: PASS. If a case fails, fast-check prints the shrunk counterexample and the seed — treat it as a real defect in a check, not as a reason to loosen the property.

- [ ] **Step 4: Confirm fast-check stays out of the shipped bundle**

`fast-check` is a root devDependency and must never appear in `packages/core/package.json` dependencies. Confirm:

Run: `node -e "const p=require('./packages/core/package.json');console.log(Object.keys(p.dependencies).join(','))"`
Expected: no `fast-check`.

- [ ] **Step 5: Run the full check and commit**

Run: `pnpm check`

```bash
git add package.json pnpm-lock.yaml packages/core/test/plausibility.property.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "test(core): property tests for the plausibility layer

fast-check 4.9.0 with a fixed seed: L4 never fires on an empty draft,
never throws, never reports an attribute L1 rejected, is independent of
attribute insertion order, and always fills both languages with no
unresolved placeholder.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 10: Gap report

**Files:**
- Create: `packages/core/src/gap/action.ts`, `packages/core/src/gap/report.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/gap.test.ts` (create), `packages/core/test/gap.snapshot.test.ts` (create)

**Interfaces:**
- Consumes: `attributes`, `getAttribute`, `LangText`, `ApplicabilityStatus` from `@passwerk/rules`; `PassportDraft`, `getField` from the model; `ValidationReport` from `validate/finding.js`.
- Produces: `gapReport(draft, options?): GapReport`; types `GapBucket`, `GapStatus`, `GapItem`, `Completeness`, `GapReport`; `suggestedAction(status, bucket, whoTypicallyHasIt): LangText`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/gap.test.ts`:

```ts
import { gapReport, samples, validate } from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('gapReport', () => {
  const report = gapReport(validate(samples['ev-valid']).findings.length === 0
    ? (samples['ev-valid'] as never)
    : (samples['ev-valid'] as never));

  it('covers every knowledge-base attribute exactly once', () => {
    const ids = gapReport(samples['ev-valid'] as never).items.map((i) => i.attributeId);
    expect(ids).toHaveLength(attributes.length);
    expect(new Set(ids).size).toBe(attributes.length);
  });

  it('buckets by the effective applicability for the draft category', () => {
    const items = gapReport(samples['ev-valid'] as never).items;
    const byId = new Map(items.map((i) => [i.attributeId, i]));
    expect(byId.get('batteryMass')?.bucket).toBe('required');
    // Deferred: the Commission marks the recycled-content shares not yet applicable.
    expect(byId.get('recycledCobaltPreConsumer')?.bucket).toBe('deferred');
  });

  it('never counts a deferred or optional attribute toward completeness', () => {
    const r = gapReport(samples['industrial-valid'] as never);
    const counted = r.items.filter((i) => i.bucket === 'required').length;
    expect(r.completeness.mandatory.total).toBe(counted);
    const overall = r.items.filter(
      (i) => i.bucket === 'required' || i.bucket === 'conditional',
    ).length;
    expect(r.completeness.overall.total).toBe(overall);
  });

  it('reports percent as a decimal string with one fractional digit', () => {
    const r = gapReport(samples['lmt-valid'] as never);
    expect(r.completeness.mandatory.percent).toMatch(/^\d+\.\d$/);
    expect(Number(r.completeness.mandatory.percent)).toBeGreaterThan(0);
  });

  it('marks an attribute with an error finding as invalid, not present', () => {
    const draft = samples['ev-valid'] as never;
    const validation = validate(draft);
    const r = gapReport(draft, { report: validation });
    for (const item of r.items) {
      if (item.status === 'invalid') expect(item.findings.length).toBeGreaterThan(0);
    }
  });

  it('carries legal references, who-has-it and a DE/EN suggested action', () => {
    const item = gapReport(samples['ev-valid'] as never).items.find(
      (i) => i.attributeId === 'batteryMass',
    );
    expect(item?.legalRefs.length).toBeGreaterThan(0);
    expect(item?.whoTypicallyHasIt.de.length).toBeGreaterThan(0);
    expect(item?.suggestedAction.de.length).toBeGreaterThan(0);
    expect(item?.suggestedAction.en.length).toBeGreaterThan(0);
  });

  it('groups by submodel and by data owner without losing an item', () => {
    const r = gapReport(samples['ev-valid'] as never);
    const inSubmodels = r.bySubmodel.flatMap((g) => g.attributeIds);
    const inOwners = r.byDataOwner.flatMap((g) => g.attributeIds);
    expect(inSubmodels.sort()).toEqual(r.items.map((i) => i.attributeId).sort());
    expect(inOwners.sort()).toEqual(r.items.map((i) => i.attributeId).sort());
  });

  it('is deterministic', () => {
    expect(JSON.stringify(gapReport(samples['ev-valid'] as never))).toBe(
      JSON.stringify(gapReport(samples['ev-valid'] as never)),
    );
  });

  it('states that it is not legal advice', () => {
    expect(gapReport(samples['ev-valid'] as never).isNotLegalAdvice).toBe(true);
  });
});
```

Create `packages/core/test/gap.snapshot.test.ts`:

```ts
import { brokenSamples, BROKEN_SAMPLE_NAMES, gapReport, validate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('gap report snapshots', () => {
  for (const name of BROKEN_SAMPLE_NAMES) {
    it(`is stable for ${name}`, () => {
      const draft = brokenSamples[name].draft;
      const report = gapReport(draft, { report: validate(draft) });
      // Snapshot a digest rather than the whole report: the full item list is 93 entries and
      // would bury a real change in noise.
      expect({
        category: report.category,
        completeness: report.completeness,
        buckets: report.items.reduce<Record<string, number>>((acc, i) => {
          acc[i.bucket] = (acc[i.bucket] ?? 0) + 1;
          return acc;
        }, {}),
        statuses: report.items.reduce<Record<string, number>>((acc, i) => {
          acc[i.status] = (acc[i.status] ?? 0) + 1;
          return acc;
        }, {}),
        invalid: report.items.filter((i) => i.status === 'invalid').map((i) => i.attributeId),
      }).toMatchSnapshot();
    });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/gap.test.ts packages/core/test/gap.snapshot.test.ts`
Expected: FAIL — `gapReport` is not exported.

- [ ] **Step 3: Write the suggested-action texts**

Create `packages/core/src/gap/action.ts`:

```ts
import type { LangText } from '@passwerk/rules';

export type GapBucket = 'required' | 'conditional' | 'deferred' | 'optional';
export type GapStatus = 'present' | 'missing' | 'invalid' | 'conflict' | 'not_applicable';

/**
 * Workflow instructions, not legal claims: what to do next about one attribute. The deferred
 * wording carries the reassurance that used to live in PW-PLAUS-013 (ADR D-023): a data point
 * the Commission marks 'not yet applicable' is not a gap as of February 2027.
 */
export function suggestedAction(
  status: GapStatus,
  bucket: GapBucket,
  whoTypicallyHasIt: LangText,
): LangText {
  if (bucket === 'deferred') {
    return {
      en: 'No action. The Commission marks this data point as not to be filled or displayed for this battery category, so its absence is not a gap.',
      de: 'Keine Aktion. Die Kommission stuft diesen Datenpunkt für diese Batteriekategorie als nicht auszufüllen bzw. nicht anzuzeigen ein; sein Fehlen ist keine Lücke.',
    };
  }
  switch (status) {
    case 'present':
      return {
        en: 'Nothing to do. Keep the source document with the passport for verification.',
        de: 'Nichts zu tun. Belegdokument zusammen mit dem Pass für die Prüfung aufbewahren.',
      };
    case 'invalid':
      return {
        en: `The value is present but rejected by validation. Correct it with ${whoTypicallyHasIt.en}.`,
        de: `Der Wert ist vorhanden, aber von der Prüfung abgelehnt. Mit ${whoTypicallyHasIt.de} korrigieren.`,
      };
    case 'conflict':
      return {
        en: `Two documents disagree. Decide which source is authoritative, with ${whoTypicallyHasIt.en}.`,
        de: `Zwei Dokumente widersprechen sich. Mit ${whoTypicallyHasIt.de} klären, welche Quelle maßgeblich ist.`,
      };
    case 'not_applicable':
      return {
        en: 'Marked as not applicable for this battery. Record why, in case a market surveillance authority asks.',
        de: 'Für diese Batterie als nicht zutreffend markiert. Begründung dokumentieren, falls eine Marktüberwachungsbehörde nachfragt.',
      };
    default:
      return bucket === 'conditional'
        ? {
            en: `Confirm whether this applies to your battery; if it does, request the value from ${whoTypicallyHasIt.en}.`,
            de: `Prüfen, ob dies für Ihre Batterie zutrifft; falls ja, den Wert bei ${whoTypicallyHasIt.de} anfordern.`,
          }
        : {
            en: `Request this value from ${whoTypicallyHasIt.en}.`,
            de: `Diesen Wert bei ${whoTypicallyHasIt.de} anfordern.`,
          };
  }
}
```

- [ ] **Step 4: Implement the report**

Create `packages/core/src/gap/report.ts`:

```ts
import {
  type ApplicabilityStatus,
  attributes as knowledgeBaseAttributes,
  type BatteryCategory,
  getTemplate,
  type LangText,
} from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type { AnyFieldValue } from '../model/field.js';
import { getField, type PassportDraft } from '../model/passport.js';
import type { Provenance } from '../model/provenance.js';
import type { ValidationReport } from '../validate/finding.js';
import { type GapBucket, type GapStatus, suggestedAction } from './action.js';

export type { GapBucket, GapStatus } from './action.js';

export interface Completeness {
  present: number;
  total: number;
  /** Decimal string with one fractional digit, e.g. "72.3". Computed with decimal.js. */
  percent: string;
}

export interface GapItem {
  attributeId: string;
  name: LangText;
  status: GapStatus;
  bucket: GapBucket;
  applicability: ApplicabilityStatus;
  applicabilityText?: string;
  part: number | null;
  submodelIdShort: string | null;
  legalRefs: string[];
  whoTypicallyHasIt: LangText;
  explanation: LangText;
  suggestedAction: LangText;
  sources: Provenance[];
  confidence?: number;
  /** Rule ids from the passed report that name this attribute. */
  findings: string[];
  verify: boolean;
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

export interface GapReportOptions {
  /** A ValidationReport for the same draft; supplies the invalid status and finding ids. */
  report?: ValidationReport;
  /** ISO date-time treated as "now". Default: draft.meta.createdAt. */
  asOf?: string;
}

const BUCKETS: Record<ApplicabilityStatus, GapBucket> = {
  mandatory: 'required',
  conditional: 'conditional',
  optional: 'optional',
  // Never reported as a gap (ADR D-008).
  not_yet_applicable: 'deferred',
  not_displayed: 'deferred',
};

function completeness(present: number, total: number): Completeness {
  const percent =
    total === 0
      ? new Decimal(0)
      : new Decimal(present).div(total).times(100).toDecimalPlaces(1, Decimal.ROUND_HALF_UP);
  return { present, total, percent: percent.toFixed(1) };
}

function statusOf(field: AnyFieldValue | undefined, hasError: boolean): GapStatus {
  if (hasError) return 'invalid';
  if (field?.status === 'conflict') return 'conflict';
  if (field?.status === 'not_applicable') return 'not_applicable';
  if (field?.status === 'present') return 'present';
  return 'missing';
}

/**
 * The to-do list: every knowledge-base attribute for this battery's category, with what it
 * is, who typically holds it, what the law says and what to do next. Not legal advice.
 */
export function gapReport(draft: PassportDraft, options: GapReportOptions = {}): GapReport {
  const category = draft.meta.category;
  const findingsByAttribute = new Map<string, { ids: string[]; error: boolean }>();
  for (const finding of options.report?.findings ?? []) {
    if (!finding.attributeId) continue;
    const entry = findingsByAttribute.get(finding.attributeId) ?? { ids: [], error: false };
    entry.ids.push(finding.ruleId);
    entry.error ||= finding.severity === 'error';
    findingsByAttribute.set(finding.attributeId, entry);
  }

  const items: GapItem[] = knowledgeBaseAttributes.map((attribute) => {
    const cell = attribute.applicability[category];
    const bucket = BUCKETS[cell.status];
    const field = getField(draft, attribute.id);
    const found = findingsByAttribute.get(attribute.id);
    const status = statusOf(field, found?.error ?? false);
    const submodel = attribute.part === null ? null : getTemplate(attribute.part);
    return {
      attributeId: attribute.id,
      name: attribute.name,
      status,
      bucket,
      applicability: cell.status,
      ...(cell.text ? { applicabilityText: cell.text } : {}),
      part: attribute.part,
      submodelIdShort: submodel?.submodelIdShort ?? null,
      legalRefs: attribute.legalRefs,
      whoTypicallyHasIt: attribute.whoTypicallyHasIt,
      explanation: attribute.explanation,
      suggestedAction: suggestedAction(status, bucket, attribute.whoTypicallyHasIt),
      sources: field?.source ?? [],
      ...(field?.confidence !== undefined ? { confidence: field.confidence } : {}),
      findings: [...(found?.ids ?? [])].sort(),
      verify: attribute.verify,
    };
  });

  const counted = (buckets: GapBucket[]): Completeness => {
    const relevant = items.filter((i) => buckets.includes(i.bucket));
    return completeness(relevant.filter((i) => i.status === 'present').length, relevant.length);
  };

  const submodelKeys = [...new Set(items.map((i) => i.part))].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
  const bySubmodel = submodelKeys.map((part) => {
    const group = items.filter((i) => i.part === part);
    const relevant = group.filter((i) => i.bucket === 'required' || i.bucket === 'conditional');
    return {
      part,
      submodelIdShort: group[0]?.submodelIdShort ?? null,
      completeness: completeness(
        relevant.filter((i) => i.status === 'present').length,
        relevant.length,
      ),
      attributeIds: group.map((i) => i.attributeId),
    };
  });

  const owners = new Map<string, { owner: LangText; attributeIds: string[] }>();
  for (const item of items) {
    const key = item.whoTypicallyHasIt.en;
    const entry = owners.get(key) ?? { owner: item.whoTypicallyHasIt, attributeIds: [] };
    entry.attributeIds.push(item.attributeId);
    owners.set(key, entry);
  }
  const byDataOwner = [...owners.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);

  return {
    category,
    asOf: options.asOf ?? draft.meta.createdAt,
    completeness: { mandatory: counted(['required']), overall: counted(['required', 'conditional']) },
    items,
    bySubmodel,
    byDataOwner,
    isNotLegalAdvice: true,
    sources: [
      'Regulation (EU) 2023/1542, Annex XIII and Annex VI Part A',
      "European Commission, Guidance Document 'Digital Batteries Passport - data points by category', version 2.0",
      'DIN DKE SPEC 99100',
      'IDTA 02035-1 to -7',
    ],
  };
}
```

- [ ] **Step 5: Export and fix the test's draft typing**

In `packages/core/src/index.ts` add, alphabetically before the `ingest/` exports:

```ts
export * from './gap/action.js';
export * from './gap/report.js';
```

`gapReport` takes a parsed `PassportDraft`, but `samples[...]` is a `PassportDraftInput`. Rather than the `as never` casts in the draft test, parse the sample first. Replace every `samples['x'] as never` in `gap.test.ts` with a helper defined at the top of that file:

```ts
import { PassportDraft } from '@passwerk/core';
const parse = (name: 'ev-valid' | 'lmt-valid' | 'industrial-valid') =>
  PassportDraft.parse(samples[name]);
```

and use `parse('ev-valid')`. Do the same in `gap.snapshot.test.ts` for `brokenSamples[name].draft`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/gap.test.ts packages/core/test/gap.snapshot.test.ts`
Expected: PASS. The snapshot file is written on the first run — read it before committing and confirm the numbers are sane (for example that `deferred` holds 18 or more entries and `required` matches the counts in the spec: EV 47, LMT 49, industrial 36).

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/gap packages/core/src/index.ts packages/core/test/gap.test.ts packages/core/test/gap.snapshot.test.ts packages/core/test/__snapshots__
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): gap report

Every knowledge-base attribute bucketed by its effective applicability,
two completeness figures (mandatory and overall), grouped by submodel and
by data owner, with legal references, who-has-it and a DE/EN suggested
action. Deferred data points are listed but never counted as gaps.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 11: Obligations decision tree (ADR D-022)

**Files:**
- Create: `packages/core/src/obligations/types.ts`, `packages/core/src/obligations/check.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/obligations.test.ts` (create)

**Interfaces:**
- Consumes: `getTimeline`, `getAttributesForCategory`, `LangText`, `TimelineStatus` from `@passwerk/rules`.
- Produces: `BATTERY_TYPES`, `ROLES`, `checkObligations(input): ObligationResult`, and the types `BatteryType`, `Role`, `ObligationInput`, `ObligationVerdict`, `ObligationResult`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/obligations.test.ts`:

```ts
import { BATTERY_TYPES, checkObligations } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const AS_OF = '2027-03-01';

describe('checkObligations', () => {
  it('requires a passport for an EV battery of any size', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AS_OF });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('EV');
    expect(r.mandatoryAttributes.length).toBe(47);
    expect(r.sources).toContain('BR Article 77(1), Annex XIII');
  });

  it('requires a passport for an LMT battery', () => {
    const r = checkObligations({ batteryType: 'LMT', role: 'importer', asOf: AS_OF });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('LMT');
  });

  it('requires a passport for an industrial battery above 2 kWh', () => {
    const r = checkObligations({
      batteryType: 'INDUSTRIAL',
      energyKwh: '220',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('INDUSTRIAL_GT_2KWH');
  });

  it('does not require one for an industrial battery of exactly 2 kWh', () => {
    const r = checkObligations({
      batteryType: 'INDUSTRIAL',
      energyKwh: '2',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('not_required');
    expect(r.category).toBeNull();
  });

  it('declines to answer for an industrial battery of unknown size', () => {
    const r = checkObligations({ batteryType: 'INDUSTRIAL', role: 'manufacturer', asOf: AS_OF });
    expect(r.verdict).toBe('insufficient_input');
    expect(r.missingInput).toContain('energyKwh');
  });

  it('treats stationary storage as industrial and says so', () => {
    const r = checkObligations({
      batteryType: 'STATIONARY_BATTERY_ENERGY_STORAGE',
      energyKwh: '500',
      role: 'manufacturer',
      asOf: AS_OF,
    });
    expect(r.verdict).toBe('required');
    expect(r.category).toBe('INDUSTRIAL_GT_2KWH');
    expect(r.reason.en.toLowerCase()).toContain('industrial');
    expect(r.reason.de.length).toBeGreaterThan(0);
  });

  it('does not require one for portable or SLI batteries', () => {
    for (const batteryType of ['PORTABLE', 'SLI', 'OTHER'] as const) {
      const r = checkObligations({ batteryType, role: 'manufacturer', asOf: AS_OF });
      expect(r.verdict, batteryType).toBe('not_required');
      expect(r.mandatoryAttributes, batteryType).toEqual([]);
    }
  });

  it('does not require one before the passport obligation starts', () => {
    const r = checkObligations({
      batteryType: 'EV',
      role: 'manufacturer',
      placedOnMarketDate: '2026-11-01',
    });
    expect(r.verdict).toBe('not_required');
    expect(r.reason.en).toContain('2027-02-18');
  });

  it('declines to answer without any date', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer' });
    expect(r.verdict).toBe('insufficient_input');
    expect(r.missingInput).toContain('placedOnMarketDate');
  });

  it('returns the timeline with in-effect flags and verify flags intact', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AS_OF });
    const passportEvent = r.timeline.find((e) => e.id === 'battery-passport');
    expect(passportEvent?.inEffect).toBe(true);
    expect(passportEvent?.legalRef).toBe('BR Article 77(1), Annex XIII');
    const future = r.timeline.find((e) => e.date > AS_OF);
    expect(future?.inEffect).toBe(false);
    expect(r.timeline.some((e) => e.verify === true)).toBe(true);
  });

  it('gives DE/EN role guidance and never claims to be legal advice', () => {
    const r = checkObligations({ batteryType: 'EV', role: 'distributor', asOf: AS_OF });
    expect(r.roleGuidance.de.length).toBeGreaterThan(0);
    expect(r.roleGuidance.en.length).toBeGreaterThan(0);
    expect(r.isNotLegalAdvice).toBe(true);
  });

  it('answers for every battery type without throwing', () => {
    for (const batteryType of BATTERY_TYPES) {
      expect(() =>
        checkObligations({ batteryType, energyKwh: '10', role: 'other', asOf: AS_OF }),
      ).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/obligations.test.ts`
Expected: FAIL — `checkObligations` is not exported.

- [ ] **Step 3: Write the types**

Create `packages/core/src/obligations/types.ts`:

```ts
import type { BatteryCategory, LangText, TimelineStatus } from '@passwerk/rules';

/**
 * Wider than the three passport categories on purpose, so the tool can answer "no passport
 * needed" (ADR D-022). Labels are engine text; no Article 3 definition is quoted, because the
 * knowledge base does not hold them and this project does not guess legal references.
 */
export const BATTERY_TYPES = [
  'EV',
  'LMT',
  'INDUSTRIAL',
  'STATIONARY_BATTERY_ENERGY_STORAGE',
  'PORTABLE',
  'SLI',
  'OTHER',
] as const;
export type BatteryType = (typeof BATTERY_TYPES)[number];

export const ROLES = [
  'manufacturer',
  'authorised_representative',
  'importer',
  'distributor',
  'fulfilment_service_provider',
  'other',
] as const;
export type Role = (typeof ROLES)[number];

export interface ObligationInput {
  batteryType: BatteryType;
  /** Battery energy in kWh as a decimal string. Decides the industrial 2 kWh threshold. */
  energyKwh?: string;
  /** ISO date the battery is or was placed on the market or put into service. */
  placedOnMarketDate?: string;
  role: Role;
  /** ISO date treated as "now". Falls back to placedOnMarketDate. */
  asOf?: string;
}

export type ObligationVerdict = 'required' | 'not_required' | 'insufficient_input';

export interface ObligationTimelineEntry {
  id: string;
  date: string;
  dateRule: 'fixed' | 'latest_of';
  alternative?: string;
  title: LangText;
  legalRef: string;
  status: TimelineStatus;
  note?: LangText;
  /** True when the event's date is on or before the effective date. */
  inEffect: boolean;
  /** Carried through from the knowledge base: the entry is not yet confirmed. */
  verify: boolean;
}

export interface ObligationResult {
  verdict: ObligationVerdict;
  reason: LangText;
  /** Which input would settle an insufficient_input verdict. */
  missingInput: string[];
  category: BatteryCategory | null;
  mandatoryAttributes: string[];
  conditionalAttributes: string[];
  deferredAttributes: string[];
  timeline: ObligationTimelineEntry[];
  roleGuidance: LangText;
  sources: string[];
  isNotLegalAdvice: true;
}
```

- [ ] **Step 4: Implement the decision tree**

Create `packages/core/src/obligations/check.ts`:

```ts
import {
  type BatteryCategory,
  getAttributesForCategory,
  getTimeline,
  type LangText,
} from '@passwerk/rules';
import { Decimal } from 'decimal.js';
import type {
  BatteryType,
  ObligationInput,
  ObligationResult,
  ObligationTimelineEntry,
  Role,
} from './types.js';

export * from './types.js';

/** The one citation used throughout, read from the knowledge base rather than typed here. */
function passportEvent() {
  const event = getTimeline().find((e) => e.id === 'battery-passport');
  if (!event) throw new Error('@passwerk/core: timeline.json has no battery-passport event');
  return event;
}

const CATEGORY_OF: Partial<Record<BatteryType, BatteryCategory>> = {
  EV: 'EV',
  LMT: 'LMT',
  INDUSTRIAL: 'INDUSTRIAL_GT_2KWH',
  STATIONARY_BATTERY_ENERGY_STORAGE: 'INDUSTRIAL_GT_2KWH',
};

const THRESHOLD_TYPES: BatteryType[] = ['INDUSTRIAL', 'STATIONARY_BATTERY_ENERGY_STORAGE'];

const ROLE_GUIDANCE: Record<Role, LangText> = {
  manufacturer: {
    en: 'The manufacturer places the battery on the market and is responsible for creating the passport and keeping it accurate.',
    de: 'Der Hersteller bringt die Batterie in Verkehr und ist dafür verantwortlich, den Pass zu erstellen und aktuell zu halten.',
  },
  authorised_representative: {
    en: 'An authorised representative acts on a written mandate from the manufacturer and should confirm in that mandate who maintains the passport.',
    de: 'Ein Bevollmächtigter handelt auf Grundlage eines schriftlichen Mandats des Herstellers; im Mandat sollte geregelt sein, wer den Pass pflegt.',
  },
  importer: {
    en: 'An importer must check that the passport exists and is reachable before placing the battery on the Union market.',
    de: 'Ein Importeur muss vor dem Inverkehrbringen in der Union prüfen, dass der Pass existiert und erreichbar ist.',
  },
  distributor: {
    en: 'A distributor must check that the battery carries the QR code and must not make it available if the passport is missing.',
    de: 'Ein Händler muss prüfen, dass die Batterie den QR-Code trägt, und darf sie ohne Pass nicht bereitstellen.',
  },
  fulfilment_service_provider: {
    en: 'A fulfilment service provider handles batteries placed on the market by others and should obtain written confirmation that a passport exists.',
    de: 'Ein Fulfilment-Dienstleister behandelt Batterien, die andere in Verkehr bringen, und sollte sich schriftlich bestätigen lassen, dass ein Pass existiert.',
  },
  other: {
    en: 'Establish which economic operator role applies before deciding who must create and maintain the passport.',
    de: 'Zunächst klären, welche Rolle als Wirtschaftsakteur zutrifft, bevor entschieden wird, wer den Pass erstellen und pflegen muss.',
  },
};

function attributeSets(category: BatteryCategory | null) {
  if (category === null) {
    return { mandatoryAttributes: [], conditionalAttributes: [], deferredAttributes: [] };
  }
  const ids = (statuses: Parameters<typeof getAttributesForCategory>[1]) =>
    getAttributesForCategory(category, statuses)
      .map((a) => a.id)
      .sort();
  return {
    mandatoryAttributes: ids(['mandatory']),
    conditionalAttributes: ids(['conditional']),
    deferredAttributes: ids(['not_yet_applicable', 'not_displayed']),
  };
}

function timelineFor(category: BatteryCategory | null, effectiveDate: string) {
  return getTimeline(category ?? undefined).map(
    (event): ObligationTimelineEntry => ({
      id: event.id,
      date: event.date,
      dateRule: event.dateRule,
      ...(event.alternative ? { alternative: event.alternative } : {}),
      title: event.title,
      legalRef: event.legalRef,
      status: event.status,
      ...(event.note ? { note: event.note } : {}),
      inEffect: event.date <= effectiveDate,
      verify: event.verify,
    }),
  );
}

function result(
  partial: Pick<ObligationResult, 'verdict' | 'reason' | 'category'> &
    Partial<Pick<ObligationResult, 'missingInput'>>,
  role: Role,
  effectiveDate: string,
): ObligationResult {
  return {
    ...partial,
    missingInput: partial.missingInput ?? [],
    ...attributeSets(partial.category),
    timeline: timelineFor(partial.category, effectiveDate),
    roleGuidance: ROLE_GUIDANCE[role],
    sources: [passportEvent().legalRef],
    isNotLegalAdvice: true,
  };
}

/**
 * Does this battery need a passport, and if so which attribute set applies? Every claim cites
 * Article 77(1) as read from timeline.json; no Article 3 definition is quoted (ADR D-022).
 */
export function checkObligations(input: ObligationInput): ObligationResult {
  const event = passportEvent();
  const effectiveDate = input.asOf ?? input.placedOnMarketDate ?? '';

  if (effectiveDate === '') {
    return result(
      {
        verdict: 'insufficient_input',
        category: null,
        missingInput: ['placedOnMarketDate', 'asOf'],
        reason: {
          en: 'The passport obligation depends on when the battery is placed on the market. Provide that date, or an "as of" date to reason about.',
          de: 'Die Passpflicht hängt davon ab, wann die Batterie in Verkehr gebracht wird. Bitte dieses Datum oder ein Stichdatum angeben.',
        },
      },
      input.role,
      event.date,
    );
  }

  const category = CATEGORY_OF[input.batteryType] ?? null;

  if (category === null) {
    return result(
      {
        verdict: 'not_required',
        category: null,
        reason: {
          en: `${event.legalRef} requires a battery passport only for LMT batteries, industrial batteries above 2 kWh and electric vehicle batteries. This battery type is not one of them.`,
          de: `${event.legalRef} verlangt einen Batteriepass nur für LMT-Batterien, Industriebatterien über 2 kWh und Elektrofahrzeugbatterien. Dieser Batterietyp gehört nicht dazu.`,
        },
      },
      input.role,
      effectiveDate,
    );
  }

  if (THRESHOLD_TYPES.includes(input.batteryType)) {
    if (input.energyKwh === undefined) {
      return result(
        {
          verdict: 'insufficient_input',
          category: null,
          missingInput: ['energyKwh'],
          reason: {
            en: 'An industrial battery needs a passport only above 2 kWh. Provide the battery energy in kWh.',
            de: 'Eine Industriebatterie braucht erst über 2 kWh einen Pass. Bitte die Batterieenergie in kWh angeben.',
          },
        },
        input.role,
        effectiveDate,
      );
    }
    let energy: Decimal;
    try {
      energy = new Decimal(input.energyKwh);
    } catch {
      return result(
        {
          verdict: 'insufficient_input',
          category: null,
          missingInput: ['energyKwh'],
          reason: {
            en: `"${input.energyKwh}" is not a number of kWh that can be compared with the 2 kWh threshold.`,
            de: `"${input.energyKwh}" ist keine kWh-Zahl, die mit der 2-kWh-Schwelle verglichen werden kann.`,
          },
        },
        input.role,
        effectiveDate,
      );
    }
    if (!energy.gt(2)) {
      return result(
        {
          verdict: 'not_required',
          category: null,
          reason: {
            en: `${energy.toString()} kWh is not above the 2 kWh threshold, so ${event.legalRef} does not require a battery passport.`,
            de: `${energy.toString()} kWh liegen nicht über der 2-kWh-Schwelle; ${event.legalRef} verlangt daher keinen Batteriepass.`,
          },
        },
        input.role,
        effectiveDate,
      );
    }
  }

  if (effectiveDate < event.date) {
    return result(
      {
        verdict: 'not_required',
        category: null,
        reason: {
          en: `The battery passport obligation starts on ${event.date} (${event.legalRef}). A battery placed on the market on ${effectiveDate} is before that date.`,
          de: `Die Batteriepass-Pflicht beginnt am ${event.date} (${event.legalRef}). Eine am ${effectiveDate} in Verkehr gebrachte Batterie liegt davor.`,
        },
      },
      input.role,
      effectiveDate,
    );
  }

  const stationary = input.batteryType === 'STATIONARY_BATTERY_ENERGY_STORAGE';
  return result(
    {
      verdict: 'required',
      category,
      reason: {
        en: stationary
          ? `A stationary battery energy storage system above 2 kWh is treated as an industrial battery for the passport data set (${event.legalRef}).`
          : `${event.legalRef} requires a battery passport for this battery from ${event.date}.`,
        de: stationary
          ? `Ein stationäres Batterie-Energiespeichersystem über 2 kWh wird für den Passdatensatz wie eine Industriebatterie behandelt (${event.legalRef}).`
          : `${event.legalRef} verlangt für diese Batterie ab ${event.date} einen Batteriepass.`,
      },
    },
    input.role,
    effectiveDate,
  );
}
```

- [ ] **Step 5: Export**

In `packages/core/src/index.ts` add, alphabetically after the `model/` exports:

```ts
export * from './obligations/check.js';
export * from './obligations/types.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/obligations.test.ts`
Expected: PASS. If the EV mandatory count is not 47, read the real number from `getAttributesForCategory('EV').length` and correct the assertion — the knowledge base is the authority, not this plan.

- [ ] **Step 7: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/obligations packages/core/src/index.ts packages/core/test/obligations.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): checkObligations decision tree (D-022)

Seven battery types so the tool can answer 'no passport needed', the
2 kWh threshold, the February 2027 date gate, and insufficient_input
instead of a guess when energy or date is missing. Every claim cites
Article 77(1) as read from timeline.json.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 12: Explain

**Files:**
- Create: `packages/core/src/explain/explain.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/explain.test.ts` (create)

**Interfaces:**
- Consumes: `getAttribute`, `getRule`, `plausibilityRules`, `attributes` from `@passwerk/rules`; `message`, `RULE_IDS` from `validate/messages.js`.
- Produces: `explainAttribute(id)`, `explainRule(id)`, `explain(id)` and the types `AttributeExplanation`, `RuleExplanation`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/explain.test.ts`:

```ts
import { explain, explainAttribute, explainRule } from '@passwerk/core';
import { attributes, plausibilityRules } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('explainAttribute', () => {
  it('answers for every attribute in the knowledge base', () => {
    for (const attribute of attributes) {
      const e = explainAttribute(attribute.id);
      expect(e, attribute.id).toBeDefined();
      expect(e?.name.de.length, attribute.id).toBeGreaterThan(0);
      expect(e?.name.en.length, attribute.id).toBeGreaterThan(0);
      expect(e?.explanation.de.length, attribute.id).toBeGreaterThan(0);
      expect(e?.isNotLegalAdvice).toBe(true);
    }
  });

  it('carries the template details and the applicability per category', () => {
    const e = explainAttribute('batteryMass');
    expect(e?.template.length).toBeGreaterThan(0);
    expect(e?.template[0]?.semanticId).toBeTruthy();
    expect(e?.applicability.EV.status).toBeTruthy();
    expect(e?.applicability.INDUSTRIAL_GT_2KWH.status).toBeTruthy();
    expect(e?.legalRefs.length).toBeGreaterThan(0);
    expect(e?.definition.length).toBeGreaterThan(0);
  });

  it('lists the rules that read the attribute', () => {
    expect(explainAttribute('nominalVoltage')?.relatedRules).toContain('PW-PLAUS-002');
  });

  it('returns undefined for an unknown id', () => {
    expect(explainAttribute('notAnAttribute')).toBeUndefined();
  });
});

describe('explainRule', () => {
  it('answers for every plausibility rule with both languages', () => {
    for (const rule of plausibilityRules) {
      const e = explainRule(rule.id);
      expect(e?.title.de.length, rule.id).toBeGreaterThan(0);
      expect(e?.fixHint.en.length, rule.id).toBeGreaterThan(0);
      expect(e?.attributes.length, rule.id).toBeGreaterThan(0);
      expect(e?.attributes[0]?.name.de.length, rule.id).toBeGreaterThan(0);
    }
  });

  it('answers for an engine rule id so an agent can look up any finding', () => {
    const e = explainRule('PW-L3-MISSING');
    expect(e?.message.de.length).toBeGreaterThan(0);
    expect(e?.legalRef).toBeNull();
    // An engine rule has no single severity: PW-L1-DOCUMENT-UNCLASSIFIED is a warning
    // while PW-L3-MISSING is an error, and the finding carries the real value.
    expect(e?.severity).toBeNull();
    expect(e?.attributes).toEqual([]);
  });

  it('returns undefined for an unknown id', () => {
    expect(explainRule('PW-PLAUS-999')).toBeUndefined();
  });
});

describe('explain', () => {
  it('dispatches on the PW- prefix', () => {
    expect(explain('PW-PLAUS-002')?.kind).toBe('rule');
    expect(explain('batteryMass')?.kind).toBe('attribute');
    expect(explain('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/core/test/explain.test.ts`
Expected: FAIL — nothing is exported.

- [ ] **Step 3: Implement**

Create `packages/core/src/explain/explain.ts`:

```ts
import {
  type ApplicabilityCell,
  type BatteryCategory,
  type Cardinality,
  getAttribute,
  getRule,
  type LangText,
  plausibilityRules,
  type ValueKind,
} from '@passwerk/rules';
import { message, RULE_IDS } from '../validate/messages.js';

export interface AttributeExplanation {
  kind: 'attribute';
  id: string;
  name: LangText;
  /** The DIN DKE SPEC 99100 longlist definition, verbatim. */
  definition: string;
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
  /** null for engine rules: their severity is decided per finding, not per rule. */
  severity: 'error' | 'warning' | null;
  title: LangText;
  message: LangText;
  fixHint: LangText;
  attributes: { id: string; name: LangText }[];
  legalRef: string | null;
  isNotLegalAdvice: true;
}

/** Everything the knowledge base holds about one attribute. Nothing is composed. */
export function explainAttribute(id: string): AttributeExplanation | undefined {
  const attribute = getAttribute(id);
  if (!attribute) return undefined;
  return {
    kind: 'attribute',
    id: attribute.id,
    name: attribute.name,
    definition: attribute.din.row.definition,
    explanation: attribute.explanation,
    synonyms: attribute.synonyms,
    whoTypicallyHasIt: attribute.whoTypicallyHasIt,
    valueKind: attribute.valueKind,
    unit: attribute.unit,
    range: attribute.range,
    applicability: attribute.applicability,
    applicabilitySource: attribute.applicabilitySource,
    legalRefs: attribute.legalRefs,
    dynamic: attribute.dynamic,
    template: attribute.templateElements.map((element) => ({
      path: element.path,
      part: element.part,
      submodelIdShort: element.submodelIdShort,
      idShort: element.idShort,
      semanticId: element.semanticId,
      cardinality: element.cardinality,
      valueType: element.valueType,
      exampleValue: element.exampleValue,
    })),
    relatedRules: plausibilityRules
      .filter((rule) => rule.attributes.includes(attribute.id))
      .map((rule) => rule.id)
      .sort(),
    verify: attribute.verify,
    lastVerified: attribute.lastVerified,
    isNotLegalAdvice: true,
  };
}

/**
 * A plausibility rule, or one of the engine rules in validate/messages.ts so an agent can
 * look up any finding id it receives. Engine rules carry no legal reference.
 */
export function explainRule(id: string): RuleExplanation | undefined {
  const rule = getRule(id);
  if (rule) {
    return {
      kind: 'rule',
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      message: rule.message,
      fixHint: rule.fixHint,
      attributes: rule.attributes.map((attributeId) => ({
        id: attributeId,
        name: getAttribute(attributeId)?.name ?? { de: attributeId, en: attributeId },
      })),
      legalRef: rule.legalRef,
      isNotLegalAdvice: true,
    };
  }
  if (!RULE_IDS.includes(id)) return undefined;
  const text = message(id, '...');
  return {
    kind: 'rule',
    id,
    severity: null,
    title: text,
    message: text,
    fixHint: {
      en: 'This is an engine rule about the structure or the AAS conformance of the passport, not a domain rule.',
      de: 'Dies ist eine Engine-Regel zur Struktur oder AAS-Konformität des Passes, keine Fachregel.',
    },
    attributes: [],
    legalRef: null,
    isNotLegalAdvice: true,
  };
}

/** Dispatches on the PW- prefix: rule ids start with it, attribute ids never do. */
export function explain(id: string): AttributeExplanation | RuleExplanation | undefined {
  return id.startsWith('PW-') ? explainRule(id) : explainAttribute(id);
}
```

- [ ] **Step 4: Export**

In `packages/core/src/index.ts` add, alphabetically after the `emit/` exports:

```ts
export * from './explain/explain.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run packages/core/test/explain.test.ts`
Expected: PASS. `explainRule('PW-L3-MISSING')` returns a message containing the literal `...` because engine messages interpolate a detail; that is intentional and the test only checks the length.

- [ ] **Step 6: Run the full check and commit**

Run: `pnpm check`

```bash
git add packages/core/src/explain packages/core/src/index.ts packages/core/test/explain.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "feat(core): explainAttribute, explainRule and explain

Pure joins over the knowledge base: DIN definition, DE/EN explanation,
synonyms, who-has-it, applicability per category with the Commission's
wording, legal references and the template element with its semanticId,
cardinality and example value. Engine rule ids resolve too, so an agent
can look up any finding it receives.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 13: Sovereignty, browser safety, status and the phase close

**Files:**
- Modify: `packages/core/test/sovereignty.test.ts`
- Modify: `packages/core/test/browser-safety.test.ts` (only if it enumerates modules)
- Modify: `AGENTS.md`
- Test: the whole suite

**Interfaces:**
- Consumes: everything built in Tasks 1 to 12.
- Produces: nothing new; closes the phase.

- [ ] **Step 1: Extend the sovereignty proof**

`test/sovereignty.test.ts` patches every network API and then exercises the public surface (ADR D-013). Add the four new entry points to whatever loop or list it uses, so the zero-network proof covers them:

```ts
    for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
      const draft = PassportDraft.parse(getSample(name));
      validatePlausibility(draft);
      gapReport(draft, { report: validate(draft) });
    }
    checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: '2027-03-01' });
    for (const attribute of attributes) explainAttribute(attribute.id);
    for (const rule of plausibilityRules) explainRule(rule.id);
```

Follow the file's existing structure rather than pasting this verbatim; the point is that every new public function runs inside the guarded block.

- [ ] **Step 2: Confirm browser safety**

Run: `pnpm vitest run packages/core/test/browser-safety.test.ts`
Expected: PASS. None of the new modules imports `node:*`; `daysBetween` deliberately avoids `Date` so it is both browser-safe and timezone-independent.

- [ ] **Step 3: Update the status section in AGENTS.md**

Replace the `**Next: Phase 5.**` line at the end of the Status section with:

```markdown
- **Phase 5 (gap report, obligations, explain, L4): done.** L4 plausibility is a full verdict
  layer over 24 `PW-PLAUS` rules (ADR D-020): rules stay data in `kb/rules.json`, checks are a
  registry keyed by rule id, and L4's context hides any attribute L1 rejected so a bad value is
  reported once. Numeric bands now come from the knowledge-base `range` rather than a hardcoded
  0-100 (ADR D-021). `gapReport` buckets every attribute as required, conditional, deferred or
  optional, reports mandatory and overall completeness, and groups by submodel and by data
  owner. `checkObligations` answers required / not required / insufficient input for seven
  battery types, citing Article 77(1) only (ADR D-022). `explainAttribute` and `explainRule`
  join the knowledge base without composing a single new claim. Where IDTA and the Commission
  disagree, the template wins the file and the guidance wins the advice (ADR D-023).
- **Next: Phase 6.** MCP server, agent skill and CLI.
```

- [ ] **Step 4: Run the whole gate**

Run: `pnpm check`
Expected: PASS, all packages.

Run: `pnpm oracle`
Expected: 16/16 parity, `docs/CONFORMANCE.md` unchanged since Task 8 (or regenerated cleanly if a verdict moved).

Report the real output. If anything fails, fix it before claiming the phase is done — use `superpowers:systematic-debugging` for any failure whose cause is not immediately obvious, and never weaken a test to make it pass.

- [ ] **Step 5: Commit and open the PR**

```bash
git add AGENTS.md packages/core/test/sovereignty.test.ts
git -c user.name=shahriarbijoy -c user.email=shahriarbijoy@gmail.com commit -m "chore: close Phase 5

Sovereignty proof covers the four new entry points; status updated.

Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
git push -u origin feat/core-gap-obligations-explain-l4
gh pr create --title "feat(core): Phase 5 - gap report, obligations, explain, plausibility L4" --body "$(cat <<'BODY'
Phase 5 of docs/BUILD_PLAN.md. Spec: docs/superpowers/specs/2026-09-04-phase-5-design.md

- L4 plausibility as a full verdict layer over 24 PW-PLAUS rules (D-020)
- Numeric bands come from the knowledge-base range, not a hardcoded 0-100 (D-021)
- gapReport with required/conditional/deferred/optional buckets, two completeness
  figures, and groupings by submodel and by data owner
- checkObligations for seven battery types, citing Article 77(1) only (D-022)
- explainAttribute / explainRule as pure knowledge-base joins
- Where IDTA and the Commission disagree, the template wins the file and the
  guidance wins the advice (D-023)

Oracle parity unchanged at 16/16 (L2 parity, D-012).

https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V
BODY
)"
```

---

## Notes for the executor

- **The three tolerances** (`ENERGY_COHERENCE_TOLERANCE` 20 %, `SHARE_SUM_TOLERANCE_PP` 1, `CAPACITY_FADE_TOLERANCE_PP` 1) are engineering judgement, not values from the Regulation. If a golden sample or a Musterwerk fixture trips one, check the data first; only tune a constant if the rule is genuinely too tight, and say so in the commit message.
- **Never weaken a rule to make a sample pass.** Fix the sample, or move the case to `brokenSamples` with the rule id declared in `expectedFindings`.
- **If a legal reference is needed that is not already in `kb/ec-datapoints.json` or `kb/timeline.json`, stop and ask the owner.** Do not compose one.
- **Attribute and rule counts** in this plan (93 attributes, 47/49/36 mandatory, 24 rules) were read from the knowledge base on 2026-09-04. If an assertion disagrees with the data, the data is right.
