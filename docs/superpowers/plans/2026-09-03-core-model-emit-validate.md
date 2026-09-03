# Phase 2: core model, AAS emitters, validation L1 to L3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@passwerk/core` gets the attribute-keyed `PassportDraft` model (L1), AAS JSON and AASX emitters for the three MVP submodels, L2 (aas-core verification) and L3 (template diff), six golden samples and the tests that prove `validate(emit(sample))` is `valid`.

**Architecture:** The draft is `{ meta, attributes: { [attributeId]: Field } }` on the DIN grain of `@passwerk/rules`. Emitters build an aas-core `Environment` only through catalogue-path builders, so every idShort, semanticId and valueType is read from data. L2 and L3 run on the emitted JSON and every emitter re-validates its own output before returning a verdict.

**Tech Stack:** TypeScript 5.9 strict ESM (NodeNext), Zod 4.5.4, decimal.js 10.6.0, `@aas-core-works/aas-core3.0-typescript` 1.0.5, fflate 0.8.3, Vitest 4, Biome 2, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-09-03-core-model-emit-validate-design.md`

## Global Constraints

- No `node:*` imports anywhere under `packages/core/src` (ADR D-006). Tests may use `node:*`.
- No semanticId, idShort or legal reference string typed by hand in `src`; read them from `@passwerk/rules` (`getTemplateElement`, `templates`, `attributes`). The only exceptions are the address children (see spec 3.4) and the marking names quoted from the template description.
- Numbers in the draft are decimal strings, validated with `decimal.js`. Never `number`.
- Dates are ISO-8601 strings. `createdAt` is injected by the caller; no `Date.now()` in `src`.
- Deterministic output: canonical key-sorted JSON, fixed zip timestamps, catalogue order.
- `verdict` is only ever computed from findings that come from running the validators.
- Every finding message exists in `de` and `en`.
- Conventional Commits; commit as `shahriarbijoy` with the session trailer:
  `Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V`
- Run `pnpm check` before every commit that touches `src`.
- Instances never set `idShort` on direct children of a `SubmodelElementList` (AASd-120).
- Working directory for all commands: `W:\personal-code\passwerk` (repo root).

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/package.json` | deps (already added), `pnpm.patchedDependencies` lives in root `package.json` |
| `patches/@aas-core-works__aas-core3.0-typescript@1.0.5.patch` | adds `.js` to the ESM relative imports |
| `packages/core/tsconfig.json` | include `src/**/*.json` |
| `src/model/provenance.ts` | `Provenance` schema |
| `src/model/field.ts` | `Field(inner)` factory, `FieldStatus`, `AnyField` |
| `src/model/values.ts` | `valueSchemaFor(valueKind)`, decimal helpers |
| `src/model/composites.ts` | Zod shapes for the five MVP composite attributes |
| `src/model/attributeIds.ts` | `ATTRIBUTE_IDS`, `AttributeIdSchema` from the KB |
| `src/model/passport.ts` | `PassportMeta`, `PassportDraft`, `BatteryCategory` |
| `src/validate/finding.ts` | `Finding`, `LayerResult`, `ValidationReport`, `computeVerdict` |
| `src/validate/messages.ts` | DE/EN text per ruleId, `message(ruleId, detail)` |
| `src/validate/schema.ts` | L1 |
| `src/validate/aas.ts` | L2 |
| `src/validate/template.ts` | L3 |
| `src/validate/index.ts` | `validate(draft, options)` |
| `src/emit/canonical.ts` | `canonicalJson(value)` |
| `src/emit/ids.ts` | `resolveIds(draft, options)` |
| `src/emit/elements.ts` | catalogue-path element builders |
| `src/emit/submodels/nameplate.ts` | part 1 |
| `src/emit/submodels/materialComposition.ts` | part 6 |
| `src/emit/submodels/carbonFootprint.ts` | part 3 |
| `src/emit/environment.ts` | `buildEnvironment(draft, options)` |
| `src/emit/aasJson.ts` | `emitAasJson` |
| `src/emit/aasx.ts` | `emitAasx`, `readAasxEnvironment` |
| `src/samples/*.json`, `src/samples/index.ts` | golden drafts |
| `src/index.ts` | public API |
| `packages/core/test/*.test.ts` | one file per module |
| `docs/DECISIONS.md` | D-010, D-011 |
| `AGENTS.md` | status update |

---

### Task 1: Package scaffolding, aas-core patch, browser-safety test

**Files:**
- Modify: `packages/core/package.json` (deps already added by the planning session)
- Modify: `packages/core/tsconfig.json`
- Create: `patches/@aas-core-works__aas-core3.0-typescript@1.0.5.patch` (via `pnpm patch`)
- Modify: `package.json` (root; `pnpm.patchedDependencies` written by `pnpm patch-commit`)
- Create: `packages/core/test/browser-safety.test.ts`
- Create: `packages/core/test/aas-core.test.ts`

**Interfaces:**
- Produces: a loadable `@aas-core-works/aas-core3.0-typescript` under Node ESM; `packages/core/tsconfig.json` includes JSON.

- [ ] **Step 1: Confirm the dependencies are in `packages/core/package.json`**

Run: `Get-Content packages/core/package.json`
Expected `dependencies` block contains exactly:

```json
"dependencies": {
  "@aas-core-works/aas-core3.0-typescript": "1.0.5",
  "@passwerk/rules": "workspace:*",
  "decimal.js": "10.6.0",
  "fflate": "0.8.3",
  "zod": "4.5.4"
}
```

If a caret was added, remove it (exact pins).

- [ ] **Step 2: Write the failing aas-core smoke test**

`packages/core/test/aas-core.test.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getTemplate } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('@aas-core-works/aas-core3.0-typescript', () => {
  it('deserialises the bundled nameplate template and verifies it', () => {
    const env = aas.jsonization.environmentFromJsonable(
      getTemplate(1)?.environment as aas.jsonization.JsonValue,
    );
    expect(env.error).toBeNull();
    const errors = [...aas.verification.verify(env.mustValue())];
    // Templates legitimately violate AASd-120 (idShort on list children). Nothing else.
    for (const e of errors) expect(e.message).toContain('AASd-120');
  });
});
```

- [ ] **Step 3: Run it**

Run: `pnpm vitest run packages/core/test/aas-core.test.ts`
Expected: PASS under Vitest (Vite resolves extensionless imports). If it fails with a module resolution error, continue to Step 4 regardless; the patch is needed for plain Node.

- [ ] **Step 4: Prove plain Node cannot load the ESM build**

Run (PowerShell):
```
Set-Content -Encoding utf8 packages/core/probe.mjs "import('@aas-core-works/aas-core3.0-typescript').then(m => console.log(Object.keys(m)))"; node packages/core/probe.mjs; Remove-Item packages/core/probe.mjs
```
Expected: `ERR_MODULE_NOT_FOUND ... dist/lib/esm/common`.

- [ ] **Step 5: Create the patch**

Run: `pnpm patch @aas-core-works/aas-core3.0-typescript@1.0.5 --edit-dir .patch-aas`
Then rewrite the 14 relative imports in `.patch-aas/dist/lib/esm/*.js` to carry `.js`:

```
Get-ChildItem .patch-aas/dist/lib/esm/*.js | ForEach-Object {
  (Get-Content $_.FullName -Raw) -replace 'from "\./(common|constants|jsonization|stringification|types|verification)"', 'from "./$1.js"' | Set-Content -Encoding utf8 -NoNewline $_.FullName
}
```
Then: `pnpm patch-commit .patch-aas` and `Remove-Item -Recurse -Force .patch-aas`.

Expected: `patches/@aas-core-works__aas-core3.0-typescript@1.0.5.patch` exists and root `package.json` has `pnpm.patchedDependencies`. Verify the patch only touches `dist/lib/esm/*.js` import lines: `git diff --stat; Get-Content patches/*.patch | Select-String '^[-+]' | Select-String -NotMatch '^(---|\+\+\+)'`.

- [ ] **Step 6: Re-run the Node probe from Step 4**

Expected: prints `[ 'common', 'constants', 'jsonization', 'stringification', 'types', 'verification' ]`.

