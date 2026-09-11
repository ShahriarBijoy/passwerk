# Workbench redesign: the app as a fixed-height instrument

Status: approved in conversation 2026-09-10 (layout B, six steps, Lucide icons, bundled
Space Grotesk / Space Mono / Doto, dark first). Branch `feat/workbench-redesign`.
Implemented as ADR D-040 (2026-09-11); the rulings that amended this spec during
implementation are recorded there.
Scope: `apps/web` (`views`, `components`, `i18n`, `index.css`, one `workflow` type) and the
`apps/mcp-app` shell that reuses them, plus fonts, tests, one ADR (D-040), the build plan
status and `AGENTS.md`. No change to `@passwerk/core`, `@passwerk/rules` or
`@passwerk/server`; no new feature; the first release waits for this.

## 1. Goal and definition of done

The workbench today is a document: a `max-w-6xl` page of stacked cards, every list fully
expanded, one text size for everything. Inside Claude Desktop's inline iframe (measured 735 px
wide, ADR D-037) it becomes a wall the whole chat scrolls through, because the MCP Apps SDK
reports the document's height to the host and the host grows the iframe to match. The
redesign makes the app an instrument: a fixed-height frame that scrolls inside itself, one
line per item, detail on demand, a typographic hierarchy in the Nothing idiom (monochrome,
mono caps labels, one hero number per screen, red only as an interrupt).

| Deliverable | Done when |
|---|---|
| Instrument shell | Every step renders inside one frame of fixed height (640 px inline in a host, viewport height in fullscreen and in the web app); only the list region scrolls; the host's size notification reports a constant height on every step |
| Six steps | `project`, `upload`, `facts`, `review`, `gaps`, `export`; the stepper shows all six with state; export is its own screen with the verdict stated once |
| Screens | Each screen is hero strip, toolbar, one-line rows, footer; legal basis, provenance, explanations and actions live in a bottom sheet for the opened row, with prev / n of N / next |
| Tokens | Nothing palette in both modes mapped onto the existing shadcn variables; three text sizes and two families per screen; no shadows, no gradients, no toasts |
| Fonts | Space Grotesk, Space Mono and Doto subsetted to WOFF2, committed with provenance, inlined into the single-file workbench; zero runtime fetches |
| Test contract | Every existing `data-testid` keeps its name; Playwright suites of the web app and the MCP app pass with the same verdicts, findings and completeness figures as before; a new spec proves the frame height is constant across steps in the host page |
| Visual check | The built app reviewed with Claude in Chrome at 735 px and 1280 px in both modes, findings fixed before the PR |
| Records | ADR D-040; Phase 7a/7b status lines in `docs/BUILD_PLAN.md` and `AGENTS.md`; screenshots under `docs/screenshots/` replaced |

`pnpm check`, `pnpm build:web && pnpm e2e`, `pnpm build:mcp-app && pnpm e2e:mcp-app` green.
Oracle parity unaffected (no core change).

## 2. Principles

Carried in unchanged from the earlier web-app specs: core is the only domain logic; only
inputs are state; no network, no backend, no telemetry; injected clock; bilingual chrome; no
`useEffect`; dependency ages. Added for this work:

- **Subtract.** A screen shows the one number that matters, the rows, and the next action.
  Everything else waits behind a row.
- **Type is the hierarchy.** Size and weight, then grey level, then spacing. Never a border
  where spacing would do; never a card where a divider would do.
- **Colour only on values.** Grey scale for chrome. `--accent` red is the single interrupt
  (invalid, conflict, error); `--success` and `--warning` colour a value's status, never a
  label or a row background.
- **Labels are mono caps; prose is sentence case.** Mono caps are for one to four words
  (`PENDING`, `28 / 36 DECIDED`, the stepper). Anything a person reads as a sentence stays
  Space Grotesk, sentence case, 13-14 px.
- **Pixels move, results do not.** The Musterwerk and golden assertions are the proof that the
  redesign changed no verdict, finding, count or export byte.

## 3. The instrument

### 3.1 Sizing

