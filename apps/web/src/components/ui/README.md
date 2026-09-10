# components/ui

shadcn primitives (`radix-nova` style, official registry https://ui.shadcn.com, MIT), installed
with `pnpm exec shadcn add <name>` and re-skinned through the Nothing tokens in `src/index.css`
(spec 2026-09-10, ADR D-040). Do not edit the generated structure; change classes only.

| File | Added | Note |
|---|---|---|
| alert-dialog, badge, button, dialog, input, label, select, table, tabs | 2026-09-05 (Phase 7a) | re-skinned 2026-09-10 |
| toggle-group, toggle, scroll-area, kbd, spinner | 2026-09-10 | official registry; ReUI's registry needs a licence key for these (see the spec §5.2) |

Removed 2026-09-10: `card`, `progress`, `separator`, `sonner` (nothing in the redesign is a card, a bar is `views/shell/SegmentedBar`, status is inline).