- [ ] **Step 7: tsconfig includes JSON**

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": []
  },
  "include": ["src/**/*.ts", "src/**/*.json"],
  "references": [{ "path": "../rules" }]
}
```

- [ ] **Step 8: Browser-safety test**

`packages/core/test/browser-safety.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('browser safety (ADR D-006)', () => {
  it('core/src never imports node:* modules', () => {
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/from\s+['"]node:/);
      expect(text, file).not.toMatch(/import\(\s*['"]node:/);
      expect(text, file).not.toMatch(/require\(\s*['"]node:/);
    }
  });
});
```

- [ ] **Step 9: Run everything and commit**

Run: `pnpm check`
Expected: lint clean, typecheck clean, all tests pass (rules + core).

```
git add packages/core/package.json packages/core/tsconfig.json package.json pnpm-lock.yaml patches packages/core/test/browser-safety.test.ts packages/core/test/aas-core.test.ts
git commit -m "chore(core): add Phase 2 dependencies and patch aas-core ESM imports"
```
(append the session trailer to every commit message.)

---

### Task 2: Provenance, Field and value schemas

**Files:**
- Create: `packages/core/src/model/provenance.ts`
- Create: `packages/core/src/model/field.ts`
- Create: `packages/core/src/model/values.ts`
- Test: `packages/core/test/model.field.test.ts`, `packages/core/test/model.values.test.ts`

**Interfaces:**
- Produces:
  - `Provenance` (Zod), `type Provenance`
  - `FieldStatus` (Zod enum), `Field<T extends z.ZodType>(inner: T)`, `AnyField`, `type AnyFieldValue = z.infer<typeof AnyField>`
  - `valueSchemaFor(kind: ValueKind): z.ZodType`, `isDecimalString(s: string): boolean`, `DecimalString` (Zod), `PercentString`, `IsoDate`, `IsoDateTime`, `DocumentRef`, `GraphicRef`, `MultilingualText`

- [ ] **Step 1: Failing tests**

`packages/core/test/model.field.test.ts`:

```ts
import { AnyField, Field, Provenance } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

describe('Provenance', () => {
  it('requires a file and accepts page and cell', () => {
    expect(Provenance.safeParse({ file: 'bom.xlsx', page: 2, cell: 'C7' }).success).toBe(true);
    expect(Provenance.safeParse({ page: 2 }).success).toBe(false);
  });
});

describe('Field', () => {
  const F = Field(z.string());
  it('defaults status to missing and source to []', () => {
    expect(F.parse({})).toEqual({ source: [], status: 'missing' });
  });
  it('present requires a value', () => {
    expect(F.safeParse({ status: 'present' }).success).toBe(false);
    expect(F.safeParse({ status: 'present', value: 'x' }).success).toBe(true);
  });
  it('a value requires status present or conflict', () => {
    expect(F.safeParse({ value: 'x', status: 'missing' }).success).toBe(false);
    expect(F.safeParse({ value: 'x', status: 'conflict' }).success).toBe(true);
  });
  it('confidence is within 0..1', () => {
    expect(F.safeParse({ value: 'x', status: 'present', confidence: 1.2 }).success).toBe(false);
  });
  it('AnyField accepts any value', () => {
    expect(AnyField.safeParse({ value: { a: 1 }, status: 'present' }).success).toBe(true);
  });
});
```

`packages/core/test/model.values.test.ts`:

```ts
import { isDecimalString, valueSchemaFor } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const ok = (kind: Parameters<typeof valueSchemaFor>[0], v: unknown) =>
  valueSchemaFor(kind).safeParse(v).success;

describe('value schemas per valueKind', () => {
  it('decimal strings', () => {
    expect(isDecimalString('61.2')).toBe(true);
    expect(isDecimalString('-0.5')).toBe(true);
    expect(isDecimalString('61,2')).toBe(false);
    expect(isDecimalString('1e3')).toBe(false);
    expect(ok('decimal', '12.5')).toBe(true);
    expect(ok('decimal', 12.5)).toBe(false);
  });
  it('percentage is 0..100', () => {
    expect(ok('percentage', '100')).toBe(true);
    expect(ok('percentage', '100.01')).toBe(false);
  });
  it('integer', () => {
    expect(ok('integer', '42')).toBe(true);
    expect(ok('integer', '4.2')).toBe(false);
  });
  it('date and dateTime', () => {
    expect(ok('date', '2026-03-01')).toBe(true);
    expect(ok('date', '01.03.2026')).toBe(false);
    expect(ok('dateTime', '2026-03-01T10:00:00Z')).toBe(true);
    expect(ok('dateTime', '2026-03-01')).toBe(false);
  });
  it('uri accepts URLs and URNs', () => {
    expect(ok('uri', 'https://example.test/p/1')).toBe(true);
    expect(ok('uri', 'urn:example:battery:1')).toBe(true);
    expect(ok('uri', 'not a uri')).toBe(false);
  });
  it('multilingualText needs at least one language', () => {
    expect(ok('multilingualText', { en: 'x' })).toBe(true);
    expect(ok('multilingualText', {})).toBe(false);
  });
  it('document is a non-empty list of refs with id', () => {
    expect(ok('document', [{ id: 'DoC-1' }])).toBe(true);
    expect(ok('document', [])).toBe(false);
  });
  it('graphic needs fileName and contentType', () => {
    expect(ok('graphic', { fileName: 'wheelie.png', contentType: 'image/png' })).toBe(true);
    expect(ok('graphic', { fileName: 'wheelie.png' })).toBe(false);
  });
  it('boolean, enum, text, identifier', () => {
    expect(ok('boolean', true)).toBe(true);
    expect(ok('enum', 'Original')).toBe(true);
    expect(ok('text', '')).toBe(false);
    expect(ok('identifier', 'A12')).toBe(true);
  });
  it('composite accepts unknown (checked separately)', () => {
    expect(ok('composite', { anything: 1 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/model.field.test.ts packages/core/test/model.values.test.ts`
Expected: FAIL (exports missing from `@passwerk/core`).

- [ ] **Step 3: Implement**

`packages/core/src/model/provenance.ts`:

```ts
import { z } from 'zod';

/** Where a value came from: file plus optional page (PDF) or cell (spreadsheet). */
export const Provenance = z.object({
  file: z.string().min(1),
  page: z.number().int().positive().optional(),
  cell: z.string().min(1).optional(),
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof Provenance>;
```

`packages/core/src/model/field.ts`:

```ts
import { z } from 'zod';
import { Provenance } from './provenance.js';

export const FieldStatus = z.enum(['present', 'missing', 'conflict', 'not_applicable']);
export type FieldStatus = z.infer<typeof FieldStatus>;

/**
 * Every leaf of a PassportDraft is a Field: value + provenance + confidence + status.
 * Invariants: status 'present' requires a value; a value requires 'present' or 'conflict'.
 */
export const Field = <T extends z.ZodType>(inner: T) =>
  z
    .object({
      value: inner.optional(),
      unit: z.string().min(1).optional(),
      source: z.array(Provenance).default([]),
      confidence: z.number().min(0).max(1).optional(),
      status: FieldStatus.default('missing'),
    })
    .superRefine((field, ctx) => {
      const hasValue = field.value !== undefined;
      if (field.status === 'present' && !hasValue) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'status present requires a value' });
      }
      if (hasValue && field.status !== 'present' && field.status !== 'conflict') {
        ctx.addIssue({
          code: 'custom',
          path: ['status'],
          message: `a value requires status present or conflict, got ${field.status}`,
        });
      }
    });

export const AnyField = Field(z.unknown());
export type AnyFieldValue = z.infer<typeof AnyField>;
```

`packages/core/src/model/values.ts`:

```ts
import type { ValueKind } from '@passwerk/rules';
import Decimal from 'decimal.js';
import { z } from 'zod';

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;
const INTEGER_RE = /^-?\d+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** xs:decimal lexical form (no exponent, dot as separator) that decimal.js accepts. */
export function isDecimalString(s: string): boolean {
  if (!DECIMAL_RE.test(s)) return false;
  try {
    return new Decimal(s).isFinite();
  } catch {
    return false;
  }
}

function isUri(s: string): boolean {
  if (/\s/.test(s)) return false;
  return URL.canParse(s);
}

export const DecimalString = z.string().refine(isDecimalString, 'expected a decimal string like "12.5"');
export const IntegerString = z.string().regex(INTEGER_RE, 'expected an integer string like "42"');
export const PercentString = DecimalString.refine((s) => {
  const d = new Decimal(s);
  return d.gte(0) && d.lte(100);
}, 'expected a percentage between 0 and 100');
export const IsoDate = z.string().regex(ISO_DATE_RE, 'expected YYYY-MM-DD');
export const IsoDateTime = z.string().regex(ISO_DATETIME_RE, 'expected an ISO-8601 date-time');
export const Uri = z.string().refine(isUri, 'expected a URL or URN');
export const MultilingualText = z
  .record(z.string().min(2), z.string().min(1))
  .refine((r) => Object.keys(r).length > 0, 'expected at least one language');
export const DocumentRef = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  uri: Uri.optional(),
});
export const GraphicRef = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  bytesBase64: z.string().optional(),
  uri: Uri.optional(),
  additionalText: z.string().min(1).optional(),
});

const BY_KIND: Record<ValueKind, z.ZodType> = {
  identifier: z.string().min(1),
  text: z.string().min(1),
  uri: Uri,
  multilingualText: MultilingualText,
  decimal: DecimalString,
  percentage: PercentString,
  integer: IntegerString,
  date: IsoDate,
  dateTime: IsoDateTime,
  boolean: z.boolean(),
  enum: z.string().min(1),
  document: z.array(DocumentRef).min(1),
  graphic: GraphicRef,
  composite: z.unknown(),
};

/** The Zod schema for Field.value given the attribute's KB valueKind. */
export function valueSchemaFor(kind: ValueKind): z.ZodType {
  return BY_KIND[kind];
}
```

`packages/core/src/index.ts` (replace the placeholder):

```ts
/**
 * @passwerk/core: MCP-free library. Phase 2: model, emit (AAS JSON, AASX), validate L1-L3.
 */
export const PACKAGE_NAME = '@passwerk/core' as const;

export * from './model/field.js';
export * from './model/provenance.js';
export * from './model/values.js';
```

Also update `packages/core/test/index.test.ts` to stop importing `DEPENDS_ON` if it does (keep the PACKAGE_NAME assertion only).

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm vitest run packages/core`
Expected: all PASS.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): Provenance, Field and value schemas per KB valueKind"
```

---

### Task 3: Composites, attribute ids and PassportDraft

**Files:**
- Create: `packages/core/src/model/composites.ts`
- Create: `packages/core/src/model/attributeIds.ts`
- Create: `packages/core/src/model/passport.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/model.passport.test.ts`

**Interfaces:**
- Consumes: `Field`, `AnyField`, value schemas from Task 2.
- Produces:
  - `ATTRIBUTE_IDS: readonly string[]`, `AttributeIdSchema` (z.enum), `type AttributeId = string`, `isAttributeId(s): boolean`
  - `COMPOSITE_SCHEMAS: Record<string, z.ZodType>` with keys `manufacturerInformation`, `batteryChemistry`, `criticalRawMaterials`, `electrodeAndElectrolyteMaterials`, `hazardousSubstances`, `carbonFootprintGeneralInformation`
  - types `ManufacturerInformation`, `BatteryChemistry`, `BatteryMaterial`, `HazardousSubstance`, `CarbonFootprintGeneralInformation`
  - `BatteryCategory` (Zod enum over `BATTERY_CATEGORIES`), `PassportMeta`, `PassportDraft` (Zod), `type PassportDraft`, `SCHEMA_VERSION = '1.0'`
  - `getField(draft, id): AnyFieldValue | undefined`, `presentValue<T>(draft, id): T | undefined` (value only when status is `present` or `conflict`)

- [ ] **Step 1: Failing tests**

`packages/core/test/model.passport.test.ts`:

```ts
import {
  ATTRIBUTE_IDS,
  COMPOSITE_SCHEMAS,
  PassportDraft,
  isAttributeId,
  presentValue,
} from '@passwerk/core';
import { attributes } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const meta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://passport.example.test/battery/0001',
} as const;

describe('attribute ids', () => {
  it('mirror the knowledge base', () => {
    expect(ATTRIBUTE_IDS).toEqual(attributes.map((a) => a.id));
    expect(isAttributeId('manufacturingDate')).toBe(true);
    expect(isAttributeId('nope')).toBe(false);
  });
});

describe('PassportDraft', () => {
  it('parses a minimal draft and applies field defaults', () => {
    const r = PassportDraft.safeParse({ meta, attributes: { manufacturingDate: { value: '2026-03-01', status: 'present' } } });
    expect(r.success).toBe(true);
    expect(r.data?.attributes.manufacturingDate).toEqual({ value: '2026-03-01', status: 'present', source: [] });
  });
  it('rejects unknown attribute ids and bad meta', () => {
    expect(PassportDraft.safeParse({ meta, attributes: { nope: { status: 'missing' } } }).success).toBe(false);
    expect(PassportDraft.safeParse({ meta: { ...meta, schemaVersion: '2.0' }, attributes: {} }).success).toBe(false);
    expect(PassportDraft.safeParse({ meta: { ...meta, passportId: 'not a uri' }, attributes: {} }).success).toBe(false);
    expect(PassportDraft.safeParse({ meta: { ...meta, createdAt: '2026-09-03' }, attributes: {} }).success).toBe(false);
  });
  it('presentValue returns values only for present or conflict fields', () => {
    const d = PassportDraft.parse({
      meta,
      attributes: {
        manufacturingDate: { value: '2026-03-01', status: 'present' },
        batteryIdentifier: { status: 'missing' },
      },
    });
    expect(presentValue<string>(d, 'manufacturingDate')).toBe('2026-03-01');
    expect(presentValue(d, 'batteryIdentifier')).toBeUndefined();
    expect(presentValue(d, 'operatorIdentifier')).toBeUndefined();
  });
});

describe('composites', () => {
  it('manufacturerInformation', () => {
    const S = COMPOSITE_SCHEMAS['manufacturerInformation']!;
    expect(S.safeParse({ name: { de: 'Musterwerk Batteriesysteme GmbH' }, identifier: 'DE-MW-001' }).success).toBe(true);
    expect(S.safeParse({ name: {}, identifier: 'x' }).success).toBe(false);
  });
  it('battery materials require name and identifier; mass is a decimal string', () => {
    const S = COMPOSITE_SCHEMAS['criticalRawMaterials']!;
    expect(S.safeParse([{ name: 'Lithium', identifier: '7439-93-2', massKg: '2.35' }]).success).toBe(true);
    expect(S.safeParse([{ name: 'Lithium', identifier: '7439-93-2', massKg: 2.35 }]).success).toBe(false);
    expect(S.safeParse([{ name: 'Lithium' }]).success).toBe(false);
  });
  it('hazardous substances', () => {
    const S = COMPOSITE_SCHEMAS['hazardousSubstances']!;
    expect(
      S.safeParse([{ name: 'Lithium hexafluorophosphate', identifier: '21324-40-3', concentrationPercent: '0.12', impacts: ['H302'] }]).success,
    ).toBe(true);
    expect(S.safeParse([{ name: 'x', identifier: 'y', concentrationPercent: '101' }]).success).toBe(false);
  });
  it('carbon footprint general information needs one calculation method', () => {
    const S = COMPOSITE_SCHEMAS['carbonFootprintGeneralInformation']!;
    expect(S.safeParse({ calculationMethods: ['ISO 14067:2018'] }).success).toBe(true);
    expect(S.safeParse({ calculationMethods: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/model.passport.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/model/attributeIds.ts`:

```ts
import { attributes } from '@passwerk/rules';
import { z } from 'zod';

/** The 93 DIN DKE SPEC 99100 attribute ids, in longlist order, from the knowledge base. */
export const ATTRIBUTE_IDS: readonly string[] = attributes.map((a) => a.id);

const first = ATTRIBUTE_IDS[0];
if (first === undefined) throw new Error('@passwerk/core: knowledge base has no attributes');

export const AttributeIdSchema = z.enum([first, ...ATTRIBUTE_IDS.slice(1)]);
/** Runtime-checked; the literal union is not expressible because ids come from data. */
export type AttributeId = string;

const idSet = new Set(ATTRIBUTE_IDS);
export function isAttributeId(s: string): boolean {
  return idSet.has(s);
}
```

`packages/core/src/model/composites.ts`:

```ts
import { z } from 'zod';
import { DecimalString, MultilingualText, PercentString } from './values.js';

const Location = z.object({
  componentName: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
});

export const ManufacturerInformation = z.object({
  name: MultilingualText,
  identifier: z.string().min(1),
  address: z
    .object({
      street: z.string().min(1).optional(),
      zipCode: z.string().min(1).optional(),
      cityTown: z.string().min(1).optional(),
      nationalCode: z.string().min(1).optional(),
      email: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      website: z.string().min(1).optional(),
    })
    .optional(),
});
export type ManufacturerInformation = z.infer<typeof ManufacturerInformation>;

export const BatteryChemistry = z.object({
  shortName: z.string().min(1),
  clearName: z.string().min(1),
});
export type BatteryChemistry = z.infer<typeof BatteryChemistry>;

export const BatteryMaterial = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  massKg: DecimalString.optional(),
  location: Location.optional(),
});
export type BatteryMaterial = z.infer<typeof BatteryMaterial>;

export const HazardousSubstance = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1),
  class: z.string().min(1).optional(),
  concentrationPercent: PercentString.optional(),
  location: Location.optional(),
  impacts: z.array(z.string().min(1)).optional(),
});
export type HazardousSubstance = z.infer<typeof HazardousSubstance>;

export const CarbonFootprintGeneralInformation = z.object({
  calculationMethods: z.array(z.string().min(1)).min(1),
  referenceImpactUnit: z.string().min(1).optional(),
  quantityOfMeasure: DecimalString.optional(),
});
export type CarbonFootprintGeneralInformation = z.infer<typeof CarbonFootprintGeneralInformation>;

/** Explicit value shapes for composite attributes of the MVP submodels, keyed by attribute id. */
export const COMPOSITE_SCHEMAS: Record<string, z.ZodType> = {
  manufacturerInformation: ManufacturerInformation,
  batteryChemistry: BatteryChemistry,
  criticalRawMaterials: z.array(BatteryMaterial).min(1),
  electrodeAndElectrolyteMaterials: z.array(BatteryMaterial).min(1),
  hazardousSubstances: z.array(HazardousSubstance).min(1),
  carbonFootprintGeneralInformation: CarbonFootprintGeneralInformation,
};
```

`packages/core/src/model/passport.ts`:

```ts
import { BATTERY_CATEGORIES } from '@passwerk/rules';
import { z } from 'zod';
import { AttributeIdSchema } from './attributeIds.js';
import { AnyField, type AnyFieldValue } from './field.js';
import { IsoDateTime, Uri } from './values.js';

export const SCHEMA_VERSION = '1.0' as const;

export const BatteryCategory = z.enum(BATTERY_CATEGORIES);
export type BatteryCategory = z.infer<typeof BatteryCategory>;

export const PassportMeta = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  category: BatteryCategory,
  /** Injected by the caller so output is deterministic. */
  createdAt: IsoDateTime,
  /** The battery passport identifier (DIN 6.1.2.1), a URI. Also the AAS global asset id. */
  passportId: Uri,
});
export type PassportMeta = z.infer<typeof PassportMeta>;

/**
 * The neutral internal model (BUILD_PLAN 2.3, ADR D-010): one Field per DIN attribute,
 * keyed by the knowledge-base id. Value shapes are checked per valueKind in validate/schema.
 */
export const PassportDraft = z.object({
  meta: PassportMeta,
  attributes: z.partialRecord(AttributeIdSchema, AnyField),
});
export type PassportDraft = z.infer<typeof PassportDraft>;
export type PassportDraftInput = z.input<typeof PassportDraft>;

export function getField(draft: PassportDraft, id: string): AnyFieldValue | undefined {
  return (draft.attributes as Record<string, AnyFieldValue | undefined>)[id];
}

/** The value of an attribute when it is present (or in conflict), else undefined. */
export function presentValue<T = unknown>(draft: PassportDraft, id: string): T | undefined {
  const f = getField(draft, id);
  if (!f || f.value === undefined) return undefined;
  if (f.status !== 'present' && f.status !== 'conflict') return undefined;
  return f.value as T;
}
```

Add to `src/index.ts`:

```ts
export * from './model/attributeIds.js';
export * from './model/composites.js';
export * from './model/passport.js';
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): attribute-keyed PassportDraft with composite shapes"
```

---

### Task 4: Findings, messages and L1

**Files:**
- Create: `packages/core/src/validate/finding.ts`
- Create: `packages/core/src/validate/messages.ts`
- Create: `packages/core/src/validate/schema.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/validate.schema.test.ts`

**Interfaces:**
- Produces:
  - `type Layer = 'L1' | 'L2' | 'L3'`, `type Severity = 'error' | 'warning'`
  - `interface Finding { layer; ruleId; severity; path: string; templatePath?: string; attributeId?: string; message: { de: string; en: string } }`
  - `interface LayerResult { ran: boolean; errors: number; warnings: number }`
  - `type Verdict = 'valid' | 'valid_with_warnings' | 'invalid'`
  - `interface ValidationReport { verdict; findings: Finding[]; layers: Record<Layer, LayerResult> }`
  - `computeVerdict(findings): Verdict`, `layerResult(findings, layer, ran): LayerResult`, `buildReport(findings, ran: Record<Layer, boolean>): ValidationReport`
  - `message(ruleId: string, detail?: string): { de; en }`
  - `validateSchema(input: unknown): { findings: Finding[]; draft?: PassportDraft }`

- [ ] **Step 1: Failing tests**

`packages/core/test/validate.schema.test.ts`:

```ts
import { computeVerdict, validateSchema } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const meta = {
  schemaVersion: '1.0',
  category: 'EV',
  createdAt: '2026-09-03T12:00:00Z',
  passportId: 'https://passport.example.test/battery/0001',
};
const ids = (r: { findings: { ruleId: string }[] }) => r.findings.map((f) => f.ruleId);

describe('L1 validateSchema', () => {
  it('accepts a well-formed draft and returns the parsed draft', () => {
    const r = validateSchema({ meta, attributes: { manufacturingDate: { value: '2026-03-01', status: 'present' } } });
    expect(r.findings).toEqual([]);
    expect(r.draft?.meta.category).toBe('EV');
  });
  it('reports structural issues as PW-L1-SCHEMA with a path', () => {
    const r = validateSchema({ meta: { ...meta, category: 'TRUCK' }, attributes: {} });
    expect(ids(r)).toContain('PW-L1-SCHEMA');
    expect(r.findings[0]?.path).toBe('meta.category');
    expect(r.draft).toBeUndefined();
  });
  it('reports unknown attribute ids', () => {
    const r = validateSchema({ meta, attributes: { nope: { status: 'missing' } } });
    expect(ids(r)).toContain('PW-L1-UNKNOWN-ATTRIBUTE');
    expect(r.findings.find((f) => f.ruleId === 'PW-L1-UNKNOWN-ATTRIBUTE')?.path).toBe('attributes.nope');
  });
  it('checks values against the valueKind (date, decimal, composite)', () => {
    const r = validateSchema({
      meta,
      attributes: {
        manufacturingDate: { value: '01.03.2026', status: 'present' },
        carbonFootprintPerFunctionalUnit: { value: '61,2', unit: 'kgCO2e/kWh', status: 'present' },
        criticalRawMaterials: { value: [{ name: 'Lithium' }], status: 'present' },
      },
    });
    const bad = r.findings.filter((f) => f.ruleId === 'PW-L1-VALUE');
    expect(bad.map((f) => f.attributeId).sort()).toEqual([
      'carbonFootprintPerFunctionalUnit',
      'criticalRawMaterials',
      'manufacturingDate',
    ]);
    expect(bad[0]?.message.de.length).toBeGreaterThan(5);
    expect(bad[0]?.message.en.length).toBeGreaterThan(5);
    expect(bad[0]?.severity).toBe('error');
  });
  it('flags a passport id mismatch', () => {
    const r = validateSchema({
      meta,
      attributes: { batteryPassportIdentifier: { value: 'https://other.example.test/1', status: 'present' } },
    });
    expect(ids(r)).toContain('PW-L1-PASSPORT-ID-MISMATCH');
  });
  it('warns on unmodelled composites and unassigned substance impacts', () => {
    const r = validateSchema({
      meta,
      attributes: {
        dueDiligenceReport: { value: [{ id: 'DD-1' }], status: 'present' },
        supplyChainIndices: { value: 'x', status: 'present' },
        substanceImpacts: { value: 'H302 Harmful if swallowed', status: 'present' },
        hazardousSubstances: { value: [{ name: 'LiPF6', identifier: '21324-40-3' }], status: 'present' },
      },
    });
    expect(ids(r)).toContain('PW-L1-IMPACT-UNASSIGNED');
    expect(r.findings.every((f) => f.severity === 'warning')).toBe(true);
  });
  it('warns PW-L1-COMPOSITE-UNMODELLED for composites without a shape', () => {
    const r = validateSchema({
      meta,
      attributes: { thermalManagement: { value: { anything: true }, status: 'present' } },
    });
    // thermalManagement may not exist; pick the first composite without a shape at runtime
    void r;
  });
});

describe('computeVerdict', () => {
  const f = (severity: 'error' | 'warning') => ({ layer: 'L1' as const, ruleId: 'x', severity, path: '', message: { de: 'x', en: 'x' } });
  it('is invalid on any error, valid_with_warnings on warnings only, else valid', () => {
    expect(computeVerdict([])).toBe('valid');
    expect(computeVerdict([f('warning')])).toBe('valid_with_warnings');
    expect(computeVerdict([f('warning'), f('error')])).toBe('invalid');
  });
});
```

Replace the placeholder `warns PW-L1-COMPOSITE-UNMODELLED` test with this concrete one (it picks a real composite attribute from the KB that has no shape):

```ts
  it('warns PW-L1-COMPOSITE-UNMODELLED for composites without a shape', async () => {
    const { attributes } = await import('@passwerk/rules');
    const { COMPOSITE_SCHEMAS } = await import('@passwerk/core');
    const id = attributes.find((a) => a.valueKind === 'composite' && !COMPOSITE_SCHEMAS[a.id])?.id;
    expect(id).toBeDefined();
    const r = validateSchema({ meta, attributes: { [id as string]: { value: { anything: true }, status: 'present' } } });
    expect(ids(r)).toEqual(['PW-L1-COMPOSITE-UNMODELLED']);
    expect(r.findings[0]?.severity).toBe('warning');
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/validate.schema.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/validate/finding.ts`:

```ts
export type Layer = 'L1' | 'L2' | 'L3';
export type Severity = 'error' | 'warning';
export type Verdict = 'valid' | 'valid_with_warnings' | 'invalid';

export interface Finding {
  layer: Layer;
  ruleId: string;
  severity: Severity;
  /** Draft path (L1) or AAS path (L2, L3) */
  path: string;
  /** Catalogue path when known, e.g. "6/BatteryMaterials/BatteryMaterial/BatteryMaterialIdentifier" */
  templatePath?: string;
  attributeId?: string;
  message: { de: string; en: string };
}

export interface LayerResult {
  ran: boolean;
  errors: number;
  warnings: number;
}

export interface ValidationReport {
  verdict: Verdict;
  findings: Finding[];
  layers: Record<Layer, LayerResult>;
}

export function computeVerdict(findings: readonly Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'error')) return 'invalid';
  if (findings.some((f) => f.severity === 'warning')) return 'valid_with_warnings';
  return 'valid';
}

export function layerResult(findings: readonly Finding[], layer: Layer, ran: boolean): LayerResult {
  const mine = findings.filter((f) => f.layer === layer);
  return {
    ran,
    errors: mine.filter((f) => f.severity === 'error').length,
    warnings: mine.filter((f) => f.severity === 'warning').length,
  };
}

export function buildReport(findings: Finding[], ran: Record<Layer, boolean>): ValidationReport {
  return {
    verdict: computeVerdict(findings),
    findings,
    layers: {
      L1: layerResult(findings, 'L1', ran.L1),
      L2: layerResult(findings, 'L2', ran.L2),
      L3: layerResult(findings, 'L3', ran.L3),
    },
  };
}
```

`packages/core/src/validate/messages.ts`:

```ts
/**
 * DE/EN texts per rule id. `{detail}` is replaced by the caller's detail string.
 * These are engine messages, not legal claims; legal texts live in the knowledge base.
 */
const MESSAGES: Record<string, { de: string; en: string }> = {
  'PW-L1-SCHEMA': {
    de: 'Strukturfehler im Entwurf: {detail}',
    en: 'Structural error in the draft: {detail}',
  },
  'PW-L1-UNKNOWN-ATTRIBUTE': {
    de: 'Unbekannte Attribut-ID "{detail}". Gültige IDs stehen in der Wissensbasis (@passwerk/rules).',
    en: 'Unknown attribute id "{detail}". Valid ids are listed in the knowledge base (@passwerk/rules).',
  },
  'PW-L1-VALUE': {
    de: 'Wert passt nicht zum erwarteten Typ: {detail}',
    en: 'Value does not match the expected type: {detail}',
  },
  'PW-L1-PASSPORT-ID-MISMATCH': {
    de: 'meta.passportId und das Attribut batteryPassportIdentifier unterscheiden sich: {detail}',
    en: 'meta.passportId and the attribute batteryPassportIdentifier differ: {detail}',
  },
  'PW-L1-IMPACT-UNASSIGNED': {
    de: 'substanceImpacts ist gesetzt, aber keinem Gefahrstoff zugeordnet; beim Export wird der Text jedem Gefahrstoff zugeordnet.',
    en: 'substanceImpacts is set but not assigned to a hazardous substance; on export the text is attached to every substance.',
  },
  'PW-L1-COMPOSITE-UNMODELLED': {
    de: 'Zusammengesetztes Attribut "{detail}" hat in dieser Version noch keine feste Struktur; der Wert wird nicht geprüft.',
    en: 'Composite attribute "{detail}" has no fixed shape in this version yet; the value is not checked.',
  },
  'PW-L2-DESERIALIZE': {
    de: 'Die AAS-JSON-Ausgabe lässt sich nicht als AAS-Umgebung lesen: {detail}',
    en: 'The AAS JSON output cannot be read as an AAS environment: {detail}',
  },
  'PW-L2-AAS-CORE': {
    de: 'AAS-Metamodell-Verletzung: {detail}',
    en: 'AAS metamodel violation: {detail}',
  },
  'PW-L3-UNKNOWN-SUBMODEL': {
    de: 'Kein IDTA-02035-Template für das Teilmodell mit semanticId "{detail}".',
    en: 'No IDTA 02035 template for the submodel with semanticId "{detail}".',
  },
  'PW-L3-MISSING': {
    de: 'Pflichtelement des Templates fehlt: {detail}',
    en: 'Mandatory template element is missing: {detail}',
  },
  'PW-L3-TOO-MANY': {
    de: 'Zu viele Elemente für {detail}',
    en: 'Too many elements for {detail}',
  },
  'PW-L3-MODEL-TYPE': {
    de: 'Falscher Elementtyp: {detail}',
    en: 'Wrong element type: {detail}',
  },
  'PW-L3-SEMANTIC-ID': {
    de: 'semanticId weicht vom Template ab: {detail}',
    en: 'semanticId differs from the template: {detail}',
  },
  'PW-L3-VALUE-TYPE': {
    de: 'valueType weicht vom Template ab: {detail}',
    en: 'valueType differs from the template: {detail}',
  },
  'PW-L3-LIST-TYPE': {
    de: 'Listen-Typangaben weichen vom Template ab: {detail}',
    en: 'List type settings differ from the template: {detail}',
  },
  'PW-L3-UNKNOWN-ELEMENT': {
    de: 'Element ist im Template nicht vorgesehen: {detail}',
    en: 'Element is not defined in the template: {detail}',
  },
  'PW-L3-SUBMODEL-ID-SHORT': {
    de: 'idShort des Teilmodells weicht vom Template ab: {detail}',
    en: 'Submodel idShort differs from the template: {detail}',
  },
};

export function message(ruleId: string, detail = ''): { de: string; en: string } {
  const m = MESSAGES[ruleId];
  if (!m) throw new Error(`@passwerk/core: no message for rule ${ruleId}`);
  return { de: m.de.replaceAll('{detail}', detail), en: m.en.replaceAll('{detail}', detail) };
}

export const RULE_IDS = Object.keys(MESSAGES);
```

`packages/core/src/validate/schema.ts`:

```ts
import { getAttribute } from '@passwerk/rules';
import type { z } from 'zod';
import { isAttributeId } from '../model/attributeIds.js';
import { COMPOSITE_SCHEMAS } from '../model/composites.js';
import type { AnyFieldValue } from '../model/field.js';
import { PassportDraft } from '../model/passport.js';
import { valueSchemaFor } from '../model/values.js';
import type { Finding } from './finding.js';
import { message } from './messages.js';

export interface SchemaResult {
  findings: Finding[];
  /** Set only when the draft is structurally valid (no PW-L1-SCHEMA / unknown attribute). */
  draft?: PassportDraft;
}

function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.map(String).join('.');
}

function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`).join('; ');
}

/** L1: structural validity of a PassportDraft plus per-attribute value shapes. */
export function validateSchema(input: unknown): SchemaResult {
  const findings: Finding[] = [];

  // Unknown attribute ids get their own rule so the message can name the id.
  const rawAttributes =
    typeof input === 'object' && input !== null && 'attributes' in input
      ? (input as { attributes: unknown }).attributes
      : undefined;
  if (typeof rawAttributes === 'object' && rawAttributes !== null) {
    for (const id of Object.keys(rawAttributes)) {
      if (!isAttributeId(id)) {
        findings.push({
          layer: 'L1',
          ruleId: 'PW-L1-UNKNOWN-ATTRIBUTE',
          severity: 'error',
          path: `attributes.${id}`,
          message: message('PW-L1-UNKNOWN-ATTRIBUTE', id),
        });
      }
    }
  }
  if (findings.length > 0) return { findings };

  const parsed = PassportDraft.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      findings.push({
        layer: 'L1',
        ruleId: 'PW-L1-SCHEMA',
        severity: 'error',
        path: issuePath(issue),
        message: message('PW-L1-SCHEMA', `${issuePath(issue) || '(root)'}: ${issue.message}`),
      });
    }
    return { findings };
  }

  const draft = parsed.data;
  const attrs = draft.attributes as Record<string, AnyFieldValue | undefined>;

  for (const [id, field] of Object.entries(attrs)) {
    if (!field || field.value === undefined) continue;
    const attribute = getAttribute(id);
    if (!attribute) continue; // cannot happen after the unknown-id check
    const path = `attributes.${id}.value`;

    if (attribute.valueKind === 'composite') {
      const shape = COMPOSITE_SCHEMAS[id];
      if (!shape) {
        findings.push({
          layer: 'L1',
          ruleId: 'PW-L1-COMPOSITE-UNMODELLED',
          severity: 'warning',
          path,
          attributeId: id,
          message: message('PW-L1-COMPOSITE-UNMODELLED', id),
        });
        continue;
      }
      const r = shape.safeParse(field.value);
      if (!r.success) {
        findings.push({
          layer: 'L1',
          ruleId: 'PW-L1-VALUE',
          severity: 'error',
          path,
          attributeId: id,
          message: message('PW-L1-VALUE', `${id} (${attribute.valueKind}): ${describeIssues(r.error.issues)}`),
        });
      }
      continue;
    }

    const r = valueSchemaFor(attribute.valueKind).safeParse(field.value);
    if (!r.success) {
      findings.push({
        layer: 'L1',
        ruleId: 'PW-L1-VALUE',
        severity: 'error',
        path,
        attributeId: id,
        message: message('PW-L1-VALUE', `${id} (${attribute.valueKind}): ${describeIssues(r.error.issues)}`),
      });
    }
  }

  const passportIdAttr = attrs['batteryPassportIdentifier'];
  if (
    passportIdAttr?.value !== undefined &&
    typeof passportIdAttr.value === 'string' &&
    passportIdAttr.value !== draft.meta.passportId
  ) {
    findings.push({
      layer: 'L1',
      ruleId: 'PW-L1-PASSPORT-ID-MISMATCH',
      severity: 'error',
      path: 'attributes.batteryPassportIdentifier.value',
      attributeId: 'batteryPassportIdentifier',
      message: message(
        'PW-L1-PASSPORT-ID-MISMATCH',
        `${draft.meta.passportId} vs ${passportIdAttr.value}`,
      ),
    });
  }

  const impacts = attrs['substanceImpacts'];
  const substances = attrs['hazardousSubstances'];
  if (impacts?.value !== undefined && Array.isArray(substances?.value)) {
    const anyAssigned = (substances.value as { impacts?: string[] }[]).some(
      (s) => (s.impacts?.length ?? 0) > 0,
    );
    if (!anyAssigned) {
      findings.push({
        layer: 'L1',
        ruleId: 'PW-L1-IMPACT-UNASSIGNED',
        severity: 'warning',
        path: 'attributes.substanceImpacts.value',
        attributeId: 'substanceImpacts',
        message: message('PW-L1-IMPACT-UNASSIGNED'),
      });
    }
  }

  return { findings, draft };
}
```

Add to `src/index.ts`:

```ts
export * from './validate/finding.js';
export { message as findingMessage, RULE_IDS } from './validate/messages.js';
export * from './validate/schema.js';
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. If the Zod 4 issue type import `z.core.$ZodIssue` does not resolve, use `import type { $ZodIssue } from 'zod/v4/core'` and adjust.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): L1 schema validation with DE/EN findings"
```

---

### Task 5: Golden sample drafts

**Files:**
- Create: `packages/core/src/samples/ev-valid.json`, `lmt-valid.json`, `industrial-valid.json`, `ev-missing-material-identifier.json`, `lmt-wrong-date-format.json`, `industrial-bad-decimal.json`
- Create: `packages/core/src/samples/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/samples.test.ts`

**Interfaces:**
- Produces: `VALID_SAMPLE_NAMES`, `BROKEN_SAMPLE_NAMES`, `samples: Record<SampleName, PassportDraftInput>`, `brokenSamples: Record<BrokenSampleName, { draft: PassportDraftInput; expectedFindings: string[] }>`, `getSample(name)`.

- [ ] **Step 1: Failing test**

`packages/core/test/samples.test.ts`:

```ts
import { BROKEN_SAMPLE_NAMES, VALID_SAMPLE_NAMES, brokenSamples, samples, validateSchema } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('golden samples', () => {
  it('valid samples pass L1 without findings', () => {
    for (const name of VALID_SAMPLE_NAMES) {
      const r = validateSchema(samples[name]);
      expect(r.findings, name).toEqual([]);
    }
  });
  it('broken samples declare their expected findings and produce them where L1 applies', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      expect(expectedFindings.length, name).toBeGreaterThan(0);
      const l1 = validateSchema(draft).findings.map((f) => f.ruleId);
      for (const id of expectedFindings.filter((e) => e.startsWith('PW-L1-'))) expect(l1, name).toContain(id);
    }
  });
  it('every sample is marked fictional', () => {
    for (const s of Object.values(samples)) expect((s as { $comment?: string }).$comment).toMatch(/fictional/i);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/samples.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the samples**

Common shape: every file is `{ "$comment": "...fictional...", "meta": {...}, "attributes": {...} }`. `$comment` is a top-level key that `PassportDraft` must tolerate: Zod objects strip unknown keys by default, so no change is needed. Provenance entries reference fictional file names.

`packages/core/src/samples/ev-valid.json`:

```json
{
  "$comment": "Golden sample. All values are fictional and for testing only (Musterwerk Batteriesysteme GmbH does not exist).",
  "meta": {
    "schemaVersion": "1.0",
    "category": "EV",
    "createdAt": "2026-09-03T12:00:00Z",
    "passportId": "https://passport.musterwerk.example/battery/MW-EV-2026-000123"
  },
  "attributes": {
    "batteryPassportIdentifier": {
      "value": "https://passport.musterwerk.example/battery/MW-EV-2026-000123",
      "status": "present",
      "source": [{ "file": "stammdaten.xlsx", "cell": "B2" }]
    },
    "batteryIdentifier": { "value": "MW-EV-2026-000123", "status": "present", "source": [{ "file": "stammdaten.xlsx", "cell": "B3" }] },
    "manufacturerInformation": {
      "value": {
        "name": { "de": "Musterwerk Batteriesysteme GmbH", "en": "Musterwerk Battery Systems GmbH" },
        "identifier": "DE-MW-0001",
        "address": { "street": "Werkstrasse 1", "zipCode": "28199", "cityTown": "Bremen", "nationalCode": "DE", "email": "passport@musterwerk.example" }
      },
      "status": "present",
      "source": [{ "file": "stammdaten.xlsx", "cell": "B5" }]
    },
    "manufacturingPlace": { "value": "DE-MW-0001-PLANT-BRE", "status": "present", "source": [{ "file": "stammdaten.xlsx", "cell": "B6" }] },
    "manufacturingDate": { "value": "2026-03-01", "status": "present", "source": [{ "file": "stammdaten.xlsx", "cell": "B7" }] },
    "batteryStatus": { "value": "Original", "status": "present", "source": [{ "file": "stammdaten.xlsx", "cell": "B8" }] },
    "separateCollectionSymbol": {
      "value": { "fileName": "separate-collection.png", "contentType": "image/png", "uri": "https://passport.musterwerk.example/files/separate-collection.png" },
      "status": "present",
      "source": [{ "file": "kennzeichnung.pdf", "page": 1 }]
    },
    "meaningOfLabelsAndSymbols": {
      "value": "Durchgestrichene Mülltonne: getrennte Sammlung von Altbatterien.",
      "status": "present",
      "source": [{ "file": "kennzeichnung.pdf", "page": 1 }]
    },
    "euDeclarationOfConformity": { "value": [{ "id": "DoC-MW-EV-2026-01", "uri": "https://passport.musterwerk.example/docs/DoC-MW-EV-2026-01.pdf" }], "status": "present", "source": [{ "file": "konformitaet.pdf", "page": 1 }] },
    "testReportsProvingCompliance": { "value": [{ "id": "TR-2026-0457" }], "status": "present", "source": [{ "file": "pruefbericht.pdf", "page": 1 }] },
    "batteryChemistry": { "value": { "shortName": "NMC", "clearName": "Lithium nickel manganese cobalt oxide" }, "status": "present", "source": [{ "file": "bom.xlsx", "cell": "C2" }] },
    "criticalRawMaterials": {
      "value": [
        { "name": "Lithium", "identifier": "7439-93-2", "massKg": "6.40", "location": { "componentName": "Cathode" } },
        { "name": "Cobalt", "identifier": "7440-48-4", "massKg": "4.10", "location": { "componentName": "Cathode" } },
        { "name": "Natural graphite", "identifier": "7782-42-5", "massKg": "38.00", "location": { "componentName": "Anode" } }
      ],
      "unit": "kg",
      "status": "present",
      "source": [{ "file": "bom.xlsx", "cell": "D4:D6" }]
    },
    "electrodeAndElectrolyteMaterials": {
      "value": [
        { "name": "Lithium hexafluorophosphate", "identifier": "21324-40-3", "location": { "componentName": "Electrolyte" } },
        { "name": "Copper", "identifier": "7440-50-8", "location": { "componentName": "Anode" } }
      ],
      "status": "present",
      "source": [{ "file": "bom.xlsx", "cell": "D8:D9" }]
    },
    "hazardousSubstances": {
      "value": [
        { "name": "Lithium hexafluorophosphate", "identifier": "21324-40-3", "class": "AcuteToxicity", "concentrationPercent": "1.2", "location": { "componentName": "Electrolyte" }, "impacts": ["H301 Toxic if swallowed", "H314 Causes severe skin burns and eye damage"] }
      ],
      "unit": "%",
      "status": "present",
      "source": [{ "file": "sicherheitsdatenblatt.pdf", "page": 3 }]
    },
    "carbonFootprintGeneralInformation": { "value": { "calculationMethods": ["ISO 14067:2018"], "referenceImpactUnit": "kWh", "quantityOfMeasure": "1" }, "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 2 }] },
    "carbonFootprintPerFunctionalUnit": { "value": "61.2", "unit": "kgCO2e/kWh", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 2 }] },
    "carbonFootprintShareRawMaterials": { "value": "58.0", "unit": "%", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 4 }] },
    "carbonFootprintShareManufacturing": { "value": "34.5", "unit": "%", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 4 }] },
    "carbonFootprintShareDistribution": { "value": "2.5", "unit": "%", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 4 }] },
    "carbonFootprintShareEndOfLife": { "value": "5.0", "unit": "%", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 4 }] },
    "carbonFootprintPerformanceClass": { "value": "B", "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 1 }] },
    "carbonFootprintStudyLink": { "value": [{ "id": "PCF-MW-EV-2026", "uri": "https://passport.musterwerk.example/pcf/MW-EV-2026.pdf" }], "status": "present", "source": [{ "file": "pcf-bericht.pdf", "page": 1 }] }
  }
}
```

`lmt-valid.json`: same structure with `category: "LMT"`, passportId `https://passport.musterwerk.example/battery/MW-LMT-2026-000042`, identifiers accordingly, chemistry `{ "shortName": "LFP", "clearName": "Lithium iron phosphate" }`, critical raw materials Lithium (`"0.35"`) and Natural graphite (`"2.10"`), electrode materials Copper and Aluminium (`7429-90-5`, Cathode), one hazardous substance (same LiPF6 entry with `concentrationPercent: "0.9"`), the `separateCollectionSymbol` marking and `meaningOfLabelsAndSymbols`, DoC and test report documents, **no** carbon footprint attributes at all. Provenance file names: `lmt-stammdaten.xlsx`, `lmt-bom.xlsx`, `lmt-sdb.pdf`.