```
Instrument height
  host inline       640px            constant; the SDK's ResizeObserver reports 640 every time
  host fullscreen   100vh            requested with app.requestDisplayMode({ mode: 'fullscreen' })
  web app           100vh, min 480px
Instrument width
  host              100% of the iframe (735 px measured; the shell is designed for 640-1024)
  web app           100%, max-width 1024px, centred; below 640 px the stepper shows numbers only
```

The root element is `display: grid; grid-template-rows: auto auto auto 1fr auto` (top bar,
hero strip, toolbar, list, footer) with `height: var(--instrument-height); overflow: hidden`.
Only the list region scrolls (`overflow-y: auto`, `overscroll-behavior: contain`). Dialogs and
the sheet are portaled into the instrument element, not `document.body`, so they never exceed
the frame in the web app either.

The MCP-app shell keeps `autoResize` on: with a constant body height the notification is
harmless and the host still learns the width. A `⤢` ghost control in the top bar appears only
when the host context lists `fullscreen` in `availableDisplayModes`; it toggles between
`inline` and `fullscreen`. The web app never shows it.

### 3.2 Regions

| Region | Height | Content |
|---|---|---|
| Top bar | 44 px | Stepper (left), language toggle `DE` / `EN` and `⤢` (right), `START OVER` as a ghost when a project exists. Bottom `1px --border` |
| Hero strip | 72 px | One `HeroNumber` (Doto 40 px) with its mono label, a `SegmentedBar` where a proportion exists, one line of mono caps metadata. The verdict word in red when invalid |
| Toolbar | 36 px | Filter `ToggleGroup` (mono caps, underline active), search (mono, underline), optional ghost action (`+ VALUE`) |
| List | rest | `Row`s; group headers where grouping exists; the fade at the bottom is a 40 px gradient to the background so a cut-off row reads as "more below" |
| Footer | 52 px | Inline status (left), the one primary pill button (right). Top `1px --border` |

The `Sheet` overlays the list from the bottom, max 45 % of the instrument height, its own
scroll, a 32 × 2 px handle, a `1px --border-visible` top edge. It is non-modal: the list stays
clickable, so opening another row swaps the sheet content. `Esc` closes; `←` / `→` move to the
previous / next row of the current filtered list; the footer of the sheet shows `n OF N`.

## 4. Tokens

`apps/web/src/index.css` is rewritten. The Nothing tokens are defined once and mapped onto
the shadcn variable names the existing `components/ui/*` consume, so every primitive re-skins
without an API change.

### 4.1 Colour

