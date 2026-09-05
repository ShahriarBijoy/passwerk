# Phase 7a design: web app, first slice (upload, review, gaps, export)

Status: approved 2026-09-05. Branch `feat/web-app-first-slice`.
Scope: `docs/BUILD_PLAN.md` section 7, Phase 7a, first slice as ordered by ADR D-024
(after Phase 5b, before Phase 6). Everything lands in a new `apps/web` package plus one
CI job, one ADR (D-029) and a rewording of the Phase 7a definition of done. No change to
`@passwerk/core` or `@passwerk/rules` beyond what a red test forces.

## 1. Goal and definition of done

The primary product (ADR D-019) gets its first end-to-end workflow so real supplier documents
are exercised in a browser before any agent surface is built (ADR D-024).

| Deliverable | Done when |
|---|---|
| `apps/web` (`@passwerk/web`) | Static Vite app, React, TypeScript strict, Tailwind, shadcn/ui, bundling `@passwerk/core` from its built `dist`; four steps: start, upload, review, gaps and export |
| Musterwerk track (Playwright) | Uploading the five fixtures, accepting every proposal at confidence >= 0.7 and opening the gaps screen shows the same verdict, findings and gap items core computes in Node for the same inputs |
| Golden track (Playwright) | Importing each of the eight golden samples as draft JSON shows `valid` for the three valid samples and the same finding ids core reports for the five broken samples |
| Sovereignty (Playwright) | Every request the page makes during the Musterwerk track targets the preview server's origin; any other URL fails the test |
| Persistence (Playwright) | Decisions survive a reload |
| Unit tests (Vitest) | Reducer and derivation, file removal cascade, draft import rejection, persistence codec version guard, dictionary key parity, import-boundary test, one render test per view |
| CI | One Ubuntu job builds the app, installs Chromium (cached on the Playwright version) and runs the four specs; lint, typecheck and the matrix cover the app through the workspace |
| Records | ADR D-029; Phase 7a definition of done reworded in the build plan; status line in `AGENTS.md` |

`pnpm check` green, oracle parity unchanged at 16/16, main green before the PR opens.

### 1.1 Why the definition of done has two tracks

A probe on 2026-09-05 applied every Musterwerk proposal at confidence >= 0.7 (32 proposals,
26 applied, no conflicts) and validated the result: verdict `invalid`, 29 findings, mandatory
completeness 15 of 47 (31.9 %). The documents cover a third of the mandatory data points, so no
document-only run can reach `valid`. "Valid on the valid set" is therefore measured on the
golden samples through draft import, and the Musterwerk run is measured against core itself.
Extending the fixtures until they reach `valid` is domain work that would also move the
Phase 4 recall gate; it is out of scope (option B in the brainstorm, rejected).

The probe also showed composites arriving half-filled (chemistry with only `shortName`,
manufacturer information without `identifier`). The review screen therefore needs composite
leaf entry, not only accept and reject.

## 2. Principles carried in from earlier phases

- **Core is the only domain logic.** The app calls `ingest`, `extractFacts`, `suggestMappings`,
  `applyMappings`, `validate`, `gapReport`, `emitAasJson` and `emitAasx`. It composes no
  verdict, no legal text and no mapping heuristic of its own.
- **Only inputs are state; everything else is derived** (section 4). The screen can never
  show a verdict that disagrees with the draft it shows.
- **No network, no backend, no telemetry** (ADRs D-006, D-013). IndexedDB is the only storage
  and holds no document bytes.
- **No floats.** Numbers pass through as core's canonical strings; the app formats them for
  display only and never parses them back except in the edit field, where the typed string is
  handed to core unchanged.
- **Injected clock.** `createdAt` is set once at the start step; `asOf` for validate and gap
  report is the app's clock injected at call time, never `Date.now()` inside a component.
- **Bilingual from the first screen.** Every chrome string exists in `de` and `en`; every
  knowledge-base string is picked from core's `{ de, en }` pairs at render time.
- **No `useEffect`.** Async work lives in event handlers; subscriptions use
  `useSyncExternalStore`; startup reads happen before the first render.
- **Dependency ages.** Every new package is pinned to a release at least three days old
  (pnpm `minimumReleaseAge`).

## 3. Package layout and stack