`industrial-valid.json`: `category: "INDUSTRIAL_GT_2KWH"`, passportId `https://passport.musterwerk.example/battery/MW-IND-2026-000007`, full set like `ev-valid` plus `cadmiumLeadSymbols` marking (`{ "fileName": "pb.png", "contentType": "image/png", "additionalText": "Pb" }`), `dateOfPuttingIntoService: "2026-06-15"`, `operatorIdentifier: "DE-OP-4711"`, two hazardous substances (LiPF6 and `{ "name": "Lead", "identifier": "7439-92-1", "class": "ReproductiveToxicity", "concentrationPercent": "0.05", "impacts": ["H360 May damage fertility or the unborn child"] }`), chemistry NMC, three critical raw materials, carbon footprint values `"74.9"`, shares `"61.0"/"31.0"/"3.0"/"5.0"`, performance class `"C"`.

`ev-missing-material-identifier.json`: copy of `ev-valid.json` where the first `criticalRawMaterials` entry has no `identifier`, `$comment` explains the defect.

`lmt-wrong-date-format.json`: copy of `lmt-valid.json` with `manufacturingDate.value = "01.03.2026"`.

`industrial-bad-decimal.json`: copy of `industrial-valid.json` with `carbonFootprintPerFunctionalUnit.value = "74,9"`.