| Token | Dark | Light | shadcn variable |
|---|---|---|---|
| `--black` | `#000000` | `#F5F5F5` | `--background` |
| `--surface` | `#111111` | `#FFFFFF` | `--card`, `--popover`, `--secondary`, `--muted` |
| `--surface-raised` | `#1A1A1A` | `#F0F0F0` | `--accent` (shadcn's hover surface) |
| `--border` | `#222222` | `#E8E8E8` | `--border` |
| `--border-visible` | `#333333` | `#CCCCCC` | `--input`, `--ring` |
| `--text-disabled` | `#666666` | `#999999` | — (disabled states only) |
| `--text-secondary` | `#999999` | `#666666` | `--muted-foreground` |
| `--text-primary` | `#E8E8E8` | `#1A1A1A` | `--foreground`, `--card-foreground` |
| `--text-display` | `#FFFFFF` | `#000000` | `--primary` (buttons invert: `--primary-foreground` = `--black`) |
| `--accent-red` | `#D71921` | `#D71921` | `--destructive` |
| `--success` | `#4A9E5C` | `#3E8A4F` | — |
| `--warning` | `#D4A843` | `#B8902E` | — |

`--text-disabled` is below WCAG AA on purpose and is used only for disabled controls and
decorative brackets. Anything meant to be read uses `--text-secondary` or above. Dark is the
`.dark` class on `<html>` as today; the web app follows `prefers-color-scheme` on first load and
remembers a manual toggle in `localStorage` (`passwerk.theme`); the MCP app follows the host.

### 4.2 Type

| Role | Family | Size / line | Tracking | Use |
|---|---|---|---|---|
| Hero | Doto 700 | 40 / 1.0 | -0.02em | The one number per screen; the verdict word |
| Heading | Space Grotesk 500 | 16 / 1.3 | -0.01em | Sheet title, dialog title |
| Body | Space Grotesk 400 | 14 / 1.5 | 0 | Row names, prose, form values |
| Body small | Space Grotesk 400 | 13 / 1.5 | 0 | Sheet prose, hints |
| Data | Space Mono 400 | 14 / 1.4 | 0 | Values, units, identifiers, inputs |
| Label | Space Mono 400 | 11 / 1.2 | 0.08em, caps | Labels, tags, stepper, buttons, tabs |

Per screen at most three sizes are visible at once (hero, body, label); heading and body-small
appear only inside the sheet and dialogs. Doto never renders text longer than one word.

### 4.3 Space, shape, motion

Spacing scale 4 / 8 / 12 / 16 / 24 / 32. Row height 40 px, group header 44 px, row padding
`0 16px`. Radii: pill 999 px (buttons, tags), 8 px (inputs, dropdowns), 12 px (dialogs, the
instrument in the web app). No `box-shadow` anywhere; `tw-animate-css` stays for the sheet
and dialog transitions, `200ms ease-out`, disabled under `prefers-reduced-motion`.

### 4.4 Fonts, offline

Sources are the `google/fonts` repository, OFL, verified on 2026-09-10 by git blob SHA:

| Family | Path in `google/fonts` | Blob SHA |
|---|---|---|
| Space Grotesk | `ofl/spacegrotesk/SpaceGrotesk[wght].ttf` | `a1b2e6c26093066510a31147e7aec9abdc8d6c5e` |
| Space Mono | `ofl/spacemono/SpaceMono-Regular.ttf` | `1cfa3653dc8ddb7aa9f4ef1c9c581e9516137e6e` |
| Space Mono | `ofl/spacemono/SpaceMono-Bold.ttf` | `2c4f2682f915d988e7314544ff7c9e38c8c733f5` |
| Doto | `ofl/doto/Doto[ROND,wght].ttf` | `ed8f0db9fb890c570b558941201d1504483f5ebc` |

`apps/web/scripts/fonts.mjs` (dev only, run by hand) downloads each file at a pinned commit of
`google/fonts`, checks the sha256 recorded in the script, subsets with `pyftsubset` (via `uv
tool run --from fonttools`) to Latin, Latin-1 Supplement, Latin Extended-A, general
punctuation, `€`, arrows and the glyphs the shell draws (`·`, `▸`, `▾`, `✕`, `⤢`), keeps the
`wght` axis (Doto also `ROND`), and writes WOFF2 to `apps/web/src/fonts/` beside a
`PROVENANCE.md` listing source, licence, commit, sha256 of the download and of the output. The
WOFF2 files are committed. `index.css` declares them with `@font-face` and relative `url()`;
the web build emits them as same-origin assets, the single-file workbench inlines them
(`assetsInlineLimit` is already unconditional there). No `<link>` to any font host exists in
either app; `apps/web/e2e/sovereignty.spec.ts` and `apps/mcp-app/e2e/sovereignty.spec.ts`
stay unchanged and green. Fallback stacks: `"Space Grotesk", system-ui, sans-serif`,
`"Space Mono", ui-monospace, monospace`, `"Doto", "Space Mono", monospace`.

## 5. Components

### 5.1 `views/shell/` — the design system in code

New, all in the `views` layer (props in, callbacks out, no `app` import), each with a unit
test:

| Component | Props (essentials) | Notes |
|---|---|---|
| `Instrument` | `top`, `hero`, `toolbar`, `children`, `footer`, `sheet` | The grid frame from section 3.2; owns the portal container for `Sheet` and dialogs |
| `Stepper` | `steps`, `current`, `reachable(step)`, `onGo` | Mono caps `01 PROJECT … 06 EXPORT`; done steps `--text-secondary`, current `[ 04 REVIEW ]` in `--text-display`, unreachable `--text-disabled`; numbers only under 640 px |
| `HeroNumber` | `label`, `value`, `unit?`, `tone?` | Doto 40 px; `tone: 'accent'` for the red verdict word |
| `SegmentedBar` | `filled`, `total`, `tone?`, `size?` | Discrete 2 px-gapped blocks, square ends; 8 px standard, 6 px compact |
| `Row` | `dot?`, `name`, `value?`, `unit?`, `tags?`, `open?`, `onOpen`, `data-*` passthrough | 40 px, `border-top: 1px --border`, name truncates, chevron `›` / `▾`; open rows get `--surface` and a 2 px left `--accent` bar |
| `GroupHeader` | `name`, `count`, `open`, `onToggle` | 44 px, name in `--text-display`, count as label |
| `Sheet` | `open`, `title`, `meta?`, `children`, `actions`, `position: {index, total}`, `onPrev`, `onNext`, `onClose` | Radix `Dialog` with `modal={false}` portaled into the instrument; `Esc`, `←`, `→` |
| `InlineStatus` | `kind: 'ok'|'error'|'info'`, `text` | `[SAVED]`, `[ERROR: …]` in mono label size; the replacement for every toast |
| `Field` | `label`, `htmlFor`, `hint?`, `error?`, `children` | Mono caps label above, underline input, error in `--accent` below |

### 5.2 `components/ui/`

Existing shadcn primitives stay and re-skin through the variables: `button` (variants become
pill primary / pill secondary / ghost / destructive-outline; text mono caps 11 px; min height
36 px, 44 px inside the sheet), `input` (underline style becomes the default, full border only
inside dialogs), `select`, `dialog`, `alert-dialog`, `label`, `tabs` (kept for the assist
panel), `table` (kept for the row editor dialog only), `badge` (becomes the `Tag`: outline
pill, mono caps), `progress` (deleted; `SegmentedBar` replaces it), `card` (deleted; nothing
in the redesign is a card), `separator` (deleted), `sonner` (deleted).

ReUI's registry answers `307 → /r/styles/radix-nova/<name>.json → 401` for the base primitives
without a licence key (checked 2026-09-10 for `toggle-group`, `scroll-area`, `kbd`, `spinner`,
`toggle`); only its blocks are public. The same four items are served by the official shadcn
registry (`https://ui.shadcn.com/r/styles/radix-nova/<name>.json`, HTTP 200, MIT), and ReUI's
own copies in its MIT repository are built from them. The plan installs them from the official
registry with the shadcn CLI already in `devDependencies`; no ReUI registry entry is added to
`components.json`. Icons are `lucide-react` only, 1.5 px
stroke, 14 px, in `--text-secondary`: `ChevronRight`, `ChevronDown`, `X`, `Maximize2`,
`ArrowLeft`, `ArrowRight`, `Upload`, `Download`, `Copy`. No filled icon, no animated icon.

### 5.3 Dialogs

`AddValueDialog`, `RowEditorDialog`, the start-over `AlertDialog` and the assist panel keep
their logic and their test ids. They render as Nothing modals: backdrop `rgba(0,0,0,.8)`,
`--surface` panel, `1px --border-visible`, 12 px radius, max 480 px (the row editor 640 px),
`[ ✕ ]` ghost close top right, `Field`s inside. The assist panel becomes a sheet opened from
the review toolbar's `ASSIST` toggle (`assist-toggle`) rather than a card above the list; its
config, disclosure, run and result blocks are unchanged in content.

## 6. Screens

Each screen lists hero, toolbar, rows, sheet, footer and the test ids it must carry. Test ids
not mentioned keep their current element and meaning.

### 6.1 `01 PROJECT`

Two columns inside the list region (form 330 px | obligation), stacking under 640 px.

- Form: `Field`s for battery type (`battery-type`), role (`role`), energy (`energy-kwh`, hint
  under it), placed on market (`placed-on-market`). Below, two collapsible rows: `IDENTIFIER ·
  <mode>` (opens the mode `ToggleGroup` with `identifier-mode-*` and the mode's fields
  `identifier-resolver` / `identifier-gtin` / `identifier-serial` / `identifier-giai` /
  `identifier-uri` / `identifier-urn`, the `identifier-error` line, and the `QrPreview`), and
  `IMPORT A DRAFT` (`import-draft` file input, `import-error`). Both rows are collapsed by
  default; the identifier row opens itself when the identifier is invalid.
- Obligation column: label `PASSPORT OBLIGATION`, hero word `REQUIRED` / `NOT REQUIRED` /
  `INSUFFICIENT INPUT` (`obligation-verdict` with `data-verdict`), reason prose
  (`obligation-reason`), category line (`obligation-category`) or, for a voluntary passport,
  the `manual-category` select as a `Field`. Rows: `TIMELINE · n` (collapsed; entries
  `timeline-entry` with date mono, title, legal ref label, `IN EFFECT` / `UPCOMING` tag),
  `WHAT YOUR ROLE MEANS` (collapsed prose), `SOURCES` (collapsed). Missing-input line in
  `--accent`. `not-legal-advice` as the last line in `--text-secondary`.
- Resume: when `resume` is set, the hero strip shows `n DOCUMENTS · SAVED <date>` with
  `RESUME` primary and `START OVER` ghost (`resume-card` moves to this strip, id kept).
- Footer: `CREATE PROJECT →` / `CONTINUE →` (`project-continue`), disabled without a category.

### 6.2 `02 DOCUMENTS`

- Hero: files count; label `DOCUMENTS`; metadata `n proposals derived` once files exist.
- List: the drop zone is the first block (dashed `--border-visible`, 96 px, mono `DROP FILES
  OR CHOOSE`, the real `file-input`), then one `Row` per file (`file-row`, `data-file`): name,
  format tag, pages (`file-pages`), language tag, `✕` ghost remove; an errored file shows its
  error as a red tag instead of format. `upload-busy` is the `spinner` plus `[READING…]` in
  the footer's status slot while ingest runs.
- Footer: `CONTINUE · n PROPOSALS →` (`continue`, label from `uploadContinueLabel`).

### 6.3 `03 FACTS`

- Hero: facts count; metadata `FROM n DOCUMENTS · proposed · mapped · unmapped` counts.
- Toolbar: status `ToggleGroup` (`facts-status-all|mapped|proposed|unmapped`), document
  select (`facts-document`) rendered as a mono caps trigger, search (`facts-search`),
  `facts-count`.
- Rows (`fact-row`, `data-fact`, `data-status`): label, value (`fact-value`, mono; `EDITED`
  tag when edited: `fact-edited`), unit, status tag (green `MAPPED`, `PROPOSED`, dim
  `UNMAPPED`).
- Sheet: title = label; meta = kind · file · page/cell (`SourceRef`); value large; the mapped
  attribute or the proposal it feeds; actions `EDIT VALUE` (`fact-edit`, turns the sheet's
  value block into `fact-edit-value` / `fact-edit-unit` inputs with `fact-edit-save` and
  `fact-edit-reset`), `MAP TO ATTRIBUTE` (`fact-map`, opens `AddValueDialog` with the prefill).
- Footer: `CONTINUE TO REVIEW →` (`facts-continue`).

### 6.4 `04 REVIEW`

- Hero: pending count; `SegmentedBar` decided/total; metadata `n / N DECIDED · <verdict>`
  (`review-summary` carries the accepted/pending text as today; `verdict` with `data-verdict`).
- Toolbar: filter `ToggleGroup` (`filter-pending|accepted|rejected|all`), search, `ASSIST`
  toggle (`assist-toggle`, only when the platform has an assist), `+ VALUE` (`add-value`, opens
  `AddValueDialog`).
- Status lines above the rows, each an `InlineStatus` in red: conflicts (`conflict`) and
  invalid decisions (`invalid-decision`, with a `CLEAR` ghost).
- Rows: one per attribute group (`group`, `data-key`): name (`· path` for a composite leaf),
  best proposal's value and unit, confidence label, state tag (`ACCEPTED` green value,
  `REJECTED` dim, `EDITED`, pending has no tag), critique dot when the assist marked it
  (`assist-critique-chip` inside the sheet). Manual entries (`manual`) and array entries
  (`array-entry`, `data-attribute`) are rows under a `MANUAL` / `ROWS` group header with
  `CLEAR` / `EDIT ROWS` (`array-edit`) actions in their sheet.
