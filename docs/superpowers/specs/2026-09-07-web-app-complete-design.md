# Phase 7a design: web app, second slice (project, facts, row editor, QR preview)

Status: approved in conversation 2026-09-07. Branch `feat/web-app-complete`.
Scope: the rest of `docs/BUILD_PLAN.md` section 7, Phase 7a, except the bring-your-own-key
model call, which ships as its own PR with its own ADR and sovereignty rules. Everything here
lands in `apps/web`, one ADR (D-036), the build plan status and `AGENTS.md`. No change to
`@passwerk/core` or `@passwerk/rules` beyond what a red test forces.

## 1. Goal and definition of done

The supplier web app (ADR D-019) becomes complete: a project screen that answers "do I need
a passport" before any upload, a facts screen that shows what the documents contain and lets
the user correct and map facts, a row editor for the five array composites (issue #23), and a
live QR preview from the Phase 7 carrier.

| Deliverable | Done when |
|---|---|
| Project screen | Battery type (seven), role (six), energy, placed-on-market date drive `checkObligations`; the DE/EN verdict, reason, timeline, role guidance and sources are shown; the passport category is derived or, for a voluntary passport, chosen by hand; the identifier is entered as GS1 Digital Link (GTIN plus serial or GIAI), https URI or draft urn, with live validation and QR preview |
| Facts screen | Every extracted fact with file, page or cell provenance; search, filter by document and mapping status; edit value and unit; map an unmapped fact to an attribute with provenance kept |
| Row editor (#23) | Array composites are entered and edited as rows validated against core's composite schema before dispatch; the review shows the row count |
| QR preview | The project and export screens render the QR inline with its payload; a non-https identifier shows the carrier's DE/EN reason instead |
| State v2 | Proposals are derived from facts and category; project inputs and fact edits are state; a v1 session is reported as not restorable |
| Tests | Vitest for every new reducer action, derivation, schema walk and view; Playwright for the project, facts, row editor and QR tracks, each compared with core in Node |
| Records | ADR D-036; Phase 7a status in the build plan and `AGENTS.md`; issue #23 closed by the PR |

`pnpm check` green, oracle parity unchanged at 16/16, `pnpm build:web && pnpm e2e` green.

## 2. Principles carried in from the first slice

Unchanged from `2026-09-05-web-app-first-slice-design.md` section 2: core is the only domain
logic; only inputs are state; no network, no backend, no telemetry; no floats; injected
clock; bilingual chrome; no `useEffect`; dependency ages. Two additions:

- **Chrome labels for core enums.** Battery types and roles are core identifiers without
  knowledge-base labels; their DE/EN labels are app chrome in `i18n`, keyed by the enum value
  so a new core value is a type error. Everything legal (verdict reasons, timeline titles,
  role guidance) is core's `LangText`, picked at render time.
- **Every derivation is memoised on its own inputs**, not on the whole state, so a language
  toggle, a filter or a screen change recomputes nothing.

## 3. State (version 2)

```ts
interface WorkflowState {
  version: 2;
  step: 'project' | 'upload' | 'facts' | 'review' | 'gaps';
  language: 'de' | 'en';
  project: Project | null;
  importedDraft: PassportDraft | null;         // from draft import, else null
  files: FileSummary[];
  facts: FactSet | null;
  factEdits: Record<string, FactEdit>;         // by fact id
  decisions: Record<DecisionKey, Decision>;
  generation: number;
  updatedAt: string;
}

interface Project {
  batteryType: BatteryType;                    // core BATTERY_TYPES
  role: Role;                                  // core ROLES
  energyKwh?: string;                          // decimal string
  placedOnMarketDate?: string;                 // ISO date (YYYY-MM-DD)
  manualCategory?: BatteryCategory;            // chosen by hand; voluntary passport or import
  identifier: Identifier;
  createdAt: string;                           // stamped once from the action clock
}
```

A derived category always wins; the hand-picked one applies only when the check derives none.

```ts
type Identifier =
  | { mode: 'gs1'; resolverBase: string; gtin: string; serial: string }
  | { mode: 'gs1-giai'; resolverBase: string; giai: string }
  | { mode: 'https'; uri: string }
  | { mode: 'draft'; urn: string };

interface FactEdit { value: string; unit?: string }

type Decision =
  | { kind: 'accept'; attributeId; path?; factId }
  | { kind: 'reject'; attributeId; path?; factId }
  | { kind: 'edit'; attributeId; path?; factId; value; unit?; recordedAt? }
  | { kind: 'manual'; attributeId; path?; factId?; value; unit?; recordedAt? };  // factId new
```

Removed from v1: `meta` (derived from `project`), `baseDraft` (derived), `proposals`
(derived). `STATE_VERSION` becomes 2; `loadState` reports a stored v1 as `version` exactly
as it does today, so a user sees "previous session could not be restored" once.

`manual.factId` anchors a manual value to a fact so a value mapped from the facts screen
keeps that fact's provenance. `manual` without `factId` is the Add Value dialog's case and
stays source-less.

### 3.1 Actions

| Action | Effect |
|---|---|
| `setProject(project)` | replaces `project`; `createdAt` is taken from the previous project when one exists, else from the action's `at`; `step` becomes `upload` on the first call, unchanged after |
| `importDraft(draft)` | `importedDraft = draft`; `project` from the draft's meta (section 3.2); clears files, facts, fact edits and decisions; `step = 'review'` |
| `filesIngested(summaries, facts)` | as today minus proposals; `factEdits` for facts that disappeared are pruned with the decisions |
| `fileRemoved(name)` | as today, plus its fact edits |
| `editFact(factId, edit)`, `clearFactEdit(factId)` | set or drop the override; unknown fact ids are ignored |
| `decide`, `clearDecision`, `setLanguage`, `goTo`, `reset` | as today |

`startProject` is removed; `setProject` covers it.

### 3.2 Draft import fills the project

The draft's `meta.category` becomes `project.manualCategory`.
The battery type is the category mapped back (`EV` to `EV`, `LMT` to `LMT`,
`INDUSTRIAL_GT_2KWH` to `INDUSTRIAL` with `energyKwh` unset, so the obligations panel reports
insufficient input until the user fills it in). The role defaults to `manufacturer`. The
identifier is `{ mode: 'https', uri }` when `meta.passportId` is an absolute https URI, else
`{ mode: 'draft', urn: meta.passportId }`. `createdAt` is the draft's.

## 4. Derivation

```
obligations  = checkObligations({ batteryType, role, energyKwh, placedOnMarketDate, asOf })
identifier   = passportIdOf(project.identifier)
               -> { ok: true, passportId, digitalLink? } | { ok: false, message: LangText }
category     = obligations.category ?? project.manualCategory
meta         = { schemaVersion: SCHEMA_VERSION, category, passportId, createdAt }
baseDraft    = importedDraft ? { ...importedDraft, meta } : newDraft(meta)
effFacts     = facts with factEdits applied
proposals    = suggestMappings(effFacts, { category })
draft, conflicts, invalidDecisions, report, gap   as today
carrier      = generateCarrier({ uid: passportId, format: 'svg' })
               -> { ok: true, svg, payload, digitalLink? } | { ok: false, message: LangText }
```

- `passportIdOf` builds the GS1 link through core's `buildGs1DigitalLink` and surfaces its
  `CarrierInputError.text`; `https` mode requires an absolute https URI (same predicate the
  carrier uses, checked by calling `generateCarrier` on it); `draft` mode passes the urn
  through. When the identifier is not ok, the previous valid passport id is not kept: the
  project screen blocks Continue and the stepper marks the project step as incomplete.
- `effFacts` replaces `value`, `raw` and `unit` of an edited fact with the edit; the fact
  keeps its `kind`, `label` and `source`. The set handed to `suggestMappings` is a plain
  `FactSet`; the "edited" marker the facts screen shows is looked up in `state.factEdits`
  at render time, never written into a fact.
- A decision whose `factId` has no proposal under the current category (for example after a
  battery type change) is ignored by derivation, and comes back when its proposal does.
  `manual` decisions are always applied.
- Each derivation is memoised on the identity of its own inputs with `WeakMap` and a small
  key cache for strings, replacing today's whole-state memo.
- `derive.ts` grows into a folder: `derive/index.ts` (the chain), `derive/project.ts`
  (obligations, identifier, meta), `derive/facts.ts` (effective facts, proposals),
  `derive/carrier.ts`. `buildExports` takes `derived.carrier` instead of regenerating the QR
  and returns a keyed record (`aasJson`, `aasx`, `draft`, `gaps`, `html`, `qr`) so the app no
  longer picks files by position (a PR #22 follow-up).

## 5. Screens

**Stepper**: project, upload, facts, review, gaps. Reachable: project always; upload when
`project` exists and its identifier is ok; facts when `facts` exists; review and gaps when
`baseDraft` derives (project or import).

### 5.1 Project (replaces Start)

Three cards, then the existing import, resume and start-over actions.

1. **Battery and role**: battery type select, role select, energy input (kWh, decimal string,
   comma accepted and normalised to a point before it reaches state), placed-on-market date
   input. Every change dispatches `setProject`; the obligations card updates from derivation.
2. **Obligations**: verdict chip (`required`, `not_required`, `insufficient_input`), reason,
   missing inputs (as chrome labels of the missing field names), timeline entries (date,
   title, legal reference, status, in-effect marker, `verify` badge), role guidance, sources,
   not-legal-advice line. The derived category is shown as text. When the result has no
   category, a category select appears under a "voluntary passport" note; a chosen category
   sets `project.manualCategory`. A derived category always wins; the hand-picked one applies
   only when the check derives none.
3. **Identifier**: tabs for the four modes, prefilled with `draft` and
   `urn:passwerk:draft:<uuid>` as today. GS1 fields show the carrier's DE/EN error text
   live; the https field shows "must be an absolute https URI". Beside the fields: the QR
   preview panel (section 5.4) or the reason there is none.

Continue is enabled when a category exists and the identifier is ok.

### 5.2 Facts

A table over `effFacts` across all documents. Columns: label, value (with `edited` marker),
unit, kind, source (file, page or cell through `SourceRef`), status (`mapped` with the
attribute name when a decision of kind accept, edit or manual references the fact;
`proposed` when a proposal exists without a decision; `unmapped` otherwise). Filter bar:
document select, status select, text search over label, value and source. Row actions:

- **Edit**: inline value and unit inputs, save dispatches `editFact`, a reset action
  dispatches `clearFactEdit`. The edit is a string; core validates it when a mapping applies
  it, and an invalid result surfaces as an invalid decision on the review screen as today.
- **Map**: opens the Add Value dialog prefilled with the fact's value and unit, and passes
  `factId` so the dispatched `manual` decision carries provenance. Available for every fact
  regardless of status; a second mapping of the same fact to another attribute is allowed.

Table facts (`FactSet.tables`) are not shown; their header cells already appear as facts.

### 5.3 Review: row editor for array composites

`attributeChoices` stops filtering array composites out. For an array composite the Add
Value dialog and the group's edit action open the **row editor** instead of the leaf picker.

- `compositeSchema.ts` gains `arrayElementLeaves(attributeId)`: the dotted leaf paths of one
  element, with nested string arrays reported as `list` leaves and nested object arrays
  (`sparePartSources.components`) as `rows` leaves. `leafSchemaAt` learns to resolve a path
  inside the element (`0.name` style is not used; the editor validates rows whole).
- The editor renders one row per element with one input per leaf; `list` leaves are a
  comma-separated field, `rows` leaves a nested editor with the same component (depth 2 is
  the deepest shape core has). Optional leaves left blank are omitted from the row.
- On save the rows are parsed into objects and checked with
  `COMPOSITE_SCHEMAS[attributeId].safeParse(rows)`; issues are shown per row and nothing is
  dispatched on failure. On success one `manual` decision with `path` undefined and
  `value: rows` is dispatched. `validateValue` gains this branch: a composite whole value is
  accepted only when it is an array the schema parses, so the existing refusal of raw strings
  stays.
- An existing array value (from an imported draft or an earlier decision) opens prefilled
  from the derived draft; saving overrides it (`override: true` as for every decision).
- The review group for an array composite shows the row count and an edit action instead of
  leaf rows.

### 5.4 QR preview panel

One `QrPreview` part: renders `derived.carrier.svg` inline (as an `img` with a data URL built
from the SVG bytes, no `innerHTML`), the payload URL as selectable text, the digital link
parts when GS1, and a download action. When `carrier.ok` is false it shows the DE/EN message.
Used on the project screen beside the identifier and on the gaps screen beside the export
bar. The QR export button reuses `derived.carrier`; `buildExports` no longer calls
`generateCarrier`.

## 6. Errors, language and persistence

As in the first slice. New i18n keys cover the project and facts screens, the row editor, the
QR panel, the battery type and role labels and the missing-input field names. `t()` falls
back to the key instead of throwing on a missing template (a PR #22 follow-up), and the
parity test still fails on a missing key. Persistence stores state v2 with no allowlist
change: the state still contains no document bytes and no secrets (BYOK will add a rule
when it comes).

## 7. Testing

**Vitest (`apps/web/test`).**

- `reducer.test.ts`: `setProject` stamps `createdAt` once and moves to upload only on the
  first call; `importDraft` fills the project per section 3.2; `editFact` and
  `clearFactEdit`; file removal prunes fact edits; unknown fact id ignored.
- `derive.test.ts`: proposals derive from facts and category; a category change re-proposes
  and a stranded decision is ignored then revived; a fact edit propagates to the proposal
  value and to the draft; `manual` with `factId` carries the fact's source; obligations per
  battery type (EV required, portable not required with null category, industrial without
  energy insufficient, industrial 1.5 kWh not required, industrial 3 kWh required);
  identifier modes produce the expected passport id and errors; carrier ok for https and
  GS1, not ok for urn; memoisation: a language change reuses every derived object.
- `compositeSchema.test.ts`: `arrayElementLeaves` for the six array composites, including
  `list` and `rows` leaves; `validateValue` accepts a parsed array and refuses a string.
- `projectModel.test.ts`: `passportIdOf` for all four modes; GS1 errors carry DE and EN.
- `exports.test.ts`: keyed record; QR taken from `derived.carrier`.
- `views/*.test.tsx`: `ProjectView` shows verdict, timeline, voluntary select and identifier
  errors in both languages; `FactsView` filters and edits; `RowEditorDialog` adds, removes,
  validates rows and shows per-row issues; `QrPreview` renders an image or the reason.
- `i18n.test.ts`, `boundary.test.ts`, `persistence.test.ts` (v1 rejected, v2 round-trips).

**Playwright (`apps/web/e2e`).** Same oracle helper style: expected values come from
`@passwerk/core` in Node with the pinned clock.

1. `musterwerk.spec.ts`: adapted to the project screen (EV, manufacturer, no energy needed;
   the obligations chip reads `required` and the category `EV`), then the existing track.
2. `project.spec.ts`: industrial with 1.5 kWh shows `not_required` and the voluntary select;
   3 kWh shows `required` with `INDUSTRIAL_GT_2KWH`; portable shows the select and no
   derived category; GS1 GTIN plus serial shows the QR preview with the payload equal to
   core's `buildGs1DigitalLink`; a wrong check digit shows the carrier's message and blocks
   Continue; the timeline lists the same entry ids as core.
3. `facts.spec.ts`: upload one fixture, open facts, edit a fact's value, accept its proposal
   on review, and assert the draft export carries the edited value; map an unmapped fact and
   assert its provenance file and page in the draft JSON.
4. `rows.spec.ts`: import `ev-valid`, open the row editor for `criticalRawMaterials`, add a
   row with a blank required leaf (per-row issue shown, nothing dispatched), complete it,
   save, and assert the exported draft's array equals the rows and the verdict equals core's
   for the same draft.
5. `golden.spec.ts`, `persistence.spec.ts` (now covers a fact edit and the project),
   `sovereignty.spec.ts` (now walks the project and facts screens too): adapted.

## 8. Records and sequencing

1. ADR D-036: proposals derive from facts; project inputs and fact edits are state; a
   voluntary passport is allowed with a hand-chosen category; identifier modes; the QR is a
   derivation. State version 2 without migration.
2. Build plan Phase 7a: status line for this slice; BYOK noted as the remaining item with its
   own PR.
3. `AGENTS.md` status line; issue #23 closed by the PR.

## 9. Out of scope

Bring-your-own-key model call (next PR); table facts view; routing and deep links; storing
document bytes; seeding a capacity attribute from the project's energy value (the energy is
an obligations input, not a passport data point); any change to the knowledge base.