`packages/core/src/samples/index.ts`:

```ts
import type { PassportDraftInput } from '../model/passport.js';
import evMissing from './ev-missing-material-identifier.json' with { type: 'json' };
import evValid from './ev-valid.json' with { type: 'json' };
import industrialBadDecimal from './industrial-bad-decimal.json' with { type: 'json' };
import industrialValid from './industrial-valid.json' with { type: 'json' };
import lmtValid from './lmt-valid.json' with { type: 'json' };
import lmtWrongDate from './lmt-wrong-date-format.json' with { type: 'json' };

export const VALID_SAMPLE_NAMES = ['ev-valid', 'lmt-valid', 'industrial-valid'] as const;
export const BROKEN_SAMPLE_NAMES = [
  'ev-missing-material-identifier',
  'lmt-wrong-date-format',
  'industrial-bad-decimal',
] as const;
export type SampleName = (typeof VALID_SAMPLE_NAMES)[number];
export type BrokenSampleName = (typeof BROKEN_SAMPLE_NAMES)[number];

export const samples: Record<SampleName, PassportDraftInput> = {
  'ev-valid': evValid as PassportDraftInput,
  'lmt-valid': lmtValid as PassportDraftInput,
  'industrial-valid': industrialValid as PassportDraftInput,
};

export const brokenSamples: Record<
  BrokenSampleName,
  { draft: PassportDraftInput; expectedFindings: string[] }
> = {
  'ev-missing-material-identifier': {
    draft: evMissing as PassportDraftInput,
    // L1 rejects the composite; when emitted anyway, the template element is missing.
    expectedFindings: ['PW-L1-VALUE', 'PW-L3-MISSING'],
  },
  'lmt-wrong-date-format': { draft: lmtWrongDate as PassportDraftInput, expectedFindings: ['PW-L1-VALUE'] },
  'industrial-bad-decimal': {
    draft: industrialBadDecimal as PassportDraftInput,
    expectedFindings: ['PW-L1-VALUE'],
  },
};

export function getSample(name: SampleName | BrokenSampleName): PassportDraftInput {
  return name in samples ? samples[name as SampleName] : brokenSamples[name as BrokenSampleName].draft;
}
```

Add to `src/index.ts`: `export * from './samples/index.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. If the JSON cast complains under `exactOptionalPropertyTypes`, cast through `unknown` (`evValid as unknown as PassportDraftInput`).

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): golden sample drafts for EV, LMT and industrial batteries"
```

---

### Task 6: Canonical JSON, identifier scheme and catalogue-driven element builders

**Files:**
- Create: `packages/core/src/emit/canonical.ts`
- Create: `packages/core/src/emit/ids.ts`
- Create: `packages/core/src/emit/elements.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/emit.canonical.test.ts`, `packages/core/test/emit.elements.test.ts`

**Interfaces:**
- Produces:
  - `canonicalJson(value: unknown): string`, `sortKeysDeep(value)`
  - `interface EmitIds { shellId: string; assetId: string; submodelId: (idShort: string) => string }`, `interface EmitOptions { ids?: Partial<{ shellId: string; assetId: string; submodelIdPrefix: string }> }`, `resolveIds(draft, options?): EmitIds`
  - `externalReference(value: string): aas.types.Reference`
  - `property(path: string, value: string): aas.types.Property`
  - `multiLanguageProperty(path: string, value: Record<string, string>): aas.types.MultiLanguageProperty`
  - `collection(path: string, children: aas.types.ISubmodelElement[]): aas.types.SubmodelElementCollection`
  - `list(path: string, children: aas.types.ISubmodelElement[]): aas.types.SubmodelElementList`
  - `file(path: string, contentType: string, value: string): aas.types.File`
  - `plainProperty(idShort: string, value: string): aas.types.Property` (no catalogue, no semanticId; only for drop-in children)
  - `isListChild(path: string): boolean`

- [ ] **Step 1: Failing tests**

`packages/core/test/emit.canonical.test.ts`:

```ts
import { canonicalJson } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('canonicalJson', () => {
  it('sorts keys recursively, keeps array order, ends with a newline', () => {
    const out = canonicalJson({ b: [{ z: 1, a: 2 }], a: { y: null, x: 'v' } });
    expect(out).toBe('{\n  "a": {\n    "x": "v",\n    "y": null\n  },\n  "b": [\n    {\n      "a": 2,\n      "z": 1\n    }\n  ]\n}\n');
  });
});
```

`packages/core/test/emit.elements.test.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { collection, file, isListChild, list, multiLanguageProperty, property, resolveIds } from '@passwerk/core';
import { getTemplateElement } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

describe('element builders read everything from the catalogue', () => {
  it('property copies idShort, semanticId, supplemental ids and valueType', () => {
    const p = property('1/SerialNumber', 'A12');
    const t = getTemplateElement('1/SerialNumber')!;
    expect(p.idShort).toBe('SerialNumber');
    expect(p.semanticId?.keys[0]?.value).toBe(t.semanticId);
    expect(p.supplementalSemanticIds?.map((r) => r.keys[0]?.value)).toEqual(t.supplementalSemanticIds);
    expect(aas.stringification.dataTypeDefXsdToString(p.valueType)).toBe('xs:string');
    expect(p.value).toBe('A12');
    expect(p.qualifiers).toBeNull();
  });
  it('list children carry no idShort (AASd-120)', () => {
    expect(isListChild('1/Markings/Markings__00__')).toBe(true);
    expect(isListChild('1/SerialNumber')).toBe(false);
    const c = collection('1/Markings/Markings__00__', [property('1/Markings/Markings__00__/MarkingName', 'x')]);
    expect(c.idShort).toBeNull();
    expect(c.value?.[0]?.idShort).toBe('MarkingName');
  });
  it('list copies typeValueListElement, valueTypeListElement and semanticIdListElement', () => {
    const l = list('3/ProductCarbonFootprints', []);
    expect(aas.stringification.aasSubmodelElementsToString(l.typeValueListElement)).toBe('SubmodelElementCollection');
    expect(l.semanticIdListElement?.keys[0]?.value).toBe(getTemplateElement('3/ProductCarbonFootprints')!.listElement!.semanticIdListElement);
    const l2 = list('1/EUDeclarationOfConformity', []);
    expect(aas.stringification.dataTypeDefXsdToString(l2.valueTypeListElement!)).toBe('xs:string');
    expect(l2.semanticIdListElement).toBeNull();
  });
  it('multiLanguageProperty and file', () => {
    const m = multiLanguageProperty('1/ManufacturerName', { de: 'Musterwerk', en: 'Musterwerk' });
    expect(m.value?.map((l) => `${l.language}=${l.text}`)).toEqual(['de=Musterwerk', 'en=Musterwerk']);
    const f = file('1/Markings/Markings__00__/MarkingFile', 'image/png', 'x.png');
    expect(f.contentType).toBe('image/png');
    expect(f.value).toBe('x.png');
  });
  it('throws on an unknown catalogue path', () => {
    expect(() => property('1/DoesNotExist', 'x')).toThrow(/unknown template path/);
  });
});

describe('resolveIds', () => {
  const draft = { meta: { schemaVersion: '1.0', category: 'EV', createdAt: '2026-09-03T12:00:00Z', passportId: 'https://p.example/b/1' }, attributes: {} } as const;
  it('derives ids from the passport id', () => {
    const ids = resolveIds(draft as never);
    expect(ids.assetId).toBe('https://p.example/b/1');
    expect(ids.shellId).toBe('https://p.example/b/1/aas');
    expect(ids.submodelId('BatteryNameplate')).toBe('https://p.example/b/1/submodels/BatteryNameplate');
  });
  it('honours overrides', () => {
    const ids = resolveIds(draft as never, { ids: { shellId: 'urn:x:aas', submodelIdPrefix: 'urn:x:sm' } });
    expect(ids.shellId).toBe('urn:x:aas');
    expect(ids.submodelId('CarbonFootprint')).toBe('urn:x:sm/CarbonFootprint');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.canonical.test.ts packages/core/test/emit.elements.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/canonical.ts`:

```ts
/** Recursively sort object keys so JSON output is byte-stable. Arrays keep their order. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}
```

`packages/core/src/emit/ids.ts`:

```ts
import type { PassportDraft } from '../model/passport.js';

export interface EmitIds {
  shellId: string;
  assetId: string;
  submodelId: (idShort: string) => string;
}

export interface EmitOptions {
  ids?: Partial<{ shellId: string; assetId: string; submodelIdPrefix: string }>;
}

/** ADR D-010: ids derive from the passport identifier unless overridden. */
export function resolveIds(draft: PassportDraft, options: EmitOptions = {}): EmitIds {
  const base = draft.meta.passportId;
  const prefix = options.ids?.submodelIdPrefix ?? `${base}/submodels`;
  return {
    shellId: options.ids?.shellId ?? `${base}/aas`,
    assetId: options.ids?.assetId ?? base,
    submodelId: (idShort) => `${prefix}/${idShort}`,
  };
}
```

`packages/core/src/emit/elements.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { type CatalogueElement, getTemplateElement } from '@passwerk/rules';

const { types, stringification } = aas;

function element(path: string): CatalogueElement {
  const el = getTemplateElement(path);
  if (!el) throw new Error(`@passwerk/core: unknown template path ${path}`);
  return el;
}

export function externalReference(value: string): aas.types.Reference {
  return new types.Reference(types.ReferenceTypes.ExternalReference, [
    new types.Key(types.KeyTypes.GlobalReference, value),
  ]);
}

/** Direct children of a SubmodelElementList must not carry an idShort (AASd-120). */
export function isListChild(path: string): boolean {
  const cut = path.lastIndexOf('/');
  if (cut < 0) return false;
  return getTemplateElement(path.slice(0, cut))?.modelType === 'SubmodelElementList';
}

function xsd(valueType: string | null, path: string): aas.types.DataTypeDefXsd {
  const v = valueType ? stringification.dataTypeDefXsdFromString(valueType) : null;
  if (v === null) throw new Error(`@passwerk/core: template ${path} has no usable valueType (${valueType})`);
  return v;
}

function applySemantics(
  target: aas.types.ISubmodelElement & { idShort: string | null },
  el: CatalogueElement,
): void {
  target.idShort = isListChild(el.path) ? null : el.idShort;
  target.semanticId = el.semanticId ? externalReference(el.semanticId) : null;
  target.supplementalSemanticIds =
    el.supplementalSemanticIds.length > 0 ? el.supplementalSemanticIds.map(externalReference) : null;
}

export function property(path: string, value: string): aas.types.Property {
  const el = element(path);
  const p = new types.Property(xsd(el.valueType, path));
  applySemantics(p, el);
  p.value = value;
  return p;
}

export function multiLanguageProperty(
  path: string,
  value: Record<string, string>,
): aas.types.MultiLanguageProperty {
  const el = element(path);
  const m = new types.MultiLanguageProperty();
  applySemantics(m, el);
  m.value = Object.keys(value)
    .sort()
    .map((lang) => new types.LangStringTextType(lang, value[lang] as string));
  return m;
}

export function collection(
  path: string,
  children: aas.types.ISubmodelElement[],
): aas.types.SubmodelElementCollection {
  const el = element(path);
  const c = new types.SubmodelElementCollection();
  applySemantics(c, el);
  c.value = children.length > 0 ? children : null;
  return c;
}

export function list(
  path: string,
  children: aas.types.ISubmodelElement[],
): aas.types.SubmodelElementList {
  const el = element(path);
  const le = el.listElement;
  const typeValue = le?.typeValueListElement
    ? stringification.aasSubmodelElementsFromString(le.typeValueListElement)
    : null;
  if (typeValue === null) throw new Error(`@passwerk/core: template ${path} has no typeValueListElement`);
  const l = new types.SubmodelElementList(typeValue);
  applySemantics(l, el);
  l.valueTypeListElement = le?.valueTypeListElement ? xsd(le.valueTypeListElement, path) : null;
  l.semanticIdListElement = le?.semanticIdListElement ? externalReference(le.semanticIdListElement) : null;
  l.value = children.length > 0 ? children : null;
  return l;
}

export function file(path: string, contentType: string, value: string): aas.types.File {
  const el = element(path);
  const f = new types.File(contentType);
  applySemantics(f, el);
  f.value = value;
  return f;
}

/**
 * A Property with idShort only. Used solely for children of drop-in collections whose
 * template (ZVEI Contact Information) is not bundled, so no semanticId is available.
 * verify: pin IDTA 02002 Contact Information to replace this (spec section 3.4).
 */
export function plainProperty(idShort: string, value: string): aas.types.Property {
  const p = new types.Property(types.DataTypeDefXsd.String);
  p.idShort = idShort;
  p.value = value;
  return p;
}
```

Add to `src/index.ts`:

```ts
export * from './emit/canonical.js';
export * from './emit/elements.js';
export * from './emit/ids.js';
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): canonical JSON, id scheme and catalogue-driven AAS element builders"
```

---

### Task 7: Nameplate emitter (part 1)

**Files:**
- Create: `packages/core/src/emit/submodels/shared.ts`
- Create: `packages/core/src/emit/submodels/nameplate.ts`
- Test: `packages/core/test/emit.nameplate.test.ts`

**Interfaces:**
- Consumes: builders from Task 6, `presentValue`, `PassportDraft`, composites.
- Produces:
  - `shared.ts`: `submodelFromTemplate(part: number, id: string, elements: ISubmodelElement[]): aas.types.Submodel`, `hasAny(draft, ids: string[]): boolean`
  - `nameplate.ts`: `NAMEPLATE_ATTRIBUTES: readonly string[]`, `emitNameplate(draft, ids: EmitIds): aas.types.Submodel | null`

- [ ] **Step 1: Failing test**