- Sheet: title = attribute name; meta = legal refs; one block per candidate proposal
  (`proposal`, `data-fact`, `data-state`): value mono large, unit, confidence, `SourceRef`, the
  `why` prose, and the actions `ACCEPT` (`accept`), `REJECT` (`reject`), `EDIT` (`edit`,
  inline `edit-value` / `edit-unit` / `edit-recorded-at` with `SAVE`, `value-error`). A decided
  group shows `CLEAR` in the sheet footer. `→` moves to the next row of the current filter,
  which under `PENDING` is the next undecided attribute.
- Footer: `CONTINUE TO GAPS →` (`to-gaps`).

### 6.5 `05 GAPS`

- Hero: mandatory present `/` total (Doto for the present count, `/ total` in
  `--text-disabled` at 22 px), `SegmentedBar`, metadata `31.9 % · OVERALL 38 / 93 · <verdict>
  · L1 3 L2 0 L3 0 L4 2` (`completeness-mandatory`, `completeness-overall`, `verdict`,
  `layer-L1…L4` keep their ids on the respective spans).
- Toolbar: view `ToggleGroup` `BY OWNER` / `BY SUBMODEL` / `FINDINGS n`; filter `OPEN` /
  `ALL` (open = status not `present`); search.
- Rows under `BY OWNER` and `BY SUBMODEL`: `GroupHeader` per group (name, `n OPEN`), open by
  default, collapsible; items (`gap-item`, `data-attribute`, `data-status`, `data-bucket`):
  status dot (green present, red invalid, outlined missing), name, bucket tag, `VERIFY` tag in
  `--warning` when flagged. Under `FINDINGS`: one row per finding (`finding`, `data-rule`,
  `data-attribute`): layer tag (red for errors), rule id mono, message.
