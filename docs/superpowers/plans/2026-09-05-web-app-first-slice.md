# Web App First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `apps/web`, a client-side React app that uploads supplier documents, reviews core's mapping proposals, shows the gap report and exports AAS files, proven by Playwright against core's own results.

**Architecture:** One Vite package in three layers with a tested import direction: `workflow` (pure TypeScript over `@passwerk/core`, inputs-only state, derived verdicts), `views` (props-driven React on shadcn/ui), `app` (shell, IndexedDB autosave, wiring). Async work lives in event handlers; the store is read through `useSyncExternalStore`; no `useEffect` anywhere.

**Tech Stack:** Vite 8.2.2, React 19.2.8, TypeScript strict, Tailwind 4.3.3 (`@tailwindcss/vite`), shadcn CLI 4.19.1 (radix base), `idb-keyval` 6.3.0, Vitest 4 (root config, jsdom 30.0.1 for view tests), `@testing-library/react` 16.3.3, `@playwright/test` 1.62.1 (Chromium only).

**Spec:** `docs/superpowers/specs/2026-09-05-web-app-first-slice-design.md`

## Global Constraints

- Every new dependency is pinned to the exact versions listed in Task 2; all were published before 2026-09-02 and pass pnpm's `minimumReleaseAge` of 4320 minutes. If pnpm rejects a version, pin the previous release, never add an exclusion.
- No `useEffect` in any React file. Async work in event handlers; subscriptions through `useSyncExternalStore`; startup reads before the first render.
- Import direction `workflow` -> `views` -> `app`; `workflow` never imports React; `views` never imports `app`, `idb-keyval` or `main.tsx`. Task 3's boundary test enforces it.
- The wall clock is read only in `apps/web/src/app/clock.ts`. Reducer actions carry `at`; derivations take `asOf`.
- Every chrome string exists in `de.ts` and `en.ts` with the same key. Knowledge-base text comes from core's `{ de, en }` pairs.
- No `node:*` import anywhere under `apps/web/src`. No network call at runtime.
- Numbers pass through as core's canonical strings; the app never parses them except to hand the typed string to core.
- TypeScript settings from `tsconfig.base.json` apply: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`. Use conditional spreads for optional fields and bracket access for index signatures.
- Biome formats everything: single quotes, semicolons, trailing commas, line width 100. Run `pnpm lint:fix` before each commit.
- Commit as `shahriarbijoy <shahriarbijoy@gmail.com>` with Conventional Commits, ending the body with `Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V`.
- Run `pnpm check` before every commit that touches more than one package.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/core/test/extract.facts.test.ts` | Task 1 only: hook timeout |
| `pnpm-workspace.yaml`, `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `biome.json` | Root wiring for `apps/*` |
| `apps/web/package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `components.json`, `src/vite-env.d.ts`, `src/index.css` | App scaffold |
| `apps/web/src/components/ui/*` | shadcn primitives (generated) |
| `apps/web/src/lib/utils.ts` | shadcn `cn` helper (generated) |
| `apps/web/src/i18n/de.ts`, `en.ts`, `index.ts` | Chrome strings and `t()` |
| `apps/web/src/workflow/state.ts` | State types, initial state, decision keys |
| `apps/web/src/workflow/reducer.ts` | Actions and pure reducer |
| `apps/web/src/workflow/store.ts` | Minimal external store |
| `apps/web/src/workflow/derive.ts` | decisions -> draft, report, gap (memoised) |
| `apps/web/src/workflow/ingest.ts` | `ingestFiles` over core |
| `apps/web/src/workflow/draftIo.ts` | Draft JSON import and export |
| `apps/web/src/workflow/exports.ts` | AAS JSON, AASX, gap report files |
| `apps/web/src/views/parts/*.tsx` | `LangText`, `VerdictChip`, `ConfidenceBadge`, `SourceRef` |
| `apps/web/src/views/StartView.tsx`, `UploadView.tsx`, `ReviewView.tsx`, `AddValueDialog.tsx`, `GapsExportView.tsx` | Screens |
| `apps/web/src/app/clock.ts`, `useStore.ts`, `persistence.ts`, `download.ts`, `ErrorBoundary.tsx`, `App.tsx` | Shell |
| `apps/web/src/main.tsx` | Startup: load IndexedDB, create store, render |
| `apps/web/test/*.test.ts(x)` | Vitest |
| `apps/web/e2e/*.spec.ts`, `e2e/helpers.ts`, `playwright.config.ts` | Playwright |
| `.github/workflows/ci.yml` | `web` job |
| `docs/DECISIONS.md`, `docs/BUILD_PLAN.md`, `AGENTS.md`, `README.md` | Records |

---

### Task 1: Green main first (hook timeout fix PR)

**Files:**
- Modify: `packages/core/test/extract.facts.test.ts:54`

**Interfaces:** none.

- [ ] **Step 1: Branch from main**

```bash
git checkout main && git pull --ff-only && git checkout -b fix/core-extract-hook-timeout
```

- [ ] **Step 2: Raise the hook timeout**

In `packages/core/test/extract.facts.test.ts`, the `beforeAll(async () => { ... })` that ingests the five Musterwerk files ends with `});`. Change that closing to pass Vitest's per-hook timeout as the second argument:

```ts
}, 60_000);
```

Add one comment line above `beforeAll`:

```ts
// PDF ingest on the Windows CI runner exceeded Vitest's 10 s default under Node 24 (2026-09-05).
```

- [ ] **Step 3: Run the file**

Run: `pnpm vitest run packages/core/test/extract.facts.test.ts`
Expected: all tests pass.

- [ ] **Step 4: Commit, push, open the PR**

```bash
pnpm lint:fix && git add packages/core/test/extract.facts.test.ts
git commit -m "fix(core): raise ingest hook timeout in extract.facts test" -m "Windows runner with Node 24 exceeded the 10 s default on 2026-09-05." -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
git push -u origin fix/core-extract-hook-timeout
gh pr create --title "fix(core): raise ingest hook timeout in extract.facts test" --body "Main went red on Windows/Node 24 with 'Hook timed out in 10000ms' in the PDF-ingesting beforeAll. Raises that hook's timeout to 60 s.

https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
git checkout feat/web-app-first-slice
```

Tell the owner the PR number. Continue on `feat/web-app-first-slice`; rebase onto main once the fix merges.

---

### Task 2: Scaffold `apps/web` and root wiring

**Files:**
- Modify: `pnpm-workspace.yaml`, `package.json`, `tsconfig.json`, `tsconfig.test.json`, `vitest.config.ts`, `biome.json`, `.gitignore`
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`, `apps/web/src/vite-env.d.ts`, `apps/web/src/index.css`, `apps/web/src/main.tsx`, `apps/web/test/smoke.test.ts`

**Interfaces:**
- Produces: the `@passwerk/web` package; `pnpm --filter @passwerk/web build` and `pnpm test` include it.

- [ ] **Step 1: Workspace and root scripts**

`pnpm-workspace.yaml`: add `  - apps/*` under `packages:`.

`package.json` scripts, add:

```json
"build:web": "pnpm --filter @passwerk/web build",
"e2e": "pnpm --filter @passwerk/web e2e",
```

and change `"typecheck"` to:

```json
"typecheck": "tsc -b && tsc -p tsconfig.test.json && tsc -p apps/web/tsconfig.json",
```

`.gitignore`: append

```
apps/web/playwright-report/
apps/web/test-results/
```

- [ ] **Step 2: App package.json**

Create `apps/web/package.json`:

```json
{
  "name": "@passwerk/web",
  "version": "0.0.0",
  "private": true,
  "description": "Client-side web app for building EU Digital Battery Passports from supplier documents",
  "license": "Apache-2.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "e2e": "playwright test",
    "clean": "rimraf dist playwright-report test-results"
  },
  "dependencies": {
    "@passwerk/core": "workspace:*",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "idb-keyval": "6.3.0",
    "lucide-react": "1.39.0",
    "pdfjs-dist": "6.3.289",
    "radix-ui": "1.6.7",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "tailwind-merge": "3.6.0"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@tailwindcss/vite": "4.3.3",
    "@testing-library/react": "16.3.3",
    "@testing-library/dom": "10.4.1",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.5",
    "@vitejs/plugin-react": "6.1.1",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "tw-animate-css": "1.4.0",
    "vite": "8.2.2"
  }
}
```

Run: `pnpm install`
Expected: succeeds. If pnpm reports a version younger than the release age, pin the previous patch release and note it in the commit body.

- [ ] **Step 3: Vite config, tsconfig, html, css, env types**

`apps/web/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { target: 'es2022', sourcemap: true },
});
```

`apps/web/tsconfig.json` (typecheck only; Vite emits):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "incremental": false,
    "declaration": false,
    "declarationMap": false,
    "sourceMap": false,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["vite/client", "node"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`apps/web/index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>passwerk</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/web/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`apps/web/src/index.css` (shadcn init rewrites this in Step 5; start minimal):

```css
@import 'tailwindcss';
```

`apps/web/src/main.tsx` placeholder (replaced in Task 14):

```tsx
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (root) createRoot(root).render(<main className="p-6 font-sans">passwerk</main>);
```

- [ ] **Step 4: Root typecheck, vitest projects, biome**

`tsconfig.json` (root) stays as is; the app is typechecked by the new script argument.

`tsconfig.test.json`: no change (the app has its own tsconfig).

`vitest.config.ts`: replace `test.include` with projects. Keep the alias block unchanged. New `test` block:

```ts
  test: {
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
    },
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'packages/*/src/**/*.test.ts',
            'tools/*/test/**/*.test.ts',
            'apps/web/test/**/*.test.ts',
          ],
        },
      },
      {
        test: {
          name: 'web-dom',
          environment: 'jsdom',
          include: ['apps/web/test/**/*.test.tsx'],
        },
      },
    ],
  },
```

Also add to the root `resolve.alias`: `'@': local('./apps/web/src')`. Add `plugins: [react()]` at the top level of the root Vitest config with `import react from '@vitejs/plugin-react';` (root gets `@vitejs/plugin-react` as a devDependency at the same pinned version: run `pnpm add -Dw @vitejs/plugin-react@6.1.1`).

`biome.json` `files.includes`: append `"!apps/web/src/components/ui"` is NOT done; generated files are linted like everything else. No change.

- [ ] **Step 5: shadcn init and components**

Run from the repo root:

```bash
pnpm dlx shadcn@4.19.1 init -y -b radix --no-monorepo -c apps/web
```

If the CLI asks anything interactively or fails to detect the project, write `apps/web/components.json` by hand and rerun the `add` line:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Then:

```bash
pnpm dlx shadcn@4.19.1 add -y -c apps/web button card badge input label select table tabs dialog alert-dialog progress separator sonner
pnpm lint:fix
```

Confirm `apps/web/src/components/ui/button.tsx` and `apps/web/src/lib/utils.ts` exist and `apps/web/src/index.css` now starts with `@import 'tailwindcss';` plus the shadcn theme block. If `init` added dependencies at versions younger than three days, pin them to the versions in Step 2.

- [ ] **Step 6: Smoke test**

`apps/web/test/smoke.test.ts`:

```ts
import { PACKAGE_NAME } from '@passwerk/core';
import { describe, expect, it } from 'vitest';

describe('apps/web wiring', () => {
  it('resolves @passwerk/core through the root alias', () => {
    expect(PACKAGE_NAME).toBe('@passwerk/core');
  });
});
```

- [ ] **Step 7: Verify build, test, lint, typecheck**

Run: `pnpm build && pnpm build:web && pnpm test && pnpm lint && pnpm typecheck`
Expected: `apps/web/dist/index.html` exists; the Vitest summary lists both projects; lint and typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore(web): scaffold apps/web with Vite, React, Tailwind and shadcn" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 3: Import-boundary test and i18n dictionary

**Files:**
- Create: `apps/web/test/boundary.test.ts`, `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/index.ts`, `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces: `type Language = 'de' | 'en'`, `type Key`, `t(lang: Language, key: Key, params?: Record<string, string | number>): string`, `pick(lang, text: { de: string; en: string }): string`.

- [ ] **Step 1: Boundary test (fails until the folders exist)**

`apps/web/test/boundary.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function layerOf(file: string): string {
  const rel = relative(SRC, file).split(sep);
  return rel.length > 1 ? (rel[0] ?? '') : 'root';
}

function imports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] ?? '');
}

const FORBIDDEN: Record<string, RegExp[]> = {
  workflow: [/^react/, /^@\/views/, /^@\/app/, /^@\/components/, /^idb-keyval/, /^\.\.?\/(views|app|components)/],
  views: [/^@\/app/, /^idb-keyval/, /^\.\.?\/app/, /main\.tsx$/],
  i18n: [/^react/, /^@\/(views|app|workflow|components)/],
};

describe('import boundaries (spec section 3)', () => {
  const files = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
  it('src has the three layers', () => {
    const layers = new Set(files.map(layerOf));
    expect(layers.has('workflow')).toBe(true);
    expect(layers.has('views')).toBe(true);
    expect(layers.has('app')).toBe(true);
  });
  for (const file of files) {
    const layer = layerOf(file);
    const rules = FORBIDDEN[layer];
    if (!rules) continue;
    it(`${relative(SRC, file)} respects the ${layer} boundary`, () => {
      const bad = imports(file).filter((spec) => rules.some((r) => r.test(spec)));
      expect(bad).toEqual([]);
    });
  }
  it('nothing under src imports node:*', () => {
    const bad = files.filter((f) => imports(f).some((s) => s.startsWith('node:')));
    expect(bad.map((f) => relative(SRC, f))).toEqual([]);
  });
});
```

Run: `pnpm vitest run apps/web/test/boundary.test.ts`
Expected: FAIL on "src has the three layers".

- [ ] **Step 2: Dictionary**

`apps/web/src/i18n/de.ts`:

```ts
export const de = {
  'app.title': 'passwerk',
  'app.tagline': 'Batteriepass aus Lieferantendokumenten',
  'app.language': 'Sprache',
  'app.notLegalAdvice': 'Keine Rechtsberatung. Quellen sind bei jedem Eintrag angegeben.',
  'app.startOver': 'Neu beginnen',
  'app.startOver.confirm': 'Alle Dateien, Vorschläge und Entscheidungen dieser Sitzung werden gelöscht.',
  'app.cancel': 'Abbrechen',
  'app.confirm': 'Bestätigen',
  'app.error.title': 'Etwas ist schiefgelaufen',
  'app.error.reload': 'Neu laden',
  'app.error.copy': 'Details kopieren',
  'app.storage.unavailable': 'Der Browser erlaubt keinen lokalen Speicher. Änderungen gehen beim Neuladen verloren.',
  'app.storage.version': 'Eine frühere Sitzung konnte nicht wiederhergestellt werden (anderes Datenformat).',
  'step.start': 'Start',
  'step.upload': 'Dokumente',
  'step.review': 'Prüfen',
  'step.gaps': 'Lücken & Export',
  'start.category': 'Batteriekategorie',
  'start.category.EV': 'Elektrofahrzeug (EV)',
  'start.category.LMT': 'Leichtes Verkehrsmittel (LMT)',
  'start.category.INDUSTRIAL_GT_2KWH': 'Industriebatterie > 2 kWh',
  'start.passportId': 'Passkennung (URI)',
  'start.passportId.hint': 'Vorbelegt mit einer Platzhalter-URN. Ersetzen Sie sie durch Ihr eigenes Kennungsschema.',
  'start.passportId.invalid': 'Bitte eine gültige URI angeben, z. B. urn:... oder https://...',
  'start.begin': 'Projekt anlegen',
  'start.import': 'Entwurf importieren (JSON)',
  'start.import.error': 'Der Entwurf konnte nicht gelesen werden: {reason}',
  'start.resume.title': 'Letzte Sitzung fortsetzen',
  'start.resume.saved': 'Gespeichert {at}',
  'start.resume.files': '{count} Dateien',
  'start.resume.button': 'Fortsetzen',
  'upload.title': 'Dokumente hochladen',
  'upload.hint': 'PDF, XLSX, DOCX, CSV oder TXT. Die Dateien verlassen den Browser nicht.',
  'upload.choose': 'Dateien auswählen',
  'upload.busy': 'Wird gelesen …',
  'upload.remove': 'Entfernen',
  'upload.col.file': 'Datei',
  'upload.col.format': 'Format',
  'upload.col.pages': 'Seiten',
  'upload.col.lang': 'Sprache',
  'upload.error.unsupported': 'Nicht unterstütztes Format',
  'upload.error.encrypted': 'Verschlüsselt, kann nicht gelesen werden',
  'upload.error.corrupt': 'Datei ist beschädigt',
  'upload.error.undecodable': 'Text konnte nicht dekodiert werden',
  'upload.error.limit_exceeded': 'Datei überschreitet die Größenbegrenzung',
  'upload.continue': 'Weiter zu {count} Vorschlägen',
  'upload.empty': 'Noch keine Dateien.',
  'review.title': 'Vorschläge prüfen',
  'review.filter.pending': 'Offen',
  'review.filter.accepted': 'Übernommen',
  'review.filter.rejected': 'Verworfen',
  'review.filter.all': 'Alle',
  'review.search': 'Suchen …',
  'review.accept': 'Übernehmen',
  'review.reject': 'Verwerfen',
  'review.edit': 'Bearbeiten',
  'review.save': 'Speichern',
  'review.clear': 'Zurücksetzen',
  'review.value': 'Wert',
  'review.unit': 'Einheit',
  'review.confidence': 'Konfidenz',
  'review.source': 'Quelle',
  'review.page': 'Seite {page}',
  'review.cell': 'Zelle {cell}',
  'review.edited': 'bearbeitet',
  'review.manual': 'manuell',
  'review.summary': '{accepted} übernommen, {pending} offen',
  'review.addValue': 'Wert hinzufügen',
  'review.addValue.attribute': 'Attribut',
  'review.addValue.leaf': 'Teilfeld',
  'review.addValue.whole': 'Gesamter Wert',
  'review.addValue.add': 'Hinzufügen',
  'review.conflict': 'Konflikt: vorhanden {existing}, neu {incoming}',
  'review.empty': 'Keine Vorschläge für diesen Filter.',
  'review.continue': 'Weiter zu Lücken & Export',
  'gaps.title': 'Lücken & Export',
  'gaps.verdict.valid': 'Gültig',
  'gaps.verdict.valid_with_warnings': 'Gültig mit Warnungen',
  'gaps.verdict.invalid': 'Ungültig',
  'gaps.layer': 'Ebene {layer}: {errors} Fehler, {warnings} Warnungen',
  'gaps.findings': 'Befunde',
  'gaps.completeness.mandatory': 'Pflichtangaben',
  'gaps.completeness.overall': 'Gesamt',
  'gaps.groupBy.owner': 'Nach Datenhalter',
  'gaps.groupBy.submodel': 'Nach Teilmodell',
  'gaps.bucket.required': 'Pflicht',
  'gaps.bucket.conditional': 'Bedingt',
  'gaps.bucket.deferred': 'Später',
  'gaps.bucket.optional': 'Optional',
  'gaps.status.present': 'vorhanden',
  'gaps.status.missing': 'fehlt',
  'gaps.status.conflict': 'Konflikt',
  'gaps.status.invalid': 'ungültig',
  'gaps.status.not_applicable': 'nicht anwendbar',
  'gaps.legalRefs': 'Rechtsgrundlage',
  'gaps.nextAction': 'Nächster Schritt',
  'gaps.verify': 'Eintrag noch nicht fachlich geprüft',
  'export.title': 'Export',
  'export.aasJson': 'AAS JSON',
  'export.aasx': 'AASX',
  'export.draft': 'Entwurf (JSON)',
  'export.gaps': 'Lückenbericht (JSON)',
  'export.verdictNote': 'Die Dateien tragen das Prüfergebnis: {verdict}.',
  'export.failed': 'Export nicht möglich: {reason}',
} as const;
```

`apps/web/src/i18n/en.ts` with the same keys (`export const en: Record<keyof typeof de, string> = { ... }`), English text, for example `'app.tagline': 'Battery passport from supplier documents'`, `'start.category.EV': 'Electric vehicle (EV)'`, `'upload.continue': 'Continue to {count} proposals'`, `'review.summary': '{accepted} accepted, {pending} pending'`, `'gaps.layer': 'Layer {layer}: {errors} errors, {warnings} warnings'`, `'export.verdictNote': 'The files carry the verdict: {verdict}.'`. Every key from `de.ts` must appear. Import the type: `import type { de } from './de.ts';`.

`apps/web/src/i18n/index.ts`:

```ts
import { de } from './de.ts';
import { en } from './en.ts';

export type Language = 'de' | 'en';
export type Key = keyof typeof de;
export type LangText = { de: string; en: string };

const DICT: Record<Language, Record<Key, string>> = { de, en };

export function t(lang: Language, key: Key, params: Record<string, string | number> = {}): string {
  const template = DICT[lang][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function pick(lang: Language, text: LangText): string {
  return text[lang];
}

export function verdictKey(verdict: 'valid' | 'valid_with_warnings' | 'invalid'): Key {
  return `gaps.verdict.${verdict}`;
}
```

- [ ] **Step 3: i18n test**

`apps/web/test/i18n.test.ts`:

```ts
import { de } from '@/i18n/de.ts';
import { en } from '@/i18n/en.ts';
import { t } from '@/i18n/index.ts';
import { describe, expect, it } from 'vitest';

describe('i18n dictionary', () => {
  it('de and en have identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });
  it('has no empty strings', () => {
    for (const dict of [de, en]) for (const [k, v] of Object.entries(dict)) expect(v, k).not.toBe('');
  });
  it('substitutes params', () => {
    expect(t('en', 'review.summary', { accepted: 3, pending: 2 })).toBe('3 accepted, 2 pending');
    expect(t('de', 'review.page', { page: 4 })).toBe('Seite 4');
  });
});
```

- [ ] **Step 4: Create the empty layer folders so the boundary test can pass**

Create `apps/web/src/workflow/.gitkeep`, `apps/web/src/views/.gitkeep`, `apps/web/src/app/.gitkeep` (removed as real files arrive).

Run: `pnpm vitest run apps/web/test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm lint:fix && git add -A && git commit -m "feat(web): i18n dictionary and import-boundary test" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 4: Workflow state, reducer and store

**Files:**
- Create: `apps/web/src/workflow/state.ts`, `apps/web/src/workflow/reducer.ts`, `apps/web/src/workflow/store.ts`, `apps/web/test/reducer.test.ts`
- Delete: `apps/web/src/workflow/.gitkeep`

**Interfaces:**
- Produces:
  - `STATE_VERSION = 1`, `type Step`, `interface FileSummary`, `type Decision`, `interface WorkflowState`, `initialState`, `decisionKey(attributeId, path?)`, `proposalKey(proposal)`.
  - `type Action` (see below), `reduce(state, action): WorkflowState`.
  - `createStore(initial): Store` with `getState()`, `dispatch(action)`, `subscribe(listener): () => void`.

- [ ] **Step 1: state.ts**

```ts
import type {
  BatteryCategory,
  FactSet,
  IngestError,
  MappingProposal,
  PassportDraft,
  PassportMeta,
} from '@passwerk/core';
import type { Language } from '../i18n/index.ts';

export const STATE_VERSION = 1 as const;
export type Step = 'start' | 'upload' | 'review' | 'gaps';
export const STEPS: readonly Step[] = ['start', 'upload', 'review', 'gaps'];

export interface FileSummary {
  name: string;
  size: number;
  sha256: string;
  format: string;
  pages: number;
  lang: 'de' | 'en';
  error?: IngestError;
}

/** `attributeId` alone, or `attributeId#path` for a composite leaf. */
export type DecisionKey = string;

export type Decision =
  | { kind: 'accept'; attributeId: string; path?: string; factId: string }
  | { kind: 'reject'; attributeId: string; path?: string; factId: string }
  | { kind: 'edit'; attributeId: string; path?: string; factId: string; value: string; unit?: string }
  | { kind: 'manual'; attributeId: string; path?: string; value: string; unit?: string };

export interface WorkflowState {
  version: typeof STATE_VERSION;
  step: Step;
  language: Language;
  meta: PassportMeta | null;
  baseDraft: PassportDraft | null;
  files: FileSummary[];
  facts: FactSet | null;
  proposals: MappingProposal[];
  decisions: Record<DecisionKey, Decision>;
  updatedAt: string;
}

export const initialState: WorkflowState = {
  version: STATE_VERSION,
  step: 'start',
  language: 'de',
  meta: null,
  baseDraft: null,
  files: [],
  facts: null,
  proposals: [],
  decisions: {},
  updatedAt: '1970-01-01T00:00:00Z',
};

export function decisionKey(attributeId: string, path?: string): DecisionKey {
  return path === undefined ? attributeId : `${attributeId}#${path}`;
}

export function proposalKey(p: MappingProposal): DecisionKey {
  return decisionKey(p.attributeId, p.path);
}

export function categoryOf(state: WorkflowState): BatteryCategory | undefined {
  return state.meta?.category;
}
```

- [ ] **Step 2: Failing reducer tests**

`apps/web/test/reducer.test.ts`:

```ts
import { getSample, type MappingProposal, type PassportDraft, SCHEMA_VERSION } from '@passwerk/core';
import { type Action, reduce } from '@/workflow/reducer.ts';
import { initialState, proposalKey, type WorkflowState } from '@/workflow/state.ts';
import { describe, expect, it } from 'vitest';

const AT = '2026-09-05T12:00:00Z';
const META = {
  schemaVersion: SCHEMA_VERSION,
  category: 'EV' as const,
  createdAt: AT,
  passportId: 'urn:passwerk:test:1',
};

const proposal = (over: Partial<MappingProposal>): MappingProposal => ({
  attributeId: 'ratedCapacity',
  value: '94.5',
  unit: 'Ah',
  factId: 'a.pdf:1',
  confidence: 0.9,
  source: [{ file: 'a.pdf', page: 1 }],
  why: { de: 'x', en: 'x' },
  checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' },
  ...over,
});

const facts = (files: string[]) => ({
  facts: files.map((file, i) => ({
    id: `${file}:${i}`,
    label: 'l',
    labelKey: 'l',
    raw: 'r',
    kind: 'text' as const,
    lang: 'de' as const,
    shape: 'kv' as const,
    source: { file, page: 1 },
  })),
  tables: [],
  documents: [],
});

function start(): WorkflowState {
  return reduce(initialState, { type: 'startProject', meta: META, at: AT });
}

describe('reducer', () => {
  it('startProject creates the base draft and moves to upload', () => {
    const s = start();
    expect(s.step).toBe('upload');
    expect(s.baseDraft?.meta).toEqual(META);
    expect(s.updatedAt).toBe(AT);
  });

  it('importDraft replaces the base and clears documents and decisions', () => {
    const s0 = reduce(start(), {
      type: 'filesIngested',
      summaries: [{ name: 'a.pdf', size: 1, sha256: 'x', format: 'pdf', pages: 1, lang: 'de' }],
      facts: facts(['a.pdf']),
      proposals: [proposal({})],
      at: AT,
    });
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(s0, { type: 'importDraft', draft, at: AT });
    expect(s.baseDraft).toBe(draft);
    expect(s.meta).toEqual(draft.meta);
    expect(s.files).toEqual([]);
    expect(s.proposals).toEqual([]);
    expect(s.decisions).toEqual({});
    expect(s.step).toBe('review');
  });

  it('accepting one proposal rejects its siblings in the same group', () => {
    const a = proposal({ factId: 'a.pdf:1' });
    const b = proposal({ factId: 'b.pdf:1', value: '90', source: [{ file: 'b.pdf', page: 1 }] });
    const s0 = reduce(start(), {
      type: 'filesIngested',
      summaries: [],
      facts: facts(['a.pdf', 'b.pdf']),
      proposals: [a, b],
      at: AT,
    });
    const s = reduce(s0, {
      type: 'decide',
      decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf:1' },
      at: AT,
    });
    expect(s.decisions[proposalKey(a)]).toEqual({
      kind: 'accept',
      attributeId: 'ratedCapacity',
      factId: 'a.pdf:1',
    });
    expect(Object.keys(s.decisions)).toEqual(['ratedCapacity']);
  });

  it('fileRemoved drops its summary, facts, proposals and decisions', () => {
    const a = proposal({ factId: 'a.pdf:0' });
    const b = proposal({ attributeId: 'nominalVoltage', factId: 'b.pdf:1', source: [{ file: 'b.pdf' }] });
    let s = reduce(start(), {
      type: 'filesIngested',
      summaries: [
        { name: 'a.pdf', size: 1, sha256: 'x', format: 'pdf', pages: 1, lang: 'de' },
        { name: 'b.pdf', size: 1, sha256: 'y', format: 'pdf', pages: 1, lang: 'de' },
      ],
      facts: facts(['a.pdf', 'b.pdf']),
      proposals: [a, b],
      at: AT,
    });
    s = reduce(s, { type: 'decide', decision: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'a.pdf:0' }, at: AT });
    s = reduce(s, { type: 'fileRemoved', name: 'a.pdf', at: AT });
    expect(s.files.map((f) => f.name)).toEqual(['b.pdf']);
    expect(s.facts?.facts.map((f) => f.source.file)).toEqual(['b.pdf']);
    expect(s.proposals.map((p) => p.factId)).toEqual(['b.pdf:1']);
    expect(s.decisions).toEqual({});
  });

  it('manual decisions survive file removal and clearDecision removes one key', () => {
    let s = start();
    s = reduce(s, { type: 'decide', decision: { kind: 'manual', attributeId: 'batteryChemistry', path: 'clearName', value: 'NMC' }, at: AT });
    s = reduce(s, { type: 'fileRemoved', name: 'none.pdf', at: AT });
    expect(Object.keys(s.decisions)).toEqual(['batteryChemistry#clearName']);
    s = reduce(s, { type: 'clearDecision', key: 'batteryChemistry#clearName', at: AT });
    expect(s.decisions).toEqual({});
  });

  it('reset returns the initial state but keeps the language', () => {
    let s = reduce(start(), { type: 'setLanguage', language: 'en', at: AT });
    s = reduce(s, { type: 'reset', at: AT });
    expect(s).toEqual({ ...initialState, language: 'en', updatedAt: AT });
  });

  it('every action stamps updatedAt from the action, never from the clock', () => {
    const s = reduce(start(), { type: 'goTo', step: 'start', at: '2030-01-01T00:00:00Z' } satisfies Action);
    expect(s.updatedAt).toBe('2030-01-01T00:00:00Z');
  });
});
```

Run: `pnpm vitest run apps/web/test/reducer.test.ts`
Expected: FAIL, module `@/workflow/reducer.ts` not found.

- [ ] **Step 3: reducer.ts**

```ts
import type { FactSet, MappingProposal, PassportDraft, PassportMeta } from '@passwerk/core';
import { newDraft } from '@passwerk/core';
import type { Language } from '../i18n/index.ts';
import {
  type Decision,
  type DecisionKey,
  decisionKey,
  type FileSummary,
  initialState,
  proposalKey,
  type Step,
  type WorkflowState,
} from './state.ts';