`packages/core/test/emit.nameplate.test.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { PassportDraft, emitNameplate, resolveIds, samples } from '@passwerk/core';
import { getTemplate } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitNameplate(draft, resolveIds(draft));
const byIdShort = (idShort: string) => sm?.submodelElements?.find((e) => e.idShort === idShort);

describe('emitNameplate', () => {
  it('copies the submodel header from the template and sets kind Instance', () => {
    const t = getTemplate(1)!;
    expect(sm?.idShort).toBe(t.submodelIdShort);
    expect(sm?.semanticId?.keys[0]?.value).toBe(t.submodelSemanticId);
    expect(sm?.kind).toBe(aas.types.ModellingKind.Instance);
    expect(sm?.administration?.templateId).toBe('https://admin-shell.io/idta-02035-1');
    expect(sm?.id).toBe('https://passport.musterwerk.example/battery/MW-EV-2026-000123/submodels/BatteryNameplate');
  });
  it('maps scalar attributes to their template elements', () => {
    expect((byIdShort('URIOfTheProduct') as aas.types.Property).value).toBe(draft.meta.passportId);
    expect((byIdShort('SerialNumber') as aas.types.Property).value).toBe('MW-EV-2026-000123');
    expect((byIdShort('DateOfManufacture') as aas.types.Property).value).toBe('2026-03-01');
    expect((byIdShort('LifeCycleStage') as aas.types.Property).value).toBe('Original');
    expect((byIdShort('ManufacturerIdentifier') as aas.types.Property).value).toBe('DE-MW-0001');
    expect((byIdShort('UniqueFacilityIdentifier') as aas.types.Property).value).toBe('DE-MW-0001-PLANT-BRE');
    expect(byIdShort('OperatorIdentifier')).toBeUndefined();
  });
  it('emits ManufacturerName as MLP and the address as a drop-in collection', () => {
    const name = byIdShort('ManufacturerName') as aas.types.MultiLanguageProperty;
    expect(name.value?.map((l) => l.language)).toEqual(['de', 'en']);
    const addr = byIdShort('AddressInformation') as aas.types.SubmodelElementCollection;
    expect(addr.value?.map((e) => e.idShort)).toEqual(['Street', 'Zipcode', 'CityTown', 'NationalCode', 'Email']);
    expect(addr.value?.[0]?.semanticId).toBeNull();
  });
  it('emits one marking per marking attribute, list children without idShort', () => {
    const markings = byIdShort('Markings') as aas.types.SubmodelElementList;
    expect(markings.value?.length).toBe(2);
    const first = markings.value?.[0] as aas.types.SubmodelElementCollection;
    expect(first.idShort).toBeNull();
    const names = markings.value?.map((m) => ((m as aas.types.SubmodelElementCollection).value?.find((e) => e.idShort === 'MarkingName') as aas.types.Property).value);
    expect(names).toEqual(['Separate collection symbol', 'Meaning of labels and symbols']);
    const fileEl = first.value?.find((e) => e.idShort === 'MarkingFile') as aas.types.File;
    expect(fileEl.value).toBe('https://passport.musterwerk.example/files/separate-collection.png');
  });
  it('emits document lists as Property children without idShort', () => {
    const doc = byIdShort('EUDeclarationOfConformity') as aas.types.SubmodelElementList;
    expect((doc.value?.[0] as aas.types.Property).value).toBe('DoC-MW-EV-2026-01');
    expect(doc.value?.[0]?.idShort).toBeNull();
  });
  it('returns null when no nameplate attribute is present', () => {
    const empty = PassportDraft.parse({ meta: draft.meta, attributes: {} });
    expect(emitNameplate(empty, resolveIds(empty))).toBeNull();
  });
  it('keeps element order as in the catalogue', () => {
    expect(sm?.submodelElements?.map((e) => e.idShort)).toEqual([
      'URIOfTheProduct', 'ManufacturerName', 'AddressInformation', 'SerialNumber', 'DateOfManufacture',
      'UniqueFacilityIdentifier', 'LifeCycleStage', 'ManufacturerIdentifier', 'Markings',
      'EUDeclarationOfConformity', 'ResultsOfTestReportsProvingCompliance',
    ]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.nameplate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/submodels/shared.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getTemplate } from '@passwerk/rules';
import { getField, type PassportDraft } from '../../model/passport.js';

const { types, jsonization } = aas;

interface RawSubmodel {
  idShort?: string;
  semanticId?: unknown;
  supplementalSemanticIds?: unknown[];
  administration?: { version?: string; revision?: string; templateId?: string };
}

/** Instance submodel whose header (idShort, semanticIds, administration) is copied from the template. */
export function submodelFromTemplate(
  part: number,
  id: string,
  elements: aas.types.ISubmodelElement[],
): aas.types.Submodel {
  const template = getTemplate(part);
  if (!template) throw new Error(`@passwerk/core: no bundled template for part ${part}`);
  const raw = template.environment.submodels?.[0] as RawSubmodel | undefined;
  if (!raw) throw new Error(`@passwerk/core: template ${part} has no submodel`);

  const ref = (j: unknown) => jsonization.referenceFromJsonable(j as aas.jsonization.JsonValue).mustValue();
  const sm = new types.Submodel(id);
  sm.idShort = raw.idShort ?? template.submodelIdShort;
  sm.kind = types.ModellingKind.Instance;
  sm.semanticId = raw.semanticId ? ref(raw.semanticId) : null;
  sm.supplementalSemanticIds = raw.supplementalSemanticIds?.length ? raw.supplementalSemanticIds.map(ref) : null;
  sm.administration = new types.AdministrativeInformation(
    null,
    raw.administration?.version ?? null,
    raw.administration?.revision ?? null,
    null,
    raw.administration?.templateId ?? null,
  );
  sm.submodelElements = elements.length > 0 ? elements : null;
  return sm;
}

/** True when at least one of the ids has a usable (present or conflict) value. */
export function hasAny(draft: PassportDraft, ids: readonly string[]): boolean {
  return ids.some((id) => {
    const f = getField(draft, id);
    return f?.value !== undefined && (f.status === 'present' || f.status === 'conflict');
  });
}

/** Push `el` when defined; keeps emitter code linear. */
export function push<T>(into: T[], el: T | null | undefined): void {
  if (el !== null && el !== undefined) into.push(el);
}
```

`packages/core/src/emit/submodels/nameplate.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { ManufacturerInformation } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import type { DocumentRef, GraphicRef } from '../../model/values.js';
import type { z } from 'zod';
import { collection, file, list, multiLanguageProperty, plainProperty, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, push, submodelFromTemplate } from './shared.js';

type Doc = z.infer<typeof DocumentRef>;
type Graphic = z.infer<typeof GraphicRef>;

const P = '1';
const M = `${P}/Markings/Markings__00__`;

/**
 * Marking names are the context names quoted in the IDTA 02035-1 template description of
 * MarkingName (DIN DKE SPEC 99100 6.2.2, 6.2.3, 6.2.6).
 */
const MARKINGS: { attributeId: string; name: string }[] = [
  { attributeId: 'separateCollectionSymbol', name: 'Separate collection symbol' },
  { attributeId: 'cadmiumLeadSymbols', name: 'Symbols for cadmium and lead' },
  { attributeId: 'meaningOfLabelsAndSymbols', name: 'Meaning of labels and symbols' },
];

export const NAMEPLATE_ATTRIBUTES: readonly string[] = [
  'batteryPassportIdentifier', 'manufacturerInformation', 'batteryIdentifier', 'manufacturingDate',
  'dateOfPuttingIntoService', 'manufacturingPlace', 'batteryStatus', 'operatorIdentifier',
  'separateCollectionSymbol', 'cadmiumLeadSymbols', 'meaningOfLabelsAndSymbols',
  'euDeclarationOfConformity', 'testReportsProvingCompliance',
];

function address(info: ManufacturerInformation['address']): aas.types.SubmodelElementCollection | null {
  if (!info) return null;
  const children: aas.types.ISubmodelElement[] = [];
  // idShorts follow the ZVEI Contact Information template; semanticIds are not bundled (verify).
  const pairs: [string, string | undefined][] = [
    ['Street', info.street], ['Zipcode', info.zipCode], ['CityTown', info.cityTown],
    ['NationalCode', info.nationalCode], ['Email', info.email], ['Phone', info.phone], ['Website', info.website],
  ];
  for (const [idShort, value] of pairs) if (value) children.push(plainProperty(idShort, value));
  return collection(`${P}/AddressInformation`, children);
}

function marking(name: string, graphic: Graphic | undefined, text: string | undefined): aas.types.SubmodelElementCollection {
  const children: aas.types.ISubmodelElement[] = [property(`${M}/MarkingName`, name)];
  if (graphic) push(children, file(`${M}/MarkingFile`, graphic.contentType, graphic.uri ?? graphic.fileName));
  const extra = graphic?.additionalText ?? text;
  if (extra) push(children, property(`${M}/MarkingAdditionalText`, extra));
  return collection(M, children);
}

function documentList(path: string, docs: Doc[] | undefined): aas.types.SubmodelElementList | null {
  if (!docs || docs.length === 0) return null;
  return list(path, docs.map((d) => property(`${path}/DocumentIdentifier`, d.id)));
}

/** IDTA 02035-1 Battery Nameplate. Returns null when the draft has no nameplate data. */
export function emitNameplate(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, NAMEPLATE_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];
  const manufacturer = v<ManufacturerInformation>('manufacturerInformation');

  // Catalogue order for part 1.
  push(els, property(`${P}/URIOfTheProduct`, draft.meta.passportId));
  if (manufacturer) push(els, multiLanguageProperty(`${P}/ManufacturerName`, manufacturer.name));
  if (manufacturer) push(els, address(manufacturer.address));
  const serial = v<string>('batteryIdentifier');
  if (serial) push(els, property(`${P}/SerialNumber`, serial));
  const made = v<string>('manufacturingDate');
  if (made) push(els, property(`${P}/DateOfManufacture`, made));
  const inService = v<string>('dateOfPuttingIntoService');
  if (inService) push(els, property(`${P}/DateOfPuttingIntoService`, inService));
  const facility = v<string>('manufacturingPlace');
  if (facility) push(els, property(`${P}/UniqueFacilityIdentifier`, facility));
  const stage = v<string>('batteryStatus');
  if (stage) push(els, property(`${P}/LifeCycleStage`, stage));
  const operator = v<string>('operatorIdentifier');
  if (operator) push(els, property(`${P}/OperatorIdentifier`, operator));
  if (manufacturer) push(els, property(`${P}/ManufacturerIdentifier`, manufacturer.identifier));

  const markings: aas.types.ISubmodelElement[] = [];
  for (const { attributeId, name } of MARKINGS) {
    const value = v<Graphic | string>(attributeId);
    if (value === undefined) continue;
    markings.push(typeof value === 'string' ? marking(name, undefined, value) : marking(name, value, undefined));
  }
  if (markings.length > 0) push(els, list(`${P}/Markings`, markings));

  push(els, documentList(`${P}/EUDeclarationOfConformity`, v<Doc[]>('euDeclarationOfConformity')));
  push(els, documentList(`${P}/ResultsOfTestReportsProvingCompliance`, v<Doc[]>('testReportsProvingCompliance')));

  return submodelFromTemplate(1, ids.submodelId('BatteryNameplate'), els);
}
```

Add to `src/index.ts`: `export * from './emit/submodels/nameplate.js';` and `export { submodelFromTemplate } from './emit/submodels/shared.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. If the catalogue idShort for `1/Markings/Markings__00__` children differs from the strings above, fix the test to the catalogue value; never the other way round.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): emit IDTA 02035-1 nameplate submodel from the draft"
```

---

### Task 8: Material Composition emitter (part 6)

**Files:**
- Create: `packages/core/src/emit/submodels/materialComposition.ts`
- Test: `packages/core/test/emit.materialComposition.test.ts`

**Interfaces:**
- Produces: `MATERIAL_ATTRIBUTES`, `emitMaterialComposition(draft, ids): aas.types.Submodel | null`

- [ ] **Step 1: Failing test**

`packages/core/test/emit.materialComposition.test.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { PassportDraft, emitMaterialComposition, resolveIds, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitMaterialComposition(draft, resolveIds(draft))!;
const top = (idShort: string) => sm.submodelElements?.find((e) => e.idShort === idShort);
const child = (c: aas.types.ISubmodelElement, idShort: string) =>
  (c as aas.types.SubmodelElementCollection).value?.find((e) => e.idShort === idShort);
const val = (c: aas.types.ISubmodelElement | undefined) => (c as aas.types.Property | undefined)?.value;

describe('emitMaterialComposition', () => {
  it('emits the chemistry collection', () => {
    const chem = top('BatteryChemistry')!;
    expect(val(child(chem, 'ShortName'))).toBe('NMC');
    expect(val(child(chem, 'ClearName'))).toBe('Lithium nickel manganese cobalt oxide');
  });
  it('merges critical raw materials and electrode materials into BatteryMaterials', () => {
    const mats = (top('BatteryMaterials') as aas.types.SubmodelElementList).value!;
    expect(mats.length).toBe(5);
    expect(mats.every((m) => m.idShort === null)).toBe(true);
    expect(val(child(mats[0]!, 'BatteryMaterialIdentifier'))).toBe('7439-93-2');
    expect(val(child(mats[0]!, 'BatteryMaterialMass'))).toBe('6.40');
    expect(val(child(mats[0]!, 'IsCriticalRawMaterial'))).toBe('true');
    expect(val(child(mats[3]!, 'IsCriticalRawMaterial'))).toBe('false');
    expect(child(mats[3]!, 'BatteryMaterialMass')).toBeUndefined();
    const loc = child(mats[0]!, 'BatteryMaterialLocation')!;
    expect(val(child(loc, 'ComponentName'))).toBe('Cathode');
    expect((mats[0] as aas.types.SubmodelElementCollection).value?.map((e) => e.idShort)).toEqual([
      'BatteryMaterialLocation', 'BatteryMaterialIdentifier', 'BatteryMaterialName', 'BatteryMaterialMass', 'IsCriticalRawMaterial',
    ]);
  });
  it('emits hazardous substances with impacts as a nested list', () => {
    const subs = (top('HazardousSubstances') as aas.types.SubmodelElementList).value!;
    expect(subs.length).toBe(1);
    expect(val(child(subs[0]!, 'HazardousSubstanceClass'))).toBe('AcuteToxicity');
    expect(val(child(subs[0]!, 'HazardousSubstanceConcentration'))).toBe('1.2');
    const impacts = child(subs[0]!, 'HazardousSubstanceImpact') as aas.types.SubmodelElementList;
    expect(impacts.value?.map((p) => (p as aas.types.Property).value)).toEqual([
      'H301 Toxic if swallowed', 'H314 Causes severe skin burns and eye damage',
    ]);
    expect(impacts.value?.[0]?.idShort).toBeNull();
  });
  it('attaches a flat substanceImpacts text to every substance that has none', () => {
    const d = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: {
        ...samples['ev-valid'].attributes,
        hazardousSubstances: { value: [{ name: 'LiPF6', identifier: '21324-40-3' }], status: 'present' },
        substanceImpacts: { value: 'H302 Harmful if swallowed', status: 'present' },
      },
    });
    const s = emitMaterialComposition(d, resolveIds(d))!;
    const subs = (s.submodelElements?.find((e) => e.idShort === 'HazardousSubstances') as aas.types.SubmodelElementList).value!;
    const impacts = child(subs[0]!, 'HazardousSubstanceImpact') as aas.types.SubmodelElementList;
    expect(val(impacts.value?.[0])).toBe('H302 Harmful if swallowed');
  });
  it('skips the identifier element when a material has none (broken sample)', () => {
    const d = PassportDraft.parse({
      ...samples['ev-valid'],
      attributes: { ...samples['ev-valid'].attributes, criticalRawMaterials: { value: [{ name: 'Lithium' }], status: 'present' } },
    });
    const s = emitMaterialComposition(d, resolveIds(d))!;
    const mats = (s.submodelElements?.find((e) => e.idShort === 'BatteryMaterials') as aas.types.SubmodelElementList).value!;
    expect(child(mats[0]!, 'BatteryMaterialIdentifier')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.materialComposition.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/submodels/materialComposition.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { BatteryChemistry } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, push, submodelFromTemplate } from './shared.js';

const P = '6';
const MAT = `${P}/BatteryMaterials/BatteryMaterial`;
const HAZ = `${P}/HazardousSubstances/HazardousSubstance`;

export const MATERIAL_ATTRIBUTES: readonly string[] = [
  'batteryChemistry', 'criticalRawMaterials', 'electrodeAndElectrolyteMaterials', 'hazardousSubstances', 'substanceImpacts',
];

/** Loose input shapes: the emitter must tolerate drafts that failed L1 (fail-honest emit). */
interface MaterialIn {
  name?: string;
  identifier?: string;
  massKg?: string;
  location?: { componentName?: string; componentId?: string };
}
interface SubstanceIn extends MaterialIn {
  class?: string;
  concentrationPercent?: string;
  impacts?: string[];
}

function location(path: string, loc: MaterialIn['location']): aas.types.SubmodelElementCollection | null {
  if (!loc || (!loc.componentName && !loc.componentId)) return null;
  const children: aas.types.ISubmodelElement[] = [];
  if (loc.componentName) children.push(property(`${path}/ComponentName`, loc.componentName));
  if (loc.componentId) children.push(property(`${path}/ComponentId`, loc.componentId));
  return collection(path, children);
}

function material(m: MaterialIn, critical: boolean): aas.types.SubmodelElementCollection {
  const c: aas.types.ISubmodelElement[] = [];
  push(c, location(`${MAT}/BatteryMaterialLocation`, m.location));
  if (m.identifier) c.push(property(`${MAT}/BatteryMaterialIdentifier`, m.identifier));
  if (m.name) c.push(property(`${MAT}/BatteryMaterialName`, m.name));
  if (m.massKg) c.push(property(`${MAT}/BatteryMaterialMass`, m.massKg));
  c.push(property(`${MAT}/IsCriticalRawMaterial`, critical ? 'true' : 'false'));
  return collection(MAT, c);
}

function substance(s: SubstanceIn, fallbackImpact: string | undefined): aas.types.SubmodelElementCollection {
  const c: aas.types.ISubmodelElement[] = [];
  if (s.class) c.push(property(`${HAZ}/HazardousSubstanceClass`, s.class));
  if (s.name) c.push(property(`${HAZ}/HazardousSubstanceName`, s.name));
  if (s.concentrationPercent) c.push(property(`${HAZ}/HazardousSubstanceConcentration`, s.concentrationPercent));
  const impacts = s.impacts && s.impacts.length > 0 ? s.impacts : fallbackImpact ? [fallbackImpact] : [];
  if (impacts.length > 0) {
    c.push(list(`${HAZ}/HazardousSubstanceImpact`, impacts.map((i) => property(`${HAZ}/HazardousSubstanceImpact/Impact`, i))));
  }
  push(c, location(`${HAZ}/HazardousSubstanceLocation`, s.location));
  if (s.identifier) c.push(property(`${HAZ}/HazardousSubstanceIdentifier`, s.identifier));
  return collection(HAZ, c);
}

/** IDTA 02035-6 Material Composition. Returns null when the draft has no material data. */
export function emitMaterialComposition(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, MATERIAL_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const els: aas.types.ISubmodelElement[] = [];

  const chem = v<Partial<BatteryChemistry>>('batteryChemistry');
  if (chem) {
    const c: aas.types.ISubmodelElement[] = [];
    if (chem.shortName) c.push(property(`${P}/BatteryChemistry/ShortName`, chem.shortName));
    if (chem.clearName) c.push(property(`${P}/BatteryChemistry/ClearName`, chem.clearName));
    els.push(collection(`${P}/BatteryChemistry`, c));
  }

  const critical = v<MaterialIn[]>('criticalRawMaterials') ?? [];
  const electrode = v<MaterialIn[]>('electrodeAndElectrolyteMaterials') ?? [];
  const criticalIds = new Set(critical.map((m) => m.identifier).filter(Boolean));
  const materials = [
    ...critical.map((m) => material(m, true)),
    ...electrode.map((m) => material(m, m.identifier !== undefined && criticalIds.has(m.identifier))),
  ];
  if (materials.length > 0) els.push(list(`${P}/BatteryMaterials`, materials));

  const substances = v<SubstanceIn[]>('hazardousSubstances') ?? [];
  const flatImpact = v<string>('substanceImpacts');
  if (substances.length > 0) {
    els.push(list(`${P}/HazardousSubstances`, substances.map((s) => substance(s, flatImpact))));
  }

  return submodelFromTemplate(6, ids.submodelId('MaterialComposition'), els);
}
```