- Sheet (gap item): title = name; meta = `<status> · <bucket>`; `LEGAL BASIS` label + refs;
  `NEXT` label + suggested action; actions `FIX IN REVIEW` (goes to review with the search
  prefilled to the attribute name) and, when present in the knowledge base, the attribute's
  DE/EN explanation under `EXPLAIN` (collapsed prose). Sheet (finding): rule id, layer,
  message, path, the affected attribute row link.
- Footer: `not-legal-advice` in the status slot; `CONTINUE TO EXPORT →`.

### 6.6 `06 EXPORT`

- Hero: the verdict word in Doto (`INVALID` red, `VALID` white, `VALID WITH WARNINGS` white);
  metadata `n FINDINGS · m / N MANDATORY`.
- Two columns in the list region (files | carrier 200 px), stacking under 640 px.
- File rows: `AAS JSON · IDTA 02035-1…7` (`export-aasJson`), `AASX PACKAGE` (`export-aasx`),
  `HTML PASSPORT SHEET · DE / EN` (`export-html`), `GAP REPORT · JSON` (`export-gaps`), `DRAFT
  · JSON, RE-IMPORTABLE` (`export-draft`); each row's action is a `DOWNLOAD` pill (primary for
  the first two). `export.failed` renders as an `InlineStatus` under the rows.