interface Stamped {
  at: string;
}

export type Action = Stamped &
  (
    | { type: 'startProject'; meta: PassportMeta }
    | { type: 'importDraft'; draft: PassportDraft }
    | { type: 'filesIngested'; summaries: FileSummary[]; facts: FactSet; proposals: MappingProposal[] }
    | { type: 'fileRemoved'; name: string }
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

function withoutFile(facts: FactSet | null, name: string): FactSet | null {
  if (!facts) return null;
  return {
    facts: facts.facts.filter((f) => f.source.file !== name),
    tables: facts.tables.filter((t) => t.source.file !== name),
    documents: facts.documents.filter((d) => d.name !== name),
  };
}

/** Drops accept/reject/edit decisions whose proposal no longer exists; manual ones stay. */
function pruneDecisions(
  decisions: Record<DecisionKey, Decision>,
  proposals: MappingProposal[],
): Record<DecisionKey, Decision> {
  const live = new Set(proposals.map((p) => `${proposalKey(p)}|${p.factId}`));
  const out: Record<DecisionKey, Decision> = {};
  for (const [key, d] of Object.entries(decisions)) {
    if (d.kind === 'manual' || live.has(`${key}|${d.factId}`)) out[key] = d;
  }
  return out;
}

function decide(state: WorkflowState, decision: Decision): Record<DecisionKey, Decision> {
  const key = decisionKey(decision.attributeId, decision.path);
  const next = { ...state.decisions };
  // One decision per key: the group's other proposals are implicitly rejected by not being chosen.
  next[key] = decision;
  return next;
}

export function reduce(state: WorkflowState, action: Action): WorkflowState {
  const stamp = { updatedAt: action.at };
  switch (action.type) {
    case 'startProject':
      return {
        ...state,
        ...stamp,
        meta: action.meta,
        baseDraft: newDraft(action.meta),
        files: [],
        facts: null,
        proposals: [],
        decisions: {},
        step: 'upload',
      };
    case 'importDraft':
      return {
        ...state,
        ...stamp,
        meta: action.draft.meta,
        baseDraft: action.draft,
        files: [],
        facts: null,
        proposals: [],
        decisions: {},
        step: 'review',
      };
    case 'filesIngested': {
      const replaced = new Set(action.summaries.map((s) => s.name));
      let facts = state.facts;
      for (const name of replaced) facts = withoutFile(facts, name);
      const merged = mergeFacts(facts, action.facts);
      const keptProposals = state.proposals.filter(
        (p) => !p.source.some((s) => replaced.has(s.file)),
      );
      const proposals = [...keptProposals, ...action.proposals];
      return {
        ...state,
        ...stamp,
        files: [...state.files.filter((f) => !replaced.has(f.name)), ...action.summaries],
        facts: merged,
        proposals,
        decisions: pruneDecisions(state.decisions, proposals),
      };
    }
    case 'fileRemoved': {
      const proposals = state.proposals.filter((p) => !p.source.some((s) => s.file === action.name));
      return {
        ...state,
        ...stamp,
        files: state.files.filter((f) => f.name !== action.name),
        facts: withoutFile(state.facts, action.name),
        proposals,
        decisions: pruneDecisions(state.decisions, proposals),
      };
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
      return { ...initialState, ...stamp, language: state.language };
  }
}
```

Note on the sibling test: with one decision per key, "accept rejects siblings" holds because the group has exactly one entry; the test asserts the key set is `['ratedCapacity']`.

- [ ] **Step 4: store.ts**

```ts
import type { Action } from './reducer.ts';
import { reduce } from './reducer.ts';
import type { WorkflowState } from './state.ts';

export interface Store {
  getState(): WorkflowState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
}

export function createStore(initial: WorkflowState): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

Append to `reducer.test.ts`:

```ts
import { createStore } from '@/workflow/store.ts';

describe('store', () => {
  it('notifies subscribers once per dispatch and unsubscribes', () => {
    const store = createStore(initialState);
    let n = 0;
    const off = store.subscribe(() => n++);
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    expect(n).toBe(1);
    expect(store.getState().language).toBe('en');
    off();
    store.dispatch({ type: 'setLanguage', language: 'de', at: AT });
    expect(n).toBe(1);
  });
});
```

- [ ] **Step 5: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS, clean.

```bash
git rm -q apps/web/src/workflow/.gitkeep; git add -A && git commit -m "feat(web): workflow state, reducer and store" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 5: Derivation (decisions to draft, report, gap)

**Files:**
- Create: `apps/web/src/workflow/derive.ts`, `apps/web/test/derive.test.ts`

**Interfaces:**
- Consumes: `WorkflowState`, `Decision` from Task 4.
- Produces: `decisionsToMappings(state): MappingDecision[]`, `interface Derived { draft: PassportDraft; conflicts: MappingConflict[]; report: ValidationReport; gap: GapReport; asOf: string }`, `derive(state, asOf): Derived | null` (null when `baseDraft` is null). Memoised on `(state, asOf)`.

- [ ] **Step 1: Failing tests**

`apps/web/test/derive.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, extractFacts, getSample, ingest, type PassportDraft, SCHEMA_VERSION, suggestMappings } from '@passwerk/core';
import { decisionsToMappings, derive } from '@/workflow/derive.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState, proposalKey } from '@/workflow/state.ts';
import { beforeAll, describe, expect, it } from 'vitest';

const AT = '2026-09-05T12:00:00Z';
const FIX = join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'test', 'fixtures', 'musterwerk');
const META = { schemaVersion: SCHEMA_VERSION, category: 'EV' as const, createdAt: AT, passportId: 'urn:passwerk:test:1' };

let withProposals = initialState;
beforeAll(async () => {
  const names = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'datasheet-en.csv'];
  const bundle = await ingest(names.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIX, name))) })));
  const facts = extractFacts(bundle);
  withProposals = reduce(reduce(initialState, { type: 'startProject', meta: META, at: AT }), {
    type: 'filesIngested',
    summaries: [],
    facts,
    proposals: suggestMappings(facts, { category: 'EV' }),
    at: AT,
  });
}, 60_000);

describe('derive', () => {
  it('returns null without a base draft', () => {
    expect(derive(initialState, AT)).toBeNull();
  });

  it('accepted proposals land in the draft with their provenance; rejected ones do not', () => {
    const [a, b] = withProposals.proposals.filter((p) => p.confidence >= 0.7 && p.path === undefined);
    if (!a || !b) throw new Error('need two proposals');
    let s = reduce(withProposals, { type: 'decide', decision: { kind: 'accept', attributeId: a.attributeId, factId: a.factId }, at: AT });
    s = reduce(s, { type: 'decide', decision: { kind: 'reject', attributeId: b.attributeId, factId: b.factId }, at: AT });
    const d = derive(s, AT);
    expect(d?.draft.attributes[a.attributeId]?.value).toBe(a.value);
    expect(d?.draft.attributes[a.attributeId]?.source).toEqual(a.source);
    expect(d?.draft.attributes[b.attributeId]).toBeUndefined();
  });

  it('edit keeps the provenance and replaces the value; manual carries none', () => {
    const p = withProposals.proposals.find((x) => x.confidence >= 0.7 && x.path === undefined);
    if (!p) throw new Error('need a proposal');
    let s = reduce(withProposals, { type: 'decide', decision: { kind: 'edit', attributeId: p.attributeId, factId: p.factId, value: '1', unit: p.unit }, at: AT });
    s = reduce(s, { type: 'decide', decision: { kind: 'manual', attributeId: 'batteryChemistry', path: 'clearName', value: 'Lithium nickel manganese cobalt oxide' }, at: AT });
    const mappings = decisionsToMappings(s);
    expect(mappings.find((m) => m.attributeId === p.attributeId)).toMatchObject({ value: '1', source: p.source, override: true });
    expect(mappings.find((m) => m.attributeId === 'batteryChemistry')).toEqual({
      attributeId: 'batteryChemistry',
      path: 'clearName',
      value: 'Lithium nickel manganese cobalt oxide',
      override: true,
    });
  });

  it('is byte-identical on re-run and memoised per state', () => {
    const d1 = derive(withProposals, AT);
    const d2 = derive(withProposals, AT);
    expect(d1).toBe(d2);
    const again = derive({ ...withProposals }, AT);
    expect(canonicalJson(again?.report)).toBe(canonicalJson(d1?.report));
    expect(canonicalJson(again?.gap)).toBe(canonicalJson(d1?.gap));
  });

  it('an imported golden sample validates as core says', () => {
    const draft = getSample('ev-valid') as PassportDraft;
    const s = reduce(initialState, { type: 'importDraft', draft, at: AT });
    expect(derive(s, AT)?.report.verdict).toBe('valid');
    const broken = getSample('lmt-wrong-date-format') as PassportDraft;
    const b = reduce(initialState, { type: 'importDraft', draft: broken, at: AT });
    expect(derive(b, AT)?.report.verdict).toBe('invalid');
  });
});
```

Run: `pnpm vitest run apps/web/test/derive.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 2: derive.ts**

```ts
import {
  applyMappings,
  gapReport,
  type GapReport,
  type MappingConflict,
  type MappingDecision,
  type PassportDraft,
  validate,
  type ValidationReport,
} from '@passwerk/core';
import type { Decision, WorkflowState } from './state.ts';

export interface Derived {
  draft: PassportDraft;
  conflicts: MappingConflict[];
  report: ValidationReport;
  gap: GapReport;
  asOf: string;
}

function toMapping(state: WorkflowState, d: Decision): MappingDecision | null {
  const path = d.path !== undefined ? { path: d.path } : {};
  if (d.kind === 'reject') return null;
  if (d.kind === 'manual') {
    return { attributeId: d.attributeId, ...path, value: d.value, ...(d.unit ? { unit: d.unit } : {}), override: true };
  }
  const p = state.proposals.find((x) => x.factId === d.factId && x.attributeId === d.attributeId && x.path === d.path);
  if (!p) return null;
  const value = d.kind === 'edit' ? d.value : p.value;
  const unit = d.kind === 'edit' ? d.unit : p.unit;
  return {
    attributeId: d.attributeId,
    ...path,
    value,
    ...(unit ? { unit } : {}),
    source: p.source,
    confidence: p.confidence,
    override: true,
  };
}

/** Accept, edit and manual decisions as core mapping decisions, in stable key order. */
export function decisionsToMappings(state: WorkflowState): MappingDecision[] {
  return Object.keys(state.decisions)
    .sort()
    .map((key) => state.decisions[key])
    .filter((d): d is Decision => d !== undefined)
    .map((d) => toMapping(state, d))
    .filter((m): m is MappingDecision => m !== null);
}

const cache = new WeakMap<WorkflowState, { asOf: string; derived: Derived | null }>();

export function derive(state: WorkflowState, asOf: string): Derived | null {
  const hit = cache.get(state);
  if (hit && hit.asOf === asOf) return hit.derived;
  let derived: Derived | null = null;
  if (state.baseDraft) {
    const { draft, conflicts } = applyMappings(state.baseDraft, decisionsToMappings(state));
    const report = validate(draft, { asOf });
    const gap = gapReport(draft, { report, asOf });
    derived = { draft, conflicts, report, gap, asOf };
  }
  cache.set(state, { asOf, derived });
  return derived;
}
```

- [ ] **Step 3: Run, lint, commit**

Run: `pnpm vitest run apps/web/test/derive.test.ts && pnpm lint:fix && pnpm typecheck`
Expected: PASS. If `applyMappings` rejects `override` on a path-less first write, read `packages/core/src/mapping/apply.ts:150-230`; `override` is accepted on both branches.

```bash
git add -A && git commit -m "feat(web): derive draft, report and gap from decisions" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 6: Ingest, draft import/export and export files

**Files:**
- Create: `apps/web/src/workflow/ingest.ts`, `apps/web/src/workflow/draftIo.ts`, `apps/web/src/workflow/exports.ts`, `apps/web/test/ingest.test.ts`, `apps/web/test/draftIo.test.ts`, `apps/web/test/exports.test.ts`

**Interfaces:**
- Produces:
  - `ingestFiles(inputs: { name: string; bytes: Uint8Array; size: number }[], options: { category: BatteryCategory; workerSrc?: string }): Promise<{ summaries: FileSummary[]; facts: FactSet; proposals: MappingProposal[] }>`
  - `importDraftJson(text: string): { ok: true; draft: PassportDraft } | { ok: false; message: LangText }`
  - `exportDraftJson(draft: PassportDraft): string`
  - `interface ExportFile { name: string; bytes: Uint8Array; type: string }`, `buildExports(derived: Derived): { files: ExportFile[]; verdict: Verdict } | { error: LangText }`
  - `slug(passportId: string): string`

- [ ] **Step 1: Failing tests**

`apps/web/test/ingest.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingestFiles } from '@/workflow/ingest.ts';
import { describe, expect, it } from 'vitest';

const FIX = join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'test', 'fixtures', 'musterwerk');
const file = (name: string) => {
  const bytes = new Uint8Array(readFileSync(join(FIX, name)));
  return { name, bytes, size: bytes.byteLength };
};

describe('ingestFiles', () => {
  it('summarises every file and proposes mappings', async () => {
    const out = await ingestFiles([file('stueckliste.xlsx'), file('datasheet-en.csv')], { category: 'EV' });
    expect(out.summaries.map((s) => [s.name, s.format, s.pages, s.lang])).toEqual([
      ['stueckliste.xlsx', 'xlsx', 3, 'de'],
      ['datasheet-en.csv', 'csv', 1, 'en'],
    ]);
    expect(out.summaries[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.proposals.length).toBeGreaterThan(0);
    expect(out.facts.facts.every((f) => ['stueckliste.xlsx', 'datasheet-en.csv'].includes(f.source.file))).toBe(true);
  }, 30_000);

  it('a corrupt file yields an error summary without failing the batch', async () => {
    const bad = { name: 'broken.xlsx', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), size: 7 };
    const out = await ingestFiles([bad, file('datasheet-en.csv')], { category: 'EV' });
    expect(out.summaries[0]?.error?.code).toBeDefined();
    expect(out.summaries[1]?.error).toBeUndefined();
  });
});
```

`apps/web/test/draftIo.test.ts`:

```ts
import { BROKEN_SAMPLE_NAMES, getSample, VALID_SAMPLE_NAMES } from '@passwerk/core';
import { exportDraftJson, importDraftJson } from '@/workflow/draftIo.ts';
import { describe, expect, it } from 'vitest';