Add to `src/index.ts`: `export * from './emit/submodels/materialComposition.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): emit IDTA 02035-6 material composition submodel"
```

---

### Task 9: Carbon Footprint emitter (part 3)

**Files:**
- Create: `packages/core/src/emit/submodels/carbonFootprint.ts`
- Test: `packages/core/test/emit.carbonFootprint.test.ts`

**Interfaces:**
- Produces: `CARBON_ATTRIBUTES`, `emitCarbonFootprint(draft, ids): aas.types.Submodel | null`

- [ ] **Step 1: Failing test**

`packages/core/test/emit.carbonFootprint.test.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { PassportDraft, emitCarbonFootprint, resolveIds, samples } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const draft = PassportDraft.parse(samples['ev-valid']);
const sm = emitCarbonFootprint(draft, resolveIds(draft))!;
const pcfs = sm.submodelElements?.[0] as aas.types.SubmodelElementList;
const pcf = pcfs.value?.[0] as aas.types.SubmodelElementCollection;
const child = (idShort: string) => pcf.value?.find((e) => e.idShort === idShort);
const val = (e: aas.types.ISubmodelElement | undefined) => (e as aas.types.Property | undefined)?.value;
const listValues = (e: aas.types.ISubmodelElement | undefined) =>
  (e as aas.types.SubmodelElementList).value?.map((p) => (p as aas.types.Property).value);

describe('emitCarbonFootprint', () => {
  it('wraps one ProductCarbonFootprint in the list, without idShort', () => {
    expect(pcfs.idShort).toBe('ProductCarbonFootprints');
    expect(pcfs.value?.length).toBe(1);
    expect(pcf.idShort).toBeNull();
  });
  it('maps the PCF value, unit, quantity and methods', () => {
    expect(val(child('PcfCO2eq'))).toBe('61.2');
    expect(val(child('ReferenceImpactUnitForCalculation'))).toBe('kWh');
    expect(val(child('QuantityOfMeasureForCalculation'))).toBe('1');
    expect(listValues(child('PcfCalculationMethods'))).toEqual(['ISO 14067:2018']);
  });
  it('lists life-cycle phases by the KB attribute name for each present share', () => {
    expect(listValues(child('LifeCyclePhases'))).toEqual([
      getAttribute('carbonFootprintShareRawMaterials')!.name.en,
      getAttribute('carbonFootprintShareManufacturing')!.name.en,
      getAttribute('carbonFootprintShareDistribution')!.name.en,
      getAttribute('carbonFootprintShareEndOfLife')!.name.en,
    ]);
  });
  it('maps performance class and study link', () => {
    expect(val(child('PerformanceClass'))).toBe('B');
    expect(listValues(child('WebLinkToPublicCarbonFootprintStudy'))).toEqual(['https://passport.musterwerk.example/pcf/MW-EV-2026.pdf']);
  });
  it('is absent for the LMT sample', () => {
    const lmt = PassportDraft.parse(samples['lmt-valid']);
    expect(emitCarbonFootprint(lmt, resolveIds(lmt))).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.carbonFootprint.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/submodels/carbonFootprint.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import { getAttribute } from '@passwerk/rules';
import type { CarbonFootprintGeneralInformation } from '../../model/composites.js';
import { type PassportDraft, presentValue } from '../../model/passport.js';
import { collection, list, property } from '../elements.js';
import type { EmitIds } from '../ids.js';
import { hasAny, submodelFromTemplate } from './shared.js';

const P = '3';
const PCF = `${P}/ProductCarbonFootprints/ProductCarbonFootprint`;

const SHARE_ATTRIBUTES = [
  'carbonFootprintShareRawMaterials',
  'carbonFootprintShareManufacturing',
  'carbonFootprintShareDistribution',
  'carbonFootprintShareEndOfLife',
] as const;

export const CARBON_ATTRIBUTES: readonly string[] = [
  'carbonFootprintGeneralInformation', 'carbonFootprintPerFunctionalUnit', ...SHARE_ATTRIBUTES,
  'carbonFootprintPerformanceClass', 'carbonFootprintStudyLink',
];

/**
 * IDTA 02035-3 Carbon Footprint (one ProductCarbonFootprint per passport).
 *
 * The four life-cycle share attributes (percentages, KB marks them `verify`) cannot be carried
 * as numbers in the template's LifeCyclePhases list of xs:string phase names. We emit the phase
 * name (the KB attribute's English name) for every share that is present; the percentages stay
 * in the draft for the gap report and the HTML sheet.
 */
export function emitCarbonFootprint(draft: PassportDraft, ids: EmitIds): aas.types.Submodel | null {
  if (!hasAny(draft, CARBON_ATTRIBUTES)) return null;
  const v = <T>(id: string) => presentValue<T>(draft, id);
  const c: aas.types.ISubmodelElement[] = [];

  const general = v<Partial<CarbonFootprintGeneralInformation>>('carbonFootprintGeneralInformation');
  const methods = general?.calculationMethods ?? [];
  if (methods.length > 0) {
    c.push(list(`${PCF}/PcfCalculationMethods`, methods.map((m) => property(`${PCF}/PcfCalculationMethods/PcfCalculationMethod`, m))));
  }
  const pcf = v<string>('carbonFootprintPerFunctionalUnit');
  if (pcf) c.push(property(`${PCF}/PcfCO2eq`, pcf));
  const unit = general?.referenceImpactUnit;
  if (unit) c.push(property(`${PCF}/ReferenceImpactUnitForCalculation`, unit));
  const quantity = general?.quantityOfMeasure;
  if (quantity) c.push(property(`${PCF}/QuantityOfMeasureForCalculation`, quantity));

  const phases: aas.types.ISubmodelElement[] = [];
  for (const id of SHARE_ATTRIBUTES) {
    if (v<string>(id) === undefined) continue;
    const name = getAttribute(id)?.name.en;
    if (name) phases.push(property(`${PCF}/LifeCyclePhases/LifeCyclePhase`, name));
  }
  if (phases.length > 0) c.push(list(`${PCF}/LifeCyclePhases`, phases));

  const klass = v<string>('carbonFootprintPerformanceClass');
  if (klass) c.push(property(`${PCF}/PerformanceClass`, klass));

  const links = v<{ id: string; uri?: string }[]>('carbonFootprintStudyLink') ?? [];
  if (links.length > 0) {
    c.push(
      list(`${PCF}/WebLinkToPublicCarbonFootprintStudy`, links.map((d) => property(`${PCF}/WebLinkToPublicCarbonFootprintStudy/DocumentIdentifier`, d.uri ?? d.id))),
    );
  }

  const pcfCollection = collection(PCF, c);
  return submodelFromTemplate(3, ids.submodelId('CarbonFootprint'), [list(`${P}/ProductCarbonFootprints`, [pcfCollection])]);
}
```

Add to `src/index.ts`: `export * from './emit/submodels/carbonFootprint.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): emit IDTA 02035-3 carbon footprint submodel"
```

---

### Task 10: Environment builder and L2

**Files:**
- Create: `packages/core/src/emit/environment.ts`
- Create: `packages/core/src/validate/aas.ts`
- Test: `packages/core/test/emit.environment.test.ts`, `packages/core/test/validate.aas.test.ts`

**Interfaces:**
- Produces:
  - `buildEnvironment(draft: PassportDraft, options?: EmitOptions): aas.types.Environment`
  - `environmentToJsonable(env): aas.jsonization.JsonObject`
  - `validateAas(jsonable: unknown): { findings: Finding[]; environment?: aas.types.Environment }`

- [ ] **Step 1: Failing tests**

`packages/core/test/emit.environment.test.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import { PassportDraft, buildEnvironment, samples } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('buildEnvironment', () => {
  it('has one shell referencing every emitted submodel', () => {
    const env = buildEnvironment(PassportDraft.parse(samples['ev-valid']));
    expect(env.assetAdministrationShells?.length).toBe(1);
    const shell = env.assetAdministrationShells![0]!;
    expect(shell.id).toBe('https://passport.musterwerk.example/battery/MW-EV-2026-000123/aas');
    expect(shell.assetInformation.assetKind).toBe(aas.types.AssetKind.Instance);
    expect(shell.assetInformation.globalAssetId).toBe('https://passport.musterwerk.example/battery/MW-EV-2026-000123');
    expect(env.submodels?.map((s) => s.idShort)).toEqual(['BatteryNameplate', 'CarbonFootprint', 'MaterialComposition']);
    expect(shell.submodels?.map((r) => r.keys[0]?.value)).toEqual(env.submodels?.map((s) => s.id));
    expect(shell.submodels?.[0]?.type).toBe(aas.types.ReferenceTypes.ModelReference);
    expect(shell.submodels?.[0]?.keys[0]?.type).toBe(aas.types.KeyTypes.Submodel);
  });
  it('omits submodels without data', () => {
    const env = buildEnvironment(PassportDraft.parse(samples['lmt-valid']));
    expect(env.submodels?.map((s) => s.idShort)).toEqual(['BatteryNameplate', 'MaterialComposition']);
  });
  it('passes aas-core verification for every valid sample', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const env = buildEnvironment(PassportDraft.parse(samples[name]));
      expect([...aas.verification.verify(env)].map((e) => `${e.path}: ${e.message}`), name).toEqual([]);
    }
  });
});
```

`packages/core/test/validate.aas.test.ts`:

```ts
import { PassportDraft, buildEnvironment, environmentToJsonable, samples, validateAas } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('L2 validateAas', () => {
  const jsonable = environmentToJsonable(buildEnvironment(PassportDraft.parse(samples['ev-valid'])));
  it('accepts the emitted environment', () => {
    const r = validateAas(jsonable);
    expect(r.findings).toEqual([]);
    expect(r.environment).toBeDefined();
  });
  it('reports deserialisation problems as PW-L2-DESERIALIZE', () => {
    const r = validateAas({ submodels: [{ modelType: 'Submodel' }] });
    expect(r.findings.map((f) => f.ruleId)).toEqual(['PW-L2-DESERIALIZE']);
    expect(r.findings[0]?.severity).toBe('error');
  });
  it('reports metamodel violations as PW-L2-AAS-CORE with a path', () => {
    const broken = structuredClone(jsonable) as { submodels: { submodelElements: { idShort: string }[] }[] };
    broken.submodels[0]!.submodelElements[0]!.idShort = 'not-valid-id-short';
    const r = validateAas(broken);
    expect(r.findings.map((f) => f.ruleId)).toEqual(['PW-L2-AAS-CORE']);
    expect(r.findings[0]?.path).toContain('submodels[0].submodelElements[0]');
    expect(r.findings[0]?.message.de).toMatch(/AAS-Metamodell/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.environment.test.ts packages/core/test/validate.aas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/environment.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { PassportDraft } from '../model/passport.js';
import { type EmitOptions, resolveIds } from './ids.js';
import { emitCarbonFootprint } from './submodels/carbonFootprint.js';
import { emitMaterialComposition } from './submodels/materialComposition.js';
import { emitNameplate } from './submodels/nameplate.js';

const { types, jsonization } = aas;

/** One shell + the MVP submodels that have data, in template part order (1, 3, 6). */
export function buildEnvironment(draft: PassportDraft, options: EmitOptions = {}): aas.types.Environment {
  const ids = resolveIds(draft, options);
  const submodels = [emitNameplate(draft, ids), emitCarbonFootprint(draft, ids), emitMaterialComposition(draft, ids)]
    .filter((s): s is aas.types.Submodel => s !== null);

  const shell = new types.AssetAdministrationShell(
    ids.shellId,
    new types.AssetInformation(types.AssetKind.Instance, ids.assetId),
  );
  shell.idShort = 'BatteryPassport';
  shell.submodels =
    submodels.length > 0
      ? submodels.map(
          (s) => new types.Reference(types.ReferenceTypes.ModelReference, [new types.Key(types.KeyTypes.Submodel, s.id)]),
        )
      : null;

  return new types.Environment([shell], submodels.length > 0 ? submodels : null, null);
}

export function environmentToJsonable(env: aas.types.Environment): aas.jsonization.JsonObject {
  return jsonization.toJsonable(env);
}
```

`packages/core/src/validate/aas.ts`:

```ts
import * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { Finding } from './finding.js';
import { message } from './messages.js';

export interface AasResult {
  findings: Finding[];
  environment?: aas.types.Environment;
}

/** L2: the emitted JSON is a valid AAS V3.0 Environment according to aas-core verification. */
export function validateAas(jsonable: unknown): AasResult {
  const parsed = aas.jsonization.environmentFromJsonable(jsonable as aas.jsonization.JsonValue);
  if (parsed.error !== null || parsed.value === null) {
    const detail = parsed.error ? `${parsed.error.path.toString()}: ${parsed.error.message}` : 'unknown error';
    return {
      findings: [
        {
          layer: 'L2',
          ruleId: 'PW-L2-DESERIALIZE',
          severity: 'error',
          path: parsed.error?.path.toString() ?? '',
          message: message('PW-L2-DESERIALIZE', detail),
        },
      ],
    };
  }
  const environment = parsed.value;
  const findings: Finding[] = [];
  for (const error of aas.verification.verify(environment)) {
    findings.push({
      layer: 'L2',
      ruleId: 'PW-L2-AAS-CORE',
      severity: 'error',
      path: error.path.toString(),
      message: message('PW-L2-AAS-CORE', `${error.path.toString()}: ${error.message}`),
    });
  }
  return { findings, environment };
}
```

Add to `src/index.ts`:

