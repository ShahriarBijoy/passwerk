# Web App Second Slice (Phase 7a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the supplier web app: project screen with the obligations check and identifier modes, facts screen with edit and map, row editor for array composites (#23), live QR preview, state v2 with derived proposals.

**Architecture:** `apps/web` keeps its three layers (`workflow` pure TypeScript, `views` props-driven React, `app` shell). State stores only inputs (`project`, `importedDraft`, `files`, `facts`, `factEdits`, `decisions`); everything else, including proposals, obligations, meta, base draft and the QR, is derived by memoised pure functions under `workflow/derive/`. Core (`@passwerk/core`) is the only domain logic.

**Tech Stack:** Vite 8, React 19, TypeScript strict, Tailwind 4, shadcn/ui (radix-ui), Vitest 4 (jsdom for views), Playwright 1.62 (Chromium), Biome 2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-web-app-complete-design.md`

## Global Constraints

- No `useEffect`; async work in handlers; `useSyncExternalStore` through `app/useStore.ts`.
- `workflow` may not import react, `views`, `app`, `components` or `idb-keyval`; `views` may not import `app` or `idb-keyval` (`apps/web/test/boundary.test.ts`).
- Nothing under `apps/web/src` imports `node:*`.
- No floats: numbers stay strings; `energyKwh` is a decimal string.
- The wall clock is read only in `apps/web/src/app/clock.ts` (`nowIso()`); reducers take `at`.
- Every chrome string exists in `de.ts` and `en.ts` (`apps/web/test/i18n.test.ts` asserts key parity). Legal text is never authored in the app: it comes from core's `LangText`.
- Relative imports inside `apps/web/src` use `.ts` / `.tsx` extensions; `@/` aliases `apps/web/src`.
- `data-testid` attributes are the Playwright contract; keep every existing one listed in the tasks.
- Run from the repo root: `pnpm vitest run apps/web/test/<file>`, `pnpm lint:fix`, `pnpm check`, `pnpm build && pnpm build:web && pnpm e2e`.
- Commit as `shahriarbijoy`, Conventional Commits, each commit message ends with `Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1`.
- Branch: `feat/web-app-complete` (already created from `main`).

## File map

| File | Responsibility |
|---|---|
| `src/workflow/project.ts` (new) | `Project`, `Identifier`, `passportIdOf`, `projectFromMeta`, `defaultProject`, `metaOf` |
| `src/workflow/state.ts` | v2 state, `FactEdit`, `Decision.manual.factId` |
| `src/workflow/reducer.ts` | `setProject`, `editFact`, `clearFactEdit`; `filesIngested` without proposals |
| `src/workflow/ingest.ts` | `ingestFiles` returns summaries and facts only |
| `src/workflow/derive/memo.ts` (new) | `memoLast` |
| `src/workflow/derive/project.ts` (new) | `deriveProject` (obligations, identifier, category, meta) |
| `src/workflow/derive/carrier.ts` (new) | `deriveCarrier`, `CarrierView` |
| `src/workflow/derive/facts.ts` (new) | `effectiveFacts`, `deriveProposals` |
| `src/workflow/derive/mappings.ts` (new) | `toMapping`, `mappingEntries`, `applyAll`, `foldOneByOne` (moved from `derive.ts`) |
| `src/workflow/derive/index.ts` (new, replaces `derive.ts`) | `derive`, `Derived`, `InvalidDecision` |
| `src/workflow/exports.ts` | keyed record, QR from `derived.carrier` |
| `src/workflow/compositeSchema.ts` | `arrayElementLeaves`, `ElementLeaf` |
| `src/workflow/rows.ts` (new) | `RowDraft`, `emptyRow`, `rowsFromValue`, `checkRows` |
| `src/workflow/validateValue.ts` | array branch |
| `src/workflow/factsModel.ts` (new) | `factStatuses`, `filterFacts` |
| `src/views/ProjectView.tsx` (new, replaces `StartView.tsx`) | project screen |
| `src/views/parts/QrPreview.tsx` (new) | QR panel |
| `src/views/parts/ObligationsCard.tsx` (new) | obligations panel |
| `src/views/FactsView.tsx` (new) | facts screen |
| `src/views/RowEditor.tsx` (new) | row editor component and dialog |
| `src/views/AddValueDialog.tsx` | array composites, prefill from a fact, controlled open |
| `src/views/ReviewView.tsx`, `src/views/reviewModel.ts` | array entries with row count |
| `src/views/GapsExportView.tsx` | QR panel beside the export bar |
| `src/app/App.tsx` | wiring for the five steps |
| `src/i18n/de.ts`, `src/i18n/en.ts`, `src/i18n/index.ts` | new keys, `t()` fallback |
| `e2e/helpers.ts`, `e2e/*.spec.ts` | adapted and new tracks |
| `docs/DECISIONS.md`, `docs/BUILD_PLAN.md`, `AGENTS.md` | ADR D-036 and status |

---

### Task 1: Project model and derivations (additive)

**Files:**
- Create: `apps/web/src/workflow/project.ts`
- Create: `apps/web/src/workflow/derive/memo.ts`
- Create: `apps/web/src/workflow/derive/carrier.ts`
- Create: `apps/web/src/workflow/derive/project.ts`
- Modify: `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/index.ts`
- Test: `apps/web/test/project.test.ts`, `apps/web/test/deriveProject.test.ts`, `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces:
  - `type Identifier`, `interface Project`, `type IdentifierResult`, `passportIdOf(id: Identifier): IdentifierResult`, `projectFromMeta(meta: PassportMeta): Project`, `defaultProject(urn: string, createdAt: string): Project`, `metaOf(project: Project, category: BatteryCategory, passportId: string): PassportMeta`, `BATTERY_TYPE_OF: Record<BatteryCategory, BatteryType>`
  - `memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R`
  - `type CarrierView = { ok: true; svg: string; payload: string } | { ok: false; message: LangText }`, `deriveCarrier(passportId: string): CarrierView`
  - `interface ProjectDerived { obligations: ObligationResult; identifier: IdentifierResult; category: BatteryCategory | null; meta: PassportMeta | null; carrier: CarrierView }`, `deriveProject(project: Project, asOf: string): ProjectDerived`
  - `t()` falls back to the key.

- [ ] **Step 1: Add the i18n keys this task needs and the `t()` fallback**

In `apps/web/src/i18n/index.ts` replace the body of `t`:

```ts
export function t(lang: Language, key: Key, params: Record<string, string | number> = {}): string {
  // A missing template (a key cast from data) renders as the key rather than throwing mid-render.
  const template = DICT[lang][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}
```

Add to `de.ts` (and the English twins to `en.ts`):

```ts
  'project.identifier.https.invalid': 'Muss eine absolute https-URI sein.',
  'project.identifier.draft.invalid': 'Muss eine URI sein, zum Beispiel urn:...',
```

```ts
  'project.identifier.https.invalid': 'Must be an absolute https URI.',
  'project.identifier.draft.invalid': 'Must be a URI, for example urn:...',
```

- [ ] **Step 2: Write the failing tests for `project.ts`**

`apps/web/test/project.test.ts`:

```ts
import { buildGs1DigitalLink, SCHEMA_VERSION } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import {
  defaultProject,
  metaOf,
  passportIdOf,
  projectFromMeta,
} from '@/workflow/project.ts';

const AT = '2026-09-07T12:00:00Z';

describe('passportIdOf', () => {
  it('builds a GS1 Digital Link from GTIN and serial through core', () => {
    const r = passportIdOf({
      mode: 'gs1',
      resolverBase: 'https://id.example.com',
      gtin: '96385074',
      serial: 'SN-1',
    });
    expect(r).toEqual({
      ok: true,
      passportId: buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'SN-1' }),
      digitalLink: buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'SN-1' }),
    });
  });
  it('builds a GIAI link', () => {
    const r = passportIdOf({ mode: 'gs1-giai', resolverBase: 'https://id.example.com/', giai: 'A1' });
    expect(r.ok && r.passportId).toBe('https://id.example.com/8004/A1');
  });
  it('reports the carrier error text in both languages for a wrong check digit', () => {
    const r = passportIdOf({
      mode: 'gs1',
      resolverBase: 'https://id.example.com',
      gtin: '96385075',
      serial: 'SN-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message.de).toContain('Prüfziffer');
      expect(r.message.en).toContain('check digit');
    }
  });
  it('accepts an https URI and rejects http', () => {
    expect(passportIdOf({ mode: 'https', uri: ' https://p.example/x ' })).toEqual({
      ok: true,
      passportId: 'https://p.example/x',
    });
    const r = passportIdOf({ mode: 'https', uri: 'http://p.example/x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.en).toBe('Must be an absolute https URI.');
  });
  it('accepts a urn draft identifier and rejects plain text', () => {
    expect(passportIdOf({ mode: 'draft', urn: 'urn:passwerk:draft:1' })).toEqual({
      ok: true,
      passportId: 'urn:passwerk:draft:1',
    });
    expect(passportIdOf({ mode: 'draft', urn: 'hello' }).ok).toBe(false);
  });
});

describe('project helpers', () => {
  it('defaultProject is an EV manufacturer with a draft identifier', () => {
    expect(defaultProject('urn:x', AT)).toEqual({
      batteryType: 'EV',
      role: 'manufacturer',
      identifier: { mode: 'draft', urn: 'urn:x' },
      createdAt: AT,
    });
  });
  it('projectFromMeta maps the category back and detects the identifier mode', () => {
    const p = projectFromMeta({
      schemaVersion: SCHEMA_VERSION,
      category: 'INDUSTRIAL_GT_2KWH',
      passportId: 'https://p.example/1',
      createdAt: AT,
    });
    expect(p).toEqual({
      batteryType: 'INDUSTRIAL',
      role: 'manufacturer',
      manualCategory: 'INDUSTRIAL_GT_2KWH',
      identifier: { mode: 'https', uri: 'https://p.example/1' },
      createdAt: AT,
    });
    const d = projectFromMeta({
      schemaVersion: SCHEMA_VERSION,
      category: 'LMT',
      passportId: 'urn:passwerk:draft:2',
      createdAt: AT,
    });
    expect(d.batteryType).toBe('LMT');
    expect(d.identifier).toEqual({ mode: 'draft', urn: 'urn:passwerk:draft:2' });
  });
  it('metaOf carries createdAt from the project', () => {
    expect(metaOf(defaultProject('urn:x', AT), 'EV', 'urn:x')).toEqual({
      schemaVersion: SCHEMA_VERSION,
      category: 'EV',
      passportId: 'urn:x',
      createdAt: AT,
    });
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run apps/web/test/project.test.ts`
Expected: FAIL, cannot resolve `@/workflow/project.ts`.

- [ ] **Step 4: Implement `project.ts`**

`apps/web/src/workflow/project.ts`:

```ts
import type { BatteryCategory, BatteryType, PassportMeta, Role } from '@passwerk/core';
import { buildGs1DigitalLink, CarrierInputError, isHttpsUri, SCHEMA_VERSION } from '@passwerk/core';
import { type Key, type LangText, t } from '../i18n/index.ts';

export type Identifier =
  | { mode: 'gs1'; resolverBase: string; gtin: string; serial: string }
  | { mode: 'gs1-giai'; resolverBase: string; giai: string }
  | { mode: 'https'; uri: string }
  | { mode: 'draft'; urn: string };

export type IdentifierMode = Identifier['mode'];
export const IDENTIFIER_MODES: readonly IdentifierMode[] = ['gs1', 'gs1-giai', 'https', 'draft'];

/** The inputs of the project screen. Everything derived from them lives in `derive/project.ts`. */
export interface Project {
  batteryType: BatteryType;
  role: Role;
  /** Decimal string in kWh; decides the industrial 2 kWh threshold. */
  energyKwh?: string;
  /** ISO date (YYYY-MM-DD). */
  placedOnMarketDate?: string;
  /** Chosen by hand when the obligations check derives no category (voluntary passport) or on import. */
  manualCategory?: BatteryCategory;
  identifier: Identifier;
  /** Stamped by the reducer on the first `setProject`, kept afterwards. */
  createdAt: string;
}

export type IdentifierResult =
  | { ok: true; passportId: string; digitalLink?: string }
  | { ok: false; message: LangText };

const URI = /^[a-z][a-z0-9+.-]*:.+/i;
const both = (key: Key): LangText => ({ de: t('de', key), en: t('en', key) });

/** The passport identifier an `Identifier` denotes, built through core's carrier module. */
export function passportIdOf(id: Identifier): IdentifierResult {
  switch (id.mode) {
    case 'gs1':
    case 'gs1-giai': {
      const key =
        id.mode === 'gs1'
          ? { gtin: id.gtin.trim(), serial: id.serial.trim() }
          : { giai: id.giai.trim() };
      try {
        const link = buildGs1DigitalLink(id.resolverBase.trim(), key);
        return { ok: true, passportId: link, digitalLink: link };
      } catch (e) {
        if (e instanceof CarrierInputError) return { ok: false, message: e.text };
        throw e;
      }
    }
    case 'https': {
      const uri = id.uri.trim();
      return isHttpsUri(uri)
        ? { ok: true, passportId: uri }
        : { ok: false, message: both('project.identifier.https.invalid') };
    }
    case 'draft': {
      const urn = id.urn.trim();
      return URI.test(urn)
        ? { ok: true, passportId: urn }
        : { ok: false, message: both('project.identifier.draft.invalid') };
    }
  }
}

export const BATTERY_TYPE_OF: Record<BatteryCategory, BatteryType> = {
  EV: 'EV',
  LMT: 'LMT',
  INDUSTRIAL_GT_2KWH: 'INDUSTRIAL',
};

export function defaultProject(urn: string, createdAt: string): Project {
  return { batteryType: 'EV', role: 'manufacturer', identifier: { mode: 'draft', urn }, createdAt };
}

/** An imported draft's meta as a project: category by hand, battery type mapped back. */
export function projectFromMeta(meta: PassportMeta): Project {
  return {
    batteryType: BATTERY_TYPE_OF[meta.category],
    role: 'manufacturer',
    manualCategory: meta.category,
    identifier: isHttpsUri(meta.passportId)
      ? { mode: 'https', uri: meta.passportId }
      : { mode: 'draft', urn: meta.passportId },
    createdAt: meta.createdAt,
  };
}

export function metaOf(
  project: Project,
  category: BatteryCategory,
  passportId: string,
): PassportMeta {
  return { schemaVersion: SCHEMA_VERSION, category, passportId, createdAt: project.createdAt };
}
```

- [ ] **Step 5: Run the test, expect PASS**

Run: `pnpm vitest run apps/web/test/project.test.ts`

- [ ] **Step 6: Write the failing tests for `memoLast`, `deriveCarrier` and `deriveProject`**

`apps/web/test/deriveProject.test.ts`:

```ts
import { checkObligations } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { deriveCarrier } from '@/workflow/derive/carrier.ts';
import { memoLast } from '@/workflow/derive/memo.ts';
import { deriveProject } from '@/workflow/derive/project.ts';
import { defaultProject, type Project } from '@/workflow/project.ts';

const AT = '2026-09-07T12:00:00Z';
const base = defaultProject('urn:passwerk:draft:1', AT);

describe('memoLast', () => {
  it('reuses the result while every argument is identical', () => {
    let calls = 0;
    const f = memoLast((a: object, b: string) => {
      calls += 1;
      return { a, b };
    });
    const o = {};
    const r1 = f(o, 'x');
    expect(f(o, 'x')).toBe(r1);
    expect(calls).toBe(1);
    f(o, 'y');
    expect(calls).toBe(2);
  });
});

describe('deriveCarrier', () => {
  it('renders an SVG for an https identifier', () => {
    const c = deriveCarrier('https://p.example/1');
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.svg.startsWith('<svg')).toBe(true);
      expect(c.payload).toBe('https://p.example/1');
    }
  });
  it('reports the carrier reason for a urn', () => {
    const c = deriveCarrier('urn:passwerk:draft:1');
    expect(c.ok).toBe(false);
    if (!c.ok) {
      expect(c.message.de).toBeTruthy();
      expect(c.message.en).toBeTruthy();
    }
  });
});