- Carrier column: `CARRIER` label, `QrPreview` (`qr-preview`, `qr-image`, `qr-payload` as a
  12 px mono line with a `COPY` ghost, `qr-download` as `SVG · PNG`), or `qr-none` prose.
- Footer: `not-legal-advice`; no primary action.

## 7. The `workflow` change

```ts
export type Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps' | 'export';
export const STEPS: readonly Step[] = ['project', 'upload', 'facts', 'review', 'gaps', 'export'];
```

`STATE_VERSION` stays `3`: the persisted shape does not change and a saved `step: 'gaps'`
remains valid. `reachable('export')` equals `reachable('gaps')`. The reducer's `goTo` and the
persistence schema accept the new literal; `reducer.test.ts` gains the case. Nothing else in
`workflow` changes; `GapsExportView` splits into `GapsView` and `ExportView` with the same
props divided between them.

## 8. Language

New chrome strings (DE and EN, in `i18n/de.ts` and `i18n/en.ts`, checked by `i18n.test.ts`):
step `06 EXPORT`; the hero labels (`PENDING`, `MANDATORY`, `DOCUMENTS`, `FACTS`, `CARRIER`,
`PASSPORT OBLIGATION`); sheet chrome (`n OF N`, `ESC`, `PREV`, `NEXT`, `CLOSE`); toolbar
labels (`BY OWNER`, `BY SUBMODEL`, `FINDINGS`, `OPEN`, `ALL`, `ASSIST`, `+ VALUE`); `FIX IN
REVIEW`, `EXPLAIN`, `LEGAL BASIS`, `NEXT`, `COPY`, `COPIED`, `DROP FILES OR CHOOSE`,
`READING…`, `FULLSCREEN`, `INLINE`. Removed: the toast strings (`app.error.copy`). The
obligation verdict words already exist; they are rendered upper-case by CSS, not by changing
the strings.