```
apps/web/
  index.html
  package.json            @passwerk/web, private, scripts: dev, build, preview, e2e
  vite.config.ts          react plugin, tailwind plugin, base './'
  tsconfig.json           extends ../../tsconfig.base.json, jsx react-jsx, DOM lib
  playwright.config.ts    chromium only, webServer = vite preview on the built app
  components.json         shadcn configuration
  src/
    main.tsx              reads IndexedDB, creates the store, renders <App/>
    workflow/             pure TypeScript, no React import allowed
      state.ts            WorkflowState, Decision, FileSummary, schema version
      reducer.ts          actions and the pure reducer
      derive.ts           deriveDraft, deriveReport, deriveGap (memoised on inputs)
      ingest.ts           ingestFiles(files, workerSrc, clock) -> summaries, facts, proposals
      draftIo.ts          importDraftJson (schema-checked), exportDraftJson
      exports.ts          aasJson, aasx, gapReportJson as { name, bytes, type }
      store.ts            createStore(reducer, initial): getState, dispatch, subscribe
    views/                props-driven React on shadcn primitives
      StartView.tsx
      UploadView.tsx
      ReviewView.tsx
      GapsExportView.tsx
      parts/              shared pieces: VerdictChip, ConfidenceBadge, SourceRef, LangText
    components/ui/        shadcn primitives (button, card, dialog, alert-dialog, badge,
                          select, input, table, tabs, toast, progress, separator)
    app/
      App.tsx             shell: header, stepper, language toggle, error boundary per step
      persistence.ts      idb-keyval codec, debounced subscriber, version guard
      useStore.ts         useSyncExternalStore binding with selectors
      clock.ts            nowIso(): the one place the wall clock is read
    i18n/
      keys.ts             the key union type
      de.ts, en.ts        Record<Key, string>
      useT.ts             t(key, params) bound to the current language
  test/                   vitest (jsdom for view render tests)
  e2e/                    playwright specs and helpers
  public/                 nothing beyond favicon; the pdf worker is an imported asset
```

Stack, each pinned at a release at least three days old at install time: Vite, React 19,
`@vitejs/plugin-react`, Tailwind 4 with `@tailwindcss/vite`, shadcn/ui components generated
into `src/components/ui`, `idb-keyval`, Playwright, `jsdom` and
`@testing-library/react` for the view render tests.

**Import direction** is `workflow` -> `views` -> `app`. `views` may import `workflow` types
and `components/ui`; it may not import `app`, `idb-keyval` or `main.tsx`. `workflow` may not
import React or anything under `views`, `app` or `components`. A Vitest test walks the
import statements of every file under `src` and fails on a violation. Phase 7b lifts
`views` and `components/ui` into a package once the MCP App needs them.

**Core in the browser.** The app imports `@passwerk/core` by name; Vite resolves the
workspace link to the package's `dist`, so `pnpm build` at the root runs `tsc -b` first and
then `pnpm --filter @passwerk/web build`. pdfjs is loaded lazily by core; the app imports
`pdfjs-dist/legacy/build/pdf.worker.min.mjs?url` and passes the URL as
`{ pdf: { workerSrc } }` to `ingest` (D-016). `@passwerk/rules` ships JSON artefacts through
`import ... with { type: 'json' }`, which Vite bundles. No polyfills are expected; if the
first build shows a Node-only import reachable from core's public surface, that is a core bug
under ADR D-006 and is fixed in core with a test.

**Root wiring.** `pnpm-workspace.yaml` gains `apps/*`. `vitest.config.ts` gains
`apps/*/test/**/*.test.{ts,tsx}` and a jsdom environment for `apps/web/test/views`. The root
`tsconfig.json` references `apps/web` for typecheck; the app's tsconfig uses `noEmit` because
Vite emits. `biome.json` covers the app; generated shadcn files are formatted once and then
linted like everything else. `tsconfig.test.json` gains the `apps/*/test` include and the DOM
lib for that path.

## 4. Workflow state and derivation

### 4.1 State (persisted inputs)

```ts
interface WorkflowState {
  version: 1;
  step: 'start' | 'upload' | 'review' | 'gaps';
  language: 'de' | 'en';
  meta: PassportMeta | null;             // category, passportId, createdAt, schemaVersion
  baseDraft: PassportDraft | null;       // newDraft(meta) or an imported draft
  files: FileSummary[];                  // name, size, sha256, format, pages, lang, error?
  facts: FactSet | null;
  proposals: MappingProposal[];
  decisions: Record<DecisionKey, Decision>;
  updatedAt: string;                     // ISO, set by the reducer from the injected clock
}

type DecisionKey = `${attributeId}` | `${attributeId}#${path}`;

type Decision =
  | { kind: 'accept'; factId: string }
  | { kind: 'reject'; factId: string }
  | { kind: 'edit'; factId: string; value: unknown; unit?: string }   // keeps the proposal's source
  | { kind: 'manual'; value: unknown; unit?: string };                // no proposal, no source