describe('draft import/export', () => {
  it('imports every golden sample', () => {
    for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
      const r = importDraftJson(JSON.stringify(getSample(name)));
      expect(r.ok, name).toBe(true);
    }
  });
  it('rejects malformed JSON and a schema violation with a bilingual message', () => {
    const a = importDraftJson('{not json');
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.message.de.length).toBeGreaterThan(0);
    const b = importDraftJson(JSON.stringify({ meta: {}, attributes: {} }));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.message.en.length).toBeGreaterThan(0);
  });
  it('round-trips', () => {
    const r = importDraftJson(JSON.stringify(getSample('ev-valid')));
    if (!r.ok) throw new Error('import failed');
    const again = importDraftJson(exportDraftJson(r.draft));
    expect(again.ok && exportDraftJson(again.draft)).toBe(exportDraftJson(r.draft));
  });
});
```

`apps/web/test/exports.test.ts`:

```ts
import { getSample, type PassportDraft, readAasxEnvironment } from '@passwerk/core';
import { derive } from '@/workflow/derive.ts';
import { buildExports, slug } from '@/workflow/exports.ts';
import { reduce } from '@/workflow/reducer.ts';
import { initialState } from '@/workflow/state.ts';
import { describe, expect, it } from 'vitest';

const AT = '2026-09-05T12:00:00Z';

describe('exports', () => {
  it('slug keeps letters, digits, dot and dash', () => {
    expect(slug('https://passport.musterwerk.example/battery/MW-EV-2026-000123')).toBe('passport.musterwerk.example-battery-mw-ev-2026-000123');
    expect(slug('urn:passwerk:draft:abc')).toBe('passwerk-draft-abc');
  });
  it('produces four files whose AASX contains the same environment as the JSON', () => {
    const s = reduce(initialState, { type: 'importDraft', draft: getSample('ev-valid') as PassportDraft, at: AT });
    const d = derive(s, AT);
    if (!d) throw new Error('no derived');
    const out = buildExports(d);
    if ('error' in out) throw new Error(out.error.en);
    expect(out.verdict).toBe('valid');
    expect(out.files.map((f) => f.name.replace(/^.*?\./, ''))).toEqual(['aas.json', 'aasx', 'draft.json', 'gaps.json']);
    const json = JSON.parse(new TextDecoder().decode(out.files[0]?.bytes));
    expect(readAasxEnvironment(out.files[1]?.bytes ?? new Uint8Array())).toEqual(json);
  });
});
```

Run: `pnpm vitest run apps/web/test/ingest.test.ts apps/web/test/draftIo.test.ts apps/web/test/exports.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 2: ingest.ts**

```ts
import {
  type BatteryCategory,
  extractFacts,
  type FactSet,
  ingest,
  type MappingProposal,
  suggestMappings,
} from '@passwerk/core';
import type { FileSummary } from './state.ts';

export interface IngestInput {
  name: string;
  bytes: Uint8Array;
  size: number;
}

export interface IngestOutcome {
  summaries: FileSummary[];
  facts: FactSet;
  proposals: MappingProposal[];
}

export async function ingestFiles(
  inputs: IngestInput[],
  options: { category: BatteryCategory; workerSrc?: string },
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
  const facts = extractFacts(bundle);
  const proposals = suggestMappings(facts, { category: options.category });
  return { summaries, facts, proposals };
}
```

- [ ] **Step 3: draftIo.ts**

```ts
import { canonicalJson, type PassportDraft, validateSchema } from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';

export type ImportResult = { ok: true; draft: PassportDraft } | { ok: false; message: LangText };

export function importDraftJson(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, message: { de: `Kein gültiges JSON: ${detail}`, en: `Not valid JSON: ${detail}` } };
  }
  const result = validateSchema(parsed);
  if (!result.draft) {
    const first = result.findings[0];
    return {
      ok: false,
      message: first?.message ?? { de: 'Kein PassportDraft', en: 'Not a PassportDraft' },
    };
  }
  return { ok: true, draft: result.draft };
}

export function exportDraftJson(draft: PassportDraft): string {
  return canonicalJson(draft);
}
```

- [ ] **Step 4: exports.ts**

```ts
import { canonicalJson, emitAasJson, emitAasx, PassportDraftError, type Verdict } from '@passwerk/core';
import type { LangText } from '../i18n/index.ts';
import type { Derived } from './derive.ts';
import { exportDraftJson } from './draftIo.ts';

export interface ExportFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export function slug(passportId: string): string {
  return passportId
    .replace(/^[a-z]+:(\/\/)?/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const utf8 = (s: string) => new TextEncoder().encode(s);

export function buildExports(derived: Derived): { files: ExportFile[]; verdict: Verdict } | { error: LangText } {
  const base = slug(derived.draft.meta.passportId);
  try {
    const json = emitAasJson(derived.draft, { asOf: derived.asOf });
    const aasx = emitAasx(derived.draft, { asOf: derived.asOf });
    return {
      verdict: json.verdict,
      files: [
        { name: `${base}.aas.json`, bytes: utf8(json.output), type: 'application/json' },
        { name: `${base}.aasx`, bytes: aasx.output, type: 'application/asset-administration-shell-package' },
        { name: `${base}.draft.json`, bytes: utf8(exportDraftJson(derived.draft)), type: 'application/json' },
        { name: `${base}.gaps.json`, bytes: utf8(canonicalJson(derived.gap)), type: 'application/json' },
      ],
    };
  } catch (e) {
    if (e instanceof PassportDraftError) {
      const first = e.findings[0];
      return { error: first?.message ?? { de: e.message, en: e.message } };
    }
    throw e;
  }
}
```

- [ ] **Step 5: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS. If `emitAasx` output for a sample differs from the JSON in the AASX test, check `readAasxEnvironment` returns the parsed spec part; compare with `JSON.parse(json.output)`.

```bash
git add -A && git commit -m "feat(web): ingest, draft import/export and export files over core" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 7: Clock, store hook, persistence, download

**Files:**
- Create: `apps/web/src/app/clock.ts`, `apps/web/src/app/useStore.ts`, `apps/web/src/app/persistence.ts`, `apps/web/src/app/download.ts`, `apps/web/test/persistence.test.ts`
- Delete: `apps/web/src/app/.gitkeep`

**Interfaces:**
- Produces: `nowIso(): string`; `useStore<T>(store, selector): T`; `loadState(): Promise<LoadResult>` with `type LoadResult = { kind: 'state'; state: WorkflowState } | { kind: 'none' } | { kind: 'version' } | { kind: 'unavailable' }`; `attachPersistence(store, delayMs?): () => void`; `clearState(): Promise<void>`; `downloadFile(file: ExportFile): void`.

- [ ] **Step 1: clock.ts**

```ts
declare global {
  interface Window {
    __passwerkClock?: string;
  }
}

/** The only place the wall clock is read. Playwright pins it through `window.__passwerkClock`. */
export function nowIso(): string {
  const pinned = typeof window !== 'undefined' ? window.__passwerkClock : undefined;
  return typeof pinned === 'string' ? pinned : new Date().toISOString();
}
```

- [ ] **Step 2: useStore.ts**

```ts
import { useSyncExternalStore } from 'react';
import type { WorkflowState } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';

export function useStore<T>(store: Store, selector: (s: WorkflowState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}
```

Selectors must return stable references for unchanged state (return slices of state, never fresh objects), or React re-renders every tick.

- [ ] **Step 3: Failing persistence test**

`apps/web/test/persistence.test.ts`:

```ts
import { attachPersistence, clearState, loadState } from '@/app/persistence.ts';
import { createStore } from '@/workflow/store.ts';
import { initialState, STATE_VERSION } from '@/workflow/state.ts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => db.get(k)),
  set: vi.fn(async (k: string, v: unknown) => void db.set(k, v)),
  del: vi.fn(async (k: string) => void db.delete(k)),
}));

const AT = '2026-09-05T12:00:00Z';

describe('persistence', () => {
  beforeEach(() => db.clear());

  it('reports none on an empty store', async () => {
    expect(await loadState()).toEqual({ kind: 'none' });
  });

  it('round-trips the state and rejects an unknown version', async () => {
    db.set('passwerk.web.state', { ...initialState, language: 'en' });
    expect(await loadState()).toEqual({ kind: 'state', state: { ...initialState, language: 'en' } });
    db.set('passwerk.web.state', { ...initialState, version: STATE_VERSION + 1 });
    expect(await loadState()).toEqual({ kind: 'version' });
  });

  it('writes after a dispatch (debounced) and clearState deletes', async () => {
    vi.useFakeTimers();
    const store = createStore(initialState);
    const off = attachPersistence(store, 50);
    store.dispatch({ type: 'setLanguage', language: 'en', at: AT });
    expect(db.has('passwerk.web.state')).toBe(false);
    await vi.advanceTimersByTimeAsync(60);
    expect(db.get('passwerk.web.state')).toMatchObject({ language: 'en' });
    off();
    await clearState();
    expect(db.has('passwerk.web.state')).toBe(false);
    vi.useRealTimers();
  });

  it('reports unavailable when IndexedDB throws', async () => {
    const idb = await import('idb-keyval');
    vi.mocked(idb.get).mockRejectedValueOnce(new Error('blocked'));
    expect(await loadState()).toEqual({ kind: 'unavailable' });
  });
});
```

- [ ] **Step 4: persistence.ts**

```ts
import { del, get, set } from 'idb-keyval';
import { STATE_VERSION, type WorkflowState } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';

export const STORAGE_KEY = 'passwerk.web.state';

export type LoadResult =
  | { kind: 'state'; state: WorkflowState }
  | { kind: 'none' }
  | { kind: 'version' }
  | { kind: 'unavailable' };

export async function loadState(): Promise<LoadResult> {
  try {
    const raw = (await get(STORAGE_KEY)) as Partial<WorkflowState> | undefined;
    if (raw === undefined) return { kind: 'none' };
    if (raw.version !== STATE_VERSION) return { kind: 'version' };
    return { kind: 'state', state: raw as WorkflowState };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Debounced autosave of the input state. Returns the unsubscribe function. */
export function attachPersistence(store: Store, delayMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = store.subscribe(() => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void set(STORAGE_KEY, store.getState()).catch(() => undefined);
    }, delayMs);
  });
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    off();
  };
}