```ts
export * from './emit/environment.js';
export * from './validate/aas.js';
```

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. If `verify` reports an error on the emitted environment, fix the emitter, not the test. Likely culprits: `idShort` on list children, an `xs:float` value that is not a float lexical form, a `valueTypeListElement` set when the list holds collections.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): build the AAS environment and verify it (L2)"
```

---

### Task 11: L3 template conformance

**Files:**
- Create: `packages/core/src/validate/template.ts`
- Test: `packages/core/test/validate.template.test.ts`

**Interfaces:**
- Produces: `validateTemplate(jsonable: unknown): { findings: Finding[] }`

- [ ] **Step 1: Failing test**

`packages/core/test/validate.template.test.ts`:

```ts
import { PassportDraft, buildEnvironment, environmentToJsonable, samples, validateTemplate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

type El = { idShort?: string; modelType: string; semanticId?: { keys: { value: string }[] }; valueType?: string; value?: El[] | string; typeValueListElement?: string };
type Env = { submodels: { idShort: string; semanticId?: { keys: { value: string }[] }; submodelElements: El[] }[] };

const base = () => structuredClone(environmentToJsonable(buildEnvironment(PassportDraft.parse(samples['ev-valid'])))) as unknown as Env;
const ids = (env: unknown) => validateTemplate(env).findings.map((f) => f.ruleId);
const nameplate = (env: Env) => env.submodels.find((s) => s.idShort === 'BatteryNameplate')!;
const materials = (env: Env) => env.submodels.find((s) => s.idShort === 'MaterialComposition')!;

describe('L3 validateTemplate', () => {
  it('accepts the emitted environment for every valid sample', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const env = environmentToJsonable(buildEnvironment(PassportDraft.parse(samples[name])));
      expect(validateTemplate(env).findings, name).toEqual([]);
    }
  });
  it('PW-L3-MISSING when a mandatory element is removed', () => {
    const env = base();
    const sm = nameplate(env);
    sm.submodelElements = sm.submodelElements.filter((e) => e.idShort !== 'SerialNumber');
    const f = validateTemplate(env).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['PW-L3-MISSING']);
    expect(f[0]?.templatePath).toBe('1/SerialNumber');
    expect(f[0]?.severity).toBe('error');
  });
  it('PW-L3-MISSING inside a list child (material without identifier)', () => {
    const env = base();
    const mats = materials(env).submodelElements.find((e) => e.idShort === 'BatteryMaterials')!;
    const first = (mats.value as El[])[0]!;
    first.value = (first.value as El[]).filter((e) => e.idShort !== 'BatteryMaterialIdentifier');
    const f = validateTemplate(env).findings;
    expect(f.map((x) => x.ruleId)).toEqual(['PW-L3-MISSING']);
    expect(f[0]?.templatePath).toBe('6/BatteryMaterials/BatteryMaterial/BatteryMaterialIdentifier');
    expect(f[0]?.path).toBe('MaterialComposition/BatteryMaterials[0]');
  });
  it('PW-L3-SEMANTIC-ID when a semanticId is changed', () => {
    const env = base();
    nameplate(env).submodelElements.find((e) => e.idShort === 'SerialNumber')!.semanticId = { keys: [{ value: 'urn:wrong' }] };
    expect(ids(env)).toEqual(['PW-L3-SEMANTIC-ID']);
  });
  it('PW-L3-VALUE-TYPE when a valueType is changed', () => {
    const env = base();
    nameplate(env).submodelElements.find((e) => e.idShort === 'DateOfManufacture')!.valueType = 'xs:string';
    expect(ids(env)).toEqual(['PW-L3-VALUE-TYPE']);
  });
  it('PW-L3-MODEL-TYPE when the model type differs', () => {
    const env = base();
    const el = nameplate(env).submodelElements.find((e) => e.idShort === 'SerialNumber')!;
    el.modelType = 'MultiLanguageProperty';
    delete el.valueType;
    el.value = [];
    expect(ids(env)).toContain('PW-L3-MODEL-TYPE');
  });
  it('PW-L3-TOO-MANY when a One element is duplicated', () => {
    const env = base();
    const sm = nameplate(env);
    sm.submodelElements.push(structuredClone(sm.submodelElements.find((e) => e.idShort === 'SerialNumber')!));
    expect(ids(env)).toEqual(['PW-L3-TOO-MANY']);
  });
  it('PW-L3-UNKNOWN-ELEMENT (warning) for a stray element, but not inside drop-ins', () => {
    const env = base();
    nameplate(env).submodelElements.push({ idShort: 'Stray', modelType: 'Property', valueType: 'xs:string', value: 'x' });
    const f = validateTemplate(env).findings;
    expect(f.map((x) => `${x.ruleId}:${x.severity}`)).toEqual(['PW-L3-UNKNOWN-ELEMENT:warning']);
    // AddressInformation children (Street, ...) are not in the template and must not warn:
    expect(f.some((x) => x.path.includes('AddressInformation'))).toBe(false);
  });
  it('PW-L3-UNKNOWN-SUBMODEL and PW-L3-SUBMODEL-ID-SHORT', () => {
    const env = base();
    nameplate(env).idShort = 'Nameplate';
    expect(ids(env)).toEqual(['PW-L3-SUBMODEL-ID-SHORT']);
    const env2 = base();
    nameplate(env2).semanticId = { keys: [{ value: 'urn:unknown' }] };
    expect(ids(env2)).toEqual(['PW-L3-UNKNOWN-SUBMODEL']);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/validate.template.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/validate/template.ts`:

```ts
import { type CatalogueElement, type CatalogueTemplate, templates } from '@passwerk/rules';
import type { Finding } from './finding.js';
import { message } from './messages.js';

const DROPIN_USE = 'https://admin-shell.io/smt-dropin/smt-dropin-use/1/0';

/** Loose view of an AAS JSON submodel element; L2 has already checked the real structure. */
interface JsonElement {
  idShort?: string | null;
  modelType?: string;
  semanticId?: { keys?: { value?: string }[] } | null;
  valueType?: string;
  typeValueListElement?: string;
  valueTypeListElement?: string;
  value?: unknown;
}
interface JsonSubmodel extends JsonElement {
  submodelElements?: JsonElement[] | null;
}

function firstKey(ref: JsonElement['semanticId']): string | null {
  return ref?.keys?.[0]?.value ?? null;
}

function children(el: JsonElement): JsonElement[] {
  return Array.isArray(el.value) ? (el.value as JsonElement[]) : [];
}

function templateChildren(t: CatalogueTemplate, parentPath: string, parentDepth: number): CatalogueElement[] {
  const prefix = `${parentPath}/`;
  return t.elements.filter((e) => e.depth === parentDepth + 1 && e.path.startsWith(prefix));
}

function finding(
  ruleId: string,
  severity: Finding['severity'],
  path: string,
  templatePath: string | undefined,
  detail: string,
): Finding {
  const f: Finding = { layer: 'L3', ruleId, severity, path, message: message(ruleId, detail) };
  if (templatePath) f.templatePath = templatePath;
  return f;
}

function checkLevel(
  t: CatalogueTemplate,
  parent: CatalogueElement | null,
  parentPath: string,
  parentDepth: number,
  instancePath: string,
  instances: JsonElement[],
  findings: Finding[],
): void {
  const inList = parent?.modelType === 'SubmodelElementList';
  const expected = templateChildren(t, parentPath, parentDepth);
  const matched = new Set<JsonElement>();

  for (const te of expected) {
    const matches = instances.filter((inst) => {
      if (matched.has(inst)) return false;
      if (inList) {
        return te.semanticId ? firstKey(inst.semanticId) === te.semanticId : inst.modelType === te.modelType;
      }
      return inst.idShort === te.idShort;
    });
    for (const m of matches) matched.add(m);

    const min = te.cardinality.min ?? 0;
    const max = te.cardinality.max;
    const label = `${te.path} (${te.cardinality.raw ?? 'ZeroToMany'})`;
    if (matches.length < min) findings.push(finding('PW-L3-MISSING', 'error', instancePath, te.path, label));
    if (max !== null && matches.length > max) {
      findings.push(finding('PW-L3-TOO-MANY', 'error', instancePath, te.path, `${label}: ${matches.length}`));
    }

    matches.forEach((inst, index) => {
      const here = inList ? `${instancePath}[${index}]` : `${instancePath}/${inst.idShort ?? te.idShort ?? '?'}`;
      if (inst.modelType !== te.modelType) {
        findings.push(finding('PW-L3-MODEL-TYPE', 'error', here, te.path, `expected ${te.modelType}, got ${inst.modelType}`));
        return;
      }
      if (te.semanticId && firstKey(inst.semanticId) !== te.semanticId) {
        findings.push(finding('PW-L3-SEMANTIC-ID', 'error', here, te.path, `expected ${te.semanticId}, got ${firstKey(inst.semanticId) ?? 'none'}`));
      }
      if (te.modelType === 'Property' && te.valueType && inst.valueType !== te.valueType) {
        findings.push(finding('PW-L3-VALUE-TYPE', 'error', here, te.path, `expected ${te.valueType}, got ${inst.valueType ?? 'none'}`));
      }
      if (te.modelType === 'SubmodelElementList' && te.listElement) {
        const le = te.listElement;
        if (
          (le.typeValueListElement && inst.typeValueListElement !== le.typeValueListElement) ||
          (le.valueTypeListElement && inst.valueTypeListElement !== le.valueTypeListElement)
        ) {
          findings.push(finding('PW-L3-LIST-TYPE', 'error', here, te.path, `expected ${le.typeValueListElement}/${le.valueTypeListElement ?? '-'}, got ${inst.typeValueListElement ?? '-'}/${inst.valueTypeListElement ?? '-'}`));
        }
      }
      const isDropIn = te.supplementalSemanticIds.includes(DROPIN_USE);
      if ((te.modelType === 'SubmodelElementCollection' || te.modelType === 'SubmodelElementList') && !isDropIn) {
        checkLevel(t, te, te.path, te.depth, here, children(inst), findings);
      }
    });
  }

  for (const inst of instances) {
    if (matched.has(inst)) continue;
    const label = inst.idShort ?? firstKey(inst.semanticId) ?? inst.modelType ?? '?';
    findings.push(finding('PW-L3-UNKNOWN-ELEMENT', 'warning', `${instancePath}/${label}`, parent?.path, label));
  }
}

/** L3: every submodel in the environment conforms to its IDTA 02035 template. */
export function validateTemplate(jsonable: unknown): { findings: Finding[] } {
  const findings: Finding[] = [];
  const env = jsonable as { submodels?: JsonSubmodel[] | null };
  for (const sm of env.submodels ?? []) {
    const semanticId = firstKey(sm.semanticId);
    const template = templates.find((t) => t.submodelSemanticId === semanticId);
    const smPath = sm.idShort ?? semanticId ?? 'submodel';
    if (!template) {
      findings.push(finding('PW-L3-UNKNOWN-SUBMODEL', 'error', smPath, undefined, semanticId ?? 'none'));
      continue;
    }
    if (sm.idShort !== template.submodelIdShort) {
      findings.push(finding('PW-L3-SUBMODEL-ID-SHORT', 'warning', smPath, undefined, `expected ${template.submodelIdShort}, got ${sm.idShort ?? 'none'}`));
    }
    checkLevel(template.catalogue, null, String(template.part), -1, template.submodelIdShort, sm.submodelElements ?? [], findings);
  }
  return { findings };
}
```

Note on the root call: root elements have `depth 0` and paths `${part}/X`, so `parentPath = "1"`, `parentDepth = -1` selects them.

Add to `src/index.ts`: `export * from './validate/template.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. Watch for: the part 3 catalogue element `3/ProductCarbonFootprints/ProductCarbonFootprint` has `cardinality.raw === null` (treated as `ZeroToMany`, min 0) and a semanticId, so the single instance matches by semanticId; `1/Markings/Markings__00__` has semanticId `0112/2///61360_7#AAS009#001` and `OneToMany`.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): L3 template conformance diff against the IDTA 02035 catalogue"
```

---

### Task 12: `validate()` orchestrator and `emitAasJson()`

**Files:**
- Create: `packages/core/src/validate/index.ts`
- Create: `packages/core/src/emit/aasJson.ts`
- Test: `packages/core/test/validate.test.ts`, `packages/core/test/emit.aasJson.test.ts` (with snapshots)

**Interfaces:**
- Produces:
  - `interface ValidateOptions extends EmitOptions {}`
  - `validate(input: unknown, options?): ValidationReport & { aasJson?: string }`
  - `validateEnvironmentJson(jsonable: unknown): { findings: Finding[] }` (L2 + L3 on an existing environment)
  - `interface EmitResult<T> { output: T; environment: aas.types.Environment; verdict: Verdict; findings: Finding[]; report: ValidationReport }`
  - `emitAasJson(input: unknown, options?): EmitResult<string>`; throws `PassportDraftError` when L1 finds structural errors (PW-L1-SCHEMA / PW-L1-UNKNOWN-ATTRIBUTE) since no draft exists to emit; value errors (PW-L1-VALUE) still emit.

- [ ] **Step 1: Failing tests**

`packages/core/test/validate.test.ts`:

```ts
import { brokenSamples, samples, validate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('validate (L1 -> emit -> L2 + L3)', () => {
  it('is valid for every valid sample and ran all layers', () => {
    for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
      const r = validate(samples[name]);
      expect(r.findings, name).toEqual([]);
      expect(r.verdict, name).toBe('valid');
      expect(r.layers).toEqual({ L1: { ran: true, errors: 0, warnings: 0 }, L2: { ran: true, errors: 0, warnings: 0 }, L3: { ran: true, errors: 0, warnings: 0 } });
      expect(r.aasJson).toContain('"modelType": "Submodel"');
    }
  });
  it('stops after L1 on structural errors', () => {
    const r = validate({ meta: {}, attributes: {} });
    expect(r.verdict).toBe('invalid');
    expect(r.layers.L2.ran).toBe(false);
    expect(r.aasJson).toBeUndefined();
  });
  it('still runs L2 and L3 on value errors and reports both layers', () => {
    const r = validate(brokenSamples['ev-missing-material-identifier'].draft);
    const ids = r.findings.map((f) => f.ruleId);
    expect(ids).toContain('PW-L1-VALUE');
    expect(ids).toContain('PW-L3-MISSING');
    expect(r.layers.L3.ran).toBe(true);
    expect(r.verdict).toBe('invalid');
  });
});
```

`packages/core/test/emit.aasJson.test.ts`:

```ts
import { PassportDraftError, emitAasJson, samples } from '@passwerk/core';
import { getTemplateElement, templates } from '@passwerk/rules';
import { describe, expect, it } from 'vitest';

const knownSemanticIds = new Set<string>();
for (const t of templates) {
  if (t.submodelSemanticId) knownSemanticIds.add(t.submodelSemanticId);
  for (const e of t.catalogue.elements) {
    if (e.semanticId) knownSemanticIds.add(e.semanticId);
    for (const s of e.supplementalSemanticIds) knownSemanticIds.add(s);
    if (e.listElement?.semanticIdListElement) knownSemanticIds.add(e.listElement.semanticIdListElement);
  }
}
// Submodel-level supplemental ids come from the raw template headers.
for (const t of templates) {
  const raw = t.environment.submodels?.[0] as { supplementalSemanticIds?: { keys: { value: string }[] }[] };
  for (const r of raw.supplementalSemanticIds ?? []) knownSemanticIds.add(r.keys[0]!.value);
}

describe('emitAasJson', () => {
  for (const name of ['ev-valid', 'lmt-valid', 'industrial-valid'] as const) {
    it(`${name}: valid, canonical, snapshot`, () => {
      const r = emitAasJson(samples[name]);
      expect(r.findings).toEqual([]);
      expect(r.verdict).toBe('valid');
      expect(r.output.endsWith('\n')).toBe(true);
      expect(r.output).toMatchSnapshot();
      // canonical: keys sorted at every level
      const parsed = JSON.parse(r.output) as Record<string, unknown>;
      expect(Object.keys(parsed)).toEqual([...Object.keys(parsed)].sort());
      // every semanticId in the output exists in the bundled templates
      for (const m of r.output.matchAll(/"value": "([^"]+)"/g)) {
        if (/^(urn:samm|https:\/\/admin-shell\.io|0112\/|0173-)/.test(m[1]!)) expect(knownSemanticIds.has(m[1]!), m[1]).toBe(true);
      }
    });
  }
  it('is byte-identical across runs', () => {
    expect(emitAasJson(samples['ev-valid']).output).toBe(emitAasJson(samples['ev-valid']).output);
  });
  it('carries the passport id as asset id and URIOfTheProduct', () => {
    const out = emitAasJson(samples['ev-valid']).output;
    expect(out).toContain('"globalAssetId": "https://passport.musterwerk.example/battery/MW-EV-2026-000123"');
    expect(getTemplateElement('1/URIOfTheProduct')?.semanticId).toBeTruthy();
  });
  it('emits with verdict invalid on value errors and throws on structural errors', () => {
    expect(emitAasJson({ meta: {}, attributes: {} } as never)).toBeUndefined;
    expect(() => emitAasJson({ meta: {}, attributes: {} })).toThrow(PassportDraftError);
  });
});
```

Remove the stray `toBeUndefined;` line from the last test before running (keep only the `toThrow` assertion).

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/validate.test.ts packages/core/test/emit.aasJson.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/validate/index.ts`:

```ts
import { buildEnvironment, environmentToJsonable } from '../emit/environment.js';
import { canonicalJson } from '../emit/canonical.js';
import type { EmitOptions } from '../emit/ids.js';
import { validateAas } from './aas.js';
import { buildReport, type Finding, type ValidationReport } from './finding.js';
import { validateSchema } from './schema.js';
import { validateTemplate } from './template.js';

export type ValidateOptions = EmitOptions;

/** L2 + L3 on an environment that already exists as JSON. */
export function validateEnvironmentJson(jsonable: unknown): { findings: Finding[] } {
  const l2 = validateAas(jsonable);
  const l3 = validateTemplate(jsonable);
  return { findings: [...l2.findings, ...l3.findings] };
}

/**
 * L1 on the draft; if it is structurally sound, emit the AAS JSON in memory and run L2 and L3
 * on it. The verdict therefore always reflects the emitted output (BUILD_PLAN 2.4).
 */
export function validate(input: unknown, options: ValidateOptions = {}): ValidationReport & { aasJson?: string } {
  const l1 = validateSchema(input);
  if (!l1.draft) return buildReport(l1.findings, { L1: true, L2: false, L3: false });

  const jsonable = environmentToJsonable(buildEnvironment(l1.draft, options));
  const rest = validateEnvironmentJson(jsonable);
  const report = buildReport([...l1.findings, ...rest.findings], { L1: true, L2: true, L3: true });
  return { ...report, aasJson: canonicalJson(jsonable) };
}
```

`packages/core/src/emit/aasJson.ts`:

```ts
import type * as aas from '@aas-core-works/aas-core3.0-typescript';
import type { Finding, ValidationReport, Verdict } from '../validate/finding.js';
import { buildReport } from '../validate/finding.js';
import { validateEnvironmentJson } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { canonicalJson } from './canonical.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';
import type { EmitOptions } from './ids.js';

export interface EmitResult<T> {
  output: T;
  environment: aas.types.Environment;
  verdict: Verdict;
  findings: Finding[];
  report: ValidationReport;
}

/** Thrown when the input is not even structurally a PassportDraft, so nothing can be emitted. */
export class PassportDraftError extends Error {
  constructor(public readonly findings: Finding[]) {
    super(`PassportDraft is structurally invalid: ${findings.map((f) => f.message.en).join('; ')}`);
    this.name = 'PassportDraftError';
  }
}

/**
 * Canonical AAS JSON for the draft. Fail-honest: value-level L1 errors still emit, and the
 * verdict is recomputed from L1 + L2 + L3 on the emitted output.
 */
export function emitAasJson(input: unknown, options: EmitOptions = {}): EmitResult<string> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const jsonable = environmentToJsonable(environment);
  const rest = validateEnvironmentJson(jsonable);
  const report = buildReport([...l1.findings, ...rest.findings], { L1: true, L2: true, L3: true });
  return { output: canonicalJson(jsonable), environment, verdict: report.verdict, findings: report.findings, report };
}
```

Add to `src/index.ts`:

```ts
export * from './emit/aasJson.js';
export * from './validate/index.js';
```

- [ ] **Step 4: Run, expect pass; review the snapshot**

Run: `pnpm vitest run packages/core`
Expected: PASS and three new snapshots under `packages/core/test/__snapshots__/emit.aasJson.test.ts.snap`. Open the `ev-valid` snapshot and confirm by eye: three submodels, `kind: "Instance"`, no `qualifiers`, no `idShort` on list children, the AddressInformation children without semanticId. This is the "show me the first emitted AAS JSON" checkpoint from BUILD_PLAN section 11: paste the nameplate submodel into the PR description.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): validate() orchestrator and emitAasJson with re-validation"
```

---

### Task 13: AASX packaging

**Files:**
- Create: `packages/core/src/emit/aasx.ts`
- Test: `packages/core/test/emit.aasx.test.ts`

**Interfaces:**
- Produces: `emitAasx(input, options?): EmitResult<Uint8Array>`, `readAasxEnvironment(bytes: Uint8Array): unknown` (the parsed JSON part), `AASX_SPEC_PART = 'aasx/passwerk/passwerk.aas.json'`

- [ ] **Step 1: Failing test**

`packages/core/test/emit.aasx.test.ts`:

```ts
import { AASX_SPEC_PART, emitAasJson, emitAasx, readAasxEnvironment, samples, validateEnvironmentJson } from '@passwerk/core';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