## 9. Errors and status

`sonner` is removed. Every failure that reached a toast becomes an `InlineStatus` in the
footer's status slot of the current screen: ingest errors (`[ERROR: <message>]` with a `COPY`
ghost), export failures under the export rows, assist errors inside the assist sheet. Success
states are the state change itself; `[SAVED]` appears only where nothing else changes
visibly (a fact edit saved in the sheet, a copied payload). The `ErrorBoundary` fallback is a
Nothing empty state: mono `[ERROR]`, the message, `START OVER` pill.

## 10. Tests

- **Unit (Vitest, jsdom).** One test file per `views/shell` component. Existing view tests are
  updated to the new structure and keep every assertion about content and dispatched actions;
  where an action moved into the sheet the test opens the row first. `App.test.tsx` adds: six
  steps in the stepper; `export` reachable exactly when `gaps` is; the MCP-app shell shows the
  fullscreen control only when the host offers it.
- **Layer boundary.** `boundary.test.ts` unchanged: `views/shell` is inside `views`.
- **Playwright, web.** The nine specs keep their assertions; helpers gain `openRow(page, id)`
  and `openSection(page, id)` for the sheet and the collapsible project rows. A new
  `instrument.spec.ts` checks at 735 × 800 and 1280 × 900, dark and light: no horizontal
  overflow, `document.documentElement.scrollHeight === clientHeight`, the list scrolls, the
  sheet opens with `←`/`→`/`Esc`, fonts resolve to the bundled families
  (`document.fonts.check('11px "Space Mono"')`), and `performance.getEntriesByType('resource')`
  lists no font from another origin.
- **Playwright, MCP app.** The four specs keep their assertions. `context.spec.ts` gains: the
  host page records every `ui/notifications/size-changed` it receives and every reported height
  across all six steps equals 640. The host page viewport returns to a normal size (the 2000 px
  workaround comes out).
- **Visual review.** Before the PR: Claude in Chrome opens the built web app at 735 px and
  1280 px, both modes, walks the six steps on the Musterwerk fixtures, and the findings are
  fixed. The screenshots replace `docs/screenshots/mcp-app-0*.png`.

## 11. Records

- **ADR D-040, "The workbench is a fixed-height instrument".** Why the iframe grew (the SDK's
  auto-resize plus a document layout), why the fix is structural, the 640 px figure and the
  fullscreen path, the Nothing idiom as the design system with the two adaptations (mono caps
  only for labels, `--text-disabled` never for readable text), the bundled-fonts decision and
  its provenance, ReUI's free tier as a registry with Lucide-only icons and why ReUI's icons
  were not adopted, and the removal of toasts.
- `docs/BUILD_PLAN.md` §7 Phase 7a and 7b: a dated paragraph each; `AGENTS.md` status likewise;
  `README.md` web-app paragraph mentions the six steps.
- `docs/screenshots/`: replaced.

## 12. Out of scope

No queue mode for review (declined); no new export kinds; no change to how proposals are
derived, decided or synced to the server; no server or core change; no light-mode-first
composition (dark is composed first, light derived with the same tokens); no ReUI premium
items; no telemetry of any kind for the visual review.

## 13. Sequencing for the plan

1. Fonts script, WOFF2 files, provenance, `@font-face`, tokens in `index.css`, ReUI registry
   and the four installed primitives, `components/ui` re-skin and deletions.
2. `views/shell` primitives with tests.
3. `workflow`: the sixth step.
4. Screens in order project, upload, facts, review, gaps, export, then dialogs and the assist
   sheet; each with its view test updated.
5. `App.tsx` on the `Instrument`; MCP-app fullscreen control; remove `sonner`.
6. Playwright updates and the two new specs; screenshots; visual review with Claude in Chrome.
7. ADR, status lines, README.