describe('deriveProject', () => {
  it('EV manufacturer: required, category EV, meta with the draft urn, no QR', () => {
    const d = deriveProject(base, AT);
    expect(d.obligations.verdict).toBe('required');
    expect(d.category).toBe('EV');
    expect(d.meta).toEqual({
      schemaVersion: '1.0',
      category: 'EV',
      passportId: 'urn:passwerk:draft:1',
      createdAt: AT,
    });
    expect(d.carrier.ok).toBe(false);
    expect(d.obligations).toEqual(
      checkObligations({ batteryType: 'EV', role: 'manufacturer', asOf: AT }),
    );
  });
  it('industrial without energy: insufficient input, no category, no meta', () => {
    const d = deriveProject({ ...base, batteryType: 'INDUSTRIAL' }, AT);
    expect(d.obligations.verdict).toBe('insufficient_input');
    expect(d.obligations.missingInput).toEqual(['energyKwh']);
    expect(d.category).toBeNull();
    expect(d.meta).toBeNull();
  });
  it('industrial 1.5 kWh: not required; a manual category makes a voluntary passport', () => {
    const p: Project = { ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' };
    expect(deriveProject(p, AT).obligations.verdict).toBe('not_required');
    expect(deriveProject(p, AT).category).toBeNull();
    const v = deriveProject({ ...p, manualCategory: 'INDUSTRIAL_GT_2KWH' }, AT);
    expect(v.category).toBe('INDUSTRIAL_GT_2KWH');
    expect(v.meta?.category).toBe('INDUSTRIAL_GT_2KWH');
  });
  it('industrial 3 kWh: required and derived category wins over a manual one', () => {
    const d = deriveProject(
      { ...base, batteryType: 'INDUSTRIAL', energyKwh: '3', manualCategory: 'EV' },
      AT,
    );
    expect(d.obligations.verdict).toBe('required');
    expect(d.category).toBe('INDUSTRIAL_GT_2KWH');
  });
  it('portable: not required, category only by hand', () => {
    expect(deriveProject({ ...base, batteryType: 'PORTABLE' }, AT).category).toBeNull();
    expect(
      deriveProject({ ...base, batteryType: 'PORTABLE', manualCategory: 'LMT' }, AT).category,
    ).toBe('LMT');
  });
  it('GS1 identifier: meta carries the link and the QR is rendered', () => {
    const d = deriveProject(
      {
        ...base,
        identifier: {
          mode: 'gs1',
          resolverBase: 'https://id.example.com',
          gtin: '96385074',
          serial: 'SN-1',
        },
      },
      AT,
    );
    expect(d.identifier.ok).toBe(true);
    expect(d.meta?.passportId).toBe('https://id.example.com/01/00000096385074/21/SN-1');
    expect(d.carrier.ok).toBe(true);
  });
  it('a broken identifier yields no meta and the carrier shows its message', () => {
    const d = deriveProject({ ...base, identifier: { mode: 'https', uri: 'nope' } }, AT);
    expect(d.identifier.ok).toBe(false);
    expect(d.meta).toBeNull();
    expect(d.carrier.ok).toBe(false);
  });
  it('is memoised on the project identity and asOf', () => {
    const p = { ...base };
    expect(deriveProject(p, AT)).toBe(deriveProject(p, AT));
    expect(deriveProject({ ...p }, AT)).not.toBe(deriveProject(p, AT));
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `pnpm vitest run apps/web/test/deriveProject.test.ts`
Expected: FAIL, modules missing.

- [ ] **Step 8: Implement `memo.ts`, `carrier.ts`, `derive/project.ts`**

`apps/web/src/workflow/derive/memo.ts`:

```ts
/**
 * Remember the last call. Derivations run during render on one state at a time, so "same
 * arguments as last time" is the whole cache; a new state object recomputes only the steps
 * whose own inputs changed.
 */
export function memoLast<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; result: R } | undefined;
  return (...args: A): R => {
    if (
      last !== undefined &&
      last.args.length === args.length &&
      last.args.every((a, i) => Object.is(a, args[i]))
    ) {
      return last.result;
    }
    const result = fn(...args);
    last = { args, result };
    return result;
  };
}
```

`apps/web/src/workflow/derive/carrier.ts`:

```ts
import { CarrierInputError, generateCarrier } from '@passwerk/core';
import type { LangText } from '../../i18n/index.ts';
import { memoLast } from './memo.ts';

export type CarrierView =
  | { ok: true; svg: string; payload: string }
  | { ok: false; message: LangText };

/** The QR for an identifier, or core's DE/EN reason there is none (D-035: never blocks anything). */
export const deriveCarrier = memoLast((passportId: string): CarrierView => {
  try {
    const r = generateCarrier({ uid: passportId, format: 'svg' });
    return { ok: true, svg: new TextDecoder().decode(r.image), payload: r.payload };
  } catch (e) {
    if (e instanceof CarrierInputError) return { ok: false, message: e.text };
    throw e;
  }
});
```

`apps/web/src/workflow/derive/project.ts`:

```ts
import type { BatteryCategory, ObligationResult, PassportMeta } from '@passwerk/core';
import { checkObligations } from '@passwerk/core';
import { type IdentifierResult, metaOf, passportIdOf, type Project } from '../project.ts';
import { type CarrierView, deriveCarrier } from './carrier.ts';
import { memoLast } from './memo.ts';

export interface ProjectDerived {
  obligations: ObligationResult;
  identifier: IdentifierResult;
  /** The obligations result's category, else the hand-picked one (voluntary passport). */
  category: BatteryCategory | null;
  /** Null until a category exists and the identifier is ok. */
  meta: PassportMeta | null;
  carrier: CarrierView;
}

const obligationsOf = memoLast(
  (
    batteryType: Project['batteryType'],
    role: Project['role'],
    energyKwh: string | undefined,
    placedOnMarketDate: string | undefined,
    asOf: string,
  ) =>
    checkObligations({
      batteryType,
      role,
      ...(energyKwh !== undefined ? { energyKwh } : {}),
      ...(placedOnMarketDate !== undefined ? { placedOnMarketDate } : {}),
      asOf,
    }),
);

const identifierOf = memoLast(passportIdOf);

export const deriveProject = memoLast((project: Project, asOf: string): ProjectDerived => {
  const obligations = obligationsOf(
    project.batteryType,
    project.role,
    project.energyKwh,
    project.placedOnMarketDate,
    asOf,
  );
  const identifier = identifierOf(project.identifier);
  const category = obligations.category ?? project.manualCategory ?? null;
  const meta =
    category !== null && identifier.ok ? metaOf(project, category, identifier.passportId) : null;
  const carrier: CarrierView = identifier.ok
    ? deriveCarrier(identifier.passportId)
    : { ok: false, message: identifier.message };
  return { obligations, identifier, category, meta, carrier };
});
```

- [ ] **Step 9: Run both tests and the i18n parity test, expect PASS**

Run: `pnpm vitest run apps/web/test/project.test.ts apps/web/test/deriveProject.test.ts apps/web/test/i18n.test.ts apps/web/test/boundary.test.ts`

- [ ] **Step 10: Lint and commit**

```bash
pnpm lint:fix
git add apps/web/src/workflow/project.ts apps/web/src/workflow/derive apps/web/src/i18n apps/web/test/project.test.ts apps/web/test/deriveProject.test.ts
git commit -m "feat(web): project model, obligations and carrier derivations"
```

---

### Task 2: State v2: derived proposals, fact edits, project in state

This task swaps the state model and keeps the app compiling with a thin shim in `App.tsx`
(the old `StartView` builds a `Project` from category and passport id). Task 3 replaces the
shim with the project screen.

**Files:**
- Modify: `apps/web/src/workflow/state.ts`
- Modify: `apps/web/src/workflow/reducer.ts`
- Modify: `apps/web/src/workflow/ingest.ts`
- Create: `apps/web/src/workflow/derive/mappings.ts`, `apps/web/src/workflow/derive/facts.ts`, `apps/web/src/workflow/derive/index.ts`
- Delete: `apps/web/src/workflow/derive.ts`
- Modify: `apps/web/src/workflow/exports.ts`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/app/persistence.ts` (no code change needed beyond the version constant; verify)
- Modify: `apps/web/src/views/ReviewView.tsx` (import path of `InvalidDecision`), `apps/web/src/views/GapsExportView.tsx` (`onExport` kind type import)
- Test: `apps/web/test/reducer.test.ts`, `apps/web/test/derive.test.ts`, `apps/web/test/reupload.test.ts`, `apps/web/test/ingest.test.ts`, `apps/web/test/exports.test.ts`, `apps/web/test/persistence.test.ts`, `apps/web/test/views/App.test.tsx`

**Interfaces:**
- Consumes: `Project`, `projectFromMeta`, `deriveProject`, `ProjectDerived`, `CarrierView`, `memoLast` from Task 1.
- Produces:
  - `STATE_VERSION = 2`, `Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps'`, `STEPS`
  - `interface FactEdit { value: string; unit?: string }`
  - `WorkflowState { version; step; language; project: Project | null; importedDraft: PassportDraft | null; files; facts: FactSet | null; factEdits: Record<string, FactEdit>; decisions; generation; updatedAt }`
  - `Decision` `manual` variant gains `factId?: string`; `value: string | unknown[]`
  - Actions: `setProject { project }`, `importDraft { draft }`, `filesIngested { summaries; facts }`, `fileRemoved { name }`, `editFact { factId; edit }`, `clearFactEdit { factId }`, `decide`, `clearDecision`, `setLanguage`, `goTo`, `reset`
  - `ingestFiles(inputs, { workerSrc? }): Promise<{ summaries; facts }>`
  - `effectiveFacts(facts: FactSet | null, edits: Record<string, FactEdit>): FactSet`, `deriveProposals(facts: FactSet, category: BatteryCategory): MappingProposal[]`
  - `interface Derived { meta: PassportMeta; facts: FactSet; proposals: MappingProposal[]; draft; conflicts; invalidDecisions; report; gap; carrier: CarrierView; asOf }`, `derive(state, asOf): Derived | null`, `decisionsToMappings(decisions, proposals, facts): MappingDecision[]`
  - `type ExportKind = 'aasJson' | 'aasx' | 'draft' | 'gaps' | 'html' | 'qr'`, `buildExports(derived, lang): { verdict; files: Partial<Record<ExportKind, ExportFile>>; carrierError?: LangText } | { error: LangText }`

- [ ] **Step 1: Rewrite `state.ts`**

```ts
import type { FactSet, IngestError, MappingProposal, PassportDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import type { Project } from './project.ts';

export const STATE_VERSION = 2 as const;
export type Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps';
export const STEPS: readonly Step[] = ['project', 'upload', 'facts', 'review', 'gaps'];

export interface FileSummary {
  name: string;
  size: number;
  sha256: string;
  format: string;
  pages: number;
  lang: 'de' | 'en';
  error?: IngestError;
}

/** A reviewer's correction of one extracted fact; applied before proposals are derived. */
export interface FactEdit {
  value: string;
  unit?: string;
}

/** `attributeId` alone, or `attributeId#path` for a composite leaf. */
export type DecisionKey = string;

export type Decision =
  | { kind: 'accept'; attributeId: string; path?: string; factId: string }
  | { kind: 'reject'; attributeId: string; path?: string; factId: string }
  | {
      kind: 'edit';
      attributeId: string;
      path?: string;
      factId: string;
      value: string;
      unit?: string;
      /** ISO-8601. The reviewer's LastUpdate for a dynamic value; never synthesised. */
      recordedAt?: string;
    }
  | {
      kind: 'manual';
      attributeId: string;
      path?: string;
      /** Set when the value was mapped from a fact on the facts screen: keeps its provenance. */
      factId?: string;
      /** A string for scalars and composite leaves; an array of rows for an array composite. */
      value: string | unknown[];
      unit?: string;
      /** ISO-8601. The reviewer's LastUpdate for a dynamic value; never synthesised. */
      recordedAt?: string;
    };

export interface WorkflowState {
  version: typeof STATE_VERSION;
  step: Step;
  language: Language;
  project: Project | null;
  /** A draft imported as JSON; its meta is replaced by the project's on derivation. */
  importedDraft: PassportDraft | null;
  files: FileSummary[];
  facts: FactSet | null;
  factEdits: Record<string, FactEdit>;
  decisions: Record<DecisionKey, Decision>;
  /**
   * Bumped whenever the active project is replaced. An upload started under one generation is
   * discarded when it lands under another, so a slow ingest cannot pour its documents into a
   * project the reviewer has since started over.
   */
  generation: number;
  updatedAt: string;
}

export const initialState: WorkflowState = {
  version: STATE_VERSION,
  step: 'project',
  language: 'de',
  project: null,
  importedDraft: null,
  files: [],
  facts: null,
  factEdits: {},
  decisions: {},
  generation: 0,
  updatedAt: '1970-01-01T00:00:00Z',
};

export function decisionKey(attributeId: string, path?: string): DecisionKey {
  return path === undefined ? attributeId : `${attributeId}#${path}`;
}

export function proposalKey(p: MappingProposal): DecisionKey {
  return decisionKey(p.attributeId, p.path);
}
```

- [ ] **Step 2: Write the failing reducer tests**

Replace `apps/web/test/reducer.test.ts` with:

```ts
import { getSample, type PassportDraft } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { defaultProject } from '@/workflow/project.ts';
import { type Action, reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';

const AT = '2026-09-07T12:00:00Z';
const LATER = '2026-09-07T13:00:00Z';
const PROJECT = defaultProject('urn:passwerk:test:1', '');

const facts = (files: string[]) => ({
  facts: files.map((file, i) => ({
    id: `${file}#1:${i}`,
    label: 'l',
    labelKey: 'l',
    raw: 'r',
    value: '1',
    kind: 'text' as const,
    lang: 'de' as const,
    shape: 'kv' as const,
    source: { file, page: 1 },
  })),
  tables: [],
  documents: [],
});
const summary = (name: string, sha256 = 'x') => ({
  name,
  size: 1,
  sha256,
  format: 'pdf',
  pages: 1,
  lang: 'de' as const,
});

function start(): WorkflowState {
  return reduce(initialState, { type: 'setProject', project: PROJECT, at: AT });
}
function withFile(state: WorkflowState, name: string, sha256 = 'x'): WorkflowState {
  return reduce(state, {
    type: 'filesIngested',
    summaries: [summary(name, sha256)],
    facts: facts([name]),
    at: AT,
  });
}

describe('reducer: project', () => {
  it('setProject stamps createdAt once and never changes the step', () => {
    const s = start();
    expect(s.step).toBe('project');
    expect(s.project?.createdAt).toBe(AT);
    const s2 = reduce(s, { type: 'setProject', project: { ...PROJECT, role: 'importer' }, at: LATER });
    expect(s2.project?.createdAt).toBe(AT);
    expect(s2.project?.role).toBe('importer');
    expect(s2.updatedAt).toBe(LATER);
    expect(s2.generation).toBe(s.generation);
  });
  it('setProject keeps files, facts and decisions', () => {
    const s = reduce(withFile(start(), 'a.pdf'), {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    const s2 = reduce(s, { type: 'setProject', project: { ...PROJECT, batteryType: 'LMT' }, at: LATER });
    expect(s2.files).toHaveLength(1);
    expect(s2.facts?.facts).toHaveLength(1);
    expect(Object.keys(s2.decisions)).toEqual(['ratedCapacity']);
  });
  it('importDraft fills the project from the meta and clears documents and decisions', () => {
    const s0 = withFile(start(), 'a.pdf');
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(s0, { type: 'importDraft', draft, at: AT });
    expect(s.importedDraft).toBe(draft);
    expect(s.project?.manualCategory).toBe('EV');
    expect(s.project?.identifier).toEqual({ mode: 'https', uri: draft.meta.passportId });
    expect(s.project?.createdAt).toBe(draft.meta.createdAt);
    expect(s.files).toEqual([]);
    expect(s.facts).toBeNull();
    expect(s.factEdits).toEqual({});
    expect(s.decisions).toEqual({});
    expect(s.generation).toBe(s0.generation + 1);
    expect(s.step).toBe('review');
  });
});

describe('reducer: facts and edits', () => {
  it('editFact stores an override and clearFactEdit drops it; unknown ids are ignored', () => {
    const s = withFile(start(), 'a.pdf');
    const e = reduce(s, {
      type: 'editFact',
      factId: 'a.pdf#1:0',
      edit: { value: '2', unit: 'kWh' },
      at: AT,
    });
    expect(e.factEdits).toEqual({ 'a.pdf#1:0': { value: '2', unit: 'kWh' } });
    expect(reduce(e, { type: 'clearFactEdit', factId: 'a.pdf#1:0', at: AT }).factEdits).toEqual({});
    expect(reduce(s, { type: 'editFact', factId: 'nope', edit: { value: '2' }, at: AT })).toBe(s);
  });
  it('fileRemoved drops the file, its facts, its edits and its non-manual decisions', () => {
    let s = withFile(withFile(start(), 'a.pdf'), 'b.pdf');
    s = reduce(s, { type: 'editFact', factId: 'a.pdf#1:0', edit: { value: '2' }, at: AT });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'manual', attributeId: 'nominalVoltage', value: '400', factId: 'a.pdf#1:0' },
      at: AT,
    });
    const r = reduce(s, { type: 'fileRemoved', name: 'a.pdf', at: AT });
    expect(r.files.map((f) => f.name)).toEqual(['b.pdf']);
    expect(r.facts?.facts.map((f) => f.source.file)).toEqual(['b.pdf']);
    expect(r.factEdits).toEqual({});
    expect(Object.keys(r.decisions)).toEqual(['nominalVoltage']);
  });
  it('re-uploading a file with a different hash drops its decisions and edits', () => {
    let s = withFile(start(), 'a.pdf', 'h1');
    s = reduce(s, { type: 'editFact', factId: 'a.pdf#1:0', edit: { value: '2' }, at: AT });
    s = reduce(s, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    });
    const same = withFile(s, 'a.pdf', 'h1');
    expect(same.decisions).toEqual(s.decisions);
    expect(same.factEdits).toEqual(s.factEdits);
    const changed = withFile(s, 'a.pdf', 'h2');
    expect(changed.decisions).toEqual({});
    expect(changed.factEdits).toEqual({});
    expect(changed.facts?.facts).toHaveLength(1);
  });
  it('decide keeps one decision per key', () => {
    const s = withFile(start(), 'a.pdf');
    const a: Action = {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    };
    const b: Action = {
      type: 'decide',
      decision: { kind: 'reject', attributeId: 'ratedCapacity', factId: 'a.pdf#1:0' },
      at: AT,
    };
    expect(reduce(reduce(s, a), b).decisions['ratedCapacity']?.kind).toBe('reject');
  });
  it('reset keeps the language and bumps the generation; the store notifies', () => {
    const store = createStore(withFile(start(), 'a.pdf'));
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    store.dispatch({ type: 'reset', at: AT });
    expect(store.getState()).toMatchObject({ ...initialState, language: 'en', updatedAt: AT });
    expect(store.getState().generation).toBe(2);
    expect(notified).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run apps/web/test/reducer.test.ts`
Expected: FAIL (`setProject` is not an action).

- [ ] **Step 4: Rewrite `reducer.ts`**

```ts
import type { Fact, FactSet, PassportDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import { type Project, projectFromMeta } from './project.ts';
import {
  type Decision,
  type DecisionKey,
  decisionKey,
  type FactEdit,
  type FileSummary,
  initialState,
  type Step,
  type WorkflowState,
} from './state.ts';

interface Stamped {
  at: string;
}

export type Action = Stamped &
  (
    | { type: 'setProject'; project: Project }
    | { type: 'importDraft'; draft: PassportDraft }
    | { type: 'filesIngested'; summaries: FileSummary[]; facts: FactSet }
    | { type: 'fileRemoved'; name: string }
    | { type: 'editFact'; factId: string; edit: FactEdit }
    | { type: 'clearFactEdit'; factId: string }
    | { type: 'decide'; decision: Decision }
    | { type: 'clearDecision'; key: DecisionKey }
    | { type: 'setLanguage'; language: Language }
    | { type: 'goTo'; step: Step }
    | { type: 'reset' }
  );

const EMPTY_FACTS: FactSet = { facts: [], tables: [], documents: [] };

function mergeFacts(a: FactSet | null, b: FactSet): FactSet {
  const base = a ?? EMPTY_FACTS;
  return {
    facts: [...base.facts, ...b.facts],
    tables: [...base.tables, ...b.tables],
    documents: [...base.documents, ...b.documents],
  };
}

function withoutFiles(facts: FactSet | null, names: Set<string>): FactSet | null {
  if (!facts) return null;
  return {
    facts: facts.facts.filter((f) => !names.has(f.source.file)),
    tables: facts.tables.filter((t) => !names.has(t.source.file)),
    documents: facts.documents.filter((d) => !names.has(d.name)),
  };
}

const factIds = (facts: FactSet | null): Set<string> =>
  new Set((facts ?? EMPTY_FACTS).facts.map((f) => f.id));

/**
 * Drops accept/reject/edit decisions whose fact no longer exists; manual ones stay (a value the
 * reviewer typed does not vanish with a document; its provenance is simply gone).
 */
function pruneDecisions(
  decisions: Record<DecisionKey, Decision>,
  facts: FactSet | null,
): Record<DecisionKey, Decision> {
  const live = factIds(facts);
  const out: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (d.kind === 'manual' || live.has(d.factId)) out[key] = d;
  }
  return out;
}

function pruneEdits(edits: Record<string, FactEdit>, facts: FactSet | null): Record<string, FactEdit> {
  const live = factIds(facts);
  return Object.fromEntries(Object.entries(edits).filter(([id]) => live.has(id)));
}

/**
 * Fact ids are `${document}#${page}:${ordinal}` with no content hash, so re-uploading a file
 * under the same name regenerates the very ids the reviewer already decided on. The document
 * hash is the only thing that can tell the two apart: when it changed, every non-manual decision
 * and every edit that came from that file goes, matched against the facts as they were *before*
 * the re-upload.
 */
function fileOfFact(facts: FactSet | null, factId: string): string | undefined {
  return (facts ?? EMPTY_FACTS).facts.find((f: Fact) => f.id === factId)?.source.file;
}

function withoutChangedFiles(
  state: WorkflowState,
  changed: Set<string>,
): { decisions: Record<DecisionKey, Decision>; factEdits: Record<string, FactEdit> } {
  if (changed.size === 0) return { decisions: state.decisions, factEdits: state.factEdits };
  const decisions: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(state.decisions)) {
    if (d.kind === 'manual') {
      decisions[key] = d;
      continue;
    }
    const file = fileOfFact(state.facts, d.factId);
    if (file !== undefined && changed.has(file)) continue;
    decisions[key] = d;
  }
  const factEdits = Object.fromEntries(
    Object.entries(state.factEdits).filter(([id]) => {
      const file = fileOfFact(state.facts, id);
      return file === undefined || !changed.has(file);
    }),
  );
  return { decisions, factEdits };
}

/** Names present before and after the upload whose document hash is not the same one. */
function changedFiles(before: FileSummary[], incoming: FileSummary[]): Set<string> {
  const hashes = new Map(before.map((f) => [f.name, f.sha256]));
  const out = new Set<string>();
  for (const s of incoming) {
    const previous = hashes.get(s.name);
    if (previous !== undefined && previous !== s.sha256) out.add(s.name);
  }
  return out;
}

function decide(state: WorkflowState, decision: Decision): Record<DecisionKey, Decision> {
  const key = decisionKey(decision.attributeId, decision.path);
  // One decision per key: the group's other proposals are implicitly rejected by not being chosen.
  return { ...state.decisions, [key]: decision };
}

export function reduce(state: WorkflowState, action: Action): WorkflowState {
  const stamp = { updatedAt: action.at };
  switch (action.type) {
    case 'setProject':
      return {
        ...state,
        ...stamp,
        project: { ...action.project, createdAt: state.project?.createdAt ?? action.at },
      };
    case 'importDraft':
      return {
        ...state,
        ...stamp,
        project: projectFromMeta(action.draft.meta),
        importedDraft: action.draft,
        files: [],
        facts: null,
        factEdits: {},
        decisions: {},
        generation: state.generation + 1,
        step: 'review',
      };
    case 'filesIngested': {
      const replaced = new Set(action.summaries.map((s) => s.name));
      const merged = mergeFacts(withoutFiles(state.facts, replaced), action.facts);
      const kept = withoutChangedFiles(state, changedFiles(state.files, action.summaries));
      return {
        ...state,
        ...stamp,
        files: [...state.files.filter((f) => !replaced.has(f.name)), ...action.summaries],
        facts: merged,
        factEdits: pruneEdits(kept.factEdits, merged),
        decisions: pruneDecisions(kept.decisions, merged),
      };
    }
    case 'fileRemoved': {
      const facts = withoutFiles(state.facts, new Set([action.name]));
      return {
        ...state,
        ...stamp,
        files: state.files.filter((f) => f.name !== action.name),
        facts,
        factEdits: pruneEdits(state.factEdits, facts),
        decisions: pruneDecisions(state.decisions, facts),
      };
    }
    case 'editFact': {
      if (!factIds(state.facts).has(action.factId)) return state;
      return { ...state, ...stamp, factEdits: { ...state.factEdits, [action.factId]: action.edit } };
    }
    case 'clearFactEdit': {
      const { [action.factId]: _dropped, ...rest } = state.factEdits;
      return { ...state, ...stamp, factEdits: rest };
    }
    case 'decide':
      return { ...state, ...stamp, decisions: decide(state, action.decision) };
    case 'clearDecision': {
      const { [action.key]: _dropped, ...rest } = state.decisions;
      return { ...state, ...stamp, decisions: rest };
    }
    case 'setLanguage':
      return { ...state, ...stamp, language: action.language };
    case 'goTo':
      return { ...state, ...stamp, step: action.step };
    case 'reset':
      return {
        ...initialState,
        ...stamp,
        language: state.language,
        generation: state.generation + 1,
      };
  }
}
```

- [ ] **Step 5: Run the reducer test, expect PASS**

Run: `pnpm vitest run apps/web/test/reducer.test.ts`

- [ ] **Step 6: Trim `ingest.ts`**

```ts
import { extractFacts, type FactSet, ingest } from '@passwerk/core';
import type { FileSummary } from './state.ts';

export interface IngestInput {
  name: string;
  // Pinned to the ArrayBuffer-backed variant: apps/web mixes DOM lib (default `ArrayBuffer`)
  // with @types/node (default `ArrayBufferLike`), and core's `InputFile.bytes` resolves to
  // `Uint8Array<ArrayBuffer>` under this project's tsconfig. `new Uint8Array(...)` always
  // allocates a fresh `ArrayBuffer`, so every real caller already satisfies this.
  bytes: Uint8Array<ArrayBuffer>;
  size: number;
}

export interface IngestOutcome {
  summaries: FileSummary[];
  facts: FactSet;
}

/** Bytes in, summaries and facts out. Proposals are derived later from facts and category. */
export async function ingestFiles(
  inputs: IngestInput[],
  options: { workerSrc?: string } = {},
): Promise<IngestOutcome> {
  const bundle = await ingest(
    inputs.map(({ name, bytes }) => ({ name, bytes })),
    options.workerSrc !== undefined ? { pdf: { workerSrc: options.workerSrc } } : {},
  );
  const sizes = new Map(inputs.map((i) => [i.name, i.size]));
  const summaries: FileSummary[] = bundle.documents.map((d) => ({
    name: d.name,
    size: sizes.get(d.name) ?? 0,
    sha256: d.sha256,
    format: d.format,
    pages: d.pages.length,
    lang: d.lang,
    ...(d.error ? { error: d.error } : {}),
  }));
  return { summaries, facts: extractFacts(bundle) };
}
```

Update `apps/web/test/ingest.test.ts`: remove every reference to `proposals` and to the `category` option (assert on `summaries` and `facts` only; keep the corrupt-file case).

- [ ] **Step 7: Write the failing derive tests**

Replace `apps/web/test/derive.test.ts` with:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalJson,
  extractFacts,
  type FactSet,
  getSample,
  ingest,
  type PassportDraft,
  suggestMappings,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { derive } from '@/workflow/derive/index.ts';
import { defaultProject } from '@/workflow/project.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState, type WorkflowState } from '@/workflow/state.ts';

const AT = '2026-09-05T12:00:00Z';
const FIX = join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'test', 'fixtures', 'musterwerk');
const PROJECT = defaultProject('urn:passwerk:test:1', '');

let facts: FactSet = { facts: [], tables: [], documents: [] };
let withFacts: WorkflowState = initialState;
beforeAll(async () => {
  const names = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'datasheet-en.csv'];
  const bundle = await ingest(
    names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) })),
  );
  facts = extractFacts(bundle);
  withFacts = reduce(reduce(initialState, { type: 'setProject', project: PROJECT, at: AT }), {
    type: 'filesIngested',
    summaries: [],
    facts,
    at: AT,
  });
}, 60_000);

const must = (d: ReturnType<typeof derive>) => {
  if (!d) throw new Error('expected a derived bundle');
  return d;
};

/** `ev-valid` with a raw string where core expects a list of materials. */
function brokenBase(): PassportDraft {
  const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
  const attributes = draft.attributes as Record<string, { value: unknown }>;
  const field = attributes['criticalRawMaterials'];
  if (!field) throw new Error('ev-valid should carry criticalRawMaterials');
  field.value = 'lithium, cobalt';
  return draft;
}

describe('derive', () => {
  it('is null without a project and null while the project has no meta', () => {
    expect(derive(initialState, AT)).toBeNull();
    const noCategory = reduce(initialState, {
      type: 'setProject',
      project: { ...PROJECT, batteryType: 'PORTABLE' },
      at: AT,
    });
    expect(derive(noCategory, AT)).toBeNull();
  });
  it('proposals come from facts and the derived category, exactly as core proposes', () => {
    const d = must(derive(withFacts, AT));
    expect(d.proposals).toEqual(suggestMappings(facts, { category: 'EV' }));
    expect(d.meta.category).toBe('EV');
    expect(d.draft.meta).toEqual(d.meta);
  });
  it('a battery type change re-proposes; a stranded decision is ignored and revived', () => {
    const first = must(derive(withFacts, AT)).proposals[0];
    if (!first) throw new Error('expected proposals');
    const decided = reduce(withFacts, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: first.attributeId, ...(first.path ? { path: first.path } : {}), factId: first.factId },
      at: AT,
    });
    expect(must(derive(decided, AT)).draft.attributes[first.attributeId]?.status).toBe('present');
    const lmt = reduce(decided, { type: 'setProject', project: { ...PROJECT, batteryType: 'LMT' }, at: AT });
    const dl = must(derive(lmt, AT));
    expect(dl.proposals).toEqual(suggestMappings(facts, { category: 'LMT' }));
    expect(dl.invalidDecisions).toEqual([]);
    const back = reduce(lmt, { type: 'setProject', project: { ...PROJECT, batteryType: 'EV' }, at: AT });
    expect(must(derive(back, AT)).draft.attributes[first.attributeId]?.status).toBe('present');
  });
  it('a fact edit reaches the proposal and the draft', () => {
    const first = must(derive(withFacts, AT)).proposals.find((p) => p.path === undefined && typeof p.value === 'string');
    if (!first) throw new Error('expected a scalar proposal');
    const edited = reduce(withFacts, {
      type: 'editFact',
      factId: first.factId,
      edit: { value: '42', ...(first.unit ? { unit: first.unit } : {}) },
      at: AT,
    });
    const accepted = reduce(edited, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: first.attributeId, factId: first.factId },
      at: AT,
    });
    const d = must(derive(accepted, AT));
    expect(d.facts.facts.find((f) => f.id === first.factId)?.value).toBe('42');
    expect(d.proposals.find((p) => p.factId === first.factId && p.attributeId === first.attributeId)?.value).toBe('42');
    const field = d.draft.attributes[first.attributeId] as { value?: unknown } | undefined;
    expect(field?.value).toBe('42');
  });
  it('a manual decision with a factId carries that fact\'s provenance', () => {
    const fact = facts.facts[0];
    if (!fact) throw new Error('expected facts');
    const s = reduce(withFacts, {
      type: 'decide',
      decision: { kind: 'manual', attributeId: 'nominalVoltage', value: '400', unit: 'V', factId: fact.id },
      at: AT,
    });
    const field = must(derive(s, AT)).draft.attributes['nominalVoltage'] as { source?: unknown } | undefined;
    expect(field?.source).toEqual([fact.source]);
  });
  it('imports a draft, replaces its meta with the project\'s and validates it', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    const d = must(derive(s, AT));
    expect(d.report.verdict).toBe('valid');
    expect(d.draft.meta).toEqual(draft.meta);
    expect(d.carrier.ok).toBe(true);
  });
  it('an imported draft with a conflict field yields invalid', () => {
    const draft = structuredClone(getSample('ev-valid')) as PassportDraft;
    (draft.attributes as Record<string, { status: string }>)['nominalVoltage'] = {
      ...(draft.attributes as Record<string, object>)['nominalVoltage'],
      status: 'conflict',
    } as never;
    const d = must(derive(reduce(initialState, { type: 'importDraft', draft, at: AT }), AT));
    expect(d.report.verdict).toBe('invalid');
  });
  it('isolates a decision core cannot walk and keeps the rest', () => {
    const s = reduce(
      reduce(initialState, { type: 'importDraft', draft: getSample('ev-valid') as PassportDraft, at: AT }),
      {
        type: 'decide',
        decision: { kind: 'manual', attributeId: 'criticalRawMaterials', value: 'lithium' },
        at: AT,
      },
    );
    const d = must(derive(s, AT));
    expect(d.invalidDecisions.map((i) => i.key)).toEqual(['criticalRawMaterials']);
    expect(d.report.verdict).toBe('valid');
  });
  it('reports L1 alone for an imported draft no validator can walk', () => {
    const d = must(derive(reduce(initialState, { type: 'importDraft', draft: brokenBase(), at: AT }), AT));
    expect(d.report.verdict).toBe('invalid');
    expect(d.report.layers.L1.ran).toBe(true);
    expect(d.report.layers.L4.ran).toBe(false);
  });
  it('is byte-identical on re-run and reuses every object across a language toggle', () => {
    const a = must(derive(withFacts, AT));
    const b = must(derive({ ...withFacts, decisions: { ...withFacts.decisions } }, AT));
    expect(canonicalJson(a.gap)).toBe(canonicalJson(b.gap));
    const toggled = reduce(withFacts, { type: 'setLanguage', language: 'en', at: AT });
    const c = must(derive(toggled, AT));
    expect(c.draft).toBe(a.draft);
    expect(c.report).toBe(a.report);
    expect(c.gap).toBe(a.gap);
    expect(c.proposals).toBe(a.proposals);
  });
});
```

Check the `layers.L1.ran` property name against `ValidationReport` in `packages/core/src/validate/report.ts` before relying on it; use whatever field `buildReport` sets for "layer ran" (the old `derive.ts` passes `{ L1: true, L2: false, ... }` to `buildReport`).

- [ ] **Step 8: Run it to see it fail**

Run: `pnpm vitest run apps/web/test/derive.test.ts`
Expected: FAIL, `@/workflow/derive/index.ts` missing.

- [ ] **Step 9: Create `derive/mappings.ts`** (moved from `derive.ts`, proposals and facts passed in)

```ts
import {
  type ApplyResult,
  applyMappings,
  buildReport,
  type FactSet,
  type MappingConflict,
  type MappingDecision,
  type MappingProposal,
  type PassportDraft,
  type ValidationReport,
  validate,
  validateSchema,
} from '@passwerk/core';
import type { Decision, DecisionKey } from '../state.ts';

/** A decision core refused to apply, kept out of the draft and reported to the reviewer. */
export interface InvalidDecision {
  key: DecisionKey;
  message: string;
}

export interface MappingEntry {
  key: DecisionKey;
  mapping: MappingDecision;
}

function toMapping(
  d: Decision,
  proposals: MappingProposal[],
  facts: FactSet,
): MappingDecision | null {
  const path = d.path !== undefined ? { path: d.path } : {};
  if (d.kind === 'reject') return null;
  if (d.kind === 'manual') {
    const fact = d.factId !== undefined ? facts.facts.find((f) => f.id === d.factId) : undefined;
    return {
      attributeId: d.attributeId,
      ...path,
      value: d.value,
      ...(d.unit ? { unit: d.unit } : {}),
      ...(d.recordedAt ? { recordedAt: d.recordedAt } : {}),
      ...(fact ? { source: [fact.source] } : {}),
      override: true,
    };
  }
  const p = proposals.find(
    (x) => x.factId === d.factId && x.attributeId === d.attributeId && x.path === d.path,
  );
  // No proposal under the current category: the decision waits until its proposal is back.
  if (!p) return null;
  const value = d.kind === 'edit' ? d.value : p.value;
  const unit = d.kind === 'edit' ? d.unit : p.unit;
  return {
    attributeId: d.attributeId,
    ...path,
    value,
    ...(unit ? { unit } : {}),
    ...(d.kind === 'edit' && d.recordedAt ? { recordedAt: d.recordedAt } : {}),
    source: p.source,
    confidence: p.confidence,
    override: true,
  };
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function mappingEntries(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
  facts: FactSet,
): MappingEntry[] {
  return Object.keys(decisions)
    .sort()
    .map((key) => ({ key, decision: decisions[key] }))
    .filter((e): e is { key: DecisionKey; decision: Decision } => e.decision !== undefined)
    .map((e) => ({ key: e.key, mapping: toMapping(e.decision, proposals, facts) }))
    .filter((e): e is MappingEntry => e.mapping !== null);
}

export interface Applied {
  draft: PassportDraft;
  conflicts: MappingConflict[];
  invalidDecisions: InvalidDecision[];
  report: ValidationReport;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type Attempt<T> = { ok: true; value: T } | { ok: false; message: string };

function tryApply(draft: PassportDraft, mapping: MappingDecision): Attempt<ApplyResult> {
  try {
    return { ok: true, value: applyMappings(draft, [mapping]) };
  } catch (e) {
    return { ok: false, message: messageOf(e) };
  }
}

function tryValidate(draft: PassportDraft, asOf: string): Attempt<ValidationReport> {
  try {
    return { ok: true, value: validate(draft, { asOf }) };
  } catch (e) {
    return { ok: false, message: messageOf(e) };
  }
}

/** (Keep the `l1Only`, `foldOneByOne` and `applyAll` functions and their comments verbatim from the old `derive.ts`; `applyAll` is exported.) */
export function applyAll(base: PassportDraft, entries: MappingEntry[], asOf: string): Applied {
  // ... verbatim from derive.ts
}
```

- [ ] **Step 10: Create `derive/facts.ts`**

```ts
import { type BatteryCategory, type FactSet, suggestMappings } from '@passwerk/core';
import type { FactEdit } from '../state.ts';
import { memoLast } from './memo.ts';

const EMPTY: FactSet = { facts: [], tables: [], documents: [] };

/** The facts as core extracted them with the reviewer's edits applied; a plain `FactSet`. */
export const effectiveFacts = memoLast(
  (facts: FactSet | null, edits: Record<string, FactEdit>): FactSet => {
    if (!facts) return EMPTY;
    if (Object.keys(edits).length === 0) return facts;
    return {
      ...facts,
      facts: facts.facts.map((f) => {
        const e = edits[f.id];
        if (!e) return f;
        const { unit: _dropped, ...rest } = f;
        return { ...rest, raw: e.value, value: e.value, ...(e.unit ? { unit: e.unit } : {}) };
      }),
    };
  },
);

export const deriveProposals = memoLast((facts: FactSet, category: BatteryCategory) =>
  facts.facts.length === 0 ? [] : suggestMappings(facts, { category }),
);
```

- [ ] **Step 11: Create `derive/index.ts` and delete `derive.ts`**

```ts
import {
  type FactSet,
  type GapReport,
  gapReport,
  type MappingConflict,
  type MappingDecision,
  type MappingProposal,
  type PassportDraft,
  type PassportMeta,
  type ValidationReport,
} from '@passwerk/core';
import { newDraft } from '@passwerk/core';
import type { Project } from '../project.ts';
import type { Decision, DecisionKey, FactEdit, WorkflowState } from '../state.ts';
import type { CarrierView } from './carrier.ts';
import { deriveProposals, effectiveFacts } from './facts.ts';
import { applyAll, type InvalidDecision, mappingEntries } from './mappings.ts';
import { memoLast } from './memo.ts';
import { deriveProject } from './project.ts';

export type { InvalidDecision } from './mappings.ts';
export type { CarrierView } from './carrier.ts';
export type { ProjectDerived } from './project.ts';
export { deriveProject } from './project.ts';

export interface Derived {
  meta: PassportMeta;
  /** Effective facts: core's extraction with the reviewer's edits applied. */
  facts: FactSet;
  proposals: MappingProposal[];
  draft: PassportDraft;
  conflicts: MappingConflict[];
  invalidDecisions: InvalidDecision[];
  report: ValidationReport;
  gap: GapReport;
  carrier: CarrierView;
  asOf: string;
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function decisionsToMappings(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
  facts: FactSet,
): MappingDecision[] {
  return mappingEntries(decisions, proposals, facts).map((e) => e.mapping);
}

const baseOf = memoLast((imported: PassportDraft | null, meta: PassportMeta): PassportDraft =>
  imported ? { ...imported, meta } : newDraft(meta),
);

const deriveInputs = memoLast(
  (
    project: Project,
    importedDraft: PassportDraft | null,
    facts: FactSet | null,
    factEdits: Record<string, FactEdit>,
    decisions: Record<DecisionKey, Decision>,
    asOf: string,
  ): Derived | null => {
    const p = deriveProject(project, asOf);
    if (!p.meta) return null;
    const eff = effectiveFacts(facts, factEdits);
    const proposals = deriveProposals(eff, p.meta.category);
    const base = baseOf(importedDraft, p.meta);
    const { draft, conflicts, invalidDecisions, report } = applyAll(
      base,
      mappingEntries(decisions, proposals, eff),
      asOf,
    );
    const gap = gapReport(draft, { report, asOf });
    return {
      meta: p.meta,
      facts: eff,
      proposals,
      draft,
      conflicts,
      invalidDecisions,
      report,
      gap,
      carrier: p.carrier,
      asOf,
    };
  },
);

/** Everything the screens show, from inputs alone. Null until the project yields a meta. */
export function derive(state: WorkflowState, asOf: string): Derived | null {
  if (!state.project) return null;
  return deriveInputs(
    state.project,
    state.importedDraft,
    state.facts,
    state.factEdits,
    state.decisions,
    asOf,
  );
}
```

Delete `apps/web/src/workflow/derive.ts`. Update the `InvalidDecision` import in `views/ReviewView.tsx` to `'../workflow/derive/index.ts'`.

- [ ] **Step 12: Run the derive test, expect PASS**

Run: `pnpm vitest run apps/web/test/derive.test.ts`

- [ ] **Step 13: Rewrite `exports.ts` with a keyed record**

```ts
import {
  canonicalJson,
  emitAasJson,
  emitAasx,
  emitHtml,
  PassportDraftError,
  type Verdict,
} from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';
import type { Derived } from './derive/index.ts';
import { exportDraftJson } from './draftIo.ts';

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export type ExportKind = 'aasJson' | 'aasx' | 'draft' | 'gaps' | 'html' | 'qr';
export const EXPORT_KINDS: readonly ExportKind[] = ['aasJson', 'aasx', 'draft', 'gaps', 'html', 'qr'];

export type ExportResult =
  | { verdict: Verdict; files: Partial<Record<ExportKind, ExportFile>>; carrierError?: LangText }
  | { error: LangText };

export function slug(passportId: string): string {
  return passportId
    .replace(/^[a-z]+:(\/\/)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildExports(derived: Derived, lang: 'de' | 'en' = 'en'): ExportResult {
  const base = slug(derived.draft.meta.passportId);
  try {
    const json = emitAasJson(derived.draft, { asOf: derived.asOf });
    const aasx = emitAasx(derived.draft, { asOf: derived.asOf });
    const files: Partial<Record<ExportKind, ExportFile>> = {
      aasJson: { name: `${base}.aas.json`, bytes: utf8(json.output), type: 'application/json' },
      aasx: {
        name: `${base}.aasx`,
        bytes: aasx.output,
        type: 'application/asset-administration-shell-package',
      },
      draft: {
        name: `${base}.draft.json`,
        bytes: utf8(exportDraftJson(derived.draft)),
        type: 'application/json',
      },
      gaps: { name: `${base}.gaps.json`, bytes: utf8(canonicalJson(derived.gap)), type: 'application/json' },
      html: {
        name: `${base}.html`,
        bytes: utf8(emitHtml(derived.draft, { asOf: derived.asOf, lang }).output),
        type: 'text/html',
      },
    };
    // The QR needs an https identifier; everything else does not (D-035), so a missing carrier
    // omits only the QR file and says why.
    if (derived.carrier.ok) {
      files.qr = { name: `${base}.qr.svg`, bytes: utf8(derived.carrier.svg), type: 'image/svg+xml' };
      return { verdict: json.verdict, files };
    }
    return { verdict: json.verdict, files, carrierError: derived.carrier.message };
  } catch (e) {
    if (e instanceof PassportDraftError) {
      const first = e.findings[0];
      return { error: first?.message ?? { de: e.message, en: e.message } };
    }
    throw e;
  }
}
```

Update `apps/web/test/exports.test.ts`: build states with `importDraft` (unchanged), derive through `@/workflow/derive/index.ts`, and assert on `out.files.aasJson`, `out.files.qr` etc. instead of indices. The "QR exceeds byte capacity" case keeps its assertions on `carrierError` and `out.files.qr` being undefined; the six-file case asserts `Object.keys(out.files).sort()` equals `['aasJson','aasx','draft','gaps','html','qr']`.

- [ ] **Step 14: Update `App.tsx` to the new state (shim for the start screen)**

Changes in `apps/web/src/app/App.tsx`:

```ts
import { derive } from '../workflow/derive/index.ts';
import { defaultProject } from '../workflow/project.ts';
import type { ExportKind } from '../workflow/exports.ts';
```

- `reachable`: `project` always; `upload` when `derived !== null`; `facts` when `state.facts !== null`; `review` and `gaps` when `derived !== null`.
- `onFiles`: guard `if (!derived || files.length === 0) return;`, call `ingestFiles(inputs, { workerSrc: pdfWorkerUrl })`, dispatch `{ type: 'filesIngested', ...out, at }`.
- `onExport(kind: ExportKind)`: `const file = out.files[kind]; if (kind === 'qr' && !file) { setExportError(out.carrierError ?? {...}); return; }`.
- `groups = buildGroups(derived?.proposals ?? [], state.decisions)`; `proposalCount={derived?.proposals.length ?? 0}`.
- `case 'project'`: render the existing `StartView` (still named so until Task 4) with `onStart={({ category, passportId }) => { const at = nowIso(); const p = defaultProject(passportId, at); dispatch({ type: 'setProject', project: { ...p, batteryType: BATTERY_TYPE_OF[category], ...(category === 'INDUSTRIAL_GT_2KWH' ? { energyKwh: '3' } : {}), identifier: isHttpsUri(passportId) ? { mode: 'https', uri: passportId } : { mode: 'draft', urn: passportId } }, at }); dispatch({ type: 'goTo', step: 'upload', at }); }}` and `resume` from `state.project` (`category: derived?.meta.category ?? 'EV'`).
- `case 'facts'`: render `<p data-testid="facts-placeholder">…</p>` for now (Task 7 replaces it).
- `case 'review'`: `category={derived.meta.category}`.
- Upload `onContinue` still goes to `review` in this task (Task 7 switches it to `facts`).
- Step buttons: `t(lang, \`step.${step}\`)` needs keys `step.project` and `step.facts`: add `'step.project': 'Projekt'` / `'Project'` and `'step.facts': 'Fakten'` / `'Facts'`, and delete `'step.start'`.

`isHttpsUri` and `BATTERY_TYPE_OF` are imported from `@passwerk/core` and `../workflow/project.ts`.

- [ ] **Step 15: Update the remaining tests**

- `apps/web/test/reupload.test.ts`: `filesIngested` without `proposals`; decisions are pruned by fact existence and file hash (mirror the reducer tests above; keep its scenario).
- `apps/web/test/persistence.test.ts`: `STATE_VERSION` is 2; add a case: a stored `{ ...initialState, version: 1 }` loads as `{ kind: 'version' }`.
- `apps/web/test/views/App.test.tsx`: replace `store.getState().meta?.category` with `store.getState().project?.batteryType` being `'EV'`; `OUTCOME` without `proposals`; the second `startProject` dispatch becomes `{ type: 'setProject', project: defaultProject('urn:passwerk:test:2', AT), at: AT }`.
- `apps/web/test/views/ReviewView.test.tsx`, `AddValueDialog.test.tsx`: no state changes needed; fix imports if `InvalidDecision` was imported from `derive.ts`.

- [ ] **Step 16: Run the whole web suite, typecheck and lint**

Run: `pnpm vitest run apps/web/test && pnpm typecheck && pnpm lint`
Expected: all green.

- [ ] **Step 17: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): state v2 with project inputs, fact edits and derived proposals"
```

---

### Task 3: Project screen with obligations, identifier modes and QR preview

**Files:**
- Create: `apps/web/src/views/ProjectView.tsx`, `apps/web/src/views/parts/ObligationsCard.tsx`, `apps/web/src/views/parts/QrPreview.tsx`
- Delete: `apps/web/src/views/StartView.tsx`, `apps/web/test/views/StartView.test.tsx`
- Modify: `apps/web/src/app/App.tsx`, `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`
- Test: `apps/web/test/views/ProjectView.test.tsx`, `apps/web/test/views/QrPreview.test.tsx`, `apps/web/test/views/App.test.tsx`

**Interfaces:**
- Consumes: `Project`, `Identifier`, `IDENTIFIER_MODES`, `defaultProject` (Task 1); `ProjectDerived`, `deriveProject`, `CarrierView` (Task 1/2); `BATTERY_TYPES`, `ROLES` from `@passwerk/core`.
- Produces:
  - `ProjectView` props: `{ lang; project: Project; derived: ProjectDerived; isNew: boolean; resume?: { files: string[]; updatedAt: string }; onChange(project: Project): void; onContinue(): void; onImport(text: string): { ok: true } | { ok: false; message: LangText }; onResume(): void; onReset(): void }`
  - `QrPreview` props: `{ lang; carrier: CarrierView; onDownload?(): void }`
  - `ObligationsCard` props: `{ lang; result: ObligationResult; manualCategory?: BatteryCategory; onManualCategory(c: BatteryCategory | undefined): void }`
  - test ids: `battery-type`, `role`, `energy-kwh`, `placed-on-market`, `obligation-verdict` (with `data-verdict`), `obligation-category`, `manual-category`, `timeline-entry` (with `data-id`), `identifier-mode-<mode>`, `identifier-resolver`, `identifier-gtin`, `identifier-serial`, `identifier-giai`, `identifier-uri`, `identifier-urn`, `identifier-error`, `qr-image`, `qr-payload`, `qr-none`, `project-continue`, `import-draft`, `import-error`, `resume-card`.

- [ ] **Step 1: Add the i18n keys** (German first in `de.ts`, English in `en.ts`; delete `start.category`, `start.category.*`, `start.passportId*`, `start.begin`)

English values (translate each into `de.ts` yourself, keeping keys identical):

```ts
  'category.EV': 'Electric vehicle (EV)',
  'category.LMT': 'Light means of transport (LMT)',
  'category.INDUSTRIAL_GT_2KWH': 'Industrial battery > 2 kWh',
  'project.title': 'Project',
  'project.battery.title': 'Battery and role',
  'project.batteryType': 'Battery type',
  'project.batteryType.EV': 'Electric vehicle battery',
  'project.batteryType.LMT': 'Light means of transport battery',
  'project.batteryType.INDUSTRIAL': 'Industrial battery',
  'project.batteryType.STATIONARY_BATTERY_ENERGY_STORAGE': 'Stationary battery energy storage',
  'project.batteryType.PORTABLE': 'Portable battery',
  'project.batteryType.SLI': 'SLI battery (starting, lighting, ignition)',
  'project.batteryType.OTHER': 'Other battery',
  'project.role': 'Your role',
  'project.role.manufacturer': 'Manufacturer',
  'project.role.authorised_representative': 'Authorised representative',
  'project.role.importer': 'Importer',
  'project.role.distributor': 'Distributor',
  'project.role.fulfilment_service_provider': 'Fulfilment service provider',
  'project.role.other': 'Other',
  'project.energyKwh': 'Battery energy (kWh)',
  'project.energyKwh.hint': 'Decides the 2 kWh threshold for industrial batteries. Decimal comma is accepted.',
  'project.placedOnMarketDate': 'Placed on the market (date)',
  'project.obligations.title': 'Passport obligation',
  'project.obligations.required': 'Passport required',
  'project.obligations.not_required': 'No passport required',
  'project.obligations.insufficient_input': 'Input incomplete',
  'project.obligations.missing': 'Missing: {fields}',
  'project.missing.energyKwh': 'battery energy',
  'project.missing.placedOnMarketDate': 'placed-on-market date',
  'project.missing.asOf': 'as-of date',
  'project.category': 'Passport category',
  'project.category.derived': 'Derived from the check: {category}',
  'project.category.voluntary': 'No category follows from this input. Choose one for a voluntary passport.',
  'project.category.none': 'No category',
  'project.timeline': 'Timeline',
  'project.timeline.inEffect': 'in effect',
  'project.timeline.upcoming': 'upcoming',
  'project.roleGuidance': 'What your role means',
  'project.sources': 'Sources',
  'project.identifier.title': 'Passport identifier',
  'project.identifier.mode.gs1': 'GS1 (GTIN + serial)',
  'project.identifier.mode.gs1-giai': 'GS1 (GIAI)',
  'project.identifier.mode.https': 'https URI',
  'project.identifier.mode.draft': 'Draft (URN)',
  'project.identifier.resolverBase': 'Resolver base (https)',
  'project.identifier.gtin': 'GTIN',
  'project.identifier.serial': 'Serial number',
  'project.identifier.giai': 'GIAI',
  'project.identifier.uri': 'https URI',
  'project.identifier.urn': 'Draft identifier',
  'project.identifier.draft.hint': 'A draft identifier produces no QR code. Switch to GS1 or https before publishing.',
  'project.continue': 'Continue to documents',
  'project.create': 'Create project',
  'qr.title': 'QR code',
  'qr.payload': 'Encodes',
  'qr.none': 'No QR code: {reason}',
  'qr.download': 'Download SVG',
```

- [ ] **Step 2: Write the failing view tests**

`apps/web/test/views/QrPreview.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QrPreview } from '@/views/parts/QrPreview.tsx';
import { mount } from './render.tsx';

describe('QrPreview', () => {
  it('renders the SVG as an image with its payload', () => {
    mount(
      <QrPreview lang="en" carrier={{ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', payload: 'https://p.example/1' }} />,
    );
    const img = screen.getByTestId('qr-image') as HTMLImageElement;
    expect(img.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(screen.getByTestId('qr-payload').textContent).toBe('https://p.example/1');
  });
  it('shows the reason in the chosen language when there is no QR', () => {
    mount(<QrPreview lang="de" carrier={{ ok: false, message: { de: 'kein https', en: 'no https' } }} />);
    expect(screen.getByTestId('qr-none').textContent).toContain('kein https');
  });
});
```

`apps/web/test/views/ProjectView.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProjectView } from '@/views/ProjectView.tsx';
import { deriveProject } from '@/workflow/derive/project.ts';
import { defaultProject, type Project } from '@/workflow/project.ts';
import { mount } from './render.tsx';

// After the 2027-02-18 obligation start, so an EV manufacturer reads "required".
const AT = '2027-09-07T12:00:00Z';
const EARLY = '2026-09-07T12:00:00Z';
const base = defaultProject('urn:passwerk:draft:1', AT);

function view(project: Project, over: Partial<Parameters<typeof ProjectView>[0]> = {}) {
  const onChange = vi.fn();
  const onContinue = vi.fn();
  const el = (
    <ProjectView
      lang="en"
      project={project}
      derived={deriveProject(project, AT)}
      isNew
      onChange={onChange}
      onContinue={onContinue}
      onImport={() => ({ ok: true })}
      onResume={() => undefined}
      onReset={() => undefined}
      {...over}
    />
  );
  return { ...mount(el), onChange, onContinue };
}

describe('ProjectView', () => {
  it('shows the verdict, the derived category and enables Continue for an EV manufacturer', () => {
    const { onContinue } = view(base);
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe('required');
    expect(screen.getByTestId('obligation-category').textContent).toContain('Electric vehicle (EV)');
    expect(screen.queryByTestId('manual-category')).toBeNull();
    expect(screen.getAllByTestId('timeline-entry').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
  it('before the start date: not required, category still derived, Continue enabled', () => {
    const { onContinue } = view(base, { derived: deriveProject(base, EARLY) });
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe('not_required');
    expect(screen.getByTestId('obligation-reason').textContent).toContain('2027-02-18');
    expect(screen.getByTestId('obligation-category').textContent).toContain('Electric vehicle (EV)');
    expect(screen.queryByTestId('manual-category')).toBeNull();
    fireEvent.click(screen.getByTestId('project-continue'));
    expect(onContinue).toHaveBeenCalled();
  });
  it('energy input normalises a decimal comma and dispatches onChange', () => {
    const { onChange } = view({ ...base, batteryType: 'INDUSTRIAL' });
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe('insufficient_input');
    expect(screen.getByText(/Missing: battery energy/)).toBeTruthy();
    fireEvent.change(screen.getByTestId('energy-kwh'), { target: { value: '1,5' } });
    expect(onChange).toHaveBeenCalledWith({ ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' });
  });
  it('offers a manual category for a voluntary passport and blocks Continue until one is chosen', () => {
    const p: Project = { ...base, batteryType: 'INDUSTRIAL', energyKwh: '1.5' };
    view(p);
    expect(screen.getByTestId('obligation-verdict').getAttribute('data-verdict')).toBe('not_required');
    expect(screen.getByTestId('manual-category')).toBeTruthy();
    expect((screen.getByTestId('project-continue') as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows the GS1 error text and blocks Continue on a wrong check digit', () => {
    view({
      ...base,
      identifier: { mode: 'gs1', resolverBase: 'https://id.example.com', gtin: '96385075', serial: 'S1' },
    });
    expect(screen.getByTestId('identifier-error').textContent).toContain('check digit');
    expect((screen.getByTestId('project-continue') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('qr-none')).toBeTruthy();
  });
  it('renders the QR preview for a valid GS1 identifier', () => {
    view({
      ...base,
      identifier: { mode: 'gs1', resolverBase: 'https://id.example.com', gtin: '96385074', serial: 'S1' },
    });
    expect(screen.getByTestId('qr-image')).toBeTruthy();
    expect(screen.getByTestId('qr-payload').textContent).toBe('https://id.example.com/01/00000096385074/21/S1');
  });
  it('switching the identifier mode dispatches an empty identifier of that mode', () => {
    const { onChange } = view(base);
    fireEvent.click(screen.getByTestId('identifier-mode-https'));
    expect(onChange).toHaveBeenCalledWith({ ...base, identifier: { mode: 'https', uri: '' } });
  });
  it('renders German chrome', () => {
    mount(
      <ProjectView
        lang="de"
        project={base}
        derived={deriveProject(base, AT)}
        isNew
        onChange={() => undefined}
        onContinue={() => undefined}
        onImport={() => ({ ok: true })}
        onResume={() => undefined}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText('Batterietyp')).toBeTruthy();
  });
});
```

Carry over from `StartView.test.tsx` the three import tests (throwing importer, returned error, input cleared) against `ProjectView`, unchanged apart from the props.

- [ ] **Step 3: Run the tests to see them fail**

Run: `pnpm vitest run apps/web/test/views/ProjectView.test.tsx apps/web/test/views/QrPreview.test.tsx`

- [ ] **Step 4: Implement `QrPreview.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import { type Language, pick, t } from '../../i18n/index.ts';
import type { CarrierView } from '../../workflow/derive/carrier.ts';

/** The QR as an image built from the SVG bytes (no innerHTML), its payload, or the reason there is none. */
export function QrPreview({
  lang,
  carrier,
  onDownload,
}: {
  lang: Language;
  carrier: CarrierView;
  onDownload?: () => void;
}) {
  if (!carrier.ok) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="qr-none">
        {t(lang, 'qr.none', { reason: pick(lang, carrier.message) })}
      </p>
    );
  }
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(carrier.svg)}`;
  return (
    <div className="grid gap-2" data-testid="qr-preview">
      <img src={src} alt={t(lang, 'qr.title')} width={160} height={160} data-testid="qr-image" />
      <span className="text-muted-foreground text-xs">{t(lang, 'qr.payload')}</span>
      <code className="break-all text-xs" data-testid="qr-payload">
        {carrier.payload}
      </code>
      {onDownload && (
        <Button size="sm" variant="outline" data-testid="qr-download" onClick={onDownload}>
          {t(lang, 'qr.download')}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Implement `ObligationsCard.tsx`**

```tsx
import type { BatteryCategory, ObligationResult } from '@passwerk/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Key, type Language, pick, t } from '../../i18n/index.ts';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];
const NONE = '__none__';

export function ObligationsCard({
  lang,
  result,
  manualCategory,
  onManualCategory,
}: {
  lang: Language;
  result: ObligationResult;
  manualCategory?: BatteryCategory;
  onManualCategory(category: BatteryCategory | undefined): void;
}) {
  const variant = result.verdict === 'required' ? 'default' : result.verdict === 'not_required' ? 'secondary' : 'destructive';
  const missing = result.missingInput.map((m) => t(lang, `project.missing.${m}` as Key)).join(', ');
  return (
    <Card data-testid="obligations-card">
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle>{t(lang, 'project.obligations.title')}</CardTitle>
        <Badge variant={variant} data-testid="obligation-verdict" data-verdict={result.verdict}>
          {t(lang, `project.obligations.${result.verdict}`)}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p data-testid="obligation-reason">{pick(lang, result.reason)}</p>
        {missing && <p className="text-destructive">{t(lang, 'project.obligations.missing', { fields: missing })}</p>}
        {result.category ? (
          <p data-testid="obligation-category">
            {t(lang, 'project.category.derived', { category: t(lang, `category.${result.category}`) })}
          </p>
        ) : (
          <div className="grid gap-2">
            <p className="text-muted-foreground">{t(lang, 'project.category.voluntary')}</p>
            <Label htmlFor="manual-category">{t(lang, 'project.category')}</Label>
            <Select
              value={manualCategory ?? NONE}
              onValueChange={(v) => onManualCategory(v === NONE ? undefined : (v as BatteryCategory))}
            >
              <SelectTrigger id="manual-category" data-testid="manual-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t(lang, 'project.category.none')}</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(lang, `category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <details>
          <summary>{t(lang, 'project.timeline')} ({result.timeline.length})</summary>
          <ul className="grid gap-1 py-2">
            {result.timeline.map((e) => (
              <li key={e.id} data-testid="timeline-entry" data-id={e.id} className="flex flex-wrap items-center gap-2">
                <code>{e.date}</code>
                <span>{pick(lang, e.title)}</span>
                <span className="text-muted-foreground text-xs">{e.legalRef}</span>
                <Badge variant={e.inEffect ? 'default' : 'outline'}>
                  {t(lang, e.inEffect ? 'project.timeline.inEffect' : 'project.timeline.upcoming')}
                </Badge>
                {e.verify && <Badge variant="outline">{t(lang, 'gaps.verify')}</Badge>}
              </li>
            ))}
          </ul>
        </details>
        <p>
          <span className="font-medium">{t(lang, 'project.roleGuidance')}: </span>
          {pick(lang, result.roleGuidance)}
        </p>
        <p className="text-muted-foreground text-xs">
          {t(lang, 'project.sources')}: {result.sources.join('; ')}
        </p>
        <p className="text-muted-foreground text-xs" data-testid="not-legal-advice">{t(lang, 'app.notLegalAdvice')}</p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Implement `ProjectView.tsx`**

Structure (write it fully; the snippets below are the parts that carry logic):

```tsx
import type { BatteryType, Role } from '@passwerk/core';
import { BATTERY_TYPES, ROLES } from '@passwerk/core';
import { useState } from 'react';
// shadcn: Button, Card*, Input, Label, Select*, Tabs, TabsList, TabsTrigger
import { type LangText, type Language, pick, t } from '../i18n/index.ts';
import type { ProjectDerived } from '../workflow/derive/project.ts';
import { IDENTIFIER_MODES, type Identifier, type IdentifierMode, type Project } from '../workflow/project.ts';
import { ObligationsCard } from './parts/ObligationsCard.tsx';
import { QrPreview } from './parts/QrPreview.tsx';

export interface ProjectViewProps {
  lang: Language;
  project: Project;
  derived: ProjectDerived;
  /** True until the project has been saved once: the primary button reads "Create project". */
  isNew: boolean;
  resume?: { files: string[]; updatedAt: string };
  onChange(project: Project): void;
  onContinue(): void;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onResume(): void;
  onReset(): void;
}

/** "1,5" -> "1.5"; whitespace trimmed; an empty field means "not given". */
export function normaliseEnergy(raw: string): string | undefined {
  const s = raw.trim().replace(',', '.');
  return s === '' ? undefined : s;
}

function emptyIdentifier(mode: IdentifierMode, previous: Identifier): Identifier {
  const resolverBase = 'resolverBase' in previous ? previous.resolverBase : '';
  switch (mode) {
    case 'gs1':
      return { mode, resolverBase, gtin: '', serial: '' };
    case 'gs1-giai':
      return { mode, resolverBase, giai: '' };
    case 'https':
      return { mode, uri: '' };
    case 'draft':
      return { mode, urn: '' };
  }
}
```

Rendering rules:

- Card 1 (`project.battery.title`): battery type `Select` (`data-testid="battery-type"`, options from `BATTERY_TYPES` labelled `project.batteryType.<type>`), role `Select` (`role`), energy `Input` (`energy-kwh`, `inputMode="decimal"`, value `project.energyKwh ?? ''`, `onChange` dispatches `{ ...project, energyKwh }` with `energyKwh` omitted when `normaliseEnergy` returns `undefined`), date `Input type="date"` (`placed-on-market`, omitted when empty).
- Card 2: `<ObligationsCard result={derived.obligations} manualCategory={project.manualCategory} onManualCategory={(c) => { const { manualCategory: _dropped, ...rest } = project; onChange(c ? { ...rest, manualCategory: c } : rest); }} />`.
- Card 3 (`project.identifier.title`): `Tabs value={project.identifier.mode}` with a `TabsTrigger` per `IDENTIFIER_MODES` (`data-testid={\`identifier-mode-${mode}\`}`), `onValueChange={(m) => onChange({ ...project, identifier: emptyIdentifier(m as IdentifierMode, project.identifier) })}`; inputs per mode with the listed test ids; when `!derived.identifier.ok` a `<p data-testid="identifier-error" className="text-destructive text-sm">{pick(lang, derived.identifier.message)}</p>`; in `draft` mode the hint `project.identifier.draft.hint`; beside the inputs `<QrPreview lang={lang} carrier={derived.carrier} />`.
- Primary button `data-testid="project-continue"`, label `project.create` when `isNew` else `project.continue`, `disabled={derived.meta === null}`.
- Resume card and import card as in the old `StartView` (`resume-card`, `import-draft`, `import-error`), the resume line showing the file count and saved time only.

- [ ] **Step 7: Run the view tests, expect PASS**

Run: `pnpm vitest run apps/web/test/views/ProjectView.test.tsx apps/web/test/views/QrPreview.test.tsx apps/web/test/i18n.test.ts`

- [ ] **Step 8: Wire the project screen in `App.tsx`**

```tsx
const [localProject, setLocalProject] = useState(() => defaultProject(`urn:passwerk:draft:${randomId()}`, ''));
const project = state.project ?? localProject;
const projectDerived = deriveProject(project, asOf);
const onProjectChange = (p: Project) => {
  if (state.project) dispatch({ type: 'setProject', project: p, at: nowIso() });
  else setLocalProject(p);
};
const onProjectContinue = () => {
  const at = nowIso();
  if (!state.project) dispatch({ type: 'setProject', project: localProject, at });
  dispatch({ type: 'goTo', step: 'upload', at });
};
```

`case 'project'` renders `<ProjectView lang={lang} project={project} derived={projectDerived} isNew={state.project === null} resume={state.project ? { files: state.files.map(f => f.name), updatedAt: state.updatedAt } : undefined} onChange={onProjectChange} onContinue={onProjectContinue} onImport={...} onResume={...} onReset={reset} />` (spread `resume` only when defined, as today). Remove the `defaultPassportId` state and the `StartView` import. `reachable('upload')` is `projectDerived.meta !== null`.

Update `apps/web/test/views/App.test.tsx`: the first test clicks `project-continue`, asserts `step === 'upload'` and `project?.batteryType === 'EV'`; the "drops an upload" test starts through `project-continue`.

- [ ] **Step 9: Run the web suite, typecheck, lint; commit**

Run: `pnpm vitest run apps/web/test && pnpm typecheck && pnpm lint:fix`

```bash
git add -A apps/web
git commit -m "feat(web): project screen with obligations check, identifier modes and QR preview"
```

---

### Task 4: Array composite schema walk, row model and whole-array validation

**Files:**
- Modify: `apps/web/src/workflow/compositeSchema.ts`
- Create: `apps/web/src/workflow/rows.ts`
- Modify: `apps/web/src/workflow/validateValue.ts`
- Test: `apps/web/test/compositeSchema.test.ts` (new), `apps/web/test/rows.test.ts` (new), `apps/web/test/validateValue.test.ts`

**Interfaces:**
- Produces:
  - `interface ElementLeaf { path: string; kind: 'scalar' | 'list' | 'rows'; required: boolean; rows?: ElementLeaf[] }`, `arrayElementLeaves(attributeId: string): ElementLeaf[]`, `compositeSchemaOf(attributeId: string): LeafSchema | null`
  - `LeafSchema.safeParse` issues gain `path?: PropertyKey[]`
  - `interface RowDraft { fields: Record<string, string>; nested: Record<string, RowDraft[]> }`, `emptyRow(): RowDraft`, `rowsFromValue(leaves: ElementLeaf[], value: unknown): RowDraft[]`, `buildRows(leaves: ElementLeaf[], rows: RowDraft[]): unknown[]`, `checkRows(attributeId: string, rows: RowDraft[]): { ok: true; value: unknown[] } | { ok: false; errors: { row: number; reason: string }[] }`
  - `validateValue(attributeId, path, value: string | unknown[], recordedAt?)` accepts a parsed array for an array composite.

- [ ] **Step 1: Write the failing schema tests**

`apps/web/test/compositeSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { arrayElementLeaves, compositeSchemaOf, isArrayComposite } from '@/workflow/compositeSchema.ts';

describe('arrayElementLeaves', () => {
  it('lists the scalar leaves of a material row with required flags', () => {
    expect(arrayElementLeaves('criticalRawMaterials')).toEqual([
      { path: 'name', kind: 'scalar', required: true },
      { path: 'identifier', kind: 'scalar', required: true },
      { path: 'massKg', kind: 'scalar', required: false },
      { path: 'location.componentName', kind: 'scalar', required: false },
      { path: 'location.componentId', kind: 'scalar', required: false },
    ]);
  });
  it('reports a nested string array as a list leaf', () => {
    const leaves = arrayElementLeaves('hazardousSubstances');
    expect(leaves.find((l) => l.path === 'impacts')).toEqual({ path: 'impacts', kind: 'list', required: false });
  });
  it('reports a nested object array as rows with its own leaves, and a record as language leaves', () => {
    const leaves = arrayElementLeaves('sparePartSources');
    expect(leaves.map((l) => l.path)).toEqual([
      'name.de', 'name.en', 'address.nationalCode', 'address.postalCode', 'address.street', 'email', 'website', 'components',
    ]);
    const components = leaves.find((l) => l.path === 'components');
    expect(components?.kind).toBe('rows');
    expect(components?.rows).toEqual([
      { path: 'partName', kind: 'scalar', required: true },
      { path: 'partNumber', kind: 'scalar', required: true },
    ]);
    expect(leaves.find((l) => l.path === 'address.street')?.required).toBe(false);
  });
  it('is empty for an object composite and for an unknown id', () => {
    expect(arrayElementLeaves('manufacturerInformation')).toEqual([]);
    expect(arrayElementLeaves('nope')).toEqual([]);
    expect(isArrayComposite('originalPowerCapability')).toBe(true);
  });
  it('compositeSchemaOf parses a whole value', () => {
    const schema = compositeSchemaOf('componentPartNumbers');
    expect(schema?.safeParse([{ partName: 'a', partNumber: 'b' }]).success).toBe(true);
    const bad = schema?.safeParse([{ partName: '' }]);
    expect(bad?.success).toBe(false);
    if (bad && !bad.success) expect(bad.error.issues[0]?.path).toEqual([0, 'partName']);
  });
});
```

`Location` is `z.object({ componentName, componentId })` with both fields optional (`packages/core/src/model/composites.ts:4`), hence the two `location.*` leaves.

- [ ] **Step 2: Run to see it fail**

Run: `pnpm vitest run apps/web/test/compositeSchema.test.ts`

- [ ] **Step 3: Extend `compositeSchema.ts`**

Change `LeafSchema`:

```ts
export interface LeafSchema {
  safeParse(
    value: unknown,
  ):
    | { success: true }
    | { success: false; error: { issues: { message: string; path?: PropertyKey[] }[] } };
}
```

Add after `isArrayComposite`:

```ts
export interface ElementLeaf {
  /** Dotted path inside one row. */
  path: string;
  /** `scalar`: one input; `list`: a comma-separated string array; `rows`: a nested row editor. */
  kind: 'scalar' | 'list' | 'rows';
  /** False when the leaf, or any object above it, is optional. */
  required: boolean;
  rows?: ElementLeaf[];
}

/** The whole composite schema (an array for a row composite), for parsing a complete value. */
export function compositeSchemaOf(attributeId: string): LeafSchema | null {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  return schema ? (schema as unknown as LeafSchema) : null;
}

function isOptional(node: unknown): boolean {
  const type = defOf(node).type;
  return type === 'optional' || type === 'nullable' || type === 'default';
}

function leavesOfObject(node: unknown, prefix: string, requiredAbove: boolean, depth: number): ElementLeaf[] {
  if (depth > MAX_DEPTH) return [];
  const out: ElementLeaf[] = [];
  const { def } = unwrap(node);
  for (const [key, child] of Object.entries(def.shape ?? {})) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    const required = requiredAbove && !isOptional(child);
    const inner = unwrap(child);
    if (inner.def.type === 'object') {
      out.push(...leavesOfObject(inner.node, path, required, depth + 1));
    } else if (inner.def.type === 'record') {
      for (const lang of LANGUAGE_KEYS) out.push({ path: `${path}.${lang}`, kind: 'scalar', required: false });
    } else if (inner.def.type === 'array') {
      const element = unwrap(inner.def.element);
      if (element.def.type === 'object') {
        out.push({ path, kind: 'rows', required, rows: leavesOfObject(element.node, '', true, depth + 1) });
      } else {
        out.push({ path, kind: 'list', required });
      }
    } else if (!CONTAINERS.has(inner.def.type)) {
      out.push({ path, kind: 'scalar', required });
    }
  }
  return out;
}

/** The leaves of one row of an array composite; empty for anything else. */
export function arrayElementLeaves(attributeId: string): ElementLeaf[] {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  if (!schema) return [];
  const { def } = unwrap(schema);
  if (def.type !== 'array') return [];
  const element = unwrap(def.element);
  return element.def.type === 'object' ? leavesOfObject(element.node, '', true, 0) : [];
}
```

Zod 4 keeps `min(1)` as a check, not a wrapper, so `unwrap` on `z.array(...).min(1)` reports `array`; `def.element` is the element schema.

- [ ] **Step 4: Run the schema test, expect PASS** (adjust the `location` expectation to what core declares, see Step 1)

- [ ] **Step 5: Write the failing row-model tests**

`apps/web/test/rows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { arrayElementLeaves } from '@/workflow/compositeSchema.ts';
import { buildRows, checkRows, emptyRow, rowsFromValue } from '@/workflow/rows.ts';

const material = arrayElementLeaves('criticalRawMaterials');
const supplier = arrayElementLeaves('sparePartSources');

describe('rows', () => {
  it('builds objects from typed fields, omitting blanks', () => {
    const rows = [{ ...emptyRow(), fields: { name: ' Lithium ', identifier: '7439-93-2', massKg: '' } }];
    expect(buildRows(material, rows)).toEqual([{ name: 'Lithium', identifier: '7439-93-2' }]);
  });
  it('splits list leaves on commas and nests rows', () => {
    const row = {
      fields: { 'name.de': 'Werk', 'name.en': 'Plant', email: 'a@b.c' },
      nested: { components: [{ fields: { partName: 'Cell', partNumber: 'C-1' }, nested: {} }] },
    };
    expect(buildRows(supplier, [row])).toEqual([
      { name: { de: 'Werk', en: 'Plant' }, email: 'a@b.c', components: [{ partName: 'Cell', partNumber: 'C-1' }] },
    ]);
    const hazardous = arrayElementLeaves('hazardousSubstances');
    expect(
      buildRows(hazardous, [{ fields: { name: 'Pb', identifier: '7439-92-1', impacts: 'a, b,,c' }, nested: {} }]),
    ).toEqual([{ name: 'Pb', identifier: '7439-92-1', impacts: ['a', 'b', 'c'] }]);
  });
  it('drops an object whose leaves are all blank', () => {
    const rows = [{ fields: { 'name.de': 'x', 'address.street': '' }, nested: {} }];
    expect(buildRows(supplier, rows)).toEqual([{ name: { de: 'x' } }]);
  });
  it('round-trips an existing value into row drafts', () => {
    const value = [{ name: 'Lithium', identifier: '7439-93-2', massKg: '1.5' }];
    const drafts = rowsFromValue(material, value);
    expect(drafts).toEqual([{ fields: { name: 'Lithium', identifier: '7439-93-2', massKg: '1.5' }, nested: {} }]);
    expect(buildRows(material, drafts)).toEqual(value);
    const nested = rowsFromValue(supplier, [{ name: { en: 'P' }, components: [{ partName: 'a', partNumber: 'b' }], website: 'w' }]);
    expect(nested[0]?.nested['components']).toEqual([{ fields: { partName: 'a', partNumber: 'b' }, nested: {} }]);
  });
  it('checkRows reports per-row issues and returns the parsed value on success', () => {
    const bad = checkRows('criticalRawMaterials', [
      { fields: { name: 'Li', identifier: 'x' }, nested: {} },
      { fields: { name: '', identifier: 'y' }, nested: {} },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.row).toBe(1);
    expect(checkRows('criticalRawMaterials', [])).toMatchObject({ ok: false });
    const good = checkRows('criticalRawMaterials', [{ fields: { name: 'Li', identifier: 'x' }, nested: {} }]);
    expect(good).toEqual({ ok: true, value: [{ name: 'Li', identifier: 'x' }] });
  });
});
```

- [ ] **Step 6: Run to see it fail; implement `rows.ts`**

```ts
import { arrayElementLeaves, compositeSchemaOf, type ElementLeaf } from './compositeSchema.ts';

/** One row as the reviewer types it: scalar and list leaves as text, nested rows by leaf path. */
export interface RowDraft {
  fields: Record<string, string>;
  nested: Record<string, RowDraft[]>;
}

export const emptyRow = (): RowDraft => ({ fields: {}, nested: {} });

function setAt(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== 'object' || next === null) {
      const fresh: Record<string, unknown> = {};
      cursor[part] = fresh;
      cursor = fresh;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[parts[parts.length - 1] ?? ''] = value;
}

function getAt(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const part of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function buildRow(leaves: ElementLeaf[], row: RowDraft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const leaf of leaves) {
    if (leaf.kind === 'rows') {
      const nested = buildRows(leaf.rows ?? [], row.nested[leaf.path] ?? []);
      if (nested.length > 0) setAt(out, leaf.path, nested);
      continue;
    }
    const text = (row.fields[leaf.path] ?? '').trim();
    if (text === '') continue;
    if (leaf.kind === 'list') {
      const items = text.split(',').map((s) => s.trim()).filter((s) => s !== '');
      if (items.length > 0) setAt(out, leaf.path, items);
    } else {
      setAt(out, leaf.path, text);
    }
  }
  return out;
}

/** Typed rows as the objects core's schema expects; blank leaves and empty sub-objects are left out. */
export function buildRows(leaves: ElementLeaf[], rows: RowDraft[]): unknown[] {
  return rows.map((row) => buildRow(leaves, row));
}

/** An existing array value (draft or earlier decision) as editable rows. Unknown keys are dropped. */
export function rowsFromValue(leaves: ElementLeaf[], value: unknown): RowDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = emptyRow();
    for (const leaf of leaves) {
      const v = getAt(item, leaf.path);
      if (v === undefined) continue;
      if (leaf.kind === 'rows') row.nested[leaf.path] = rowsFromValue(leaf.rows ?? [], v);
      else if (leaf.kind === 'list') row.fields[leaf.path] = Array.isArray(v) ? v.map(String).join(', ') : String(v);
      else row.fields[leaf.path] = String(v);
    }
    return row;
  });
}

export type RowsCheck =
  | { ok: true; value: unknown[] }
  | { ok: false; errors: { row: number; reason: string }[] };

/** Build and parse against core's composite schema; issues are attributed to their row index. */
export function checkRows(attributeId: string, rows: RowDraft[]): RowsCheck {
  const schema = compositeSchemaOf(attributeId);
  if (!schema) return { ok: false, errors: [{ row: 0, reason: `${attributeId} is not a composite` }] };
  const value = buildRows(arrayElementLeaves(attributeId), rows);
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, value };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      row: typeof i.path?.[0] === 'number' ? i.path[0] : 0,
      reason: `${i.path?.slice(1).join('.') ?? ''}${i.path && i.path.length > 1 ? ': ' : ''}${i.message}`,
    })),
  };
}
```

- [ ] **Step 7: Run `rows.test.ts`, expect PASS**

- [ ] **Step 8: Add the array branch to `validateValue`**

Signature `value: string | unknown[]`. In the composite branch, before the `path === undefined` refusal:

```ts
  if (attribute.valueKind === 'composite') {
    if (path === undefined && Array.isArray(value)) {
      const schema = compositeSchemaOf(attributeId);
      if (!schema || !isArrayComposite(attributeId)) return invalid(attribute, 'not a list composite');
      const parsed = schema.safeParse(value);
      return parsed.success ? OK : invalid(attribute, reasonOf(parsed.error.issues));
    }
    if (path === undefined) { /* existing compositeWhole refusal */ }
    ...
  }
```

For a non-composite attribute with an array value return `invalid(attribute, 'expected a single value')`. Add to `apps/web/test/validateValue.test.ts`:

```ts
  it('accepts a parsed array for an array composite and still refuses a raw string', () => {
    expect(validateValue('criticalRawMaterials', undefined, [{ name: 'Li', identifier: 'x' }]).ok).toBe(true);
    expect(validateValue('criticalRawMaterials', undefined, [{ name: '' }]).ok).toBe(false);
    expect(validateValue('criticalRawMaterials', undefined, 'lithium').ok).toBe(false);
    expect(validateValue('ratedCapacity', undefined, ['1']).ok).toBe(false);
  });
```

- [ ] **Step 9: Run the three test files, lint, commit**

Run: `pnpm vitest run apps/web/test/compositeSchema.test.ts apps/web/test/rows.test.ts apps/web/test/validateValue.test.ts && pnpm lint:fix`

```bash
git add apps/web/src/workflow/compositeSchema.ts apps/web/src/workflow/rows.ts apps/web/src/workflow/validateValue.ts apps/web/test
git commit -m "feat(web): array composite schema walk and row model (#23)"
```

---

### Task 5: Row editor in the review screen

**Files:**
- Create: `apps/web/src/views/RowEditor.tsx`
- Modify: `apps/web/src/views/reviewModel.ts`, `apps/web/src/views/AddValueDialog.tsx`, `apps/web/src/views/ReviewView.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`
- Test: `apps/web/test/views/RowEditor.test.tsx` (new), `apps/web/test/reviewModel.test.ts`, `apps/web/test/views/ReviewView.test.tsx`, `apps/web/test/views/AddValueDialog.test.tsx`

**Interfaces:**
- Consumes: `arrayElementLeaves`, `isArrayComposite`, `RowDraft`, `emptyRow`, `rowsFromValue`, `checkRows` (Task 4).
- Produces:
  - `RowEditor` props: `{ lang; attributeId: string; initial?: unknown; onSave(rows: unknown[]): void; onCancel?(): void }`
  - `RowEditorDialog` props: `{ lang; attributeId; initial?: unknown; open: boolean; onOpenChange(open: boolean): void; onSave(rows: unknown[]): void }`
  - `interface ArrayEntry { attributeId: string; name: LangText; rows: number; origin: 'draft' | 'manual' }`, `arrayEntries(category: BatteryCategory, draft: PassportDraft, decisions: Record<DecisionKey, Decision>): ArrayEntry[]`
  - `attributeChoices(category)` includes array composites.
  - `ReviewView` props gain `arrays: ArrayEntry[]` and `arrayRows(attributeId: string): unknown`.
  - test ids: `rows-row` (with `data-row`), `rows-add`, `rows-remove`, `rows-field-<path>` (nested: `rows-field-<path>-<index>-<subpath>`), `rows-save`, `rows-error`, `array-entry` (with `data-attribute`), `array-edit`.

- [ ] **Step 1: i18n keys** (English; add German twins)

```ts
  'rows.title': 'Rows for {attribute}',
  'rows.add': 'Add row',
  'rows.remove': 'Remove row',
  'rows.save': 'Save rows',
  'rows.cancel': 'Cancel',
  'rows.count': '{count} rows',
  'rows.edit': 'Edit rows',
  'rows.list.hint': 'Comma-separated',
  'rows.required': 'required',
  'rows.error': 'Row {row}: {reason}',
  'rows.empty': 'At least one row is required.',
  'review.arrays': 'List values',
```

- [ ] **Step 2: Write the failing tests**

`apps/web/test/views/RowEditor.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RowEditor } from '@/views/RowEditor.tsx';
import { mount } from './render.tsx';

describe('RowEditor', () => {
  it('starts with one empty row, refuses a blank required leaf per row, then saves typed rows', () => {
    const onSave = vi.fn();
    mount(<RowEditor lang="en" attributeId="criticalRawMaterials" onSave={onSave} />);
    expect(screen.getAllByTestId('rows-row')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('rows-add'));
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
    const field = (row: number, path: string) =>
      screen.getAllByTestId('rows-row')[row]?.querySelector(`[data-testid="rows-field-${path}"]`) as HTMLInputElement;
    fireEvent.change(field(0, 'name'), { target: { value: 'Lithium' } });
    fireEvent.change(field(0, 'identifier'), { target: { value: '7439-93-2' } });
    fireEvent.change(field(1, 'name'), { target: { value: 'Cobalt' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('rows-error').textContent).toMatch(/Row 2/);
    fireEvent.change(field(1, 'identifier'), { target: { value: '7440-48-4' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([
      { name: 'Lithium', identifier: '7439-93-2' },
      { name: 'Cobalt', identifier: '7440-48-4' },
    ]);
  });
  it('prefills from an existing value and removes a row', () => {
    const onSave = vi.fn();
    mount(
      <RowEditor
        lang="de"
        attributeId="componentPartNumbers"
        initial={[{ partName: 'Cell', partNumber: 'C-1' }, { partName: 'Module', partNumber: 'M-1' }]}
        onSave={onSave}
      />,
    );
    expect(screen.getAllByTestId('rows-row')).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId('rows-remove')[1] as HTMLElement);
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([{ partName: 'Cell', partNumber: 'C-1' }]);
    expect(screen.getByText('Zeile hinzufügen')).toBeTruthy();
  });
  it('edits nested rows', () => {
    const onSave = vi.fn();
    mount(<RowEditor lang="en" attributeId="sparePartSources" onSave={onSave} />);
    fireEvent.change(screen.getByTestId('rows-field-name.en'), { target: { value: 'Plant' } });
    fireEvent.click(screen.getByTestId('rows-add-components'));
    fireEvent.change(screen.getByTestId('rows-field-components-0-partName'), { target: { value: 'Cell' } });
    fireEvent.change(screen.getByTestId('rows-field-components-0-partNumber'), { target: { value: 'C-1' } });
    fireEvent.click(screen.getByTestId('rows-save'));
    expect(onSave).toHaveBeenCalledWith([{ name: { en: 'Plant' }, components: [{ partName: 'Cell', partNumber: 'C-1' }] }]);
  });
});
```

Add to `apps/web/test/reviewModel.test.ts`:

```ts
  it('attributeChoices includes array composites', () => {
    expect(attributeChoices('EV').map((c) => c.id)).toContain('criticalRawMaterials');
  });
  it('arrayEntries lists array values from the draft and from manual decisions', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const fromDraft = arrayEntries('EV', draft, {});
    expect(fromDraft.find((e) => e.attributeId === 'criticalRawMaterials')).toMatchObject({ origin: 'draft' });
    expect(fromDraft.every((e) => e.rows > 0)).toBe(true);
    const withManual = arrayEntries('EV', draft, {
      criticalRawMaterials: { kind: 'manual', attributeId: 'criticalRawMaterials', value: [{ name: 'Li', identifier: 'x' }] },
    });
    expect(withManual.find((e) => e.attributeId === 'criticalRawMaterials')).toEqual({
      attributeId: 'criticalRawMaterials',
      name: expect.objectContaining({ de: expect.any(String), en: expect.any(String) }),
      rows: 1,
      origin: 'manual',
    });
  });
```

`ReviewView.test.tsx`: add `arrays={[{ attributeId: 'criticalRawMaterials', name: { de: 'Kritische Rohstoffe', en: 'Critical raw materials' }, rows: 2, origin: 'draft' }]}` and `arrayRows={() => (getSample('ev-valid') as PassportDraft).attributes['criticalRawMaterials']?.value}` to the existing props; assert an `array-entry` with text "2 rows" and that clicking `array-edit` opens a dialog with two `rows-row`.

`AddValueDialog.test.tsx`: add a case: select `criticalRawMaterials`, expect `rows-row` instead of `add-value-input`; fill name and identifier; click `rows-save`; expect `onAdd` called with `{ kind: 'manual', attributeId: 'criticalRawMaterials', value: [{ name: 'Li', identifier: 'x' }] }`.

- [ ] **Step 3: Run to see them fail**

Run: `pnpm vitest run apps/web/test/views/RowEditor.test.tsx apps/web/test/reviewModel.test.ts`

- [ ] **Step 4: Implement `RowEditor.tsx`**

```tsx
import { getAttribute } from '@passwerk/rules';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type Language, pick, t } from '../i18n/index.ts';
import { arrayElementLeaves, type ElementLeaf } from '../workflow/compositeSchema.ts';
import { checkRows, emptyRow, type RowDraft, rowsFromValue } from '../workflow/rows.ts';

function RowFields({
  lang,
  leaves,
  row,
  prefix,
  onChange,
}: {
  lang: Language;
  leaves: ElementLeaf[];
  row: RowDraft;
  /** '' at the top level; `<path>-<index>` inside a nested editor (keeps test ids unique). */
  prefix: string;
  onChange(row: RowDraft): void;
}) {
  const id = (path: string) => (prefix === '' ? `rows-field-${path}` : `rows-field-${prefix}-${path}`);
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {leaves.map((leaf) =>
        leaf.kind === 'rows' ? (
          <div key={leaf.path} className="md:col-span-2 grid gap-1 border-l pl-2">
            <Label>{leaf.path}{leaf.required ? ` (${t(lang, 'rows.required')})` : ''}</Label>
            {(row.nested[leaf.path] ?? []).map((sub, i) => (
              <div key={`${leaf.path}-${i}`} className="grid gap-1" data-testid="rows-nested">
                <RowFields
                  lang={lang}
                  leaves={leaf.rows ?? []}
                  row={sub}
                  prefix={prefix === '' ? `${leaf.path}-${i}` : `${prefix}-${leaf.path}-${i}`}
                  onChange={(next) => {
                    const list = [...(row.nested[leaf.path] ?? [])];
                    list[i] = next;
                    onChange({ ...row, nested: { ...row.nested, [leaf.path]: list } });
                  }}
                />
                <Button size="sm" variant="ghost" data-testid={`rows-remove-${leaf.path}`} onClick={() => {
                  const list = (row.nested[leaf.path] ?? []).filter((_, j) => j !== i);
                  onChange({ ...row, nested: { ...row.nested, [leaf.path]: list } });
                }}>{t(lang, 'rows.remove')}</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" data-testid={`rows-add-${leaf.path}`} onClick={() =>
              onChange({ ...row, nested: { ...row.nested, [leaf.path]: [...(row.nested[leaf.path] ?? []), emptyRow()] } })
            }>{t(lang, 'rows.add')}</Button>
          </div>
        ) : (
          <div key={leaf.path} className="grid gap-1">
            <Label htmlFor={id(leaf.path)}>
              {leaf.path}{leaf.required ? ` (${t(lang, 'rows.required')})` : ''}
              {leaf.kind === 'list' ? ` · ${t(lang, 'rows.list.hint')}` : ''}
            </Label>
            <Input
              id={id(leaf.path)}
              data-testid={id(leaf.path)}
              value={row.fields[leaf.path] ?? ''}
              onChange={(e) => onChange({ ...row, fields: { ...row.fields, [leaf.path]: e.target.value } })}
            />
          </div>
        ),
      )}
    </div>
  );
}

export function RowEditor({
  lang,
  attributeId,
  initial,
  onSave,
  onCancel,
}: {
  lang: Language;
  attributeId: string;
  initial?: unknown;
  onSave(rows: unknown[]): void;
  onCancel?(): void;
}) {
  const leaves = arrayElementLeaves(attributeId);
  const [rows, setRows] = useState<RowDraft[]>(() => {
    const from = rowsFromValue(leaves, initial);
    return from.length > 0 ? from : [emptyRow()];
  });
  const [errors, setErrors] = useState<{ row: number; reason: string }[]>([]);
  const save = () => {
    if (rows.length === 0) {
      setErrors([{ row: -1, reason: t(lang, 'rows.empty') }]);
      return;
    }
    const check = checkRows(attributeId, rows);
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors([]);
    onSave(check.value);
  };
  return (
    <div className="grid gap-3">
      {rows.map((row, i) => (
        <div key={`row-${i}`} className="grid gap-2 rounded-md border p-2" data-testid="rows-row" data-row={i}>
          <RowFields lang={lang} leaves={leaves} row={row} prefix="" onChange={(next) => setRows(rows.map((r, j) => (j === i ? next : r)))} />
          <Button size="sm" variant="ghost" data-testid="rows-remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            {t(lang, 'rows.remove')}
          </Button>
        </div>
      ))}
      {errors.map((e, i) => (
        <p key={`err-${i}`} className="text-destructive text-sm" data-testid="rows-error">
          {e.row < 0 ? e.reason : t(lang, 'rows.error', { row: e.row + 1, reason: e.reason })}
        </p>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" data-testid="rows-add" onClick={() => setRows([...rows, emptyRow()])}>{t(lang, 'rows.add')}</Button>
        <Button data-testid="rows-save" onClick={save}>{t(lang, 'rows.save')}</Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>{t(lang, 'rows.cancel')}</Button>}
      </div>
    </div>
  );
}

export function RowEditorDialog(props: {
  lang: Language;
  attributeId: string;
  initial?: unknown;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSave(rows: unknown[]): void;
}) {
  const name = getAttribute(props.attributeId)?.name;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(props.lang, 'rows.title', { attribute: name ? pick(props.lang, name) : props.attributeId })}</DialogTitle>
        </DialogHeader>
        {props.open && (
          <RowEditor lang={props.lang} attributeId={props.attributeId} initial={props.initial} onSave={(rows) => { props.onSave(rows); props.onOpenChange(false); }} onCancel={() => props.onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Nested row test ids: with `prefix=''` a nested row of `components` at index 0 gets `rows-field-components-0-partName`, matching the test.

- [ ] **Step 5: `reviewModel.ts` changes**

Remove the `isArrayComposite` filter from `attributeChoices`. Add:

```ts
export interface ArrayEntry {
  attributeId: string;
  name: LangText;
  rows: number;
  origin: 'draft' | 'manual';
}

/** Array composites that currently hold rows: from a manual decision first, else from the draft. */
export function arrayEntries(
  category: BatteryCategory,
  draft: PassportDraft,
  decisions: Record<DecisionKey, Decision>,
): ArrayEntry[] {
  return getAttributesForCategory(category, ['mandatory', 'conditional', 'optional'])
    .filter((a) => isArrayComposite(a.id))
    .flatMap((a) => {
      const d = decisions[a.id];
      if (d?.kind === 'manual' && Array.isArray(d.value)) {
        return [{ attributeId: a.id, name: a.name, rows: d.value.length, origin: 'manual' as const }];
      }
      const value = (draft.attributes as Record<string, { value?: unknown } | undefined>)[a.id]?.value;
      return Array.isArray(value) ? [{ attributeId: a.id, name: a.name, rows: value.length, origin: 'draft' as const }] : [];
    })
    .sort((x, y) => x.attributeId.localeCompare(y.attributeId));
}

/** The rows an editor should open with for an array composite. */
export function currentRows(attributeId: string, draft: PassportDraft, decisions: Record<DecisionKey, Decision>): unknown {
  const d = decisions[attributeId];
  if (d?.kind === 'manual' && Array.isArray(d.value)) return d.value;
  return (draft.attributes as Record<string, { value?: unknown } | undefined>)[attributeId]?.value;
}
```

- [ ] **Step 6: `AddValueDialog.tsx`**

When `isArrayComposite(attributeId)`: render `<RowEditor lang={lang} attributeId={attributeId} onSave={(rows) => { onAdd({ kind: 'manual', attributeId, value: rows }); setOpen(false); setAttributeId(''); }} />` in place of the leaf select, value, unit and submit button. Keep the manual card in `ReviewView` rendering `Array.isArray(d.value) ? t(lang, 'rows.count', { count: d.value.length }) : d.value`.

- [ ] **Step 7: `ReviewView.tsx`**

New props `arrays: ArrayEntry[]` and `arrayRows(attributeId: string): unknown`. Under the manual cards, a section titled `review.arrays` when `arrays.length > 0`: one `Card` per entry (`data-testid="array-entry"`, `data-attribute`), showing `pick(lang, name)`, `rows.count`, the origin as a small badge (`review.manual` for manual), and a `Button data-testid="array-edit"` that sets `editing = attributeId`. One `RowEditorDialog` at the bottom with `open={editing !== null}` and `initial={editing ? props.arrayRows(editing) : undefined}`; the view has no decisions prop, so it takes `arrayRows(attributeId: string): unknown`, supplied by `App.tsx` as `(id) => currentRows(id, derived.draft, state.decisions)`. `onSave` dispatches `onDecide({ kind: 'manual', attributeId: editing, value: rows })`.

- [ ] **Step 8: `App.tsx`**: pass `arrays={arrayEntries(derived.meta.category, derived.draft, state.decisions)}`, `arrayRows={(id) => currentRows(id, derived.draft, state.decisions)}`.

- [ ] **Step 9: Run the web suite, typecheck, lint; commit**

```bash
pnpm vitest run apps/web/test && pnpm typecheck && pnpm lint:fix
git add -A apps/web
git commit -m "feat(web): row editor for array composites in the review screen (closes #23)"
```

---

### Task 6: Facts screen with edit and map

**Files:**
- Create: `apps/web/src/workflow/factsModel.ts`, `apps/web/src/views/FactsView.tsx`
- Modify: `apps/web/src/views/AddValueDialog.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/views/UploadView.tsx` (continue label), `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`
- Test: `apps/web/test/factsModel.test.ts` (new), `apps/web/test/views/FactsView.test.tsx` (new), `apps/web/test/views/AddValueDialog.test.tsx`, `apps/web/test/views/App.test.tsx`

**Interfaces:**
- Consumes: `Derived.facts`, `Derived.proposals`, `FactEdit`, `Decision` (Task 2); `AddValueDialog` (Task 5 shape).
- Produces:
  - `type FactStatus = { status: 'mapped'; attributeId: string } | { status: 'proposed' } | { status: 'unmapped' }`, `factStatuses(facts: Fact[], proposals: MappingProposal[], decisions: Record<DecisionKey, Decision>): Record<string, FactStatus>`
  - `interface FactsFilter { document: string | 'all'; status: 'all' | 'mapped' | 'proposed' | 'unmapped'; search: string }`, `filterFacts(facts: Fact[], statuses, filter: FactsFilter, lang): Fact[]`
  - `FactsView` props: `{ lang; facts: Fact[]; documents: string[]; edits: Record<string, FactEdit>; statuses: Record<string, FactStatus>; onEdit(factId: string, edit: FactEdit): void; onClearEdit(factId: string): void; onMap(fact: Fact): void; onContinue(): void }`
  - `AddValueDialog` props gain `prefill?: { factId: string; value: string; unit?: string }`, `open?: boolean`, `onOpenChange?(open: boolean): void`, `hideTrigger?: boolean`; the dispatched manual decision carries `factId` when prefilled.
  - test ids: `fact-row` (with `data-fact`, `data-status`), `fact-value`, `fact-edited`, `fact-edit`, `fact-edit-value`, `fact-edit-unit`, `fact-edit-save`, `fact-edit-reset`, `fact-map`, `facts-document`, `facts-status`, `facts-search`, `facts-count`, `facts-continue`.

- [ ] **Step 1: i18n keys** (English; add German twins)

```ts
  'facts.title': 'Extracted facts',
  'facts.hint': 'What the documents say, with page or cell. Correct a value here before it becomes a proposal.',
  'facts.search': 'Search …',
  'facts.document.all': 'All documents',
  'facts.status.all': 'All',
  'facts.status.mapped': 'mapped',
  'facts.status.proposed': 'proposed',
  'facts.status.unmapped': 'unmapped',
  'facts.col.label': 'Label',
  'facts.col.value': 'Value',
  'facts.col.unit': 'Unit',
  'facts.col.kind': 'Kind',
  'facts.col.source': 'Source',
  'facts.col.status': 'Status',
  'facts.edit': 'Edit',
  'facts.save': 'Save',
  'facts.reset': 'Reset',
  'facts.map': 'Map',
  'facts.edited': 'edited',
  'facts.empty': 'No facts for this filter.',
  'facts.count': '{shown} of {total} facts',
  'facts.continue': 'Continue to review',
  'upload.continue': 'Continue to facts ({count} proposals)',
```

- [ ] **Step 2: Failing model tests**

`apps/web/test/factsModel.test.ts`:

```ts
import type { Fact, MappingProposal } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { factStatuses, filterFacts } from '@/workflow/factsModel.ts';

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id, label: 'Nennkapazität', labelKey: 'nennkapazitaet', raw: '94,5', value: '94.5', kind: 'decimal',
  unit: 'Ah', lang: 'de', shape: 'kv', source: { file: 'a.pdf', page: 1 }, ...over,
});
const proposal = (factId: string): MappingProposal => ({
  attributeId: 'ratedCapacity', value: '94.5', factId, confidence: 0.9,
  source: [{ file: 'a.pdf', page: 1 }], why: { de: 'x', en: 'x' }, checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
});

describe('factStatuses', () => {
  it('marks mapped, proposed and unmapped', () => {
    const facts = [fact('a'), fact('b'), fact('c')];
    const s = factStatuses(facts, [proposal('a'), proposal('b')], {
      ratedCapacity: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a' },
    });
    expect(s['a']).toEqual({ status: 'mapped', attributeId: 'ratedCapacity' });
    expect(s['b']).toEqual({ status: 'proposed' });
    expect(s['c']).toEqual({ status: 'unmapped' });
  });
  it('a manual decision with a factId counts as mapped; a reject does not', () => {
    const s = factStatuses([fact('a'), fact('b')], [proposal('b')], {
      nominalVoltage: { kind: 'manual', attributeId: 'nominalVoltage', value: '1', factId: 'a' },
      ratedCapacity: { kind: 'reject', attributeId: 'ratedCapacity', factId: 'b' },
    });
    expect(s['a']).toEqual({ status: 'mapped', attributeId: 'nominalVoltage' });
    expect(s['b']).toEqual({ status: 'proposed' });
  });
});

describe('filterFacts', () => {
  const facts = [fact('a'), fact('b', { source: { file: 'b.xlsx', cell: 'B2' }, label: 'Voltage' })];
  const statuses = factStatuses(facts, [proposal('a')], {});
  it('filters by document, status and text', () => {
    expect(filterFacts(facts, statuses, { document: 'b.xlsx', status: 'all', search: '' }, 'en').map((f) => f.id)).toEqual(['b']);
    expect(filterFacts(facts, statuses, { document: 'all', status: 'unmapped', search: '' }, 'en').map((f) => f.id)).toEqual(['b']);
    expect(filterFacts(facts, statuses, { document: 'all', status: 'all', search: 'b2' }, 'en').map((f) => f.id)).toEqual(['b']);
    expect(filterFacts(facts, statuses, { document: 'all', status: 'all', search: 'nenn' }, 'en').map((f) => f.id)).toEqual(['a']);
  });
});
```

- [ ] **Step 3: Implement `factsModel.ts`**

```ts
import type { Fact, MappingProposal } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import type { Decision, DecisionKey } from './state.ts';

export type FactStatus =
  | { status: 'mapped'; attributeId: string }
  | { status: 'proposed' }
  | { status: 'unmapped' };

/** mapped: an accept, edit or manual decision names the fact; proposed: a proposal exists; else unmapped. */
export function factStatuses(
  facts: Fact[],
  proposals: MappingProposal[],
  decisions: Record<DecisionKey, Decision>,
): Record<string, FactStatus> {
  const mapped = new Map<string, string>();
  for (const d of Object.values(decisions)) {
    if (d.kind === 'reject' || d.factId === undefined) continue;
    if (!mapped.has(d.factId)) mapped.set(d.factId, d.attributeId);
  }
  const proposed = new Set(proposals.map((p) => p.factId));
  const out: Record<string, FactStatus> = {};
  for (const f of facts) {
    const attributeId = mapped.get(f.id);
    out[f.id] =
      attributeId !== undefined
        ? { status: 'mapped', attributeId }
        : proposed.has(f.id)
          ? { status: 'proposed' }
          : { status: 'unmapped' };
  }
  return out;
}

export interface FactsFilter {
  document: string | 'all';
  status: 'all' | FactStatus['status'];
  search: string;
}

export function filterFacts(
  facts: Fact[],
  statuses: Record<string, FactStatus>,
  filter: FactsFilter,
  _lang: Language,
): Fact[] {
  const q = filter.search.trim().toLowerCase();
  return facts.filter((f) => {
    if (filter.document !== 'all' && f.source.file !== filter.document) return false;
    if (filter.status !== 'all' && statuses[f.id]?.status !== filter.status) return false;
    if (!q) return true;
    const hay = [f.label, f.raw, f.value ?? '', f.unit ?? '', f.source.file, f.source.cell ?? '', String(f.source.page ?? '')]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}
```

- [ ] **Step 4: Failing view test**

`apps/web/test/views/FactsView.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import type { Fact } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FactsView } from '@/views/FactsView.tsx';
import { mount } from './render.tsx';

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
  id, label: 'Nennkapazität', labelKey: 'k', raw: '94,5', value: '94.5', kind: 'decimal', unit: 'Ah',
  lang: 'de', shape: 'kv', source: { file: 'a.pdf', page: 2 }, ...over,
});

describe('FactsView', () => {
  it('lists facts with provenance and status, edits a value and maps a fact', () => {
    const onEdit = vi.fn();
    const onMap = vi.fn();
    const facts = [fact('a'), fact('b', { source: { file: 'b.xlsx', cell: 'C3' }, value: '400', unit: 'V' })];
    mount(
      <FactsView
        lang="en"
        facts={facts}
        documents={['a.pdf', 'b.xlsx']}
        edits={{ b: { value: '401', unit: 'V' } }}
        statuses={{ a: { status: 'proposed' }, b: { status: 'unmapped' } }}
        onEdit={onEdit}
        onClearEdit={() => undefined}
        onMap={onMap}
        onContinue={() => undefined}
      />,
    );
    expect(screen.getAllByTestId('fact-row')).toHaveLength(2);
    expect(screen.getByText(/Page 2/)).toBeTruthy();
    expect(screen.getByText(/Cell C3/)).toBeTruthy();
    const rowB = screen.getAllByTestId('fact-row')[1] as HTMLElement;
    expect(rowB.getAttribute('data-status')).toBe('unmapped');
    expect(rowB.querySelector('[data-testid="fact-value"]')?.textContent).toBe('401');
    expect(rowB.querySelector('[data-testid="fact-edited"]')).toBeTruthy();
    fireEvent.click(rowB.querySelector('[data-testid="fact-edit"]') as HTMLElement);
    fireEvent.change(rowB.querySelector('[data-testid="fact-edit-value"]') as HTMLElement, { target: { value: '402' } });
    fireEvent.click(rowB.querySelector('[data-testid="fact-edit-save"]') as HTMLElement);
    expect(onEdit).toHaveBeenCalledWith('b', { value: '402', unit: 'V' });
    fireEvent.click(rowB.querySelector('[data-testid="fact-map"]') as HTMLElement);
    expect(onMap).toHaveBeenCalledWith(facts[1]);
  });
  it('renders German chrome and the count', () => {
    mount(
      <FactsView lang="de" facts={[fact('a')]} documents={['a.pdf']} edits={{}} statuses={{ a: { status: 'unmapped' } }}
        onEdit={() => undefined} onClearEdit={() => undefined} onMap={() => undefined} onContinue={() => undefined} />,
    );
    expect(screen.getByText('Extrahierte Fakten')).toBeTruthy();
    expect(screen.getByTestId('facts-count').textContent).toContain('1');
  });
});
```

- [ ] **Step 5: Implement `FactsView.tsx`**

A `Card` with the title, hint and a filter bar (document `Select` `facts-document` with `all` plus each document; status `Tabs` `facts-status-<status>`; search `Input` `facts-search`; `facts-count`; `facts-continue` button on the right), then a shadcn `Table` with the six columns. Each row (`fact-row`, `data-fact`, `data-status`): label; value cell showing `edits[f.id]?.value ?? f.value ?? f.raw` in `fact-value` plus a `fact-edited` badge when an edit exists; unit; `f.kind`; `<SourceRef lang source={[f.source]} />`; status badge (`facts.status.<status>` and the attribute id when mapped). Row actions: `fact-edit` toggles an inline editor (`fact-edit-value`, `fact-edit-unit` inputs, `fact-edit-save` calls `onEdit(f.id, { value, ...(unit ? { unit } : {}) })`; when an edit exists `fact-edit-reset` calls `onClearEdit`); `fact-map` calls `onMap(f)`. Filter state is `useState` inside the view; filtering runs through `filterFacts` with `statuses`. Empty result renders `facts.empty`.

- [ ] **Step 6: `AddValueDialog` prefill and controlled open**

```ts
export interface AddValueDialogProps {
  lang: Language;
  category: BatteryCategory;
  onAdd(d: Decision): void;
  /** A fact from the facts screen: value and unit prefilled, provenance kept through `factId`. */
  prefill?: { factId: string; value: string; unit?: string };
  open?: boolean;
  onOpenChange?(open: boolean): void;
  hideTrigger?: boolean;
}
```

`const [ownOpen, setOwnOpen] = useState(false); const open = props.open ?? ownOpen; const setOpen = (v: boolean) => { setOwnOpen(v); props.onOpenChange?.(v); };` Initial `value`/`unit` state from `prefill` (use a `key={prefill?.factId ?? 'new'}` on the dialog from the caller so a new prefill remounts it). The dispatched manual decision spreads `...(props.prefill ? { factId: props.prefill.factId } : {})`. The trigger button renders unless `hideTrigger`.

Test in `AddValueDialog.test.tsx`: render with `open prefill={{ factId: 'a.pdf#1:0', value: '400', unit: 'V' }} hideTrigger`, choose `nominalVoltage`, click `add-submit`, expect `onAdd` called with `{ kind: 'manual', attributeId: 'nominalVoltage', value: '400', unit: 'V', factId: 'a.pdf#1:0' }`.

- [ ] **Step 7: Wire in `App.tsx`**

- `const [mapFact, setMapFact] = useState<Fact | null>(null);`
- `case 'facts'`: `if (!derived) return null;` render `<FactsView lang facts={derived.facts.facts} documents={state.files.map(f => f.name)} edits={state.factEdits} statuses={factStatuses(derived.facts.facts, derived.proposals, state.decisions)} onEdit={(factId, edit) => dispatch({ type: 'editFact', factId, edit, at: nowIso() })} onClearEdit={(factId) => dispatch({ type: 'clearFactEdit', factId, at: nowIso() })} onMap={setMapFact} onContinue={() => dispatch({ type: 'goTo', step: 'review', at: nowIso() })} />` followed by `{mapFact && <AddValueDialog key={mapFact.id} lang category={derived.meta.category} open hideTrigger prefill={{ factId: mapFact.id, value: mapFact.value ?? mapFact.raw, ...(mapFact.unit ? { unit: mapFact.unit } : {}) }} onOpenChange={(o) => { if (!o) setMapFact(null); }} onAdd={(d) => { dispatch({ type: 'decide', decision: d, at: nowIso() }); setMapFact(null); }} />}`.
- Upload `onContinue` goes to `facts`; `reachable('facts')` is `state.facts !== null`.
- `App.test.tsx`: after the mocked ingest resolves, assert the upload continue button text contains "facts" (en) and that clicking it shows "Extracted facts".

- [ ] **Step 8: Run the web suite, typecheck, lint; commit**

```bash
pnpm vitest run apps/web/test && pnpm typecheck && pnpm lint:fix
git add -A apps/web
git commit -m "feat(web): facts screen with provenance, edits and map-to-attribute"
```

---

### Task 7: QR panel on the gaps and export screen

**Files:**
- Modify: `apps/web/src/views/GapsExportView.tsx`, `apps/web/src/app/App.tsx`
- Test: `apps/web/test/views/GapsExportView.test.tsx`

**Interfaces:**
- Consumes: `QrPreview`, `CarrierView`, `ExportKind`.
- Produces: `GapsExportView` props gain `carrier: CarrierView`; `onExport(kind: ExportKind)`.

- [ ] **Step 1: Failing test**

Add to `GapsExportView.test.tsx` (existing props plus `carrier`):

```tsx
  it('shows the QR preview beside the export bar, or the reason there is none', () => {
    const onExport = vi.fn();
    const { unmount } = mount(<GapsExportView {...props} carrier={{ ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', payload: 'https://p.example/1' }} onExport={onExport} />);
    expect(screen.getByTestId('qr-image')).toBeTruthy();
    fireEvent.click(screen.getByTestId('qr-download'));
    expect(onExport).toHaveBeenCalledWith('qr');
    unmount();
    mount(<GapsExportView {...props} carrier={{ ok: false, message: { de: 'kein', en: 'none' } }} onExport={onExport} />);
    expect(screen.getByTestId('qr-none').textContent).toContain('none');
    expect(screen.queryByTestId('export-qr')).toBeNull();
  });
```

- [ ] **Step 2: Implement**

In the export `Card`, wrap the buttons and a `<QrPreview lang={lang} carrier={props.carrier} onDownload={() => props.onExport('qr')} />` in a two-column grid. Remove the `export-qr` button (the QR download lives in the panel; the `data-testid="qr-download"` is the new contract). `App.tsx` passes `carrier={derived.carrier}`. The `exportError` line stays for emitter failures.

- [ ] **Step 3: Run, lint, commit**

```bash
pnpm vitest run apps/web/test/views && pnpm typecheck && pnpm lint:fix
git add -A apps/web
git commit -m "feat(web): QR preview panel on the export screen"
```

---

### Task 8: Playwright tracks

**Files:**
- Modify: `apps/web/e2e/helpers.ts`, `apps/web/e2e/musterwerk.spec.ts`, `apps/web/e2e/golden.spec.ts`, `apps/web/e2e/persistence.spec.ts`, `apps/web/e2e/sovereignty.spec.ts`
- Create: `apps/web/e2e/project.spec.ts`, `apps/web/e2e/facts.spec.ts`, `apps/web/e2e/rows.spec.ts`

**Interfaces:**
- Consumes every `data-testid` listed in Tasks 3, 5, 6 and 7.
- Produces: `startProject(page, { batteryType?, energyKwh?, identifier: { mode: 'https'; uri } | { mode: 'gs1'; resolverBase; gtin; serial } })` in `helpers.ts`.

- [ ] **Step 1: Rewrite `startProject` in `helpers.ts`**

```ts
export interface StartOptions {
  batteryType?: 'EV' | 'LMT' | 'INDUSTRIAL' | 'PORTABLE';
  energyKwh?: string;
  identifier:
    | { mode: 'https'; uri: string }
    | { mode: 'gs1'; resolverBase: string; gtin: string; serial: string };
}

/** Fill the project screen and continue to the upload step. */
export async function startProject(page: Page, opts: StartOptions): Promise<void> {
  await page.goto('/');
  if (opts.batteryType && opts.batteryType !== 'EV') {
    await page.getByTestId('battery-type').click();
    await page.getByRole('option', { name: LABEL[opts.batteryType] }).click();
  }
  if (opts.energyKwh !== undefined) await page.getByTestId('energy-kwh').fill(opts.energyKwh);
  await page.getByTestId(`identifier-mode-${opts.identifier.mode}`).click();
  if (opts.identifier.mode === 'https') {
    await page.getByTestId('identifier-uri').fill(opts.identifier.uri);
  } else {
    await page.getByTestId('identifier-resolver').fill(opts.identifier.resolverBase);
    await page.getByTestId('identifier-gtin').fill(opts.identifier.gtin);
    await page.getByTestId('identifier-serial').fill(opts.identifier.serial);
  }
  await page.getByTestId('project-continue').click();
  await expect(page.getByTestId('file-input')).toBeVisible();
}
const LABEL = { EV: /Elektrofahrzeug/, LMT: /LMT|leichte Verkehrsmittel/i, INDUSTRIAL: /^Industriebatterie$/, PORTABLE: /Gerätebatterie|Portable/ };
```

The default language is German; the labels above must match the German `project.batteryType.*` values written in Task 3 (copy them verbatim when writing the regexes). Every existing spec that called `startProject(page, { category: 'EV', passportId: PASSPORT_ID })` now calls `startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } })`. `expectedMusterwerk()` stays as it is (category `EV`).

- [ ] **Step 2: Adapt `musterwerk.spec.ts`**

After the upload assertions, click `continue` (now leads to facts), assert `facts-count` contains the number of facts core extracted (`expected.facts.facts.length`, expose `facts` from the helper), click `facts-continue`, then the existing review and gaps assertions. Before the upload, assert the derived category on the project screen (inside `startProject` when `batteryType` is `EV` or unset: `await expect(page.getByTestId('obligation-category')).toContainText('EV')`). The pinned CLOCK (2026-09-05) is before the 2027-02-18 start, so the verdict reads `not_required` while the category is still derived; `project.spec.ts` proves `required` with a placed-on-market date in 2027.

- [ ] **Step 3: Adapt `golden.spec.ts`, `persistence.spec.ts`, `sovereignty.spec.ts`**

- `golden.spec.ts`: unchanged apart from the QR comment; the HTML download stays.
- `persistence.spec.ts`: after uploading two fixtures, open facts, edit the first fact's value to `123` and save, continue to review, accept three groups, wait, reload; assert the summary text, the three accepted groups, and that the facts screen (`step-facts`) shows the first row with `fact-edited`. Replace the fixed 500 ms wait with `await expect.poll(async () => page.evaluate(() => indexedDB.databases().then((d) => d.length)), { timeout: 5000 }).toBeGreaterThan(0)` followed by `page.waitForTimeout(400)` (the debounce is 300 ms; the poll only proves the database exists).
- `sovereignty.spec.ts`: the track now also visits the facts screen (edit one fact, map one fact through `fact-map` and `add-submit` with attribute `nominalVoltage`) and the project screen again through `step-project` (switch the identifier to GS1 with `96385074` / `SN-1` so the QR renders) before exporting. Assertions unchanged: no foreign origin, no beacons.

- [ ] **Step 4: `project.spec.ts`**

```ts
import { buildGs1DigitalLink, checkObligations } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, pinClock } from './helpers.ts';

test('industrial battery: threshold, voluntary category, timeline as core', async ({ page }) => {
  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('battery-type').click();
  await page.getByRole('option', { name: /^Industriebatterie$/ }).click();
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'insufficient_input');
  await page.getByTestId('energy-kwh').fill('1,5');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'not_required');
  await expect(page.getByTestId('manual-category')).toBeVisible();
  await expect(page.getByTestId('project-continue')).toBeDisabled();
  await page.getByTestId('manual-category').click();
  await page.getByRole('option', { name: /2 kWh/ }).click();
  await expect(page.getByTestId('project-continue')).toBeEnabled();
  await page.getByTestId('energy-kwh').fill('3');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'not_required'); // before 2027-02-18
  await expect(page.getByTestId('obligation-category')).toContainText('2 kWh');
  await page.getByTestId('placed-on-market').fill('2027-03-01');
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'required');
  const expected = checkObligations({ batteryType: 'INDUSTRIAL', role: 'manufacturer', energyKwh: '3', placedOnMarketDate: '2027-03-01', asOf: CLOCK });
  const ids = await page.getByTestId('timeline-entry').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
  expect(ids).toEqual(expected.timeline.map((e) => e.id));
});

test('portable battery: no derived category, select appears', async ({ page }) => {
  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('battery-type').click();
  await page.getByRole('option', { name: /Gerätebatterie/ }).click();
  await expect(page.getByTestId('obligation-verdict')).toHaveAttribute('data-verdict', 'not_required');
  await expect(page.getByTestId('manual-category')).toBeVisible();
});

test('GS1 identifier: QR preview payload equals core, wrong check digit blocks', async ({ page }) => {
  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('identifier-mode-gs1').click();
  await page.getByTestId('identifier-resolver').fill('https://id.example.com');
  await page.getByTestId('identifier-gtin').fill('96385075');
  await page.getByTestId('identifier-serial').fill('SN-1');
  await expect(page.getByTestId('identifier-error')).toContainText('Prüfziffer');
  await expect(page.getByTestId('project-continue')).toBeDisabled();
  await page.getByTestId('identifier-gtin').fill('96385074');
  await expect(page.getByTestId('qr-image')).toBeVisible();
  await expect(page.getByTestId('qr-payload')).toHaveText(
    buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'SN-1' }),
  );
  await expect(page.getByTestId('project-continue')).toBeEnabled();
});
```

Replace the German option regexes with the exact `de.ts` labels from Task 3.

- [ ] **Step 5: `facts.spec.ts`**

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('facts: an edited value reaches the draft; a mapped fact keeps its provenance', async ({ page }) => {
  await pinClock(page);
  await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 1)); // lieferantenerklaerung.pdf
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();

  // Edit the first proposed fact.
  await page.getByTestId('facts-status-proposed').click();
  const row = page.getByTestId('fact-row').first();
  const factId = await row.getAttribute('data-fact');
  await row.getByTestId('fact-edit').click();
  await row.getByTestId('fact-edit-value').fill('777');
  await row.getByTestId('fact-edit-save').click();
  await expect(row.getByTestId('fact-edited')).toBeVisible();

  // Map the first unmapped fact to nominalVoltage.
  await page.getByTestId('facts-status-unmapped').click();
  const unmapped = page.getByTestId('fact-row').first();
  const unmappedId = await unmapped.getAttribute('data-fact');
  await unmapped.getByTestId('fact-map').click();
  await page.getByTestId('add-attribute').click();
  await page.getByRole('option', { name: /nominalVoltage/ }).click();
  await page.getByTestId('add-value-input').fill('400');
  await page.getByTestId('add-unit-input').fill('V');
  await page.getByTestId('add-submit').click();
  await expect(page.locator(`[data-testid="fact-row"][data-fact="${unmappedId}"]`)).toHaveAttribute('data-status', 'mapped');

  await page.getByTestId('facts-continue').click();
  await page.getByTestId('filter-all').click();
  await page.locator(`[data-testid="proposal"][data-fact="${factId}"]`).first().getByTestId('accept').click();
  await page.getByTestId('to-gaps').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-draft').click()]);
  const draft = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
  const values = JSON.stringify(draft.attributes);
  expect(values).toContain('"777"');
  expect(draft.attributes.nominalVoltage.value).toBe('400');
  expect(draft.attributes.nominalVoltage.source[0].file).toBe('lieferantenerklaerung.pdf');
});
```

If the first proposed fact of that fixture maps to a composite leaf or a non-decimal attribute, pick the first `fact-row` whose proposal is scalar by checking the review screen in a probe run and pin the fact id in the spec with a comment; the value `777` must be accepted by that attribute's schema.

- [ ] **Step 6: `rows.spec.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyMappings, getSample, validate } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, pinClock } from './helpers.ts';

test('row editor: rows saved on ev-valid equal core for the same draft', async ({ page }) => {
  const draft = getSample('ev-valid');
  const path = join(tmpdir(), 'passwerk-rows-ev-valid.json');
  writeFileSync(path, JSON.stringify(draft));
  const rows = [{ name: 'Lithium', identifier: '7439-93-2' }, { name: 'Cobalt', identifier: '7440-48-4', massKg: '1.5' }];
  const expected = validate(
    applyMappings(draft, [{ attributeId: 'criticalRawMaterials', value: rows, override: true }]).draft,
    { asOf: CLOCK },
  );

  await pinClock(page);
  await page.goto('/');
  await page.getByTestId('import-draft').setInputFiles(path);
  await page.locator('[data-testid="array-entry"][data-attribute="criticalRawMaterials"]').getByTestId('array-edit').click();
  const rowCount = await page.getByTestId('rows-row').count();
  for (let i = rowCount - 1; i >= 0; i--) await page.getByTestId('rows-remove').nth(i).click();
  await page.getByTestId('rows-add').click();
  await page.getByTestId('rows-field-name').fill('Lithium');
  await page.getByTestId('rows-save').click();
  await expect(page.getByTestId('rows-error')).toContainText('Zeile 1');
  await page.getByTestId('rows-field-identifier').fill('7439-93-2');
  await page.getByTestId('rows-add').click();
  const second = page.getByTestId('rows-row').nth(1);
  await second.getByTestId('rows-field-name').fill('Cobalt');
  await second.getByTestId('rows-field-identifier').fill('7440-48-4');
  await second.getByTestId('rows-field-massKg').fill('1.5');
  await page.getByTestId('rows-save').click();
  await expect(page.locator('[data-testid="array-entry"][data-attribute="criticalRawMaterials"]')).toContainText('2');

  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-draft').click()]);
  const exported = JSON.parse(readFileSync((await download.path()) ?? '', 'utf8'));
  expect(exported.attributes.criticalRawMaterials.value).toEqual(rows);
});
```

- [ ] **Step 7: Build and run the suite**

Run: `pnpm build && pnpm build:web && pnpm e2e`
Expected: every spec passes. Fix selectors against the real labels; never weaken an oracle comparison.

- [ ] **Step 8: Commit**

```bash
git add apps/web/e2e
git commit -m "test(web): Playwright tracks for project, facts, row editor and QR"
```

---

### Task 9: Records, verification and PR

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/BUILD_PLAN.md` (Phase 7a entry), `AGENTS.md` (status), `docs/superpowers/specs/2026-09-07-web-app-complete-design.md` (section 3: `manualCategory` replaces `category` plus `categorySource`)

- [ ] **Step 1: ADR D-036**

Append to `docs/DECISIONS.md`:

```markdown
## D-036: Proposals are derived; project inputs and fact edits are state; the QR is a derivation (2026-09-07)

**Context.** The first web slice stored proposals as inputs, computed once at upload with the
category chosen on the start screen. The project screen makes the battery type editable and
derives the category from `checkObligations`, so stored proposals would strand the moment the
type changed. Reviewers also asked to correct extracted values before mapping (a mis-read
decimal on a datasheet), and array composites had no entry path at all (#23). The QR needs an
absolute https identifier, which the start screen could not help with.

**Decision.** State v2 keeps only inputs: `project` (battery type, role, energy, placed-on-market
date, an optional hand-picked category, the identifier in one of four modes, `createdAt`),
`importedDraft`, files, facts, `factEdits` keyed by fact id, and decisions. Proposals, the
obligations result, the passport meta, the base draft, the validation and the QR are derived by
memoised pure functions keyed on their own inputs, so a language toggle recomputes nothing and a
battery type change re-proposes. A decision whose proposal is absent under the current category
is ignored and returns with it. A fact edit is an override applied before `suggestMappings`;
the marker is looked up at render time and never written into a fact. When the obligations
check derives no category or says no passport is required, the user may pick a category for a
voluntary passport; a derived category always wins over the hand-picked one. Array composites
are entered as rows validated against core's composite schema before dispatch as one manual
decision carrying the whole array. The QR is a derivation of the passport identifier, shown on
the project and export screens; a non-https identifier shows core's reason (D-035 stands). A
stored v1 session is reported as not restorable, never migrated.

**Consequences.** `ingestFiles` returns summaries and facts only. `Decision.manual` gains an
optional `factId` so a value mapped from the facts screen keeps provenance. Chrome labels for
core's battery types and roles live in the app dictionary; every legal string still comes from
core. Issue #23 closes. The bring-your-own-key mode ships in its own PR with its own ADR.
```

- [ ] **Step 2: Build plan and AGENTS status**

In `docs/BUILD_PLAN.md`, under Phase 7a add: "**Second slice done (2026-09-07):** project screen (obligations, voluntary category, identifier modes, QR preview), facts screen (edit, map), row editor for array composites (#23), state v2 with derived proposals (ADR D-036). Remaining: bring-your-own-key, own PR." In `AGENTS.md` add a status bullet "**Phase 7a, second slice (`apps/web`): done.** …" (three lines, same content) and change **Next** to "BYOK for the web app (own PR, D-002 boundary), then Phase 7b, then 7c."

In the spec, section 3, replace the `category` and `categorySource` fields by `manualCategory?: BatteryCategory` and the sentence "A derived category always wins; the hand-picked one applies only when the check derives none." Section 4's derivation line becomes `category = obligations.category ?? project.manualCategory`.

- [ ] **Step 3: Verification (real output, no "should")**

Run and paste the actual results into the PR description:

```
pnpm check
pnpm build && pnpm oracle
pnpm build:web && pnpm e2e
```

Oracle parity must still read 16/16.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs AGENTS.md
git commit -m "docs: ADR D-036 and Phase 7a second slice status"
git push -u origin feat/web-app-complete
gh pr create --title "feat(web): Phase 7a second slice (project, facts, row editor, QR preview)" --body-file <description>
```

PR description: what changed per package, the verification block, "Closes #23", the deferred BYOK note, and the session link `https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1` as the last line.
