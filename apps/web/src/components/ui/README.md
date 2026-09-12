# components/ui

shadcn primitives (`radix-nova` style, official registry https://ui.shadcn.com, MIT), installed
with `pnpm exec shadcn add <name>` and re-skinned through the Nothing tokens in `src/index.css`
(spec 2026-09-10, ADR D-040). Do not edit the generated structure; change classes only.

| File | Added | Note |
|---|---|---|
| alert-dialog, button, dialog, input, label, select | 2026-09-05 (Phase 7a) | re-skinned 2026-09-10 |
| toggle-group, toggle, kbd, spinner | 2026-09-10 | official registry; ReUI's registry needs a licence key for these (see the spec §5.2) |
| calendar, popover | 2026-09-11 | official registry; behind `views/shell/DateField`, which replaces `<input type="date">`. Adds `react-day-picker` and `date-fns`. Two departures from the generated `calendar.tsx`, both deliberate: the day cell is a plain `button` (this project's `Button` variants are toolbar pills, and there is no `icon` size), and day focus is a callback ref rather than the generated `useEffect`. `popover.tsx` portals into the instrument like the dialogs. The CLI wrote `import { cn } from 'cn'` and added an npm package called `cn`; both were corrected to `@/lib/utils`. |

Removed 2026-09-10: `card`, `progress`, `separator`, `sonner` (nothing in the redesign is a card, a bar is `views/shell/SegmentedBar`, status is inline).

Removed in the final fix wave (never used by any screen): `badge` (rows use their own `RowTag`
tone), `table` (`views/shell/Row` is the one list primitive), `tabs` (filters are
`toggle-group`), `scroll-area` (the list region is a plain `overflow-y-auto` div).