```

Categories offered at the start step are the passport model's three (`EV`, `LMT`,
`INDUSTRIAL_GT_2KWH`), which is what `PassportMeta` accepts. The seven battery types of
`checkObligations` belong to the project screen of the later, full Phase 7a.

Document bytes exist only inside `ingestFiles` and are dropped when it returns.

### 4.2 Derivation (never persisted)

```
decisionsToMappings(state)  -> MappingDecision[]  (accept/edit/manual; reject contributes nothing)
deriveDraft(state)          -> applyMappings(structuredClone(baseDraft), mappings)  -> { draft, conflicts }
deriveReport(state, asOf)   -> validate(draft, { asOf })
deriveGap(state, asOf)      -> gapReport(draft, { report, asOf })
```

Each derivation is memoised on the identity of its inputs so a language toggle or a filter
change recomputes nothing. Re-running the chain on the same inputs is byte-identical; a unit
test asserts it. `asOf` is read once per dispatch through `clock.ts` and stored on the
derived bundle so the report and the gap report agree on "now".

Grouping in the review screen is by `DecisionKey`. Accepting a proposal in a group rejects
every other proposal in the group in the same reducer action, so two documents disagreeing on
one field are resolved by choice. `applyMappings` can therefore only report conflicts from a
`baseDraft` that already contains `conflict` fields (an imported draft); those are rendered in
the review screen as errors with the existing and incoming values, and the verdict is
`invalid` as ADR D-026 requires.

### 4.3 Actions

| Action | Effect |
|---|---|
| `startProject(meta)` | sets `meta`, `baseDraft = newDraft(meta)`, `step = 'upload'` |
| `importDraft(draft)` | sets `meta` from the draft, `baseDraft = draft`, clears files, facts, proposals, decisions, `step = 'review'` |
| `filesIngested(summaries, facts, proposals)` | appends summaries, merges facts and proposals by file name |
| `fileRemoved(name)` | drops the summary, its facts, its proposals and every decision whose proposal came from it |
| `decide(key, decision)` | sets the decision; `accept` and `edit` also set `reject` on the group's other proposals |
| `clearDecision(key)` | returns the group to pending |
| `setLanguage(lang)`, `goTo(step)` | as named |
| `reset()` | returns to the initial state and clears IndexedDB |

Every action carries the clock value it was dispatched with; the reducer writes it to
`updatedAt` and never reads the clock itself.

### 4.4 Ingest

`ingestFiles(files: File[], options)` runs in the upload handler: reads bytes, calls core's
`ingest` with the worker URL and default limits, then `extractFacts` and `suggestMappings`
with the project category. Files that throw `IngestFailure` produce a summary with `error`
and no facts; the others proceed. The function is pure over its inputs and is unit-tested with
the Musterwerk fixtures in Node (no worker URL needed there).

### 4.5 Draft import and export

`importDraftJson(text)` parses JSON and runs core's `PassportDraft` schema; the first issue is
reported in plain words and nothing is dispatched. `exportDraftJson(state)` serialises the
derived draft with sorted keys through core's canonical JSON. Exports use `emitAasJson` and
`emitAasx` and offer the files at any verdict; the verdict is displayed next to the buttons.
File names are `<passport-id-slug>.aas.json`, `.aasx`, `.draft.json`, `.gaps.json`.

## 5. Screens

**Start.** Category select (three passport categories, bilingual labels), passport identifier
prefilled with `urn:passwerk:draft:<uuid>` and a hint to replace it with the supplier's own
scheme. Secondary actions: import draft JSON; when IndexedDB holds a session, a resume card
(category, file names, `updatedAt`) with a start-over behind a shadcn alert dialog.

**Upload.** Drop zone and file picker, PDF, XLSX, DOCX, CSV, TXT, multiple. Each file is
ingested on add and shown as a row with format, pages and language, or its error text. A
remove action per row. A continue button showing the number of proposals waiting.

**Review.** Groups by decision key, sorted by submodel then attribute id, each showing the
bilingual attribute name and legal reference from core's explain data. Each proposal row:
value, unit, confidence badge, source (file plus page or cell), the `why` text. Actions
accept, reject, edit (inline value and unit). Filter bar: pending, accepted, rejected, all,
plus text search over attribute names and values. Sticky summary: accepted, pending, live
verdict chip. "Add value" dialog: attribute picker for the category, leaf picker for
composites (from core's composite schemas), value and unit.

**Gaps and export.** Verdict card with finding counts per layer, then the findings list
(rule id, bilingual message, attribute). Gap report: two completeness bars (mandatory,
overall), items grouped by data owner with a toggle for by submodel, each showing bucket,
status, legal reference and next action, with the not-legal-advice line always visible.
Export bar: AAS JSON, AASX, draft JSON, gap report JSON.

The header holds the stepper (steps reachable once their prerequisite exists) and the DE/EN
toggle.

## 6. Errors, language and persistence

**Errors.** Per-file ingest failures stay on their row. Any other exception thrown in a
handler becomes a toast with the message and a copy-details action. An error boundary wraps
each step and offers reload and start-over. Draft import rejects invalid JSON before touching
state. IndexedDB unavailable degrades to memory with a visible notice.

**Language.** `keys.ts` declares the key union; `de.ts` and `en.ts` are `Record<Key, string>`
so a missing key is a type error, and a test asserts identical key sets. Display formatting of
numbers and dates uses `Intl` for the chosen language; exported files carry core's canonical
values untouched.

**Persistence.** One IndexedDB key (`passwerk.web.state`) holds `WorkflowState` with its
`version`. A stored state with a different version is left in place and reported as "previous
session could not be restored", never migrated silently. Writes are debounced (300 ms) from a
store subscriber. Startup awaits the read before the first render.

## 7. Testing

**Vitest (`apps/web/test`).**

- `reducer.test.ts`: each action; accept rejects siblings; file removal cascade; `updatedAt`
  from the injected clock only.
- `derive.test.ts`: decisions in, draft, report and gap out; byte-identical re-run; imported
  draft with a `conflict` field yields `invalid`.
- `ingest.test.ts`: Musterwerk fixtures through `ingestFiles` in Node; a corrupt file yields
  an error summary without failing the batch.
- `draftIo.test.ts`: every golden sample imports; malformed JSON and a schema violation are
  rejected with a message; export round-trips.
- `persistence.test.ts`: codec round-trip; unknown version rejected; `idb-keyval` mocked.
- `i18n.test.ts`: `de` and `en` have identical key sets; no empty strings.
- `boundary.test.ts`: import direction (section 3) over every file in `src`.
- `views/*.test.tsx`: each view mounts with fixture props under jsdom and shows its headline
  content in both languages.

**Playwright (`apps/web/e2e`).** Chromium only; the config starts `vite preview` on the built
app. Helpers compute the expected values by calling `@passwerk/core` in Node with the same
inputs and clock.

1. `musterwerk.spec.ts`: start EV, upload the five fixtures, assert five rows with the
   expected format and page count from `expected.json`, accept every proposal at >= 0.7,
   open gaps, and assert verdict, finding ids and every gap item's status equal core's result
   for the same decisions.
2. `golden.spec.ts`: for each of the eight samples, import, assert the verdict chip and the
   set of finding ids equal core's `validate` in Node.
3. `sovereignty.spec.ts`: register a request listener before navigation; run the Musterwerk
   track; assert every request URL has the preview server's origin. Also assert
   `navigator.sendBeacon` was never called (stubbed to record).
4. `persistence.spec.ts`: accept three proposals, reload, assert they are still accepted and
   the step is restored.

The clock is injected into the page through a `window.__passwerkClock` hook that `clock.ts`
honours only when present, so the browser and the Node oracle agree on `asOf`.

## 8. CI

New job `web` in `.github/workflows/ci.yml`, `needs: lint`, Ubuntu:

```
pnpm install --frozen-lockfile
pnpm build
actions/cache on ~/.cache/ms-playwright keyed by the Playwright version from the lockfile
pnpm --filter @passwerk/web exec playwright install --with-deps chromium   (skipped on cache hit except deps)
pnpm --filter @passwerk/web e2e
upload playwright-report on failure, 14 days
```

Estimated cost about four billed minutes per run, under three with a warm cache, against a
current run cost of about forty billed minutes.

## 9. Records and sequencing

1. Fix PR first: raise the `beforeAll` timeout of `packages/core/test/extract.facts.test.ts`
   (PDF ingest on the Windows runner exceeded the 10 s default under Node 24 on 2026-09-05),
   so main is green before the web branch opens.
2. ADR D-029: one package with a tested import boundary rather than a UI package; inputs-only
   state with derived verdicts; IndexedDB autosave without document bytes; two-track
   definition of done because the Musterwerk documents cover 31.9 % of mandatory data points.
3. Build plan Phase 7a: replace the definition of done with the two tracks; note that the
   start step carries only category and passport id in this slice.
4. `AGENTS.md` status gains the Phase 7a slice line when the PR lands.

## 10. Out of scope for this slice

Project screen with obligations check, role, capacity and dates; extracted-facts screen;
HTML passport sheet and QR (Phase 7); bring-your-own-key model call; routing and deep
links; storing document bytes; any change to the knowledge base or the synonym index.