export async function clearState(): Promise<void> {
  try {
    await del(STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing to clear.
  }
}
```

- [ ] **Step 5: download.ts**

```ts
import type { ExportFile } from '../workflow/exports.ts';

export function downloadFile(file: ExportFile): void {
  const blob = new Blob([file.bytes as BlobPart], { type: file.type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 6: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS.

```bash
git rm -q apps/web/src/app/.gitkeep; git add -A && git commit -m "feat(web): clock, store hook, IndexedDB autosave and download helper" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 8: Shared view parts and StartView

**Files:**
- Create: `apps/web/src/views/parts/Lang.tsx`, `apps/web/src/views/parts/VerdictChip.tsx`, `apps/web/src/views/parts/ConfidenceBadge.tsx`, `apps/web/src/views/parts/SourceRef.tsx`, `apps/web/src/views/StartView.tsx`, `apps/web/test/views/StartView.test.tsx`, `apps/web/test/views/render.tsx`
- Delete: `apps/web/src/views/.gitkeep`

**Interfaces:**
- Produces: `VerdictChip({ lang, verdict })`, `ConfidenceBadge({ value })`, `SourceRef({ lang, source: Provenance[] })`, `LangSpan({ lang, text })`, and
  ```ts
  interface StartViewProps {
    lang: Language;
    defaultPassportId: string;
    resume?: { category: BatteryCategory; files: string[]; updatedAt: string };
    onStart(meta: { category: BatteryCategory; passportId: string }): void;
    onImport(text: string): { ok: true } | { ok: false; message: LangText };
    onResume(): void;
    onReset(): void;
  }
  ```

- [ ] **Step 1: parts**

`apps/web/src/views/parts/Lang.tsx`:

```tsx
import { type LangText, type Language, pick } from '../../i18n/index.ts';

export function LangSpan({ lang, text, className }: { lang: Language; text: LangText; className?: string }) {
  return <span className={className}>{pick(lang, text)}</span>;
}
```

`VerdictChip.tsx`:

```tsx
import type { Verdict } from '@passwerk/core';
import { Badge } from '@/components/ui/badge';
import { type Language, t, verdictKey } from '../../i18n/index.ts';

const VARIANT: Record<Verdict, 'default' | 'secondary' | 'destructive'> = {
  valid: 'default',
  valid_with_warnings: 'secondary',
  invalid: 'destructive',
};

export function VerdictChip({ lang, verdict }: { lang: Language; verdict: Verdict }) {
  return (
    <Badge variant={VARIANT[verdict]} data-testid="verdict" data-verdict={verdict}>
      {t(lang, verdictKey(verdict))}
    </Badge>
  );
}
```

`ConfidenceBadge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

export function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const variant = value >= 0.7 ? 'default' : value >= 0.4 ? 'secondary' : 'outline';
  return (
    <Badge variant={variant} data-testid="confidence">
      {pct} %
    </Badge>
  );
}
```

`SourceRef.tsx`:

```tsx
import type { Provenance } from '@passwerk/core';
import { type Language, t } from '../../i18n/index.ts';

export function SourceRef({ lang, source }: { lang: Language; source: Provenance[] }) {
  return (
    <span className="text-muted-foreground text-xs">
      {source.map((s, i) => (
        <span key={`${s.file}-${s.page ?? ''}-${s.cell ?? ''}`}>
          {i > 0 ? '; ' : ''}
          {s.file}
          {s.page !== undefined ? `, ${t(lang, 'review.page', { page: s.page })}` : ''}
          {s.cell !== undefined ? `, ${t(lang, 'review.cell', { cell: s.cell })}` : ''}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 2: Failing StartView test**

`apps/web/test/views/render.tsx` (shared helper):

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

export function mount(el: ReactElement) {
  return render(el);
}
```

`apps/web/test/views/StartView.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { StartView } from '@/views/StartView.tsx';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './render.tsx';

describe('StartView', () => {
  it('renders in both languages and starts with the chosen category', () => {
    const onStart = vi.fn();
    const props = {
      defaultPassportId: 'urn:passwerk:draft:1',
      onStart,
      onImport: () => ({ ok: true }) as const,
      onResume: () => undefined,
      onReset: () => undefined,
    };
    const { unmount } = mount(<StartView lang="de" {...props} />);
    expect(screen.getByText('Batteriekategorie')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Projekt anlegen' }));
    expect(onStart).toHaveBeenCalledWith({ category: 'EV', passportId: 'urn:passwerk:draft:1' });
    unmount();
    mount(<StartView lang="en" {...props} />);
    expect(screen.getByText('Battery category')).toBeTruthy();
  });

  it('shows the resume card when a session exists', () => {
    mount(
      <StartView
        lang="en"
        defaultPassportId="urn:x"
        resume={{ category: 'LMT', files: ['a.pdf'], updatedAt: '2026-09-05T12:00:00Z' }}
        onStart={() => undefined}
        onImport={() => ({ ok: true })}
        onResume={() => undefined}
        onReset={() => undefined}
      />,
    );
    expect(screen.getByText('Resume last session')).toBeTruthy();
  });
});
```

Run: `pnpm vitest run apps/web/test/views`
Expected: FAIL, module not found.

- [ ] **Step 3: StartView.tsx**

```tsx
import type { BatteryCategory } from '@passwerk/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type LangText, type Language, t } from '../i18n/index.ts';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];

export interface StartViewProps {
  lang: Language;
  defaultPassportId: string;
  resume?: { category: BatteryCategory; files: string[]; updatedAt: string };
  onStart(meta: { category: BatteryCategory; passportId: string }): void;
  onImport(text: string): { ok: true } | { ok: false; message: LangText };
  onResume(): void;
  onReset(): void;
}

function isUri(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:.+/i.test(s.trim());
}

export function StartView(props: StartViewProps) {
  const { lang } = props;
  const [category, setCategory] = useState<BatteryCategory>('EV');
  const [passportId, setPassportId] = useState(props.defaultPassportId);
  const [error, setError] = useState<string | null>(null);
  const valid = isUri(passportId);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const r = props.onImport(await file.text());
    setError(r.ok ? null : t(lang, 'start.import.error', { reason: r.message[lang] }));
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {props.resume && (
        <Card data-testid="resume-card" className="md:col-span-2">
          <CardHeader>
            <CardTitle>{t(lang, 'start.resume.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span>{t(lang, `start.category.${props.resume.category}`)}</span>
            <span className="text-muted-foreground">{t(lang, 'start.resume.files', { count: props.resume.files.length })}</span>
            <span className="text-muted-foreground">
              {t(lang, 'start.resume.saved', { at: new Date(props.resume.updatedAt).toLocaleString(lang) })}
            </span>
            <Button onClick={props.onResume}>{t(lang, 'start.resume.button')}</Button>
            <Button variant="outline" onClick={props.onReset}>{t(lang, 'app.startOver')}</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'step.start')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="category">{t(lang, 'start.category')}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as BatteryCategory)}>
              <SelectTrigger id="category" data-testid="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{t(lang, `start.category.${c}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="passportId">{t(lang, 'start.passportId')}</Label>
            <Input id="passportId" data-testid="passport-id" value={passportId} onChange={(e) => setPassportId(e.target.value)} />
            <p className="text-muted-foreground text-xs">{t(lang, 'start.passportId.hint')}</p>
            {!valid && <p className="text-destructive text-xs">{t(lang, 'start.passportId.invalid')}</p>}
          </div>
          <Button data-testid="start" disabled={!valid} onClick={() => props.onStart({ category, passportId: passportId.trim() })}>
            {t(lang, 'start.begin')}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t(lang, 'start.import')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input data-testid="import-draft" type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0])} />
          {error && <p className="text-destructive text-sm" data-testid="import-error">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
```

`en.ts` must contain `'start.resume.title': 'Resume last session'` and `'start.category': 'Battery category'`.

- [ ] **Step 4: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS. If jsdom lacks `ResizeObserver` for the Select, add to `apps/web/test/views/render.tsx` top: `globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;` and, if needed, `Element.prototype.scrollIntoView ??= () => undefined;` and `Element.prototype.hasPointerCapture ??= () => false;`.

```bash
git rm -q apps/web/src/views/.gitkeep; git add -A && git commit -m "feat(web): shared view parts and StartView" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 9: UploadView

**Files:**
- Create: `apps/web/src/views/UploadView.tsx`, `apps/web/test/views/UploadView.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface UploadViewProps {
    lang: Language;
    files: FileSummary[];
    busy: boolean;
    proposalCount: number;
    onFiles(files: File[]): void;
    onRemove(name: string): void;
    onContinue(): void;
  }
  ```

- [ ] **Step 1: Failing test**

`apps/web/test/views/UploadView.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { UploadView } from '@/views/UploadView.tsx';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './render.tsx';

describe('UploadView', () => {
  it('lists files with format, pages, language or error, and continues', () => {
    const onContinue = vi.fn();
    mount(
      <UploadView
        lang="en"
        busy={false}
        proposalCount={7}
        files={[
          { name: 'a.pdf', size: 10, sha256: 'x', format: 'pdf', pages: 2, lang: 'de' },
          { name: 'b.bin', size: 10, sha256: 'y', format: 'unsupported', pages: 0, lang: 'de', error: { code: 'unsupported', message: 'nope' } },
        ]}
        onFiles={() => undefined}
        onRemove={() => undefined}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText('a.pdf')).toBeTruthy();
    expect(screen.getByText('Unsupported format')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to 7 proposals' }));
    expect(onContinue).toHaveBeenCalled();
  });

  it('passes chosen files to onFiles', () => {
    const onFiles = vi.fn();
    mount(<UploadView lang="de" busy={false} proposalCount={0} files={[]} onFiles={onFiles} onRemove={() => undefined} onContinue={() => undefined} />);
    const input = screen.getByTestId('file-input') as HTMLInputElement;
    const file = new File(['x'], 'c.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });
});
```

- [ ] **Step 2: UploadView.tsx**

```tsx
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { type Key, type Language, t } from '../i18n/index.ts';
import type { FileSummary } from '../workflow/state.ts';

export interface UploadViewProps {
  lang: Language;
  files: FileSummary[];
  busy: boolean;
  proposalCount: number;
  onFiles(files: File[]): void;
  onRemove(name: string): void;
  onContinue(): void;
}

const ACCEPT = '.pdf,.xlsx,.docx,.csv,.txt,application/pdf,text/csv,text/plain';

export function UploadView(props: UploadViewProps) {
  const { lang } = props;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(lang, 'upload.title')}</CardTitle>
        <p className="text-muted-foreground text-sm">{t(lang, 'upload.hint')}</p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div
          className="rounded-md border border-dashed p-6 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            props.onFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <Input
            data-testid="file-input"
            type="file"
            multiple
            accept={ACCEPT}
            disabled={props.busy}
            onChange={(e) => {
              props.onFiles(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          {props.busy && <p className="mt-2 text-sm" data-testid="upload-busy">{t(lang, 'upload.busy')}</p>}
        </div>
        {props.files.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t(lang, 'upload.empty')}</p>
        ) : (
          <Table data-testid="file-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t(lang, 'upload.col.file')}</TableHead>
                <TableHead>{t(lang, 'upload.col.format')}</TableHead>
                <TableHead>{t(lang, 'upload.col.pages')}</TableHead>
                <TableHead>{t(lang, 'upload.col.lang')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.files.map((f) => (
                <TableRow key={f.name} data-testid="file-row" data-file={f.name}>
                  <TableCell>{f.name}</TableCell>
                  <TableCell>
                    {f.error ? (
                      <span className="text-destructive">{t(lang, `upload.error.${f.error.code}` as Key)}</span>
                    ) : (
                      f.format
                    )}
                  </TableCell>
                  <TableCell data-testid="file-pages">{f.error ? '' : f.pages}</TableCell>
                  <TableCell>{f.error ? '' : f.lang}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => props.onRemove(f.name)}>
                      {t(lang, 'upload.remove')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button data-testid="continue" disabled={props.busy || props.files.every((f) => f.error)} onClick={props.onContinue}>
          {t(lang, 'upload.continue', { count: props.proposalCount })}
        </Button>
      </CardContent>
    </Card>
  );
}
```

`en.ts`: `'upload.error.unsupported': 'Unsupported format'`, `'upload.continue': 'Continue to {count} proposals'`.

- [ ] **Step 3: Run, lint, commit**

Run: `pnpm vitest run apps/web/test/views && pnpm lint:fix && pnpm typecheck`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): UploadView" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 10: ReviewView and AddValueDialog

**Files:**
- Create: `apps/web/src/views/ReviewView.tsx`, `apps/web/src/views/AddValueDialog.tsx`, `apps/web/src/views/reviewModel.ts`, `apps/web/test/reviewModel.test.ts`, `apps/web/test/views/ReviewView.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // reviewModel.ts (pure, no React)
  interface ReviewGroup { key: DecisionKey; attributeId: string; path?: string; name: LangText; legalRefs: string[]; part: number | null; proposals: MappingProposal[]; decision?: Decision }
  type ReviewFilter = 'pending' | 'accepted' | 'rejected' | 'all';
  buildGroups(proposals, decisions): ReviewGroup[]         // sorted by part, attributeId, path
  filterGroups(groups, filter, search, lang): ReviewGroup[]
  manualEntries(decisions): Decision[]                     // kind 'manual'
  compositeLeaves(attributeId): string[]                   // keys of object composites, [] otherwise
  attributeChoices(category): { id: string; name: LangText }[]
  // ReviewView props
  interface ReviewViewProps {
    lang: Language; category: BatteryCategory;
    groups: ReviewGroup[]; manual: Decision[]; conflicts: MappingConflict[];
    accepted: number; pending: number; verdict: Verdict;
    onDecide(d: Decision): void; onClear(key: DecisionKey): void; onContinue(): void;
  }
  ```

- [ ] **Step 1: Failing model tests**

`apps/web/test/reviewModel.test.ts`:

```ts
import type { MappingProposal } from '@passwerk/core';
import { attributeChoices, buildGroups, compositeLeaves, filterGroups } from '@/views/reviewModel.ts';
import { describe, expect, it } from 'vitest';

const p = (over: Partial<MappingProposal>): MappingProposal => ({
  attributeId: 'ratedCapacity', value: '1', factId: 'f', confidence: 0.8,
  source: [{ file: 'a.pdf' }], why: { de: 'w', en: 'w' },
  checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' }, ...over,
});

describe('review model', () => {
  it('groups by attribute and path, sorted by part then id', () => {
    const groups = buildGroups(
      [p({ attributeId: 'nominalVoltage', factId: 'v' }), p({ factId: 'c1' }), p({ factId: 'c2' }), p({ attributeId: 'manufacturerInformation', path: 'name.de', factId: 'm' })],
      {},
    );
    expect(groups.map((g) => g.key)).toEqual(['manufacturerInformation#name.de', 'nominalVoltage', 'ratedCapacity']);
    expect(groups[2]?.proposals.map((x) => x.factId)).toEqual(['c1', 'c2']);
    expect(groups[0]?.name.de.length).toBeGreaterThan(0);
  });
  it('filters by decision state and search', () => {
    const groups = buildGroups([p({ factId: 'c1' }), p({ attributeId: 'nominalVoltage', factId: 'v' })], {
      ratedCapacity: { kind: 'accept', attributeId: 'ratedCapacity', factId: 'c1' },
    });
    expect(filterGroups(groups, 'accepted', '', 'en').map((g) => g.key)).toEqual(['ratedCapacity']);
    expect(filterGroups(groups, 'pending', '', 'en').map((g) => g.key)).toEqual(['nominalVoltage']);
    expect(filterGroups(groups, 'all', 'volt', 'en').map((g) => g.key)).toEqual(['nominalVoltage']);
  });
  it('lists composite leaves and category attributes', () => {
    expect(compositeLeaves('batteryChemistry')).toContain('clearName');
    expect(compositeLeaves('criticalRawMaterials')).toEqual([]);
    expect(compositeLeaves('ratedCapacity')).toEqual([]);
    expect(attributeChoices('EV').some((a) => a.id === 'ratedCapacity')).toBe(true);
  });
});
```

- [ ] **Step 2: reviewModel.ts**

```ts
import { COMPOSITE_SCHEMAS, getAttribute, getAttributesForCategory, type BatteryCategory, type MappingProposal } from '@passwerk/core';
import type { LangText, Language } from '../i18n/index.ts';
import { type Decision, type DecisionKey, decisionKey, proposalKey } from '../workflow/state.ts';

export interface ReviewGroup {
  key: DecisionKey;
  attributeId: string;
  path?: string;
  name: LangText;
  legalRefs: string[];
  part: number | null;
  proposals: MappingProposal[];
  decision?: Decision;
}

export type ReviewFilter = 'pending' | 'accepted' | 'rejected' | 'all';

export function buildGroups(proposals: MappingProposal[], decisions: Record<DecisionKey, Decision>): ReviewGroup[] {
  const map = new Map<DecisionKey, ReviewGroup>();
  for (const p of proposals) {
    const key = proposalKey(p);
    let g = map.get(key);
    if (!g) {
      const a = getAttribute(p.attributeId);
      g = {
        key,
        attributeId: p.attributeId,
        ...(p.path !== undefined ? { path: p.path } : {}),
        name: a?.name ?? { de: p.attributeId, en: p.attributeId },
        legalRefs: a?.legalRefs ?? [],
        part: a?.part ?? null,
        proposals: [],
        ...(decisions[key] ? { decision: decisions[key] } : {}),
      };
      map.set(key, g);
    }
    g.proposals.push(p);
  }
  return [...map.values()].sort(
    (x, y) => (x.part ?? 99) - (y.part ?? 99) || x.attributeId.localeCompare(y.attributeId) || (x.path ?? '').localeCompare(y.path ?? ''),
  );
}

function stateOf(g: ReviewGroup): Exclude<ReviewFilter, 'all'> {
  if (!g.decision) return 'pending';
  return g.decision.kind === 'reject' ? 'rejected' : 'accepted';
}

export function filterGroups(groups: ReviewGroup[], filter: ReviewFilter, search: string, lang: Language): ReviewGroup[] {
  const q = search.trim().toLowerCase();
  return groups.filter((g) => {
    if (filter !== 'all' && stateOf(g) !== filter) return false;
    if (!q) return true;
    const hay = [g.attributeId, g.name[lang], ...g.proposals.map((p) => String(p.value))].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

export function manualEntries(decisions: Record<DecisionKey, Decision>): Decision[] {
  return Object.values(decisions).filter((d) => d.kind === 'manual');
}

export function compositeLeaves(attributeId: string): string[] {
  const schema = COMPOSITE_SCHEMAS[attributeId];
  const shape = (schema as { shape?: Record<string, unknown> } | undefined)?.shape;
  return shape ? Object.keys(shape) : [];
}

export function attributeChoices(category: BatteryCategory): { id: string; name: LangText }[] {
  return getAttributesForCategory(category, ['mandatory', 'conditional', 'optional'])
    .map((a) => ({ id: a.id, name: a.name }))
    .sort((x, y) => x.id.localeCompare(y.id));
}

export function keyOf(d: Decision): DecisionKey {
  return decisionKey(d.attributeId, d.path);
}
```

Zod 4 object schemas expose `.shape`; the `.min(1)` arrays do not, which is what makes `compositeLeaves` return `[]` for list composites. Verify `.shape` on a Zod 4 `z.object` with the context7 Zod docs if the test fails.

- [ ] **Step 3: Failing view test**

`apps/web/test/views/ReviewView.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { ReviewView } from '@/views/ReviewView.tsx';
import { buildGroups } from '@/views/reviewModel.ts';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './render.tsx';

const groups = buildGroups(
  [{ attributeId: 'ratedCapacity', value: '94.5', unit: 'Ah', factId: 'f1', confidence: 0.9, source: [{ file: 'a.pdf', page: 1 }], why: { de: 'Treffer', en: 'Match' }, checks: { label: 1, matched: 'x', unit: 'match', kind: 'ok' } }],
  {},
);

describe('ReviewView', () => {
  it('renders a group and dispatches accept', () => {
    const onDecide = vi.fn();
    mount(<ReviewView lang="en" category="EV" groups={groups} manual={[]} conflicts={[]} accepted={0} pending={1} verdict="invalid" onDecide={onDecide} onClear={() => undefined} onContinue={() => undefined} />);
    expect(screen.getByText('94.5')).toBeTruthy();
    expect(screen.getByText('Match')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onDecide).toHaveBeenCalledWith({ kind: 'accept', attributeId: 'ratedCapacity', factId: 'f1' });
  });
  it('renders German chrome', () => {
    mount(<ReviewView lang="de" category="EV" groups={groups} manual={[]} conflicts={[]} accepted={0} pending={1} verdict="invalid" onDecide={() => undefined} onClear={() => undefined} onContinue={() => undefined} />);
    expect(screen.getByText('0 übernommen, 1 offen')).toBeTruthy();
  });
});
```

- [ ] **Step 4: AddValueDialog.tsx**

```tsx
import type { BatteryCategory } from '@passwerk/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Language, pick, t } from '../i18n/index.ts';
import type { Decision } from '../workflow/state.ts';
import { attributeChoices, compositeLeaves } from './reviewModel.ts';

const WHOLE = '__whole__';

export function AddValueDialog({ lang, category, onAdd }: { lang: Language; category: BatteryCategory; onAdd(d: Decision): void }) {
  const [open, setOpen] = useState(false);
  const [attributeId, setAttributeId] = useState('');
  const [leaf, setLeaf] = useState(WHOLE);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const choices = attributeChoices(category);
  const leaves = attributeId ? compositeLeaves(attributeId) : [];

  const submit = () => {
    if (!attributeId || !value.trim()) return;
    onAdd({
      kind: 'manual',
      attributeId,
      ...(leaf !== WHOLE ? { path: leaf } : {}),
      value: value.trim(),
      ...(unit.trim() ? { unit: unit.trim() } : {}),
    });
    setOpen(false);
    setValue('');
    setUnit('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="add-value">{t(lang, 'review.addValue')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(lang, 'review.addValue')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Label>{t(lang, 'review.addValue.attribute')}</Label>
          <Select value={attributeId} onValueChange={(v) => { setAttributeId(v); setLeaf(WHOLE); }}>
            <SelectTrigger data-testid="add-attribute"><SelectValue /></SelectTrigger>
            <SelectContent>
              {choices.map((c) => <SelectItem key={c.id} value={c.id}>{pick(lang, c.name)} ({c.id})</SelectItem>)}
            </SelectContent>
          </Select>
          {leaves.length > 0 && (
            <>
              <Label>{t(lang, 'review.addValue.leaf')}</Label>
              <Select value={leaf} onValueChange={setLeaf}>
                <SelectTrigger data-testid="add-leaf"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE}>{t(lang, 'review.addValue.whole')}</SelectItem>
                  {leaves.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}
          <Label>{t(lang, 'review.value')}</Label>
          <Input data-testid="add-value-input" value={value} onChange={(e) => setValue(e.target.value)} />
          <Label>{t(lang, 'review.unit')}</Label>
          <Input data-testid="add-unit-input" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <Button data-testid="add-submit" onClick={submit}>{t(lang, 'review.addValue.add')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

Leaf values of nested composites such as `name.de` (multilingual) are typed as the dotted path by the user in the value picker; the leaf list shows only first-level keys, which is what this slice supports.

- [ ] **Step 5: ReviewView.tsx**

```tsx
import type { BatteryCategory, MappingConflict, MappingProposal, Verdict } from '@passwerk/core';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Language, pick, t } from '../i18n/index.ts';
import type { Decision, DecisionKey } from '../workflow/state.ts';
import { AddValueDialog } from './AddValueDialog.tsx';
import { ConfidenceBadge } from './parts/ConfidenceBadge.tsx';
import { SourceRef } from './parts/SourceRef.tsx';
import { VerdictChip } from './parts/VerdictChip.tsx';
import { filterGroups, keyOf, type ReviewFilter, type ReviewGroup } from './reviewModel.ts';

export interface ReviewViewProps {
  lang: Language;
  category: BatteryCategory;
  groups: ReviewGroup[];
  manual: Decision[];
  conflicts: MappingConflict[];
  accepted: number;
  pending: number;
  verdict: Verdict;
  onDecide(d: Decision): void;
  onClear(key: DecisionKey): void;
  onContinue(): void;
}

function ProposalRow({ lang, group, p, onDecide }: { lang: Language; group: ReviewGroup; p: MappingProposal; onDecide(d: Decision): void }) {
  const d = group.decision;
  const chosen = d && d.kind !== 'manual' && d.factId === p.factId ? d.kind : undefined;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(p.value ?? ''));
  const [unit, setUnit] = useState(p.unit ?? '');
  const base = { attributeId: group.attributeId, ...(group.path !== undefined ? { path: group.path } : {}), factId: p.factId };
  return (
    <div className="flex flex-wrap items-center gap-3 border-t py-2" data-testid="proposal" data-fact={p.factId} data-state={chosen ?? 'pending'}>
      {editing ? (
        <>
          <Input className="w-40" value={value} onChange={(e) => setValue(e.target.value)} data-testid="edit-value" />
          <Input className="w-20" value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="edit-unit" />
          <Button size="sm" onClick={() => { onDecide({ kind: 'edit', ...base, value, ...(unit ? { unit } : {}) }); setEditing(false); }}>{t(lang, 'review.save')}</Button>
        </>
      ) : (
        <>
          <span className="font-mono" data-testid="proposal-value">{chosen === 'edit' && d?.kind === 'edit' ? d.value : String(p.value)}</span>
          <span className="text-muted-foreground">{chosen === 'edit' && d?.kind === 'edit' ? (d.unit ?? '') : (p.unit ?? '')}</span>
          {chosen === 'edit' && <span className="text-xs">{t(lang, 'review.edited')}</span>}
        </>
      )}
      <ConfidenceBadge value={p.confidence} />
      <SourceRef lang={lang} source={p.source} />
      <span className="text-muted-foreground text-xs">{pick(lang, p.why)}</span>
      <span className="ml-auto flex gap-1">
        <Button size="sm" variant={chosen === 'accept' ? 'default' : 'outline'} data-testid="accept" onClick={() => onDecide({ kind: 'accept', ...base })}>{t(lang, 'review.accept')}</Button>
        <Button size="sm" variant={chosen === 'reject' ? 'destructive' : 'outline'} data-testid="reject" onClick={() => onDecide({ kind: 'reject', ...base })}>{t(lang, 'review.reject')}</Button>
        <Button size="sm" variant="ghost" data-testid="edit" onClick={() => setEditing((v) => !v)}>{t(lang, 'review.edit')}</Button>
      </span>
    </div>
  );
}

export function ReviewView(props: ReviewViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [search, setSearch] = useState('');
  const visible = filterGroups(props.groups, filter, search, lang);
  return (
    <div className="grid gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background py-2">
        <h2 className="font-semibold text-lg">{t(lang, 'review.title')}</h2>
        <span data-testid="review-summary">{t(lang, 'review.summary', { accepted: props.accepted, pending: props.pending })}</span>
        <VerdictChip lang={lang} verdict={props.verdict} />
        <Tabs value={filter} onValueChange={(v) => setFilter(v as ReviewFilter)}>
          <TabsList>
            {(['pending', 'accepted', 'rejected', 'all'] as const).map((f) => (
              <TabsTrigger key={f} value={f} data-testid={`filter-${f}`}>{t(lang, `review.filter.${f}`)}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input className="w-48" placeholder={t(lang, 'review.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <AddValueDialog lang={lang} category={props.category} onAdd={props.onDecide} />
        <Button className="ml-auto" data-testid="to-gaps" onClick={props.onContinue}>{t(lang, 'review.continue')}</Button>
      </div>
      {props.conflicts.map((c) => (
        <p key={`${c.attributeId}${c.path ?? ''}`} className="text-destructive text-sm" data-testid="conflict">
          {c.attributeId}{c.path ? `.${c.path}` : ''}: {t(lang, 'review.conflict', { existing: JSON.stringify(c.existing), incoming: JSON.stringify(c.incoming) })}
        </p>
      ))}
      {props.manual.map((d) => (
        <Card key={keyOf(d)} data-testid="manual">
          <CardContent className="flex items-center gap-3 py-3">
            <span className="font-medium">{d.attributeId}{d.path ? `.${d.path}` : ''}</span>
            <span className="font-mono">{d.kind === 'manual' ? d.value : ''}</span>
            <span className="text-xs">{t(lang, 'review.manual')}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => props.onClear(keyOf(d))}>{t(lang, 'review.clear')}</Button>
          </CardContent>
        </Card>
      ))}
      {visible.length === 0 && <p className="text-muted-foreground">{t(lang, 'review.empty')}</p>}
      {visible.map((g) => (
        <Card key={g.key} data-testid="group" data-key={g.key}>
          <CardHeader className="py-3">
            <CardTitle className="text-base">
              {pick(lang, g.name)}{g.path ? ` · ${g.path}` : ''}
              <span className="ml-2 font-normal text-muted-foreground text-xs">{g.legalRefs.join('; ')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {g.proposals.map((p) => <ProposalRow key={p.factId} lang={lang} group={g} p={p} onDecide={props.onDecide} />)}
            {g.decision && <Button size="sm" variant="link" onClick={() => props.onClear(g.key)}>{t(lang, 'review.clear')}</Button>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

`en.ts`: `'review.accept': 'Accept'`, `'review.summary': '{accepted} accepted, {pending} pending'`.

- [ ] **Step 6: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): ReviewView with grouping, filters, edit and manual values" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 11: GapsExportView

**Files:**
- Create: `apps/web/src/views/GapsExportView.tsx`, `apps/web/test/views/GapsExportView.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface GapsExportViewProps {
    lang: Language;
    report: ValidationReport;
    gap: GapReport;
    exportError?: LangText;
    onExport(kind: 'aasJson' | 'aasx' | 'draft' | 'gaps'): void;
  }
  ```

- [ ] **Step 1: Failing test**

`apps/web/test/views/GapsExportView.test.tsx`:

```tsx
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { GapsExportView } from '@/views/GapsExportView.tsx';
import { describe, expect, it, vi } from 'vitest';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });

describe('GapsExportView', () => {
  it('shows verdict, completeness, items and export buttons', () => {
    const onExport = vi.fn();
    mount(<GapsExportView lang="en" report={report} gap={gap} onExport={onExport} />);
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    expect(screen.getByTestId('completeness-mandatory').textContent).toContain(gap.completeness.mandatory.percent);
    expect(screen.getAllByTestId('gap-item').length).toBe(gap.items.length);
    fireEvent.click(screen.getByRole('button', { name: 'AASX' }));
    expect(onExport).toHaveBeenCalledWith('aasx');
    expect(screen.getByText('Not legal advice. Sources are given on every entry.')).toBeTruthy();
  });
  it('renders German', () => {
    mount(<GapsExportView lang="de" report={report} gap={gap} onExport={() => undefined} />);
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
});
```

- [ ] **Step 2: GapsExportView.tsx**

```tsx
import type { GapReport, ValidationReport } from '@passwerk/core';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Key, type LangText, type Language, pick, t, verdictKey } from '../i18n/index.ts';
import { VerdictChip } from './parts/VerdictChip.tsx';

export interface GapsExportViewProps {
  lang: Language;
  report: ValidationReport;
  gap: GapReport;
  exportError?: LangText;
  onExport(kind: 'aasJson' | 'aasx' | 'draft' | 'gaps'): void;
}

type GroupBy = 'owner' | 'submodel';

export function GapsExportView(props: GapsExportViewProps) {
  const { lang, report, gap } = props;
  const [groupBy, setGroupBy] = useState<GroupBy>('owner');
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const groups: { title: string; ids: string[] }[] =
    groupBy === 'owner'
      ? gap.byDataOwner.map((g) => ({ title: pick(lang, g.owner), ids: g.attributeIds }))
      : gap.bySubmodel.map((g) => ({ title: g.submodelIdShort ?? '—', ids: g.attributeIds }));
  const pct = (s: string) => Number(s);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>{t(lang, 'gaps.title')}</CardTitle>
          <VerdictChip lang={lang} verdict={report.verdict} />
          {(['L1', 'L2', 'L3', 'L4'] as const).map((layer) => (
            <Badge key={layer} variant="outline" data-testid={`layer-${layer}`}>
              {t(lang, 'gaps.layer', { layer, errors: report.layers[layer].errors, warnings: report.layers[layer].warnings })}
            </Badge>
          ))}
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="grid gap-1">
            <span>{t(lang, 'gaps.completeness.mandatory')}</span>
            <span data-testid="completeness-mandatory">{gap.completeness.mandatory.present}/{gap.completeness.mandatory.total} ({gap.completeness.mandatory.percent} %)</span>
            <Progress value={pct(gap.completeness.mandatory.percent)} />
            <span>{t(lang, 'gaps.completeness.overall')}</span>
            <span data-testid="completeness-overall">{gap.completeness.overall.present}/{gap.completeness.overall.total} ({gap.completeness.overall.percent} %)</span>
            <Progress value={pct(gap.completeness.overall.percent)} />
          </div>
          <details>
            <summary>{t(lang, 'gaps.findings')} ({report.findings.length})</summary>
            <ul className="grid gap-1 py-2 text-sm">
              {report.findings.map((f, i) => (
                <li key={`${f.ruleId}-${f.path}-${i}`} data-testid="finding" data-rule={f.ruleId} data-attribute={f.attributeId ?? ''}>
                  <Badge variant={f.severity === 'error' ? 'destructive' : 'secondary'}>{f.layer}</Badge> <code>{f.ruleId}</code> {pick(lang, f.message)}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle>{t(lang, 'export.title')}</CardTitle>
          <span className="text-muted-foreground text-sm">{t(lang, 'export.verdictNote', { verdict: t(lang, verdictKey(report.verdict)) })}</span>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button data-testid="export-aasJson" onClick={() => props.onExport('aasJson')}>{t(lang, 'export.aasJson')}</Button>
          <Button data-testid="export-aasx" onClick={() => props.onExport('aasx')}>{t(lang, 'export.aasx')}</Button>
          <Button variant="outline" data-testid="export-draft" onClick={() => props.onExport('draft')}>{t(lang, 'export.draft')}</Button>
          <Button variant="outline" data-testid="export-gaps" onClick={() => props.onExport('gaps')}>{t(lang, 'export.gaps')}</Button>
          {props.exportError && <p className="w-full text-destructive text-sm">{t(lang, 'export.failed', { reason: pick(lang, props.exportError) })}</p>}
        </CardContent>
      </Card>

      <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
        <TabsList>
          <TabsTrigger value="owner">{t(lang, 'gaps.groupBy.owner')}</TabsTrigger>
          <TabsTrigger value="submodel">{t(lang, 'gaps.groupBy.submodel')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {groups.map((g) => (
        <Card key={g.title}>
          <CardHeader className="py-3"><CardTitle className="text-base">{g.title}</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {g.ids.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              return (
                <div key={id} className="grid gap-1 border-t py-2 text-sm" data-testid="gap-item" data-attribute={id} data-status={item.status} data-bucket={item.bucket}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{pick(lang, item.name)}</span>
                    <Badge variant="outline">{t(lang, `gaps.bucket.${item.bucket}` as Key)}</Badge>
                    <Badge variant={item.status === 'present' ? 'default' : item.status === 'missing' ? 'secondary' : 'destructive'}>{t(lang, `gaps.status.${item.status}` as Key)}</Badge>
                    {item.verify && <Badge variant="outline">{t(lang, 'gaps.verify')}</Badge>}
                  </div>
                  <div className="text-muted-foreground">{t(lang, 'gaps.legalRefs')}: {item.legalRefs.join('; ')}</div>
                  <div>{t(lang, 'gaps.nextAction')}: {pick(lang, item.suggestedAction)}</div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      <p className="text-muted-foreground text-xs" data-testid="not-legal-advice">{t(lang, 'app.notLegalAdvice')}</p>
    </div>
  );
}
```

`en.ts`: `'app.notLegalAdvice': 'Not legal advice. Sources are given on every entry.'`, `'export.aasx': 'AASX'`.

- [ ] **Step 3: Run, lint, commit**

Run: `pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS.

```bash
git add -A && git commit -m "feat(web): GapsExportView" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 12: App shell, error boundary and startup

**Files:**
- Create: `apps/web/src/app/ErrorBoundary.tsx`, `apps/web/src/app/App.tsx`, `apps/web/test/views/App.test.tsx`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes everything above.
- Produces: `App({ store, storageNotice })` where `storageNotice?: 'unavailable' | 'version'`.

- [ ] **Step 1: ErrorBoundary.tsx**

```tsx
import { Component, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { type Language, t } from '../i18n/index.ts';

interface Props {
  lang: Language;
  onReset(): void;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override render() {
    const { lang } = this.props;
    if (!this.state.error) return this.props.children;
    const details = `${this.state.error.message}\n${this.state.error.stack ?? ''}`;
    return (
      <div className="grid gap-3 rounded-md border border-destructive p-4" role="alert">
        <p className="font-semibold">{t(lang, 'app.error.title')}</p>
        <pre className="overflow-auto text-xs">{this.state.error.message}</pre>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>{t(lang, 'app.error.reload')}</Button>
          <Button variant="outline" onClick={() => void navigator.clipboard.writeText(details)}>{t(lang, 'app.error.copy')}</Button>
          <Button variant="destructive" onClick={this.props.onReset}>{t(lang, 'app.startOver')}</Button>
        </div>
      </div>
    );
  }
}
```

- [ ] **Step 2: App.tsx**

```tsx
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { useState } from 'react';
import { toast, Toaster } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { type LangText, type Language, t } from '../i18n/index.ts';
import { derive } from '../workflow/derive.ts';
import { importDraftJson } from '../workflow/draftIo.ts';
import { buildExports } from '../workflow/exports.ts';
import { ingestFiles } from '../workflow/ingest.ts';
import { type Decision, type DecisionKey, type Step, STEPS } from '../workflow/state.ts';
import type { Store } from '../workflow/store.ts';
import { GapsExportView } from '../views/GapsExportView.tsx';
import { ReviewView } from '../views/ReviewView.tsx';
import { buildGroups, manualEntries } from '../views/reviewModel.ts';
import { StartView } from '../views/StartView.tsx';
import { UploadView } from '../views/UploadView.tsx';
import { nowIso } from './clock.ts';
import { downloadFile } from './download.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { clearState } from './persistence.ts';
import { useStore } from './useStore.ts';

export interface AppProps {
  store: Store;
  storageNotice?: 'unavailable' | 'version';
}

const SCHEMA_VERSION = '1.0' as const;

export function App({ store, storageNotice }: AppProps) {
  const state = useStore(store, (s) => s);
  const lang: Language = state.language;
  const [busy, setBusy] = useState(false);
  const [exportError, setExportError] = useState<LangText | undefined>(undefined);
  const [asOf] = useState(() => nowIso());
  const derived = derive(state, asOf);
  const dispatch = store.dispatch;

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    toast.error(t(lang, 'app.error.title'), {
      description: message,
      action: { label: t(lang, 'app.error.copy'), onClick: () => void navigator.clipboard.writeText(message) },
    });
  };

  const reset = () => {
    void clearState();
    dispatch({ type: 'reset', at: nowIso() });
  };

  const onFiles = async (files: File[]) => {
    if (!state.meta || files.length === 0) return;
    setBusy(true);
    try {
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), size: f.size })));
      const out = await ingestFiles(inputs, { category: state.meta.category, workerSrc: pdfWorkerUrl });
      dispatch({ type: 'filesIngested', ...out, at: nowIso() });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onExport = (kind: 'aasJson' | 'aasx' | 'draft' | 'gaps') => {
    if (!derived) return;
    const out = buildExports(derived);
    if ('error' in out) {
      setExportError(out.error);
      return;
    }
    setExportError(undefined);
    const index = { aasJson: 0, aasx: 1, draft: 2, gaps: 3 }[kind];
    const file = out.files[index];
    if (file) downloadFile(file);
  };

  const reachable = (step: Step): boolean => {
    if (step === 'start') return true;
    if (step === 'upload') return state.meta !== null;
    return state.baseDraft !== null;
  };

  const accepted = Object.values(state.decisions).filter((d) => d.kind !== 'reject').length;
  const groups = buildGroups(state.proposals, state.decisions);
  const pending = groups.filter((g) => !g.decision).length;

  const view = (() => {
    switch (state.step) {
      case 'start':
        return (
          <StartView
            lang={lang}
            defaultPassportId={`urn:passwerk:draft:${crypto.randomUUID()}`}
            {...(state.meta ? { resume: { category: state.meta.category, files: state.files.map((f) => f.name), updatedAt: state.updatedAt } } : {})}
            onStart={({ category, passportId }) => {
              const at = nowIso();
              dispatch({ type: 'startProject', meta: { schemaVersion: SCHEMA_VERSION, category, passportId, createdAt: at }, at });
            }}
            onImport={(text) => {
              const r = importDraftJson(text);
              if (r.ok) dispatch({ type: 'importDraft', draft: r.draft, at: nowIso() });
              return r.ok ? { ok: true } : { ok: false, message: r.message };
            }}
            onResume={() => dispatch({ type: 'goTo', step: state.baseDraft ? (state.files.length ? 'review' : 'upload') : 'upload', at: nowIso() })}
            onReset={reset}
          />
        );
      case 'upload':
        return (
          <UploadView
            lang={lang}
            files={state.files}
            busy={busy}
            proposalCount={state.proposals.length}
            onFiles={(files) => void onFiles(files)}
            onRemove={(name) => dispatch({ type: 'fileRemoved', name, at: nowIso() })}
            onContinue={() => dispatch({ type: 'goTo', step: 'review', at: nowIso() })}
          />
        );
      case 'review':
        if (!state.meta || !derived) return null;
        return (
          <ReviewView
            lang={lang}
            category={state.meta.category}
            groups={groups}
            manual={manualEntries(state.decisions)}
            conflicts={derived.conflicts}
            accepted={accepted}
            pending={pending}
            verdict={derived.report.verdict}
            onDecide={(d: Decision) => dispatch({ type: 'decide', decision: d, at: nowIso() })}
            onClear={(key: DecisionKey) => dispatch({ type: 'clearDecision', key, at: nowIso() })}
            onContinue={() => dispatch({ type: 'goTo', step: 'gaps', at: nowIso() })}
          />
        );
      case 'gaps':
        if (!derived) return null;
        return <GapsExportView lang={lang} report={derived.report} gap={derived.gap} {...(exportError ? { exportError } : {})} onExport={onExport} />;
    }
  })();

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4">
      <header className="flex flex-wrap items-center gap-3 border-b pb-3">
        <h1 className="font-bold text-xl">{t(lang, 'app.title')}</h1>
        <span className="text-muted-foreground text-sm">{t(lang, 'app.tagline')}</span>
        <nav className="flex gap-1" aria-label="steps">
          {STEPS.map((step) => (
            <Button key={step} size="sm" variant={state.step === step ? 'default' : 'ghost'} disabled={!reachable(step)} data-testid={`step-${step}`} onClick={() => dispatch({ type: 'goTo', step, at: nowIso() })}>
              {t(lang, `step.${step}`)}
            </Button>
          ))}
        </nav>
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="lang-toggle" onClick={() => dispatch({ type: 'setLanguage', language: lang === 'de' ? 'en' : 'de', at: nowIso() })}>
            {lang === 'de' ? 'EN' : 'DE'}
          </Button>
          {state.meta && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" data-testid="start-over">{t(lang, 'app.startOver')}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t(lang, 'app.startOver')}</AlertDialogTitle>
                  <AlertDialogDescription>{t(lang, 'app.startOver.confirm')}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t(lang, 'app.cancel')}</AlertDialogCancel>
                  <AlertDialogAction data-testid="start-over-confirm" onClick={reset}>{t(lang, 'app.confirm')}</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </span>
      </header>
      {storageNotice && <p className="rounded-md border p-2 text-sm" data-testid="storage-notice">{t(lang, storageNotice === 'version' ? 'app.storage.version' : 'app.storage.unavailable')}</p>}
      <ErrorBoundary lang={lang} onReset={reset}>
        {view}
      </ErrorBoundary>
      <Toaster />
    </div>
  );
}
```

`sonner` is the toast primitive shadcn installs; if `shadcn add sonner` placed a wrapper at `@/components/ui/sonner`, import `Toaster` from there and `toast` from `sonner`. The `?url` import needs `vite/client` types (already in tsconfig).

- [ ] **Step 3: main.tsx**

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { attachPersistence, loadState } from './app/persistence.ts';
import './index.css';
import { initialState } from './workflow/state.ts';
import { createStore } from './workflow/store.ts';

async function boot() {
  const loaded = await loadState();
  const store = createStore(loaded.kind === 'state' ? loaded.state : initialState);
  if (loaded.kind !== 'unavailable') attachPersistence(store);
  const notice = loaded.kind === 'unavailable' || loaded.kind === 'version' ? loaded.kind : undefined;
  const root = document.getElementById('root');
  if (!root) throw new Error('missing #root');
  createRoot(root).render(<App store={store} {...(notice ? { storageNotice: notice } : {})} />);
}

void boot();
```

A restored state lands on its saved `step`. Because the base draft survives but the document bytes do not, the start screen's resume card is shown when the user navigates back to start; `onResume` goes to review when files exist, else upload.

- [ ] **Step 4: App render test**

`apps/web/test/views/App.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react';
import { App } from '@/app/App.tsx';
import { initialState } from '@/workflow/state.ts';
import { createStore } from '@/workflow/store.ts';
import { describe, expect, it } from 'vitest';
import { mount } from './render.tsx';

describe('App', () => {
  it('starts on the start step, toggles language and starts a project', () => {
    const store = createStore(initialState);
    mount(<App store={store} />);
    expect(screen.getByText('Batteriekategorie')).toBeTruthy();
    fireEvent.click(screen.getByTestId('lang-toggle'));
    expect(screen.getByText('Battery category')).toBeTruthy();
    fireEvent.click(screen.getByTestId('start'));
    expect(store.getState().step).toBe('upload');
    expect(store.getState().meta?.category).toBe('EV');
    expect(screen.getByText('Upload documents')).toBeTruthy();
  });
  it('shows the storage notice', () => {
    mount(<App store={createStore(initialState)} storageNotice="version" />);
    expect(screen.getByTestId('storage-notice')).toBeTruthy();
  });
});
```

If jsdom lacks `crypto.randomUUID`, it is available in jsdom 30 through Node's global; otherwise add `globalThis.crypto ??= (await import('node:crypto')).webcrypto as Crypto;` in `render.tsx` (test code may import `node:`; only `src` is forbidden). The `?url` import resolves under Vitest through the Vite pipeline; if it fails in jsdom, add to the root Vitest config `web-dom` project `resolve.alias` entry `'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url': local('./apps/web/test/views/worker-url.ts')` with that file exporting `export default '/pdf.worker.mjs';`.

`en.ts`: `'upload.title': 'Upload documents'`.

- [ ] **Step 5: Build and try it**

Run: `pnpm build && pnpm build:web && pnpm vitest run apps/web/test && pnpm lint:fix && pnpm typecheck`
Expected: PASS, `apps/web/dist` contains `assets/pdf.worker.min-*.mjs`.

Run: `pnpm --filter @passwerk/web preview` in the background, open `http://localhost:4173/`, start an EV project, upload `packages/core/test/fixtures/musterwerk/lieferantenerklaerung.pdf`, confirm a row with 1 page appears and review shows proposals. Stop the preview. Report what you saw; if the PDF row shows a worker error, the `workerSrc` URL is wrong: inspect the network tab for the 404 and correct the import path.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): app shell, error boundary and startup wiring" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 13: Playwright config, helpers, Musterwerk and golden tracks

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/helpers.ts`, `apps/web/e2e/musterwerk.spec.ts`, `apps/web/e2e/golden.spec.ts`

**Interfaces:**
- Produces: `CLOCK = '2026-09-05T12:00:00.000Z'`, `pinClock(page)`, `startProject(page, { category, passportId })`, `MUSTERWERK_FILES`, `expectedMusterwerk()` computed with core in Node.

- [ ] **Step 1: playwright.config.ts**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://localhost:4173/',
    timeout: 60_000,
    reuseExistingServer: !process.env['CI'],
  },
});
```

Playwright runs on the built app: `pnpm build && pnpm build:web` must precede `pnpm e2e`.

- [ ] **Step 2: helpers.ts**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BatteryCategory } from '@passwerk/core';
import { applyMappings, extractFacts, gapReport, ingest, newDraft, SCHEMA_VERSION, suggestMappings, validate } from '@passwerk/core';
import type { Page } from '@playwright/test';

export const CLOCK = '2026-09-05T12:00:00.000Z';
export const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'packages', 'core', 'test', 'fixtures', 'musterwerk');
export const MUSTERWERK_FILES = ['lieferantenerklaerung.pdf', 'stueckliste.xlsx', 'energierechnung.pdf', 'datasheet-en.csv', 'handover-notes.docx'];
export const PASSPORT_ID = 'https://passport.musterwerk.example/battery/MW-EV-2026-000123';

export async function pinClock(page: Page): Promise<void> {
  await page.addInitScript((clock) => {
    (window as unknown as { __passwerkClock: string }).__passwerkClock = clock;
  }, CLOCK);
}

export async function startProject(page: Page, opts: { category: BatteryCategory; passportId: string }): Promise<void> {
  await page.goto('/');
  if (opts.category !== 'EV') {
    await page.getByTestId('category').click();
    await page.getByRole('option', { name: new RegExp(opts.category === 'LMT' ? 'LMT' : '2 kWh') }).click();
  }
  await page.getByTestId('passport-id').fill(opts.passportId);
  await page.getByTestId('start').click();
}

export function fixturePaths(): string[] {
  return MUSTERWERK_FILES.map((f) => join(FIXTURES, f));
}

/** What core computes in Node for the same documents, decisions and clock. */
export async function expectedMusterwerk() {
  const bundle = await ingest(MUSTERWERK_FILES.map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(FIXTURES, name))) })));
  const facts = extractFacts(bundle);
  const proposals = suggestMappings(facts, { category: 'EV' });
  const accepted = proposals.filter((p) => p.confidence >= 0.7);
  // One decision per attribute+path: the first accepted proposal in each group, mirroring the UI's grouping.
  const seen = new Set<string>();
  const decisions = accepted.filter((p) => {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const draft = newDraft({ schemaVersion: SCHEMA_VERSION, category: 'EV', createdAt: CLOCK, passportId: PASSPORT_ID });
  const applied = applyMappings(
    draft,
    decisions.map((p) => ({ attributeId: p.attributeId, ...(p.path !== undefined ? { path: p.path } : {}), value: p.value, ...(p.unit ? { unit: p.unit } : {}), source: p.source, confidence: p.confidence, override: true })),
  );
  const report = validate(applied.draft, { asOf: CLOCK });
  const gap = gapReport(applied.draft, { report, asOf: CLOCK });
  return { bundle, proposals, decisions, report, gap };
}
```

The Node helper sorts decisions by key before applying? Not needed: `applyMappings` on distinct keys is order-independent for the verdict; the UI applies in sorted key order (`decisionsToMappings`). If a mismatch appears, sort `decisions` by key in the helper.

- [ ] **Step 3: musterwerk.spec.ts**

```ts
import { expect, test } from '@playwright/test';
import { expectedMusterwerk, fixturePaths, MUSTERWERK_FILES, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('Musterwerk track: upload, accept >= 0.7, gaps match core', async ({ page }) => {
  const expected = await expectedMusterwerk();
  await pinClock(page);
  await startProject(page, { category: 'EV', passportId: PASSPORT_ID });

  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  const rows = page.getByTestId('file-row');
  await expect(rows).toHaveCount(MUSTERWERK_FILES.length);
  for (const doc of expected.bundle.documents) {
    const row = page.locator(`[data-testid="file-row"][data-file="${doc.name}"]`);
    await expect(row.getByTestId('file-pages')).toHaveText(String(doc.pages.length));
  }
  await expect(page.getByTestId('continue')).toHaveText(new RegExp(`${expected.proposals.length}`));
  await page.getByTestId('continue').click();

  // Accept the first proposal at >= 0.7 in each pending group, exactly as the Node helper did.
  for (const p of expected.decisions) {
    const key = p.path === undefined ? p.attributeId : `${p.attributeId}#${p.path}`;
    const group = page.locator(`[data-testid="group"][data-key="${key}"]`);
    await group.locator(`[data-testid="proposal"][data-fact="${p.factId}"]`).getByTestId('accept').click();
  }
  await expect(page.getByTestId('review-summary')).toContainText(String(expected.decisions.length));

  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.report.verdict);
  await expect(page.getByTestId('completeness-mandatory')).toContainText(expected.gap.completeness.mandatory.percent);

  const shownFindings = await page.getByTestId('finding').evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
  expect(shownFindings).toEqual(expected.report.findings.map((f) => f.ruleId).sort());

  const shownItems = await page.getByTestId('gap-item').evaluateAll((els) =>
    els.map((e) => `${e.getAttribute('data-attribute')}:${e.getAttribute('data-status')}:${e.getAttribute('data-bucket')}`).sort(),
  );
  expect(shownItems).toEqual(expected.gap.items.map((i) => `${i.attributeId}:${i.status}:${i.bucket}`).sort());
});
```

Groups accepted after the filter is "pending" disappear from the list; the loop locates each group by key before clicking, so it still finds it while pending. If a group is hidden because an earlier accept in the same key already happened (not possible, one accept per key), switch the filter to `all` first: `await page.getByTestId('filter-all').click();`. Do that at the top of the loop to be safe.

- [ ] **Step 4: golden.spec.ts**

```ts
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BROKEN_SAMPLE_NAMES, getSample, VALID_SAMPLE_NAMES, validate } from '@passwerk/core';
import { expect, test } from '@playwright/test';
import { CLOCK, pinClock } from './helpers.ts';

for (const name of [...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES]) {
  test(`golden track: ${name}`, async ({ page }) => {
    const draft = getSample(name);
    const expected = validate(draft, { asOf: CLOCK });
    const path = join(tmpdir(), `passwerk-${name}.json`);
    writeFileSync(path, JSON.stringify(draft));

    await pinClock(page);
    await page.goto('/');
    await page.getByTestId('import-draft').setInputFiles(path);
    await expect(page.getByTestId('review-summary')).toBeVisible();
    await page.getByTestId('to-gaps').click();
    await expect(page.getByTestId('verdict')).toHaveAttribute('data-verdict', expected.verdict);
    const shown = await page.getByTestId('finding').evaluateAll((els) => els.map((e) => e.getAttribute('data-rule')).sort());
    expect(shown).toEqual(expected.findings.map((f) => f.ruleId).sort());
  });
}
```

- [ ] **Step 5: Install Chromium locally and run**

```bash
pnpm --filter @passwerk/web exec playwright install chromium
pnpm build && pnpm build:web && pnpm e2e
```

Expected: 1 Musterwerk test and 8 golden tests pass. Common failures and fixes:
- The verdict differs between browser and Node: check `asOf` reaches `validate` (App passes `asOf` from `nowIso()` which reads the pinned clock) and that `createdAt` equals the clock.
- Finding lists differ by one L1 finding: the browser applied decisions in a different order. Sort `decisions` by key in `helpers.ts` (`decisions.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))`).
- pdfjs worker 404: see Task 12 Step 5.

- [ ] **Step 6: Commit**

```bash
pnpm lint:fix && git add -A && git commit -m "test(web): Playwright Musterwerk and golden tracks against core in Node" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 14: Sovereignty and persistence specs

**Files:**
- Create: `apps/web/e2e/sovereignty.spec.ts`, `apps/web/e2e/persistence.spec.ts`

- [ ] **Step 1: sovereignty.spec.ts**

```ts
import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('no request leaves the preview origin during the Musterwerk track', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:4173/').origin;
  const foreign: string[] = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) foreign.push(req.url());
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __beacons: string[] };
    w.__beacons = [];
    navigator.sendBeacon = (url: string | URL) => {
      w.__beacons.push(String(url));
      return false;
    };
  });
  await pinClock(page);
  await startProject(page, { category: 'EV', passportId: PASSPORT_ID });
  await page.getByTestId('file-input').setInputFiles(fixturePaths());
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();
  await page.getByTestId('filter-all').click();
  await page.getByTestId('accept').first().click();
  await page.getByTestId('to-gaps').click();
  await expect(page.getByTestId('verdict')).toBeVisible();
  await page.getByTestId('export-aasJson').click();

  const beacons = await page.evaluate(() => (window as unknown as { __beacons: string[] }).__beacons);
  expect(foreign).toEqual([]);
  expect(beacons).toEqual([]);
});
```

- [ ] **Step 2: persistence.spec.ts**

```ts
import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

test('decisions and step survive a reload', async ({ page }) => {
  await pinClock(page);
  await startProject(page, { category: 'EV', passportId: PASSPORT_ID });
  await page.getByTestId('file-input').setInputFiles(fixturePaths().slice(0, 2));
  await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
  await page.getByTestId('continue').click();
  await page.getByTestId('filter-all').click();
  const accepts = page.getByTestId('accept');
  for (let i = 0; i < 3; i++) await accepts.nth(i).click();
  const summary = await page.getByTestId('review-summary').textContent();
  await page.waitForTimeout(500); // autosave debounce (300 ms)

  await page.reload();
  await expect(page.getByTestId('review-summary')).toHaveText(summary ?? '');
  await page.getByTestId('filter-accepted').click();
  await expect(page.getByTestId('group')).toHaveCount(3);
});
```

Three clicks may land in fewer than three groups when a group holds several proposals; the accepted-filter count then differs. To make it exact, click the first `accept` of three distinct `[data-testid="group"]` elements: `for (let i = 0; i < 3; i++) await page.getByTestId('group').nth(i).getByTestId('accept').first().click();`. Use that form.

- [ ] **Step 3: Run and commit**

Run: `pnpm e2e`
Expected: 11 tests pass.

```bash
pnpm lint:fix && git add -A && git commit -m "test(web): browser sovereignty and persistence specs" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
```

---

### Task 15: CI job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the job after `lint`**

```yaml
  # Phase 7a (ADR D-029): the built web app is driven by Playwright against core's own results
  # for the same inputs, and every browser request must stay on the preview origin.
  web:
    name: Web app (Playwright, Chromium)
    needs: lint
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build && pnpm build:web
      - name: Playwright version
        id: pw
        run: echo "version=$(pnpm --filter @passwerk/web exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v4
        id: pw-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}
      - run: pnpm --filter @passwerk/web exec playwright install --with-deps chromium
        if: steps.pw-cache.outputs.cache-hit != 'true'
      - run: pnpm --filter @passwerk/web exec playwright install-deps chromium
        if: steps.pw-cache.outputs.cache-hit == 'true'
      - run: pnpm e2e
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-report
          path: apps/web/playwright-report
          retention-days: 14
```

- [ ] **Step 2: Sovereignty Docker job**

`tools/sovereignty/Dockerfile` copies the repo and runs `pnpm test`, which now includes the jsdom project. jsdom needs no network. No change; if the Docker run fails on `apps/web` tests, add `--project node` to that `CMD` and record why in the Dockerfile comment.

- [ ] **Step 3: Commit and push**

```bash
git add -A && git commit -m "ci: run the web app's Playwright suite on Ubuntu with a browser cache" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
git push -u origin feat/web-app-first-slice
```

Watch the run with `gh run watch`. Fix anything red before Task 16.

---

### Task 16: Records, final verification, PR

**Files:**
- Modify: `docs/DECISIONS.md`, `docs/BUILD_PLAN.md` (Phase 7a block), `AGENTS.md` (status), `README.md`

- [ ] **Step 1: ADR D-029**

Append to `docs/DECISIONS.md`:

```markdown
## D-029: The web app's first slice is one package with a tested import boundary and derived verdicts (2026-09-05)

**Context.** D-024 put a minimal web workflow (upload, review, gaps, export) before the MCP
server so the primary product (D-019) meets real documents first. The build plan wanted the
review, gap and export views reusable by the MCP App (Phase 7b), and asked for a Playwright
run that "reaches `valid` on the valid set". A probe on 2026-09-05 showed the Musterwerk
documents cover 15 of 47 mandatory data points after accepting every proposal at confidence
>= 0.7, so no document-only run can reach `valid`.

**Decision.** `apps/web` is a single Vite package in three layers, `workflow` (pure TypeScript
over core), `views` (props-driven React on shadcn/ui) and `app` (shell, persistence), with the
import direction enforced by a unit test rather than by a second package; Phase 7b lifts
`views` out when it needs them. Only inputs are state (meta, base draft, file summaries, facts,
proposals, decisions); the draft, conflicts, validation report and gap report are derived on
every change from base draft plus decisions, so the screen can never show a stale verdict.
Decisions are keyed by attribute and composite path with one decision per key, and every
decision carries `override: true` because a user's choice is the resolution. The input state
autosaves to IndexedDB without document bytes; a version mismatch is reported, never migrated.
The definition of done has two tracks: the Musterwerk documents must produce in the browser
the same verdict, findings and gap items core computes in Node for the same inputs and clock,
and the eight golden samples imported as draft JSON must show core's verdicts. A browser-side
sovereignty test fails on any request that leaves the preview origin.

**Consequences.** Build plan Phase 7a's definition of done is reworded. The page reads its
clock from one module that honours `window.__passwerkClock` so Playwright and the Node oracle
agree on `asOf`. CI gains an Ubuntu Playwright job with a cached Chromium (about four billed
minutes). The project screen, extracted-facts screen, HTML sheet, QR and bring-your-own-key
mode remain for the rest of Phase 7a and Phase 7.
```

- [ ] **Step 2: Build plan and AGENTS.md**

In `docs/BUILD_PLAN.md`, Phase 7a block, replace the `DoD:` line with:

```markdown
- DoD (first slice, D-029): Playwright on the built app, Chromium. Musterwerk track: the five fixtures uploaded and every proposal at confidence >= 0.7 accepted show the verdict, findings and gap items core computes in Node for the same inputs and clock. Golden track: each golden sample imported as draft JSON shows core's verdict and finding ids. Sovereignty: no request leaves the preview origin. Persistence: decisions survive a reload. The documents alone do not reach `valid` (31.9 % of mandatory data points), which is why `valid` is measured on the golden samples.
```

In `AGENTS.md` status, append before `- **Next:`:

```markdown
- **Phase 7a, first slice (`apps/web`): done.** Vite, React, Tailwind and shadcn/ui in three
  layers (`workflow`, `views`, `app`) with a tested import boundary (ADR D-029). Start, upload,
  review (accept, reject, edit, manual values, composite leaves), gaps and export (AAS JSON,
  AASX, draft JSON, gap report JSON), DE/EN chrome, IndexedDB autosave without document bytes.
  Playwright proves browser results equal core's Node results on the Musterwerk fixtures and
  the golden samples, and that no request leaves the origin. `pnpm dev` to run it.
```

Replace the `- **Next:` line with:

```markdown
- **Next: Phase 6** (MCP server, agent skill, CLI), then Phase 7, 7b, 7c (D-024 order). The
  rest of Phase 7a (project screen with obligations, facts screen, HTML sheet, QR, BYOK)
  follows Phase 7.
```

Add to the `Commands` block in `AGENTS.md`:

```
pnpm build:web          # vite build of apps/web (after pnpm build)
pnpm e2e                # Playwright suite of apps/web (after pnpm build:web; needs Chromium)
```

`README.md`: add a short "Web app" section with `pnpm install && pnpm build && pnpm --filter @passwerk/web dev`, stating that documents never leave the browser and that autosave keeps decisions but not files.

- [ ] **Step 3: Final verification**

Run, and paste the real output in the PR description:

```bash
pnpm check
pnpm build:web && pnpm e2e
pnpm oracle
```

Expected: check green (both Vitest projects), 11 Playwright tests pass, oracle 16/16 unchanged with no diff under `docs/CONFORMANCE.md` beyond the Generated line.

- [ ] **Step 4: Commit, push, PR**

```bash
pnpm lint:fix && git add -A && git commit -m "docs: ADR D-029, Phase 7a first-slice status and commands" -m "Claude-Session: https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V"
git push
gh pr create --title "feat(web): Phase 7a first slice, upload, review, gaps and export" --body-file - <<'EOF'
Phase 7a first slice per docs/superpowers/specs/2026-09-05-web-app-first-slice-design.md and ADR D-029.

- apps/web: Vite, React, Tailwind, shadcn/ui; layers workflow -> views -> app with a boundary test
- inputs-only state, derived draft/report/gap; IndexedDB autosave without document bytes
- start, upload, review (accept/reject/edit/manual, composite leaves), gaps and export (AAS JSON, AASX, draft JSON, gaps JSON); DE/EN
- Playwright: Musterwerk track vs core in Node, golden track (8 samples), browser sovereignty, persistence
- CI: web job on Ubuntu with cached Chromium

Verification output:
(paste pnpm check, pnpm e2e and pnpm oracle summaries here)

https://claude.ai/code/session_01P44CDBq3WwogwgySHUao2V
EOF
```

---

## Self-review against the spec

- Section 1 table: app (Tasks 2, 12), Musterwerk track (13), golden track (13), sovereignty (14), persistence (14), unit tests (3 to 12), CI (15), records (16). Covered.
- Section 3 layout: `parts/` names differ slightly (`Lang.tsx` holds `LangSpan`); `hooks/` is not created because nothing needs it. `components.json` and `lib/utils.ts` come from shadcn. Root `pnpm build` stays `tsc -b`; the web build is `pnpm build:web` (deviation from the spec's "root build gains a vite step", chosen to keep the six-runner matrix cheap; noted in the ADR consequences line about CI cost).
- Section 4 state: `Decision` here carries `attributeId` and `path` explicitly rather than parsing the key; `value` is a string (typed by the user or core's canonical string). `categoryOf` helper unused by later tasks; harmless.
- Section 5 screens: all four, plus header stepper and language toggle (Task 12). Composite leaf picker shows first-level keys of object composites (Task 10).
- Section 6: toast with copy (Task 12), error boundary per step (Task 12 wraps the current view), import validation (Task 6), storage notice (Task 12), dictionary parity test (Task 3), Intl formatting only for the resume timestamp (Task 8).
- Section 7: every listed Vitest file exists (`reducer`, `derive`, `ingest`, `draftIo`, `persistence`, `i18n`, `boundary`, views) plus `exports` and `reviewModel`; four Playwright specs.
- Section 8: CI job matches (cache keyed on the Playwright version; deps still installed on a cache hit).
- Type consistency: `Decision` shape identical in Tasks 4, 5, 10, 12; `ExportFile` in 6 and 7; `Derived` in 5, 6, 12; `FileSummary` in 4, 6, 9; `t`, `pick`, `verdictKey`, `Key`, `LangText`, `Language` from Task 3 everywhere.