describe('emitAasx', () => {
  const r = emitAasx(samples['ev-valid']);
  const entries = unzipSync(r.output);
  it('has the OPC layout of the official packages, in fixed order', () => {
    expect(Object.keys(entries)).toEqual(['[Content_Types].xml', '_rels/.rels', 'aasx/aasx-origin', 'aasx/_rels/aasx-origin.rels', AASX_SPEC_PART]);
    expect(strFromU8(entries['_rels/.rels']!)).toContain('http://admin-shell.io/aasx/relationships/aasx-origin');
    expect(strFromU8(entries['aasx/_rels/aasx-origin.rels']!)).toContain(`Target="/${AASX_SPEC_PART}"`);
    expect(strFromU8(entries['aasx/_rels/aasx-origin.rels']!)).toContain('http://admin-shell.io/aasx/relationships/aas-spec');
    expect(strFromU8(entries['[Content_Types].xml']!)).toContain('Extension="json" ContentType="application/json"');
    expect(strFromU8(entries['[Content_Types].xml']!)).toContain('PartName="/aasx/aasx-origin"');
  });
  it('carries the same canonical JSON as emitAasJson', () => {
    expect(strFromU8(entries[AASX_SPEC_PART]!)).toBe(emitAasJson(samples['ev-valid']).output);
  });
  it('re-validates its own output and is byte-identical across runs', () => {
    expect(r.verdict).toBe('valid');
    expect(validateEnvironmentJson(readAasxEnvironment(r.output)).findings).toEqual([]);
    expect(Buffer.from(emitAasx(samples['ev-valid']).output).equals(Buffer.from(r.output))).toBe(true);
  });
  it('reports invalid when the draft has value errors', () => {
    const broken = emitAasx({ ...samples['lmt-valid'], attributes: { ...samples['lmt-valid'].attributes, manufacturingDate: { value: '01.03.2026', status: 'present' } } });
    expect(broken.verdict).toBe('invalid');
    expect(broken.output.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm vitest run packages/core/test/emit.aasx.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/emit/aasx.ts`:

```ts
import { strFromU8, strToU8, unzipSync, zipSync, type ZipOptions, type Zippable } from 'fflate';
import { buildReport } from '../validate/finding.js';
import { validateEnvironmentJson } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { type EmitResult, PassportDraftError } from './aasJson.js';
import { canonicalJson } from './canonical.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';
import type { EmitOptions } from './ids.js';

export const AASX_SPEC_PART = 'aasx/passwerk/passwerk.aas.json';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const REL_ORIGIN = 'http://admin-shell.io/aasx/relationships/aasx-origin';
const REL_SPEC = 'http://admin-shell.io/aasx/relationships/aas-spec';

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="utf-8"?><Types xmlns="${CT_NS}">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />' +
  '<Default Extension="json" ContentType="application/json" />' +
  '<Override PartName="/aasx/aasx-origin" ContentType="text/plain" />' +
  '</Types>';
const ROOT_RELS =
  `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}">` +
  `<Relationship Type="${REL_ORIGIN}" Target="/aasx/aasx-origin" Id="R1" />` +
  '</Relationships>';
const ORIGIN_RELS =
  `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="${REL_NS}">` +
  `<Relationship Type="${REL_SPEC}" Target="/${AASX_SPEC_PART}" Id="R2" />` +
  '</Relationships>';
const ORIGIN = 'Intentionally empty.';

/** Fixed timestamp so the package is byte-stable (ZIP has no "no timestamp" option). */
const FIXED: ZipOptions = { level: 6, mtime: new Date(Date.UTC(1980, 0, 1, 0, 0, 0)) };

/** Build the OPC package around the canonical AAS JSON. Entry order is fixed. */
export function packAasx(aasJson: string): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': [strToU8(CONTENT_TYPES), FIXED],
    '_rels/.rels': [strToU8(ROOT_RELS), FIXED],
    'aasx/aasx-origin': [strToU8(ORIGIN), FIXED],
    'aasx/_rels/aasx-origin.rels': [strToU8(ORIGIN_RELS), FIXED],
    [AASX_SPEC_PART]: [strToU8(aasJson), FIXED],
  };
  return zipSync(files, FIXED);
}

/** Read the AAS JSON part back out of a package produced by packAasx. */
export function readAasxEnvironment(bytes: Uint8Array): unknown {
  const entries = unzipSync(bytes);
  const part = entries[AASX_SPEC_PART];
  if (!part) throw new Error(`@passwerk/core: AASX has no ${AASX_SPEC_PART}`);
  return JSON.parse(strFromU8(part));
}

/** AASX with the canonical JSON inside; re-validated from the packaged bytes. */
export function emitAasx(input: unknown, options: EmitOptions = {}): EmitResult<Uint8Array> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const output = packAasx(canonicalJson(environmentToJsonable(environment)));
  const rest = validateEnvironmentJson(readAasxEnvironment(output));
  const report = buildReport([...l1.findings, ...rest.findings], { L1: true, L2: true, L3: true });
  return { output, environment, verdict: report.verdict, findings: report.findings, report };
}
```

Add to `src/index.ts`: `export * from './emit/aasx.js';`

- [ ] **Step 4: Run, expect pass**

Run: `pnpm vitest run packages/core`
Expected: PASS. If the entry order assertion fails, fflate preserves insertion order of the `Zippable` object; make sure no key is numeric-like.

- [ ] **Step 5: Commit**

```
pnpm check
git add packages/core
git commit -m "feat(core): AASX packaging with re-validation from the packaged bytes"
```

---

### Task 14: Golden definition-of-done test, docs, ADRs, status

**Files:**
- Create: `packages/core/test/golden.test.ts`
- Create: `packages/core/README.md`
- Modify: `docs/DECISIONS.md` (append D-010, D-011)
- Modify: `AGENTS.md` (Status section)
- Modify: `packages/core/src/index.ts` (final export review)

- [ ] **Step 1: Golden test**

`packages/core/test/golden.test.ts`:

```ts
import { BROKEN_SAMPLE_NAMES, VALID_SAMPLE_NAMES, brokenSamples, emitAasJson, emitAasx, samples, validate } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('Phase 2 definition of done', () => {
  it('emit(sample) -> validate(output) is valid for every valid sample, for JSON and AASX', () => {
    for (const name of VALID_SAMPLE_NAMES) {
      expect(emitAasJson(samples[name]).verdict, `${name} json`).toBe('valid');
      expect(emitAasx(samples[name]).verdict, `${name} aasx`).toBe('valid');
      expect(validate(samples[name]).verdict, `${name} validate`).toBe('valid');
    }
  });
  it('every broken sample yields exactly its documented finding ids (as a set)', () => {
    for (const name of BROKEN_SAMPLE_NAMES) {
      const { draft, expectedFindings } = brokenSamples[name];
      const got = [...new Set(validate(draft).findings.map((f) => f.ruleId))].sort();
      expect(got, name).toEqual([...expectedFindings].sort());
    }
  });
});
```

Run: `pnpm vitest run packages/core/test/golden.test.ts`
Expected: PASS. If a broken sample produces extra findings, either the sample or the expectation in `samples/index.ts` is wrong; decide from the spec (section 6) and fix that, not the validator.

- [ ] **Step 2: Public API review**

`packages/core/src/index.ts` final content:

```ts
/**
 * @passwerk/core: MCP-free library for EU Digital Battery Passports.
 * Phase 2: PassportDraft model (L1), AAS JSON + AASX emitters for IDTA 02035-1/-3/-6,
 * L2 (aas-core verification) and L3 (template conformance). Browser-safe (ADR D-006).
 */
export const PACKAGE_NAME = '@passwerk/core' as const;

export * from './model/attributeIds.js';
export * from './model/composites.js';
export * from './model/field.js';
export * from './model/passport.js';
export * from './model/provenance.js';
export * from './model/values.js';

export * from './validate/finding.js';
export { RULE_IDS, message as findingMessage } from './validate/messages.js';
export * from './validate/schema.js';
export * from './validate/aas.js';
export * from './validate/template.js';
export * from './validate/index.js';

export * from './emit/canonical.js';
export * from './emit/ids.js';
export * from './emit/elements.js';
export * from './emit/environment.js';
export * from './emit/submodels/nameplate.js';
export * from './emit/submodels/carbonFootprint.js';
export * from './emit/submodels/materialComposition.js';
export { submodelFromTemplate } from './emit/submodels/shared.js';
export * from './emit/aasJson.js';
export * from './emit/aasx.js';

export * from './samples/index.js';
```

- [ ] **Step 3: README for core**

`packages/core/README.md`:

```markdown
# @passwerk/core

MCP-free, browser-safe library that turns a neutral `PassportDraft` into an EU Digital Battery
Passport in the official AAS format (IDTA 02035) and validates it in three layers.

```ts
import { emitAasJson, emitAasx, samples, validate } from '@passwerk/core';

const report = validate(samples['ev-valid']);      // L1 -> emit -> L2 + L3, verdict 'valid'
const { output, verdict } = emitAasJson(draft);      // canonical JSON, re-validated
const aasx = emitAasx(draft);                        // OPC package, re-validated from bytes
```

- `PassportDraft`: `{ meta, attributes: { [attributeId]: Field } }` on the DIN DKE SPEC 99100
  grain of `@passwerk/rules`. Numbers are decimal strings, dates ISO-8601.
- Emitters read every idShort, semanticId and valueType from the bundled template catalogue.
- Verdicts are `valid`, `valid_with_warnings` or `invalid` and always come from running the
  validators on the emitted output.

Phase 2 covers IDTA 02035-1 (Nameplate), -3 (Carbon Footprint) and -6 (Material Composition).
```

- [ ] **Step 4: ADRs**

Append to `docs/DECISIONS.md`:

```markdown
## D-010: Attribute-keyed PassportDraft on the knowledge-base grain (2026-09-03)

**Context.** The build plan sketched hand-typed nested objects per submodel. The knowledge
base (D-008) already defines 93 attributes with value kinds and template paths.

**Decision.** `PassportDraft = { meta, attributes: { [attributeId]: Field } }`. Value shapes
come from the attribute's `valueKind`; composite attributes get explicit Zod shapes in
`model/composites.ts`. Quantities are decimal strings (decimal.js), never JS numbers.
AAS identifiers derive from `meta.passportId`: shell `${id}/aas`, asset `${id}`, submodel
`${id}/submodels/${templateIdShort}`, all overridable through `EmitOptions.ids`.

**Consequences.** All seven submodels are modelled from day one; emitters and L3 cover
three in Phase 2. Gap report, mapping and the KB address the same ids. The literal id union
is not expressible in TypeScript because ids come from data; `AttributeIdSchema` checks at
runtime.

## D-011: aas-core3.0-typescript as the AAS engine, JSON inside the AASX (2026-09-03)

**Context.** The SDK verifies the metamodel and serialises JSON but has no XML serialiser.
The official IDTA packages carry XML. The official test engine dispatches AASX parts by file
extension and accepts `.json` parts.

**Decision.** AASX packages carry the canonical JSON as `aasx/passwerk/passwerk.aas.json`.
The SDK's ESM build has extensionless relative imports that plain Node cannot resolve; a
committed pnpm patch adds the `.js` extensions. Instances never set `idShort` on direct
children of a `SubmodelElementList` (AASd-120); the templates do, because they are templates.

**Consequences.** One serialiser, byte-stable output, oracle-checkable in Phase 3. An XML
part can be added later behind the same `emitAasx` if a consumer requires it, which needs
an XML serialiser verified against the AAS XSD.
```

- [ ] **Step 5: Status in AGENTS.md**

Replace the `**Next: Phase 2.**` paragraph in `AGENTS.md` with:

```markdown
- **Phase 2 (`@passwerk/core` model + emit + L1-L3): done.** Attribute-keyed `PassportDraft`
  (ADR D-010), AAS JSON and AASX emitters for IDTA 02035-1/-3/-6 driven by the template
  catalogue, L2 via aas-core verification, L3 template diff, six golden samples. See ADR D-011
  for the AAS engine choices.
- **Next: Phase 3.** Oracle parity in CI (`tools/oracle`, `aas-test-engines`) and
  `sovereignty.test.ts`. Then the remaining four submodel emitters (parts 2, 4, 5, 7).
```

- [ ] **Step 6: Full check, build, and a plain-Node smoke run of the built package**

Run:
```
pnpm check
pnpm build
Set-Content -Encoding utf8 packages/core/smoke.mjs "import { emitAasJson, samples } from './dist/index.js'; console.log(emitAasJson(samples['ev-valid']).verdict)"; node packages/core/smoke.mjs; Remove-Item packages/core/smoke.mjs
```
Expected: `pnpm check` green; build green; smoke prints `valid`. If the smoke run fails on JSON imports, the `with { type: 'json' }` attribute must be preserved in `dist` (TypeScript keeps it under NodeNext); if it fails on the aas-core import, the patch from Task 1 was not applied (`pnpm install`).

- [ ] **Step 7: Commit**

```
git add packages/core docs/DECISIONS.md AGENTS.md
git commit -m "docs(core): Phase 2 README, ADRs D-010 and D-011, status update"
```

---

## Self-review against the spec

- Spec 3.1/3.2 Field + PassportDraft: Task 2, 3. Passport id mismatch: Task 4.
- Spec 3.3 value schemas: Task 2. Enum code lists "where the template fixes one": the catalogue has no code lists for `LifeCycleStage`, so enums are free strings in Phase 2; noted here, no task.
- Spec 3.4 composites incl. drop-in address and `substanceImpacts` folding: Tasks 3, 7, 8.
- Spec 4.1 ids: Task 6. 4.2 environment + builders + per-submodel emitters: Tasks 6 to 10. 4.3 outputs + re-validation: Tasks 12, 13.
- Spec 5.1 Finding/report: Task 4. 5.2 L1: Task 4. 5.3 L2: Task 10. 5.4 L3 incl. drop-in opacity: Task 11. 5.5 orchestrator: Task 12.
- Spec 6 samples and tests: Tasks 5, 12 (snapshots), 13 (zip layout, byte identity), 14 (DoD), 1 (browser safety).
- Spec 7 determinism: Tasks 6, 13; no `Date.now()` anywhere.
- Spec 8 ADRs: Task 14.
