# Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the passwerk web app and MCP-app workbench into a fixed-height instrument in the Nothing idiom: six steps, one line per item, detail in a bottom sheet, Nothing tokens in both modes, bundled fonts, zero result changes.

**Architecture:** `apps/web/src/views/shell/` becomes the design system in code (Instrument, Stepper, HeroNumber, SegmentedBar, Row, GroupHeader, Sheet, InlineStatus, Field); every screen is composed from it; `workflow` gains one literal (`'export'`); `apps/mcp-app` reuses the views unchanged and adds a fullscreen control. Tokens live in `index.css` and are mapped onto the shadcn variables so the existing `components/ui` primitives re-skin without API changes.

**Tech Stack:** React 19.2, Tailwind v4 (`@tailwindcss/vite`), shadcn 4.19 CLI (official registry, `radix-nova` style), `radix-ui` 1.6, `lucide-react`, Vitest 4 + jsdom + Testing Library, Playwright 1.62, `@modelcontextprotocol/ext-apps` 1.7.5, fonttools `pyftsubset` via `uv`.

**Spec:** `docs/superpowers/specs/2026-09-10-workbench-redesign-design.md`

## Global Constraints

- No `useEffect` in React code (project rule; use derived state, event handlers, callback refs).
- No `node:*` import anywhere under `apps/web/src` or `apps/mcp-app/src` (boundary test).
- `views` never imports `app`; `workflow` never imports React or `views` (`apps/web/test/boundary.test.ts`).
- No network at runtime: no `<link>` to any font host, no CDN; fonts are committed WOFF2 files under `apps/web/src/fonts/`.
- Every `data-testid` listed in the spec §6 keeps its name and meaning.
- Every new chrome string exists in both `apps/web/src/i18n/de.ts` and `en.ts` (`i18n.test.ts` enforces identical key sets).
- `--text-disabled` (`#666666` dark / `#999999` light) only for disabled controls; readable text uses `--text-secondary` or above.
- Mono caps for labels of one to four words only; prose stays Space Grotesk sentence case.
- No `box-shadow`, no gradients in chrome, no toasts: `sonner` is removed.
- Instrument height: `--instrument-height` is `100vh` by default (web app), `640px` inline in an MCP host, `100vh` in host fullscreen.
- Dependency versions must be at least three days old; new packages: none (shadcn CLI adds no runtime dependency for the four primitives; `radix-ui` already covers ToggleGroup and ScrollArea).
- Conventional Commits; commit after every task; `pnpm check` before every commit that touches TypeScript.
- Commit trailer on every commit: `Claude-Session: https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1`.

**Spec amendment recorded by this plan (Task 1 writes it into the spec):** ReUI's registry answers `307 → /r/styles/radix-nova/<name>.json → 401` for the base primitives without a licence key (checked 2026-09-10 for `toggle-group`, `scroll-area`, `kbd`, `spinner`, `toggle`); only its blocks are public. The same four items are served by the official shadcn registry (`https://ui.shadcn.com/r/styles/radix-nova/<name>.json`, HTTP 200, MIT), and ReUI's own copies in its MIT repository are built from them. The plan installs them from the official registry with the shadcn CLI already in `devDependencies`; no ReUI registry entry is added to `components.json`.

---

## File structure

| Path | Responsibility |
|---|---|
| `apps/web/scripts/fonts.mjs` | Dev-only: download the four font files at a pinned `google/fonts` commit, verify sha256, subset to WOFF2, write `PROVENANCE.md` |
| `apps/web/src/fonts/*.woff2`, `apps/web/src/fonts/PROVENANCE.md` | Committed font assets and their provenance |
| `apps/web/src/index.css` | `@font-face`, Nothing tokens (dark + light) mapped to shadcn variables, base layer |
| `apps/web/src/components/ui/*` | shadcn primitives, re-skinned; `toggle-group`, `toggle`, `scroll-area`, `kbd`, `spinner` added; `card`, `progress`, `separator`, `sonner` removed |
| `apps/web/src/components/ui/README.md` | Which primitives are installed, from where, when |
| `apps/web/src/views/shell/*.tsx` | The nine shell primitives, one file each |
| `apps/web/src/views/shell/context.ts` | `InstrumentContext` (portal container) |
| `apps/web/src/views/ProjectView.tsx`, `UploadView.tsx`, `FactsView.tsx`, `ReviewView.tsx`, `GapsView.tsx`, `ExportView.tsx` | The six screens |
| `apps/web/src/views/parts/*` | `ObligationsPanel.tsx` (replaces `ObligationsCard.tsx`), `QrPreview.tsx`, `SourceRef.tsx`, `VerdictChip.tsx`, `ConfidenceBadge.tsx` re-skinned |
| `apps/web/src/views/AssistPanel.tsx`, `AddValueDialog.tsx`, `RowEditor.tsx` | Same logic and test ids, Nothing modal/sheet styling |
| `apps/web/src/workflow/state.ts` | `Step` gains `'export'` |
| `apps/web/src/i18n/de.ts`, `en.ts` | New chrome strings |
| `apps/web/src/app/App.tsx` | The shell on `Instrument`; inline status instead of toasts |
| `apps/web/src/app/platform.ts`, `main.tsx` | `Platform.theme` and `Platform.display`; web theme from `prefers-color-scheme` + `localStorage` |
| `apps/web/src/app/ErrorBoundary.tsx` | Nothing empty state |
| `apps/mcp-app/src/main.tsx`, `bridge.ts`, `host.ts` | `--instrument-height`, fullscreen request, `hostDownload` without toast |
| `apps/web/test/views/shell/*.test.tsx` | One test per shell primitive |
| `apps/web/test/views/*.test.tsx`, `apps/web/test/fonts.test.ts`, `apps/web/test/reducer.test.ts` | Updated and new unit tests |
| `apps/web/e2e/helpers.ts`, `apps/web/e2e/*.spec.ts`, `apps/web/e2e/instrument.spec.ts` | Playwright web |
| `apps/mcp-app/e2e/host/host.ts`, `index.html`, `apps/mcp-app/e2e/*.spec.ts`, `apps/mcp-app/playwright.config.ts` | Playwright MCP app |
| `docs/DECISIONS.md`, `docs/BUILD_PLAN.md`, `AGENTS.md`, `README.md`, `docs/screenshots/` | Records |

---

### Task 1: Fonts, offline

**Files:**
- Create: `apps/web/scripts/fonts.mjs`
- Create: `apps/web/src/fonts/PROVENANCE.md`, `apps/web/src/fonts/space-grotesk.woff2`, `space-mono-regular.woff2`, `space-mono-bold.woff2`, `doto.woff2` (generated by the script, committed)
- Create: `apps/web/test/fonts.test.ts`
- Modify: `apps/web/package.json` (script `fonts`)
- Modify: `docs/superpowers/specs/2026-09-10-workbench-redesign-design.md` §5.2 (the ReUI amendment from the header)

**Interfaces:**
- Produces: the four WOFF2 files at the paths above; `PROVENANCE.md` with a table `| File | Source | Commit | sha256 (download) | sha256 (woff2) | Licence |`; `index.css` (Task 2) references `./fonts/<file>.woff2`.

- [ ] **Step 1: Write the failing test**

`apps/web/test/fonts.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '..', 'src', 'fonts');
const FILES = ['space-grotesk.woff2', 'space-mono-regular.woff2', 'space-mono-bold.woff2', 'doto.woff2'];

describe('bundled fonts', () => {
  const provenance = existsSync(join(DIR, 'PROVENANCE.md'))
    ? readFileSync(join(DIR, 'PROVENANCE.md'), 'utf8')
    : '';
  for (const file of FILES) {
    it(`${file} exists, is WOFF2 and matches PROVENANCE.md`, () => {
      const bytes = readFileSync(join(DIR, file));
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('wOF2');
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(provenance, `${file} sha256 ${sha}`).toContain(sha);
    });
  }
  it('index.css loads the fonts locally and nothing from a font host', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8');
    for (const file of FILES) expect(css).toContain(`./fonts/${file}`);
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|https?:\/\//);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run apps/web/test/fonts.test.ts`
Expected: FAIL (ENOENT on the woff2 files).

- [ ] **Step 3: Write the script**

`apps/web/scripts/fonts.mjs`:

```js
#!/usr/bin/env node
/**
 * Dev-only. Downloads the four font files at a pinned commit of google/fonts, verifies their
 * sha256, subsets them to WOFF2 with pyftsubset (via uv) and writes src/fonts/PROVENANCE.md.
 * Never runs at install or runtime; the WOFF2 output is committed.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Pinned commit of https://github.com/google/fonts; the blob SHAs below were verified against
// the GitHub contents API on 2026-09-10.
const COMMIT = process.env.GOOGLE_FONTS_COMMIT ?? 'main';
const RAW = `https://raw.githubusercontent.com/google/fonts/${COMMIT}`;
const OUT = new URL('../src/fonts/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

const FONTS = [
  { out: 'space-grotesk.woff2', path: 'ofl/spacegrotesk/SpaceGrotesk[wght].ttf', family: 'Space Grotesk', licence: 'OFL-1.1', gitBlob: 'a1b2e6c26093066510a31147e7aec9abdc8d6c5e' },
  { out: 'space-mono-regular.woff2', path: 'ofl/spacemono/SpaceMono-Regular.ttf', family: 'Space Mono', licence: 'OFL-1.1', gitBlob: '1cfa3653dc8ddb7aa9f4ef1c9c581e9516137e6e' },
  { out: 'space-mono-bold.woff2', path: 'ofl/spacemono/SpaceMono-Bold.ttf', family: 'Space Mono', licence: 'OFL-1.1', gitBlob: '2c4f2682f915d988e7314544ff7c9e38c8c733f5' },
  { out: 'doto.woff2', path: 'ofl/doto/Doto[ROND,wght].ttf', family: 'Doto', licence: 'OFL-1.1', gitBlob: 'ed8f0db9fb890c570b558941201d1504483f5ebc' },
];

// Latin, Latin-1 Supplement, Latin Extended-A, general punctuation, euro, arrows and the glyphs
// the shell draws (· ▸ ▾ ✕ ⤢).
const UNICODES = 'U+0000-00FF,U+0100-017F,U+2010-2027,U+2030-205E,U+20AC,U+2190-2199,U+2212,U+00B7,U+25B8,U+25BE,U+2715,U+2922';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const gitBlobSha = (buf) =>
  createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const f of FONTS) {
  const url = `${RAW}/${f.path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const ttf = Buffer.from(await res.arrayBuffer());
  const blob = gitBlobSha(ttf);
  if (blob !== f.gitBlob) throw new Error(`${f.path}: git blob ${blob}, expected ${f.gitBlob}`);
  const tmp = join(tmpdir(), `passwerk-${f.out}.ttf`);
  writeFileSync(tmp, ttf);
  const outPath = join(OUT, f.out);
  execFileSync('uv', [
    'tool', 'run', '--from', 'fonttools[woff]', 'pyftsubset', tmp,
    `--unicodes=${UNICODES}`, '--flavor=woff2', '--layout-features=*',
    '--no-hinting', '--desubroutinize', `--output-file=${outPath}`,
  ], { stdio: 'inherit' });
  const woff2 = readFileSync(outPath);
  rows.push(`| \`${f.out}\` | ${f.family} | [${f.path}](${url}) | \`${COMMIT}\` / blob \`${f.gitBlob}\` | \`${sha256(ttf)}\` | \`${sha256(woff2)}\` | ${f.licence} |`);
  console.log(`${f.out}: ${woff2.length} bytes`);
}
writeFileSync(
  join(OUT, 'PROVENANCE.md'),
  `# Provenance of bundled fonts

Generated by \`apps/web/scripts/fonts.mjs\` on ${new Date().toISOString().slice(0, 10)}. The fonts are
subsetted (${UNICODES}) to WOFF2 and inlined into the single-file workbench; nothing is fetched at
runtime (\`apps/web/test/fonts.test.ts\` verifies the files offline on every test run). All four
are licensed under the SIL Open Font License 1.1 (\`OFL.txt\` beside each source file).

| File | Family | Source | Ref | sha256 (download) | sha256 (woff2) | Licence |
|---|---|---|---|---|---|---|
${rows.join('\n')}
`,
);
```

Add to `apps/web/package.json` scripts: `"fonts": "node scripts/fonts.mjs"`.

- [ ] **Step 4: Run the script and the test**

Run: `cd apps/web && GOOGLE_FONTS_COMMIT=$(gh api repos/google/fonts/commits/main --jq .sha) pnpm fonts` (PowerShell: `$env:GOOGLE_FONTS_COMMIT = gh api repos/google/fonts/commits/main --jq .sha; pnpm fonts`). If `pyftsubset` complains about brotli, the `fonttools[woff]` extra pulls it; if `uv` is missing, stop and ask.
Then: `pnpm vitest run apps/web/test/fonts.test.ts` — the `index.css` assertion still fails until Task 2; the four file assertions pass. Check the sizes printed are each under 120 KB.

- [ ] **Step 5: Amend the spec and commit**

In the spec §5.2 replace the sentence starting "ReUI is added as a registry" through "nothing else from ReUI." with the amendment text from this plan's header. Then:

```bash
git add apps/web/scripts/fonts.mjs apps/web/src/fonts apps/web/test/fonts.test.ts apps/web/package.json docs/superpowers/specs/2026-09-10-workbench-redesign-design.md
git commit -m "feat(web): bundle Space Grotesk, Space Mono and Doto with provenance"
```

---

### Task 2: Tokens, `@font-face`, primitives

**Files:**
- Modify: `apps/web/src/index.css` (full rewrite)
- Create via CLI: `apps/web/src/components/ui/toggle-group.tsx`, `toggle.tsx`, `scroll-area.tsx`, `kbd.tsx`, `spinner.tsx`
- Modify: `apps/web/src/components/ui/button.tsx`, `badge.tsx`, `input.tsx`, `tabs.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `select.tsx`, `label.tsx`
- Create: `apps/web/src/components/ui/README.md`

**Interfaces:**
- Produces CSS custom properties `--black --surface --surface-raised --border --border-visible --text-disabled --text-secondary --text-primary --text-display --accent-red --success --warning --instrument-height`, Tailwind utilities `font-sans` (Space Grotesk), `font-mono` (Space Mono), `font-display` (Doto), and the class `.label` (mono caps 11 px / 0.08em).
- Produces `Button` variants `primary | secondary | ghost | destructive`, sizes `sm | md | lg`; `Badge` unchanged API, outline-only look; `ToggleGroup`/`ToggleGroupItem`, `ScrollArea`, `Kbd`, `Spinner` exports as shadcn defines them.

- [ ] **Step 1: Install the four primitives from the official registry**

Run from `apps/web`: `pnpm exec shadcn add toggle-group scroll-area kbd spinner --yes --overwrite`
Expected: `toggle-group.tsx`, `toggle.tsx`, `scroll-area.tsx`, `kbd.tsx`, `spinner.tsx` under `src/components/ui/`, importing from `radix-ui` and `@/lib/utils`. If the CLI reports a missing item, stop and report; do not hand-write it.

- [ ] **Step 2: Rewrite `index.css`**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@font-face { font-family: "Space Grotesk"; src: url("./fonts/space-grotesk.woff2") format("woff2"); font-weight: 300 700; font-display: block; }
@font-face { font-family: "Space Mono"; src: url("./fonts/space-mono-regular.woff2") format("woff2"); font-weight: 400; font-display: block; }
@font-face { font-family: "Space Mono"; src: url("./fonts/space-mono-bold.woff2") format("woff2"); font-weight: 700; font-display: block; }
@font-face { font-family: "Doto"; src: url("./fonts/doto.woff2") format("woff2"); font-weight: 400 900; font-display: block; }

@theme inline {
  --font-sans: "Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Space Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --font-display: "Doto", "Space Mono", ui-monospace, monospace;
  --font-heading: var(--font-sans);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-disabled: var(--text-disabled);
  --color-display: var(--text-display);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-border-visible: var(--border-visible);
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-pill: 999px;
}

:root {
  --instrument-height: 100vh;
  /* Nothing, light */
  --black: #f5f5f5;
  --surface: #ffffff;
  --surface-raised: #f0f0f0;
  --border: #e8e8e8;
  --border-visible: #cccccc;
  --text-disabled: #999999;
  --text-secondary: #666666;
  --text-primary: #1a1a1a;
  --text-display: #000000;
  --accent-red: #d71921;
  --success: #3e8a4f;
  --warning: #b8902e;
  /* shadcn mapping */
  --background: var(--black);
  --foreground: var(--text-primary);
  --card: var(--surface);
  --card-foreground: var(--text-primary);
  --popover: var(--surface);
  --popover-foreground: var(--text-primary);
  --primary: var(--text-display);
  --primary-foreground: var(--black);
  --secondary: var(--surface);
  --secondary-foreground: var(--text-primary);
  --muted: var(--surface);
  --muted-foreground: var(--text-secondary);
  --accent: var(--surface-raised);
  --accent-foreground: var(--text-primary);
  --destructive: var(--accent-red);
  --input: var(--border-visible);
  --ring: var(--border-visible);
  --radius: 8px;
}

.dark {
  --black: #000000;
  --surface: #111111;
  --surface-raised: #1a1a1a;
  --border: #222222;
  --border-visible: #333333;
  --text-disabled: #666666;
  --text-secondary: #999999;
  --text-primary: #e8e8e8;
  --text-display: #ffffff;
  --success: #4a9e5c;
  --warning: #d4a843;
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html { @apply font-sans; color-scheme: light; }
  html.dark { color-scheme: dark; }
  body { @apply bg-background text-foreground; margin: 0; font-size: 14px; line-height: 1.5; }
  /* Mono caps label: one to four words, never prose. */
  .label { font-family: var(--font-mono); font-size: 11px; line-height: 1.2; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-secondary); }
  .display { font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; line-height: 1; color: var(--text-display); }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
}
```

- [ ] **Step 3: Re-skin the primitives**

`button.tsx` — replace the `cva` definition with:

```ts
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-200 ease-out outline-none select-none focus-visible:border-display disabled:pointer-events-none disabled:text-disabled disabled:border-border [&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'rounded-pill border border-display bg-display text-background hover:bg-foreground hover:border-foreground',
        secondary: 'rounded-pill border border-border-visible bg-transparent text-foreground hover:border-display',
        ghost: 'rounded-sm border border-transparent bg-transparent text-muted-foreground hover:text-foreground',
        destructive: 'rounded-pill border border-destructive bg-transparent text-destructive hover:bg-destructive/15',
      },
      size: {
        sm: 'h-7 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-6',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);
```

Keep the `Button` function; change its defaults to `variant = 'secondary', size = 'md'`. Every existing `variant="default"` in views becomes `primary`, `variant="outline"` becomes `secondary`, `variant="link"` becomes `ghost`; `size="sm"` stays `sm`; `size="default"`/omitted becomes `md` (views are rewritten in Tasks 6–10, so only `ErrorBoundary.tsx`, `AddValueDialog.tsx`, `RowEditor.tsx`, `AssistPanel.tsx` need this rename now to keep `pnpm typecheck` green).

`badge.tsx` — replace the `cva` definition with:

```ts
const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2 font-mono text-[11px] uppercase tracking-[0.04em]',
  {
    variants: {
      variant: {
        default: 'border-border-visible text-foreground',
        secondary: 'border-border text-muted-foreground',
        destructive: 'border-destructive text-destructive',
        outline: 'border-border-visible text-muted-foreground',
        success: 'border-success text-success',
        warning: 'border-warning text-warning',
        ghost: 'border-transparent text-muted-foreground',
        link: 'border-transparent text-foreground underline-offset-4 hover:underline',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
```

`input.tsx` — replace the class string with:

```
'h-9 w-full min-w-0 border-0 border-b border-border-visible bg-transparent px-0 py-1 font-mono text-sm text-display rounded-none transition-colors outline-none placeholder:text-disabled focus-visible:border-display disabled:text-disabled disabled:border-border aria-invalid:border-destructive file:mr-3 file:inline-flex file:h-7 file:rounded-pill file:border file:border-border-visible file:bg-transparent file:px-3 file:font-mono file:text-[11px] file:uppercase file:tracking-[0.06em] file:text-foreground'
```

`tabs.tsx` — `tabsListVariants` default: `'flex w-fit items-end gap-4 bg-transparent p-0'`; `TabsTrigger` class:

```
'relative inline-flex items-center border-b border-transparent pb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors data-active:border-display data-active:text-display hover:text-foreground disabled:text-disabled outline-none focus-visible:text-display'
```

`dialog.tsx` — `DialogOverlay` class: `'absolute inset-0 z-50 bg-black/80 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-200'`; `DialogContent` class: `'absolute top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-border-visible bg-surface p-5 text-sm text-foreground outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 duration-200'` (note `absolute`, not `fixed`: dialogs position inside the instrument; `DialogPortal` gets `container` from `InstrumentContext` in Task 5). Apply the same two class changes in `alert-dialog.tsx`. The close button becomes `<Button variant="ghost" size="sm" aria-label="close"><XIcon /></Button>` in the top-right.

`select.tsx` — `SelectTrigger` class: `'flex h-9 w-full items-center justify-between gap-2 border-0 border-b border-border-visible bg-transparent px-0 font-mono text-sm text-display rounded-none outline-none focus-visible:border-display data-placeholder:text-disabled disabled:text-disabled [&_svg]:size-3.5 [&_svg]:text-muted-foreground'`; `SelectContent` class: `'relative z-50 max-h-72 min-w-32 overflow-hidden rounded-md border border-border-visible bg-surface-raised text-foreground'`; `SelectItem` class: `'relative flex h-9 w-full cursor-default select-none items-center px-3 font-mono text-sm outline-none data-highlighted:bg-surface data-[state=checked]:border-l-2 data-[state=checked]:border-destructive'`.

`label.tsx` — class `'label block'`.

- [ ] **Step 4: Write `components/ui/README.md`**

```markdown
# components/ui

shadcn primitives (`radix-nova` style, official registry https://ui.shadcn.com, MIT), installed
with `pnpm exec shadcn add <name>` and re-skinned through the Nothing tokens in `src/index.css`
(spec 2026-09-10, ADR D-040). Do not edit the generated structure; change classes only.

| File | Added | Note |
|---|---|---|
| alert-dialog, badge, button, dialog, input, label, select, table, tabs | 2026-09-05 (Phase 7a) | re-skinned 2026-09-10 |
| toggle-group, toggle, scroll-area, kbd, spinner | 2026-09-10 | official registry; ReUI's registry needs a licence key for these (see the spec §5.2) |

Removed 2026-09-10: `card`, `progress`, `separator`, `sonner` (nothing in the redesign is a card, a bar is `views/shell/SegmentedBar`, status is inline).
```

- [ ] **Step 5: Verify**

Run: `pnpm vitest run apps/web/test/fonts.test.ts && pnpm --filter @passwerk/web build && pnpm typecheck`
Expected: fonts test PASS (all five); build OK, four `.woff2` assets listed; typecheck OK after the variant renames.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/index.css apps/web/src/components/ui
git commit -m "feat(web): Nothing tokens, bundled font faces, re-skinned primitives"
```

---

### Task 3: The sixth step

**Files:**
- Modify: `apps/web/src/workflow/state.ts:7-8`
- Modify: `apps/web/src/i18n/en.ts`, `de.ts` (`step.*`)
- Test: `apps/web/test/reducer.test.ts`, `apps/web/test/i18n.test.ts`

**Interfaces:**
- Produces: `type Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps' | 'export'`; `STEPS` has six entries in that order; keys `step.export`, `step.gaps` = "Gaps"/"Lücken", `step.export` = "Export"/"Export".

- [ ] **Step 1: Failing tests**

Append to `apps/web/test/reducer.test.ts` (inside its top-level `describe`; imports `reduce`, `initialState`, `STEPS` from `@/workflow/...`):

```ts
it('has six steps ending in export and can go there', () => {
  expect(STEPS).toEqual(['project', 'upload', 'facts', 'review', 'gaps', 'export']);
  const s = reduce(initialState, { type: 'goTo', step: 'export', at: '2026-09-10T00:00:00Z' });
  expect(s.step).toBe('export');
});
```

Append to `apps/web/test/i18n.test.ts`:

```ts
it('names every step in both languages', () => {
  for (const step of ['project', 'upload', 'facts', 'review', 'gaps', 'export']) {
    expect(`step.${step}` in de, step).toBe(true);
    expect(`step.${step}` in en, step).toBe(true);
  }
  expect(en['step.gaps']).toBe('Gaps');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run apps/web/test/reducer.test.ts apps/web/test/i18n.test.ts`
Expected: FAIL (type error on `'export'`, missing key).

- [ ] **Step 3: Implement**

`state.ts`:

```ts
export type Step = 'project' | 'upload' | 'facts' | 'review' | 'gaps' | 'export';
export const STEPS: readonly Step[] = ['project', 'upload', 'facts', 'review', 'gaps', 'export'];
```

`en.ts`: `'step.gaps': 'Gaps'`, add `'step.export': 'Export'`. `de.ts`: `'step.gaps': 'Lücken'`, add `'step.export': 'Export'`. In `App.tsx` `reachable`, the final `return derived !== null` already covers `'export'` (the switch in `view` gets its `'export'` case in Task 11; for now add `case 'export': return null;` so the switch stays exhaustive).

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run apps/web/test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/workflow/state.ts apps/web/src/i18n apps/web/src/app/App.tsx apps/web/test
git commit -m "feat(web): export becomes the sixth workflow step"
```

---

### Task 4: Chrome strings

**Files:**
- Modify: `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/de.ts`
- Test: `apps/web/test/i18n.test.ts` (existing key-set test covers both files)

**Interfaces:**
- Produces the keys below, used by Tasks 5–11 via `t(lang, key, params)`.

- [ ] **Step 1: Add the keys to `en.ts`** (values verbatim)

```ts
  'shell.of': '{n} of {total}',
  'shell.prev': 'Prev',
  'shell.next': 'Next',
  'shell.close': 'Close',
  'shell.fullscreen': 'Fullscreen',
  'shell.inline': 'Exit fullscreen',
  'shell.theme.dark': 'Dark mode',
  'shell.theme.light': 'Light mode',
  'shell.saved': 'Saved',
  'shell.copied': 'Copied',
  'shell.copy': 'Copy',
  'shell.error': 'Error',
  'hero.obligation': 'Passport obligation',
  'hero.documents': 'Documents',
  'hero.facts': 'Facts',
  'hero.pending': 'Pending',
  'hero.mandatory': 'Mandatory',
  'hero.carrier': 'Carrier',
  'hero.verdictCarried': 'Verdict carried by every file',
  'hero.decided': '{decided} / {total} decided',
  'hero.proposals': '{count} proposals derived',
  'hero.facts.meta': 'from {documents} documents · {proposed} proposed · {mapped} mapped · {unmapped} unmapped',
  'hero.gaps.meta': '{percent} % · overall {present} / {total}',
  'hero.findings': '{count} findings',
  'hero.mandatoryShort': '{present} / {total} mandatory',
  'upload.drop': 'Drop files or choose',
  'facts.editValue': 'Edit value',
  'facts.mapTo': 'Map to attribute',
  'facts.feeds': 'Proposed for',
  'facts.mappedTo': 'Mapped to',
  'review.assist': 'Assist',
  'review.candidates': '{count} candidates',
  'review.manualSection': 'Manual',
  'review.rowsSection': 'Rows',
  'gaps.view.owner': 'By owner',
  'gaps.view.submodel': 'By submodel',
  'gaps.view.findings': 'Findings',
  'gaps.filter.open': 'Open',
  'gaps.filter.all': 'All',
  'gaps.openCount': '{count} open',
  'gaps.fixInReview': 'Fix in review',
  'gaps.explain': 'Explain',
  'gaps.continue': 'Continue to export',
  'gaps.verify.short': 'Verify',
  'export.download': 'Download',
  'export.aasJson.note': 'IDTA 02035-1…7',
  'export.html.note': 'DE / EN',
  'export.gaps.note': 'JSON',
  'export.draft.note': 'JSON, re-importable',
  'export.qr.formats': 'SVG · PNG',
  'project.identifier.section': 'Identifier',
  'project.import.section': 'Import a draft',
  'project.roleGuidance.section': 'What your role means',
  'project.sources.section': 'Sources',
  'project.resume.meta': '{count} documents · saved {at}',
```

Also change: `'review.continue': 'Continue to gaps'`, `'gaps.title': 'Gaps'`, `'qr.download': 'Download'`.

- [ ] **Step 2: Add the same keys to `de.ts`**

```ts
  'shell.of': '{n} von {total}',
  'shell.prev': 'Zurück',
  'shell.next': 'Weiter',
  'shell.close': 'Schließen',
  'shell.fullscreen': 'Vollbild',
  'shell.inline': 'Vollbild beenden',
  'shell.theme.dark': 'Dunkel',
  'shell.theme.light': 'Hell',
  'shell.saved': 'Gespeichert',
  'shell.copied': 'Kopiert',
  'shell.copy': 'Kopieren',
  'shell.error': 'Fehler',
  'hero.obligation': 'Passpflicht',
  'hero.documents': 'Dokumente',
  'hero.facts': 'Fakten',
  'hero.pending': 'Offen',
  'hero.mandatory': 'Pflichtangaben',
  'hero.carrier': 'Datenträger',
  'hero.verdictCarried': 'Ergebnis in jeder Datei',
  'hero.decided': '{decided} / {total} entschieden',
  'hero.proposals': '{count} Vorschläge abgeleitet',
  'hero.facts.meta': 'aus {documents} Dokumenten · {proposed} vorgeschlagen · {mapped} zugeordnet · {unmapped} offen',
  'hero.gaps.meta': '{percent} % · gesamt {present} / {total}',
  'hero.findings': '{count} Befunde',
  'hero.mandatoryShort': '{present} / {total} Pflichtangaben',
  'upload.drop': 'Dateien ablegen oder auswählen',
  'facts.editValue': 'Wert bearbeiten',
  'facts.mapTo': 'Attribut zuordnen',
  'facts.feeds': 'Vorgeschlagen für',
  'facts.mappedTo': 'Zugeordnet zu',
  'review.assist': 'Assistent',
  'review.candidates': '{count} Kandidaten',
  'review.manualSection': 'Manuell',
  'review.rowsSection': 'Zeilen',
  'gaps.view.owner': 'Nach Datenhalter',
  'gaps.view.submodel': 'Nach Teilmodell',
  'gaps.view.findings': 'Befunde',
  'gaps.filter.open': 'Offen',
  'gaps.filter.all': 'Alle',
  'gaps.openCount': '{count} offen',
  'gaps.fixInReview': 'In Prüfung beheben',
  'gaps.explain': 'Erklären',
  'gaps.continue': 'Weiter zum Export',
  'gaps.verify.short': 'Prüfen',
  'export.download': 'Herunterladen',
  'export.aasJson.note': 'IDTA 02035-1…7',
  'export.html.note': 'DE / EN',
  'export.gaps.note': 'JSON',
  'export.draft.note': 'JSON, erneut importierbar',
  'export.qr.formats': 'SVG · PNG',
  'project.identifier.section': 'Kennung',
  'project.import.section': 'Entwurf importieren',
  'project.roleGuidance.section': 'Was Ihre Rolle bedeutet',
  'project.sources.section': 'Quellen',
  'project.resume.meta': '{count} Dokumente · gespeichert {at}',
```

Also change: `'review.continue': 'Weiter zu den Lücken'`, `'gaps.title': 'Lücken'`, `'qr.download': 'Herunterladen'`.

- [ ] **Step 3: Run the i18n test and commit**

Run: `pnpm vitest run apps/web/test/i18n.test.ts` — PASS (identical key sets, no empty strings).

```bash
git add apps/web/src/i18n
git commit -m "feat(web): chrome strings for the instrument shell, DE and EN"
```

---

### Task 5: The shell primitives

**Files:**
- Create: `apps/web/src/views/shell/context.ts`, `Instrument.tsx`, `Stepper.tsx`, `HeroNumber.tsx`, `SegmentedBar.tsx`, `Row.tsx`, `GroupHeader.tsx`, `Sheet.tsx`, `InlineStatus.tsx`, `Field.tsx`, `index.ts`
- Modify: `apps/web/src/components/ui/dialog.tsx`, `alert-dialog.tsx` (portal container from context)
- Test: `apps/web/test/views/shell/Instrument.test.tsx`, `Stepper.test.tsx`, `HeroNumber.test.tsx`, `SegmentedBar.test.tsx`, `Row.test.tsx`, `Sheet.test.tsx`, `InlineStatus.test.tsx`, `Field.test.tsx`

**Interfaces (produced):**

```ts
// context.ts
export const InstrumentContext: React.Context<{ container: HTMLElement | null }>;
// Instrument.tsx
export function Instrument(props: { top: ReactNode; hero?: ReactNode; toolbar?: ReactNode; footer?: ReactNode; sheet?: ReactNode; children: ReactNode; 'data-testid'?: string }): JSX.Element;
// Stepper.tsx
export function Stepper(props: { lang: Language; steps: readonly Step[]; current: Step; reachable(step: Step): boolean; onGo(step: Step): void }): JSX.Element;
// HeroNumber.tsx
export function HeroNumber(props: { label: string; value: string; unit?: string; tone?: 'display' | 'accent'; 'data-testid'?: string; 'data-verdict'?: string }): JSX.Element;
// SegmentedBar.tsx
export function SegmentedBar(props: { filled: number; total: number; tone?: 'display' | 'accent' | 'success'; size?: 'standard' | 'compact'; segments?: number }): JSX.Element;
// Row.tsx
export type RowTag = { label: string; tone?: 'default' | 'dim' | 'success' | 'warning' | 'accent' };
export function Row(props: { name: ReactNode; value?: string; unit?: string; tags?: RowTag[]; dot?: 'ok' | 'bad' | 'missing' | 'none'; open?: boolean; onOpen?(): void; action?: ReactNode; indent?: boolean; children?: ReactNode } & Record<`data-${string}`, string | undefined>): JSX.Element;
// GroupHeader.tsx
export function GroupHeader(props: { name: string; count: string; open: boolean; onToggle(): void; 'data-testid'?: string }): JSX.Element;
// Sheet.tsx
export function Sheet(props: { lang: Language; open: boolean; title: string; meta?: ReactNode; position?: { index: number; total: number }; onPrev?(): void; onNext?(): void; onClose(): void; actions?: ReactNode; children: ReactNode; 'data-testid'?: string }): JSX.Element;
// InlineStatus.tsx
export function InlineStatus(props: { kind: 'ok' | 'error' | 'info'; text: string; action?: ReactNode; 'data-testid'?: string }): JSX.Element;
// Field.tsx
export function Field(props: { label: string; htmlFor?: string; hint?: string; error?: string; children: ReactNode; 'data-testid'?: string }): JSX.Element;
```

- [ ] **Step 1: Failing tests** (all under `apps/web/test/views/shell/`, each starts with `/** @vitest-environment jsdom */` and imports `mount` from `../render.tsx`)

`Instrument.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Instrument } from '@/views/shell/Instrument.tsx';
import { mount } from '../render.tsx';

describe('Instrument', () => {
  it('lays out top, hero, toolbar, list, footer and sheet inside one fixed-height frame', () => {
    mount(
      <Instrument top={<b>top</b>} hero={<i>hero</i>} toolbar={<u>bar</u>} footer={<s>foot</s>} sheet={<em>sheet</em>} data-testid="instrument">
        <p>list</p>
      </Instrument>,
    );
    const root = screen.getByTestId('instrument');
    expect(root.style.height).toBe('var(--instrument-height)');
    expect(root.querySelector('[data-region="top"]')?.textContent).toBe('top');
    expect(root.querySelector('[data-region="hero"]')?.textContent).toBe('hero');
    expect(root.querySelector('[data-region="toolbar"]')?.textContent).toBe('bar');
    expect(root.querySelector('[data-region="list"]')?.textContent).toBe('list');
    expect(root.querySelector('[data-region="footer"]')?.textContent).toBe('foot');
    expect(root.querySelector('[data-region="sheet"]')?.textContent).toBe('sheet');
  });
});
```

`Stepper.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Stepper } from '@/views/shell/Stepper.tsx';
import { STEPS } from '@/workflow/state.ts';
import { mount } from '../render.tsx';

describe('Stepper', () => {
  it('numbers the six steps, marks the current one and disables unreachable ones', () => {
    const onGo = vi.fn();
    mount(<Stepper lang="en" steps={STEPS} current="review" reachable={(s) => s !== 'export'} onGo={onGo} />);
    expect(screen.getByTestId('step-project').textContent).toBe('01 Project');
    expect(screen.getByTestId('step-review').getAttribute('aria-current')).toBe('step');
    expect((screen.getByTestId('step-export') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('step-gaps'));
    expect(onGo).toHaveBeenCalledWith('gaps');
  });
});
```

`HeroNumber.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroNumber } from '@/views/shell/HeroNumber.tsx';
import { mount } from '../render.tsx';

describe('HeroNumber', () => {
  it('renders label, value and unit, and carries data attributes', () => {
    mount(<HeroNumber label="Mandatory" value="15" unit="/ 47" data-testid="hero" tone="accent" />);
    const el = screen.getByTestId('hero');
    expect(el.textContent).toContain('15');
    expect(el.textContent).toContain('/ 47');
    expect(el.getAttribute('data-tone')).toBe('accent');
    expect(screen.getByText('Mandatory').className).toContain('label');
  });
});
```

`SegmentedBar.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentedBar } from '@/views/shell/SegmentedBar.tsx';
import { mount } from '../render.tsx';

describe('SegmentedBar', () => {
  it('draws the requested number of segments and fills the proportion, rounded down', () => {
    mount(<SegmentedBar filled={15} total={47} segments={20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('15');
    expect(bar.getAttribute('aria-valuemax')).toBe('47');
    const cells = bar.querySelectorAll('i');
    expect(cells).toHaveLength(20);
    expect([...cells].filter((c) => c.dataset['filled'] === 'true')).toHaveLength(6);
  });
  it('treats a zero total as empty', () => {
    mount(<SegmentedBar filled={0} total={0} segments={8} />);
    expect(screen.getByRole('progressbar').querySelectorAll('i[data-filled="true"]')).toHaveLength(0);
  });
});
```

`Row.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Row } from '@/views/shell/Row.tsx';
import { mount } from '../render.tsx';

describe('Row', () => {
  it('shows name, value, unit and tags, passes data attributes and opens on click or Enter', () => {
    const onOpen = vi.fn();
    mount(
      <Row name="Rated capacity" value="75" unit="Ah" tags={[{ label: 'accepted', tone: 'success' }]} dot="ok" onOpen={onOpen} data-testid="row" data-key="ratedCapacity" />,
    );
    const row = screen.getByTestId('row');
    expect(row.getAttribute('data-key')).toBe('ratedCapacity');
    expect(row.textContent).toContain('Rated capacity');
    expect(row.textContent).toContain('75');
    expect(row.textContent).toContain('Ah');
    expect(row.textContent).toContain('accepted');
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
  it('is a plain div without a click handler when it cannot open', () => {
    mount(<Row name="x" data-testid="row" />);
    expect(screen.getByTestId('row').getAttribute('role')).toBeNull();
  });
});
```

`Sheet.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '@/views/shell/Sheet.tsx';
import { mount } from '../render.tsx';

describe('Sheet', () => {
  it('shows title, position, content and actions; arrows and Escape call back', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();
    mount(
      <Sheet lang="en" open title="Rated capacity" meta="BR Annex XIII" position={{ index: 2, total: 8 }} onPrev={onPrev} onNext={onNext} onClose={onClose} actions={<button type="button">Accept</button>} data-testid="sheet">
        <p>body</p>
      </Sheet>,
    );
    const sheet = screen.getByTestId('sheet');
    expect(sheet.textContent).toContain('Rated capacity');
    expect(sheet.textContent).toContain('BR Annex XIII');
    expect(sheet.textContent).toContain('2 of 8');
    expect(screen.getByRole('button', { name: 'Accept' })).toBeTruthy();
    fireEvent.keyDown(sheet, { key: 'ArrowRight' });
    fireEvent.keyDown(sheet, { key: 'ArrowLeft' });
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('renders nothing when closed', () => {
    mount(<Sheet lang="en" open={false} title="x" onClose={() => undefined} data-testid="sheet"><p>b</p></Sheet>);
    expect(screen.queryByTestId('sheet')).toBeNull();
  });
});
```

`InlineStatus.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InlineStatus } from '@/views/shell/InlineStatus.tsx';
import { mount } from '../render.tsx';

describe('InlineStatus', () => {
  it('brackets the kind and shows the text with role=status', () => {
    mount(<InlineStatus kind="error" text="body too large" data-testid="s" />);
    const el = screen.getByTestId('s');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.textContent).toBe('[ERROR] body too large');
    expect(el.getAttribute('data-kind')).toBe('error');
  });
});
```

`Field.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Field } from '@/views/shell/Field.tsx';
import { mount } from '../render.tsx';

describe('Field', () => {
  it('labels its control and shows hint and error', () => {
    mount(
      <Field label="Energy" htmlFor="e" hint="Decimal comma accepted" error="Missing">
        <input id="e" />
      </Field>,
    );
    expect(screen.getByLabelText('Energy')).toBeTruthy();
    expect(screen.getByText('Decimal comma accepted')).toBeTruthy();
    expect(screen.getByText('Missing').className).toContain('text-destructive');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run apps/web/test/views/shell`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the primitives**

`context.ts`:

```ts
import { createContext } from 'react';

/** The instrument element: portals (sheet, dialogs) mount inside it, never on document.body. */
export const InstrumentContext = createContext<{ container: HTMLElement | null }>({
  container: null,
});
```

`Instrument.tsx`:

```tsx
import { type ReactNode, useState } from 'react';
import { InstrumentContext } from './context.ts';

/**
 * The fixed-height frame every step renders in (spec §3): top bar, hero strip, toolbar, the
 * one scrolling list region, footer, and the sheet overlaying the list. The frame's height is
 * `--instrument-height`, so the document never grows with content.
 */
export function Instrument({
  top,
  hero,
  toolbar,
  footer,
  sheet,
  children,
  ...rest
}: {
  top: ReactNode;
  hero?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  sheet?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  // A callback ref into state (not an effect): the container is known after the first commit
  // and portals re-render once it is.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  return (
    <InstrumentContext.Provider value={{ container }}>
      <div
        ref={setContainer}
        className="relative mx-auto grid w-full max-w-[1024px] grid-rows-[auto_auto_auto_1fr_auto] overflow-hidden bg-background text-foreground"
        style={{ height: 'var(--instrument-height)' }}
        {...rest}
      >
        <div data-region="top" className="flex h-11 items-center gap-4 border-b border-border px-4">
          {top}
        </div>
        <div data-region="hero" className="flex min-h-[72px] items-end gap-4 px-4 pt-3 pb-2">
          {hero}
        </div>
        <div data-region="toolbar" className="flex h-9 items-center gap-4 px-4">
          {toolbar}
        </div>
        <div className="relative min-h-0">
          <div
            data-region="list"
            className="h-full overflow-y-auto overscroll-contain px-4 [scrollbar-color:var(--border-visible)_transparent] [scrollbar-width:thin]"
          >
            {children}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent"
          />
          <div data-region="sheet" className="contents">
            {sheet}
          </div>
        </div>
        <div data-region="footer" className="flex h-13 items-center gap-3 border-t border-border px-4">
          {footer}
        </div>
      </div>
    </InstrumentContext.Provider>
  );
}
```

(The bottom fade is the only gradient in the app: it is a mask on the list edge, not chrome decoration.)

`Stepper.tsx`:

```tsx
import { type Key, type Language, t } from '../../i18n/index.ts';
import type { Step } from '../../workflow/state.ts';

const pad = (i: number) => String(i + 1).padStart(2, '0');

export function Stepper({
  lang,
  steps,
  current,
  reachable,
  onGo,
}: {
  lang: Language;
  steps: readonly Step[];
  current: Step;
  reachable(step: Step): boolean;
  onGo(step: Step): void;
}) {
  return (
    <nav aria-label={t(lang, 'step.nav')} className="flex min-w-0 items-center gap-3 overflow-hidden">
      {steps.map((step, i) => {
        const active = step === current;
        return (
          <button
            key={step}
            type="button"
            data-testid={`step-${step}`}
            aria-current={active ? 'step' : undefined}
            disabled={!reachable(step)}
            onClick={() => onGo(step)}
            className={[
              'label shrink-0 whitespace-nowrap transition-colors',
              active ? 'text-display' : reachable(step) ? 'text-muted-foreground hover:text-foreground' : 'text-disabled',
            ].join(' ')}
          >
            {active ? '[ ' : ''}
            {pad(i)} <span className="max-[640px]:hidden">{t(lang, `step.${step}` as Key)}</span>
            {active ? ' ]' : ''}
          </button>
        );
      })}
    </nav>
  );
}
```

`HeroNumber.tsx`:

```tsx
export function HeroNumber({
  label,
  value,
  unit,
  tone = 'display',
  ...rest
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'display' | 'accent';
  'data-testid'?: string;
  'data-verdict'?: string;
}) {
  return (
    <div data-tone={tone} {...rest}>
      <div className="label">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={['display text-[40px]', tone === 'accent' ? 'text-destructive' : ''].join(' ')}>{value}</span>
        {unit && <span className="font-mono text-[22px] text-disabled">{unit}</span>}
      </div>
    </div>
  );
}
```

`SegmentedBar.tsx`:

```tsx
/** Discrete 2 px-gapped blocks, square ends (spec §5.1). Bar = proportion; the number beside it = precision. */
export function SegmentedBar({
  filled,
  total,
  tone = 'display',
  size = 'standard',
  segments = 36,
}: {
  filled: number;
  total: number;
  tone?: 'display' | 'accent' | 'success';
  size?: 'standard' | 'compact';
  segments?: number;
}) {
  const on = total > 0 ? Math.floor((Math.min(filled, total) / total) * segments) : 0;
  const fill = tone === 'accent' ? 'bg-destructive' : tone === 'success' ? 'bg-success' : 'bg-display';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      className={['flex w-full gap-[2px]', size === 'compact' ? 'h-1.5' : 'h-2'].join(' ')}
    >
      {Array.from({ length: segments }, (_, i) => (
        <i key={String(i)} data-filled={i < on ? 'true' : 'false'} className={['flex-1', i < on ? fill : 'bg-border'].join(' ')} />
      ))}
    </div>
  );
}
```

`Row.tsx`:

```tsx
import type { KeyboardEvent, ReactNode } from 'react';

export type RowTag = { label: string; tone?: 'default' | 'dim' | 'success' | 'warning' | 'accent' };

const TAG: Record<NonNullable<RowTag['tone']>, string> = {
  default: 'text-muted-foreground',
  dim: 'text-disabled',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-destructive',
};
const DOT: Record<'ok' | 'bad' | 'missing' | 'none', string> = {
  ok: 'bg-success',
  bad: 'bg-destructive',
  missing: 'border border-disabled',
  none: 'invisible',
};

type DataAttrs = Record<`data-${string}`, string | undefined>;

/** One line per item (spec §5.1): 40 px, top divider, name truncates, detail waits behind `onOpen`. */
export function Row({
  name,
  value,
  unit,
  tags = [],
  dot,
  open = false,
  onOpen,
  action,
  indent = false,
  children,
  ...data
}: {
  name: ReactNode;
  value?: string;
  unit?: string;
  tags?: RowTag[];
  dot?: keyof typeof DOT;
  open?: boolean;
  onOpen?(): void;
  action?: ReactNode;
  indent?: boolean;
  children?: ReactNode;
} & DataAttrs) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (onOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      {...data}
      {...(onOpen ? { role: 'button', tabIndex: 0, onClick: onOpen, onKeyDown } : {})}
      data-open={open ? 'true' : undefined}
      className={[
        'flex min-h-10 items-center gap-3 border-t border-border py-2 text-sm outline-none',
        onOpen ? 'cursor-pointer hover:bg-surface focus-visible:bg-surface' : '',
        open ? '-mx-4 border-l-2 border-l-destructive bg-surface pr-4 pl-[14px]' : '',
        indent ? 'pl-5' : '',
      ].join(' ')}
    >
      {dot && <span aria-hidden className={['size-1.5 shrink-0 rounded-pill', DOT[dot]].join(' ')} />}
      <span className="min-w-0 flex-1 truncate text-foreground">{name}</span>
      {value !== undefined && <span className="font-mono text-display">{value}</span>}
      {unit && <span className="label">{unit}</span>}
      {tags.map((tg) => (
        <span key={tg.label} className={['label', TAG[tg.tone ?? 'default']].join(' ')}>
          {tg.label}
        </span>
      ))}
      {action}
      {onOpen && <span aria-hidden className="w-3 text-right text-disabled">{open ? '▾' : '›'}</span>}
      {children}
    </div>
  );
}
```

`GroupHeader.tsx`:

```tsx
export function GroupHeader({
  name,
  count,
  open,
  onToggle,
  ...rest
}: {
  name: string;
  count: string;
  open: boolean;
  onToggle(): void;
  'data-testid'?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-11 w-full items-center gap-3 border-t border-border text-left outline-none focus-visible:bg-surface"
      {...rest}
    >
      <span className="min-w-0 flex-1 truncate text-display">{name}</span>
      <span className="label">{count}</span>
      <span aria-hidden className="w-3 text-right text-disabled">{open ? '▾' : '›'}</span>
    </button>
  );
}
```

`Sheet.tsx`:

```tsx
import { Dialog as DialogPrimitive } from 'radix-ui';
import { type KeyboardEvent, type ReactNode, useContext } from 'react';
import { Kbd } from '@/components/ui/kbd';
import { type Language, t } from '../../i18n/index.ts';
import { InstrumentContext } from './context.ts';

/**
 * The bottom sheet (spec §3.2): non-modal so the list stays clickable, portaled into the
 * instrument, max 45 % of its height. `Esc` closes, `←` / `→` move within the current list.
 */
export function Sheet({
  lang,
  open,
  title,
  meta,
  position,
  onPrev,
  onNext,
  onClose,
  actions,
  children,
  ...rest
}: {
  lang: Language;
  open: boolean;
  title: string;
  meta?: ReactNode;
  position?: { index: number; total: number };
  onPrev?(): void;
  onNext?(): void;
  onClose(): void;
  actions?: ReactNode;
  children: ReactNode;
  'data-testid'?: string;
}) {
  const { container } = useContext(InstrumentContext);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowRight' && onNext) onNext();
    else if (e.key === 'ArrowLeft' && onPrev) onPrev();
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };
  return (
    <DialogPrimitive.Root open={open} modal={false} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal container={container ?? undefined}>
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="absolute inset-x-0 bottom-0 z-40 grid max-h-[45%] grid-rows-[auto_auto_1fr_auto] border-t border-border-visible bg-surface px-4 pt-2 pb-3 outline-none data-open:animate-in data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:slide-out-to-bottom-4 duration-200"
          {...rest}
        >
          <div aria-hidden className="mx-auto mb-2 h-0.5 w-8 bg-border-visible" />
          <div className="flex items-baseline gap-3">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-sans text-base font-medium text-display">
              {title}
            </DialogPrimitive.Title>
            {meta && <DialogPrimitive.Description className="label truncate">{meta}</DialogPrimitive.Description>}
            <DialogPrimitive.Close aria-label={t(lang, 'shell.close')} className="label hover:text-foreground">
              [ ✕ ]
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto py-2 text-[13px] text-muted-foreground">{children}</div>
          <div className="flex items-center gap-2 pt-1">
            {actions}
            <span className="flex-1" />
            {position && (
              <span className="label flex items-center gap-2">
                {onPrev && (
                  <button type="button" onClick={onPrev} className="hover:text-foreground" aria-label={t(lang, 'shell.prev')}>
                    ‹ <Kbd>←</Kbd>
                  </button>
                )}
                {t(lang, 'shell.of', { n: position.index, total: position.total })}
                {onNext && (
                  <button type="button" onClick={onNext} className="hover:text-foreground" aria-label={t(lang, 'shell.next')}>
                    <Kbd>→</Kbd> ›
                  </button>
                )}
              </span>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
```

`InlineStatus.tsx`:

```tsx
import type { ReactNode } from 'react';

const WORD = { ok: 'OK', error: 'ERROR', info: 'INFO' } as const;

/** The replacement for every toast (spec §9): `[ERROR] …` in mono label size, near its trigger. */
export function InlineStatus({
  kind,
  text,
  action,
  ...rest
}: {
  kind: keyof typeof WORD;
  text: string;
  action?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <span
      role="status"
      data-kind={kind}
      className={['label inline-flex items-center gap-2', kind === 'error' ? 'text-destructive' : ''].join(' ')}
      {...rest}
    >
      {`[${WORD[kind]}] ${text}`}
      {action}
    </span>
  );
}
```

`Field.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  ...rest
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div className="grid gap-1.5" {...rest}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
```

`index.ts` re-exports all nine plus `InstrumentContext`.

- [ ] **Step 4: Portal dialogs into the instrument**

In `components/ui/dialog.tsx` and `alert-dialog.tsx`, `DialogPortal` / `AlertDialogPortal` read `InstrumentContext` and pass `container={container ?? undefined}`:

```tsx
import { useContext } from 'react';
import { InstrumentContext } from '@/views/shell/context.ts';
function DialogPortal(props: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const { container } = useContext(InstrumentContext);
  return <DialogPrimitive.Portal data-slot="dialog-portal" container={container ?? undefined} {...props} />;
}
```

(`components` importing `views/shell/context.ts` is allowed by the boundary test: only `workflow`, `views`, `i18n` have forbidden lists.)

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run apps/web/test/views/shell apps/web/test/boundary.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/shell apps/web/src/components/ui/dialog.tsx apps/web/src/components/ui/alert-dialog.tsx apps/web/test/views/shell
git commit -m "feat(web): instrument shell primitives (frame, stepper, hero, bar, row, sheet, status, field)"
```

---

### Task 6: `01 PROJECT`

**Files:**
- Modify: `apps/web/src/views/ProjectView.tsx` (rewrite the JSX; keep `normaliseEnergy`, `emptyIdentifier`, `IdField`, every handler and prop)
- Create: `apps/web/src/views/parts/ObligationsPanel.tsx` (replaces `ObligationsCard.tsx`, which is deleted)
- Modify: `apps/web/src/views/parts/QrPreview.tsx`
- Test: `apps/web/test/views/ProjectView.test.tsx`, `QrPreview.test.tsx`

**Interfaces:**
- Consumes: `Field`, `Row`, `GroupHeader`, `HeroNumber`, `InlineStatus` (Task 5); `ToggleGroup`/`ToggleGroupItem` (Task 2).
- Produces the **screen contract used by every screen from here on**: each view keeps its current props and gains `top: ReactNode` and `children?: ReactNode`, and renders the `Instrument` itself:

```ts
export function ProjectView(props: ProjectViewProps & { top: ReactNode; children?: ReactNode }): JSX.Element
// renders <Instrument top={top} hero=… toolbar=… footer=… sheet=…>{list}{children}</Instrument>
```

`App.tsx` (Task 11) builds `top` once (stepper, language, fullscreen, start-over) and passes it to the current screen. Dialogs the shell owns (`AddValueDialog` on the facts step, the assist prefill dialog) are passed as `children`, so they render inside the screen's `Instrument` and portal into it through `InstrumentContext`.

- [ ] **Step 1: Update the tests to the new structure**

In `ProjectView.test.tsx` the `view()` helper passes `top={<span>top</span>}`; keep every assertion. Add:

```tsx
it('collapses identifier and import, opens the identifier row itself when the identifier is invalid', () => {
  view(base);
  expect(screen.queryByTestId('identifier-uri')).toBeNull();
  fireEvent.click(screen.getByTestId('section-identifier'));
  expect(screen.getByTestId('identifier-mode-https')).toBeTruthy();
  const bad = { ...base, identifier: { mode: 'gs1' as const, resolverBase: 'https://id.example.com', gtin: '96385075', serial: 'S1' } };
  cleanup();
  view(bad);
  expect(screen.getByTestId('identifier-error')).toBeTruthy();
});
it('renders the obligation as the hero word with data-verdict', () => {
  view(base);
  const hero = screen.getByTestId('obligation-verdict');
  expect(hero.getAttribute('data-verdict')).toBe('required');
  expect(hero.textContent).toContain('Required');
});
```

(`cleanup` from `@testing-library/react`.) In the existing tests that read `identifier-error`, `qr-image`, `qr-payload`, `qr-none`, `identifier-mode-*`, first `fireEvent.click(screen.getByTestId('section-identifier'))` — unless the identifier is invalid, in which case the row is already open. The `import-draft` tests first click `section-import`. `timeline-entry` entries exist in the DOM under a collapsed row (rendered with `hidden`): change `getAllByTestId('timeline-entry').length` to read via `container.querySelectorAll('[data-testid="timeline-entry"]')` — Testing Library's `getAllByTestId` returns hidden elements too, so no change is needed there.

`QrPreview.test.tsx`: unchanged assertions; add `expect(screen.getByTestId('qr-copy')).toBeTruthy()` in the first test.

- [ ] **Step 2: Run to verify failures**

Run: `pnpm vitest run apps/web/test/views/ProjectView.test.tsx apps/web/test/views/QrPreview.test.tsx` → FAIL (`section-identifier` missing, `top` prop unknown).

- [ ] **Step 3: `ObligationsPanel.tsx`**

```tsx
import type { BatteryCategory, ObligationResult } from '@passwerk/core';
import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type Key, type Language, pick, t } from '../../i18n/index.ts';
import { Field } from '../shell/Field.tsx';
import { GroupHeader } from '../shell/GroupHeader.tsx';
import { HeroNumber } from '../shell/HeroNumber.tsx';
import { Row } from '../shell/Row.tsx';

const CATEGORIES: BatteryCategory[] = ['EV', 'LMT', 'INDUSTRIAL_GT_2KWH'];
const NONE = '__none__';

/** The obligation result as the project screen's hero (spec §6.1): the answer first, the reasons behind rows. */
export function ObligationsPanel({
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
  const [open, setOpen] = useState<'timeline' | 'role' | 'sources' | null>(null);
  const toggle = (k: 'timeline' | 'role' | 'sources') => setOpen((o) => (o === k ? null : k));
  const missing = result.missingInput.map((m) => t(lang, `project.missing.${m}` as Key)).join(', ');
  return (
    <div className="grid content-start gap-3" data-testid="obligations-card">
      <HeroNumber
        label={t(lang, 'hero.obligation')}
        value={t(lang, `project.obligations.${result.verdict}`)}
        tone={result.verdict === 'insufficient_input' ? 'accent' : 'display'}
        data-testid="obligation-verdict"
        data-verdict={result.verdict}
      />
      <p className="text-[13px] text-muted-foreground" data-testid="obligation-reason">{pick(lang, result.reason)}</p>
      {missing && <p className="text-[13px] text-destructive">{t(lang, 'project.obligations.missing', { fields: missing })}</p>}
      {result.category ? (
        <p className="text-[13px]" data-testid="obligation-category">
          {t(lang, 'project.category.derived', { category: t(lang, `category.${result.category}`) })}
        </p>
      ) : (
        <Field label={t(lang, 'project.category')} htmlFor="manual-category" hint={t(lang, 'project.category.voluntary')}>
          <Select value={manualCategory ?? NONE} onValueChange={(v) => onManualCategory(v === NONE ? undefined : (v as BatteryCategory))}>
            <SelectTrigger id="manual-category" data-testid="manual-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t(lang, 'project.category.none')}</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{t(lang, `category.${c}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}
      <div>
        <GroupHeader name={t(lang, 'project.timeline')} count={String(result.timeline.length)} open={open === 'timeline'} onToggle={() => toggle('timeline')} data-testid="section-timeline" />
        <ul hidden={open !== 'timeline'}>
          {result.timeline.map((e) => (
            <li key={e.id} data-testid="timeline-entry" data-id={e.id}>
              <Row
                name={pick(lang, e.title)}
                value={e.date}
                tags={[
                  { label: t(lang, e.inEffect ? 'project.timeline.inEffect' : 'project.timeline.upcoming'), tone: e.inEffect ? 'success' : 'dim' },
                  ...(e.verify ? [{ label: t(lang, 'gaps.verify.short'), tone: 'warning' as const }] : []),
                ]}
                indent
                data-legal={e.legalRef}
              />
            </li>
          ))}
        </ul>
        <GroupHeader name={t(lang, 'project.roleGuidance.section')} count="" open={open === 'role'} onToggle={() => toggle('role')} data-testid="section-role" />
        <p hidden={open !== 'role'} className="py-2 pl-5 text-[13px] text-muted-foreground">{pick(lang, result.roleGuidance)}</p>
        <GroupHeader name={t(lang, 'project.sources.section')} count={String(result.sources.length)} open={open === 'sources'} onToggle={() => toggle('sources')} data-testid="section-sources" />
        <p hidden={open !== 'sources'} className="py-2 pl-5 font-mono text-[12px] text-muted-foreground">{result.sources.join('; ')}</p>
      </div>
      <p className="label" data-testid="not-legal-advice">{t(lang, 'app.notLegalAdvice')}</p>
    </div>
  );
}
```

- [ ] **Step 4: `QrPreview.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Language, pick, t } from '../../i18n/index.ts';
import type { CarrierView } from '../../workflow/derive/carrier.ts';
import { InlineStatus } from '../shell/InlineStatus.tsx';

export function QrPreview({ lang, carrier, onDownload }: { lang: Language; carrier: CarrierView; onDownload?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!carrier.ok) {
    return <p className="text-[13px] text-muted-foreground" data-testid="qr-none">{t(lang, 'qr.none', { reason: pick(lang, carrier.message) })}</p>;
  }
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(carrier.svg)}`;
  return (
    <div className="grid justify-items-start gap-2" data-testid="qr-preview">
      <img src={src} alt={t(lang, 'qr.title')} width={128} height={128} className="border-[6px] border-white bg-white" data-testid="qr-image" />
      <span className="label">{t(lang, 'qr.payload')}</span>
      <code className="break-all font-mono text-[12px] text-muted-foreground" data-testid="qr-payload">{carrier.payload}</code>
      <span className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          data-testid="qr-copy"
          onClick={() => void navigator.clipboard?.writeText(carrier.payload).then(() => setCopied(true)).catch(() => undefined)}
        >
          {t(lang, 'shell.copy')}
        </Button>
        {copied && <InlineStatus kind="ok" text={t(lang, 'shell.copied')} />}
        {onDownload && <Button variant="ghost" size="sm" data-testid="qr-download" onClick={onDownload}>{t(lang, 'export.qr.formats')}</Button>}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: `ProjectView.tsx` JSX**

Keep the file's imports of core, `normaliseEnergy`, `emptyIdentifier`, `IdField` (change `IdField` to render `<Field label={label} htmlFor={id}><Input id={id} data-testid={id} value={value} onChange={…} /></Field>`), the props interface plus `top: ReactNode` and `children?: ReactNode`, and every handler. Replace the returned JSX with:

```tsx
const identifierInvalid = !derived.identifier.ok;
const [openSection, setOpenSection] = useState<'identifier' | 'import' | null>(null);
const identifierOpen = openSection === 'identifier' || identifierInvalid;
const importOpen = openSection === 'import';
const toggleSection = (s: 'identifier' | 'import') => setOpenSection((o) => (o === s ? null : s));

return (
  <Instrument
    top={top}
    hero={
      resume ? (
        <div className="flex w-full items-end justify-between gap-4" data-testid="resume-card">
          <HeroNumber label={t(lang, 'start.resume.title')} value={String(resume.files.length)} unit={t(lang, 'hero.documents').toLowerCase()} />
          <span className="flex items-center gap-2 pb-1">
            <span className="label">{t(lang, 'start.resume.saved', { at: new Date(resume.updatedAt).toLocaleString(lang) })}</span>
            <Button variant="primary" size="sm" onClick={onResume}>{t(lang, 'start.resume.button')}</Button>
            <Button variant="ghost" size="sm" onClick={onReset}>{t(lang, 'app.startOver')}</Button>
          </span>
        </div>
      ) : (
        <HeroNumber label={t(lang, 'project.title')} value={t(lang, `project.batteryType.${project.batteryType}` as Key)} />
      )
    }
    footer={
      <>
        <span className="flex-1" />
        <Button variant="primary" data-testid="project-continue" disabled={derived.meta === null} onClick={onContinue}>
          {t(lang, isNew ? 'project.create' : 'project.continue')} →
        </Button>
      </>
    }
  >
    <div className="grid gap-6 py-2 md:grid-cols-[330px_1fr]">
      <div className="grid content-start gap-4 md:border-r md:border-border md:pr-6">
        <Field label={t(lang, 'project.batteryType')} htmlFor="battery-type">
          <Select value={project.batteryType} onValueChange={(v) => onChange({ ...project, batteryType: v as BatteryType })}>
            <SelectTrigger id="battery-type" data-testid="battery-type"><SelectValue /></SelectTrigger>
            <SelectContent>{BATTERY_TYPES.map((type) => <SelectItem key={type} value={type}>{t(lang, `project.batteryType.${type}` as Key)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label={t(lang, 'project.role')} htmlFor="role">
          <Select value={project.role} onValueChange={(v) => onChange({ ...project, role: v as Role })}>
            <SelectTrigger id="role" data-testid="role"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((role) => <SelectItem key={role} value={role}>{t(lang, `project.role.${role}` as Key)}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t(lang, 'project.energyKwh')} htmlFor="energy-kwh" hint={t(lang, 'project.energyKwh.hint')}>
            <Input id="energy-kwh" data-testid="energy-kwh" inputMode="decimal" value={project.energyKwh ?? ''} onChange={(e) => onEnergyChange(e.target.value)} />
          </Field>
          <Field label={t(lang, 'project.placedOnMarketDate')} htmlFor="placed-on-market">
            <Input id="placed-on-market" data-testid="placed-on-market" type="date" value={project.placedOnMarketDate ?? ''} onChange={(e) => onDateChange(e.target.value)} />
          </Field>
        </div>
        <div>
          <GroupHeader name={`${t(lang, 'project.identifier.section')} · ${t(lang, `project.identifier.mode.${identifier.mode}` as Key)}`} count="" open={identifierOpen} onToggle={() => toggleSection('identifier')} data-testid="section-identifier" />
          <div hidden={!identifierOpen} className="grid gap-3 py-3">
            <ToggleGroup type="single" value={identifier.mode} aria-label={t(lang, 'project.identifier.title')} onValueChange={(mode) => { if (mode && mode !== identifier.mode) onIdentifierModeChange(mode as IdentifierMode); }}>
              {IDENTIFIER_MODES.map((mode) => (
                <ToggleGroupItem key={mode} value={mode} role="radio" aria-checked={mode === identifier.mode} data-testid={`identifier-mode-${mode}`}>
                  {t(lang, `project.identifier.mode.${mode}` as Key)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {/* the four mode blocks exactly as today (IdField per field, draft hint) */}
            {!derived.identifier.ok && <InlineStatus kind="error" text={pick(lang, derived.identifier.message)} data-testid="identifier-error" />}
            <QrPreview lang={lang} carrier={derived.carrier} />
          </div>
          <GroupHeader name={t(lang, 'project.import.section')} count="" open={importOpen} onToggle={() => toggleSection('import')} data-testid="section-import" />
          <div hidden={!importOpen} className="grid gap-2 py-3">
            <Input data-testid="import-draft" type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void onFile(file); }} />
            {importError && <InlineStatus kind="error" text={importError} data-testid="import-error" />}
          </div>
        </div>
      </div>
      <ObligationsPanel lang={lang} result={derived.obligations} {...(project.manualCategory !== undefined ? { manualCategory: project.manualCategory } : {})} onManualCategory={(c) => { const { manualCategory: _dropped, ...rest } = project; onChange(c ? { ...rest, manualCategory: c } : rest); }} />
    </div>
    {children}
  </Instrument>
);
```

`ToggleGroupItem` inherits the shadcn `toggleVariants`; in `toggle.tsx` set the base class to `'label inline-flex h-7 items-center rounded-pill border border-border-visible px-3 transition-colors hover:text-foreground data-[state=on]:border-display data-[state=on]:bg-display data-[state=on]:text-background outline-none focus-visible:border-display'` so every toggle group is the Nothing segmented control. Delete `views/parts/ObligationsCard.tsx`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run apps/web/test/views/ProjectView.test.tsx apps/web/test/views/QrPreview.test.tsx` → PASS. (`App.test.tsx` fails until Task 11; that is expected — run only the named files until then.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views apps/web/test/views
git commit -m "feat(web): project screen as an instrument, obligation as the hero"
```

---

### Task 7: `02 DOCUMENTS`

**Files:**
- Modify: `apps/web/src/views/UploadView.tsx` (rewrite)
- Test: `apps/web/test/views/UploadView.test.tsx`

**Interfaces:** props unchanged plus `top: ReactNode`, `children?: ReactNode`, and `error?: string` (the shell's last ingest error, Task 11).

- [ ] **Step 1: Update the test**

Pass `top={<span />}` in every `mount`. Replace `getByRole('button', { name: 'Continue to facts (7 proposals)' })` with `getByTestId('continue')` and assert `textContent` contains `'7 proposals'`; same for the singular test with `'1 proposal'`. Add:

```tsx
it('shows the shell error inline and the busy state as status', () => {
  mount(<UploadView top={<span />} lang="en" busy proposalCount={0} files={[]} error="body too large" onFiles={() => undefined} onRemove={() => undefined} onContinue={() => undefined} />);
  expect(screen.getByTestId('upload-busy')).toBeTruthy();
  expect(screen.getByRole('status', { name: '' }).textContent).toContain('body too large');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run apps/web/test/views/UploadView.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
import { Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { type Key, type Language, t, uploadContinueLabel } from '../i18n/index.ts';
import type { FileSummary } from '../workflow/state.ts';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row } from './shell/Row.tsx';

export interface UploadViewProps {
  lang: Language;
  top: ReactNode;
  files: FileSummary[];
  busy: boolean;
  proposalCount: number;
  error?: string;
  onFiles(files: File[]): void;
  onRemove(name: string): void;
  onContinue(): void;
  children?: ReactNode;
}

const ACCEPT = '.pdf,.xlsx,.docx,.csv,.txt,application/pdf,text/csv,text/plain';

export function UploadView(props: UploadViewProps) {
  const { lang } = props;
  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.documents')} value={String(props.files.length)} />
          {props.files.length > 0 && <span className="label pb-1.5">{t(lang, 'hero.proposals', { count: props.proposalCount })}</span>}
        </>
      }
      toolbar={<span className="label">{t(lang, 'upload.hint')}</span>}
      footer={
        <>
          {props.busy && <InlineStatus kind="info" text={t(lang, 'upload.busy')} data-testid="upload-busy" action={<Spinner />} />}
          {props.error && !props.busy && <InlineStatus kind="error" text={props.error} data-testid="upload-error" />}
          <span className="flex-1" />
          <Button variant="primary" data-testid="continue" disabled={props.busy || props.files.every((f) => f.error)} onClick={props.onContinue}>
            {uploadContinueLabel(lang, props.proposalCount)} →
          </Button>
        </>
      }
    >
      <label
        className="my-2 flex h-24 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-border-visible text-muted-foreground hover:border-display hover:text-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); props.onFiles(Array.from(e.dataTransfer.files)); }}
      >
        <Upload className="size-4" aria-hidden />
        <span className="label">{t(lang, 'upload.drop')}</span>
        <input className="sr-only" data-testid="file-input" type="file" multiple accept={ACCEPT} disabled={props.busy} onChange={(e) => { props.onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </label>
      {props.files.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{t(lang, 'upload.empty')}</p>
      ) : (
        <div data-testid="file-table">
          {props.files.map((f) => (
            <Row
              key={f.name}
              name={f.name}
              value={f.error ? undefined : String(f.pages)}
              unit={f.error ? undefined : t(lang, 'upload.col.pages').toLowerCase()}
              tags={f.error ? [{ label: t(lang, `upload.error.${f.error.code}` as Key), tone: 'accent' }] : [{ label: f.format }, { label: f.lang, tone: 'dim' }]}
              action={<Button variant="ghost" size="sm" aria-label={t(lang, 'upload.remove')} onClick={() => props.onRemove(f.name)}>✕</Button>}
              data-testid="file-row"
              data-file={f.name}
            >
              <span hidden data-testid="file-pages">{f.error ? '' : f.pages}</span>
            </Row>
          ))}
        </div>
      )}
      {props.children}
    </Instrument>
  );
}
```

(`file-pages` stays a text node the e2e reads with `toHaveText`; it is hidden because the visible page count is the row's value. Playwright's `toHaveText` reads hidden elements' `textContent`.)

- [ ] **Step 4: Run** — `pnpm vitest run apps/web/test/views/UploadView.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/UploadView.tsx apps/web/test/views/UploadView.test.tsx
git commit -m "feat(web): documents screen as an instrument"
```

---

### Task 8: `03 FACTS`

**Files:**
- Modify: `apps/web/src/views/FactsView.tsx` (rewrite)
- Test: `apps/web/test/views/FactsView.test.tsx`

**Interfaces:** props unchanged plus `top`, `children`. The sheet opens for `openId: string | null` (local state); `fact-edit`, `fact-edit-value`, `fact-edit-unit`, `fact-edit-save`, `fact-edit-reset`, `fact-map` live in the sheet, so a test/spec first opens the row.

- [ ] **Step 1: Update the test**

Pass `top={<span />}` everywhere. In the first test, before the `fact-edit` click: `fireEvent.click(rowB)`; then query the edit controls with `screen.getByTestId(...)` instead of `rowB.querySelector` (they are in the sheet, a sibling of the list). `expect(screen.getByText(/Page 2/))` — the source is only in the sheet: open row A first (`fireEvent.click(screen.getAllByTestId('fact-row')[0]!)`) and assert `/Page 2/` then open row B and assert `/Cell C3/`. Second test: click `fact-row` before `fact-edit` each time. German test: `'Extrahierte Fakten'` is no longer a heading; assert `screen.getByText('Fakten')` (the hero label). Everything else unchanged.

- [ ] **Step 2: Run to verify failure** — FAIL.

- [ ] **Step 3: Implement**

```tsx
import type { Fact } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { factsCount, type Key, type Language, pick, t } from '../i18n/index.ts';
import { type FactStatus, type FactsFilter, filterFacts } from '../workflow/factsModel.ts';
import type { FactEdit } from '../workflow/state.ts';
import { SourceRef } from './parts/SourceRef.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface FactsViewProps {
  lang: Language;
  top: ReactNode;
  facts: Fact[];
  documents: string[];
  edits: Record<string, FactEdit>;
  statuses: Record<string, FactStatus>;
  onEdit(factId: string, edit: FactEdit): void;
  onClearEdit(factId: string): void;
  onMap(fact: Fact): void;
  onContinue(): void;
  children?: ReactNode;
}

const STATUS_TABS: Array<'all' | FactStatus['status']> = ['all', 'mapped', 'proposed', 'unmapped'];
const TONE: Record<FactStatus['status'], RowTag['tone']> = { mapped: 'success', proposed: 'default', unmapped: 'dim' };

function FactSheet({ lang, fact, edit, status, position, onPrev, onNext, onClose, onEdit, onClearEdit, onMap }: {
  lang: Language; fact: Fact; edit?: FactEdit; status: FactStatus; position: { index: number; total: number };
  onPrev?(): void; onNext?(): void; onClose(): void; onEdit(id: string, e: FactEdit): void; onClearEdit(id: string): void; onMap(f: Fact): void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const shown = edit?.value ?? fact.value ?? fact.raw;
  const openEditor = () => { setValue(edit?.value ?? fact.value ?? fact.raw); setUnit(edit?.unit ?? fact.unit ?? ''); setEditing(true); };
  const mapped = status.status === 'mapped' ? getAttribute(status.attributeId) : undefined;
  return (
    <Sheet
      lang={lang}
      open
      title={fact.label}
      meta={<>{fact.kind} · <SourceRef lang={lang} source={[fact.source]} /></>}
      position={position}
      {...(onPrev ? { onPrev } : {})}
      {...(onNext ? { onNext } : {})}
      onClose={onClose}
      actions={
        editing ? (
          <Button variant="primary" size="sm" data-testid="fact-edit-save" onClick={() => { onEdit(fact.id, { value, ...(unit ? { unit } : {}) }); setEditing(false); }}>{t(lang, 'facts.save')}</Button>
        ) : (
          <>
            <Button size="sm" data-testid="fact-edit" onClick={openEditor}>{t(lang, 'facts.editValue')}</Button>
            {edit && <Button variant="ghost" size="sm" data-testid="fact-edit-reset" onClick={() => onClearEdit(fact.id)}>{t(lang, 'facts.reset')}</Button>}
            <Button size="sm" data-testid="fact-map" onClick={() => onMap(fact)}>{t(lang, 'facts.mapTo')}</Button>
          </>
        )
      }
      data-testid="fact-sheet"
    >
      {editing ? (
        <div className="flex items-end gap-3">
          <Input className="w-40" data-testid="fact-edit-value" value={value} onChange={(e) => setValue(e.target.value)} />
          <Input className="w-20" data-testid="fact-edit-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] text-display">{shown}</span>
          <span className="label">{edit?.unit ?? fact.unit ?? ''}</span>
          {edit && <span className="label" data-testid="fact-edited-sheet">{t(lang, 'facts.edited')}</span>}
        </div>
      )}
      {mapped && <p className="mt-2 text-[12px]">{t(lang, 'facts.mappedTo')}: {pick(lang, mapped.name)} ({mapped.id})</p>}
      {status.status === 'proposed' && <p className="mt-2 text-[12px]">{t(lang, 'facts.feeds')}: {t(lang, 'facts.status.proposed')}</p>}
    </Sheet>
  );
}

export function FactsView(props: FactsViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<FactsFilter>({ document: 'all', status: 'all', search: '' });
  const [openId, setOpenId] = useState<string | null>(null);
  const selectedDocument = filter.document !== 'all' && !props.documents.includes(filter.document) ? 'all' : filter.document;
  const visible = filterFacts(props.facts, props.statuses, { ...filter, document: selectedDocument }, lang);
  const openIndex = visible.findIndex((f) => f.id === openId);
  const openFact = openIndex >= 0 ? visible[openIndex] : undefined;
  const counts = { proposed: 0, mapped: 0, unmapped: 0 };
  for (const f of props.facts) counts[props.statuses[f.id]?.status ?? 'unmapped'] += 1;
  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.facts')} value={String(props.facts.length)} />
          <span className="label pb-1.5">{t(lang, 'hero.facts.meta', { documents: props.documents.length, ...counts })}</span>
        </>
      }
      toolbar={
        <>
          <ToggleGroup type="single" value={filter.status} onValueChange={(v) => v && setFilter((f) => ({ ...f, status: v as FactsFilter['status'] }))}>
            {STATUS_TABS.map((s) => <ToggleGroupItem key={s} value={s} data-testid={`facts-status-${s}`}>{t(lang, `facts.status.${s}` as Key)}</ToggleGroupItem>)}
          </ToggleGroup>
          <span className="flex-1" />
          <Select value={selectedDocument} onValueChange={(v) => setFilter((f) => ({ ...f, document: v }))}>
            <SelectTrigger className="w-44 border-0" data-testid="facts-document"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t(lang, 'facts.document.all')}</SelectItem>
              {props.documents.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input className="w-32" data-testid="facts-search" placeholder={t(lang, 'facts.search')} value={filter.search} onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))} />
          <span className="label" data-testid="facts-count">{factsCount(lang, visible.length, props.facts.length)}</span>
        </>
      }
      footer={<><span className="flex-1" /><Button variant="primary" data-testid="facts-continue" onClick={props.onContinue}>{t(lang, 'facts.continue')} →</Button></>}
      sheet={openFact && (
        <FactSheet
          key={openFact.id}
          lang={lang}
          fact={openFact}
          {...(props.edits[openFact.id] ? { edit: props.edits[openFact.id] } : {})}
          status={props.statuses[openFact.id] ?? { status: 'unmapped' }}
          position={{ index: openIndex + 1, total: visible.length }}
          {...(openIndex > 0 ? { onPrev: () => setOpenId(visible[openIndex - 1]?.id ?? null) } : {})}
          {...(openIndex < visible.length - 1 ? { onNext: () => setOpenId(visible[openIndex + 1]?.id ?? null) } : {})}
          onClose={() => setOpenId(null)}
          onEdit={props.onEdit}
          onClearEdit={props.onClearEdit}
          onMap={props.onMap}
        />
      )}
    >
      {visible.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{t(lang, 'facts.empty')}</p>
      ) : (
        visible.map((f) => {
          const status = props.statuses[f.id] ?? { status: 'unmapped' as const };
          const edit = props.edits[f.id];
          return (
            <Row
              key={f.id}
              name={f.label}
              value={edit?.value ?? f.value ?? f.raw}
              unit={edit?.unit ?? f.unit ?? ''}
              tags={[
                ...(edit ? [{ label: t(lang, 'facts.edited'), tone: 'dim' as const }] : []),
                { label: t(lang, `facts.status.${status.status}` as Key), tone: TONE[status.status] },
              ]}
              open={f.id === openId}
              onOpen={() => setOpenId(f.id)}
              data-testid="fact-row"
              data-fact={f.id}
              data-status={status.status}
            >
              <span hidden data-testid="fact-value">{edit?.value ?? f.value ?? f.raw}</span>
              {edit && <span hidden data-testid="fact-edited" />}
            </Row>
          );
        })
      )}
      {props.children}
    </Instrument>
  );
}
```

- [ ] **Step 4: Run** — `pnpm vitest run apps/web/test/views/FactsView.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/FactsView.tsx apps/web/test/views/FactsView.test.tsx
git commit -m "feat(web): facts screen as three columns with a detail sheet"
```

---

### Task 9: `04 REVIEW`, the assist sheet and the dialogs

**Files:**
- Modify: `apps/web/src/views/ReviewView.tsx` (rewrite)
- Modify: `apps/web/src/views/AssistPanel.tsx`, `AddValueDialog.tsx`, `RowEditor.tsx` (styling only, logic and test ids unchanged)
- Modify: `apps/web/src/views/parts/ConfidenceBadge.tsx`, `SourceRef.tsx`, `VerdictChip.tsx`
- Test: `apps/web/test/views/ReviewView.test.tsx`, `AssistPanel.test.tsx`, `AddValueDialog.test.tsx`, `RowEditor.test.tsx`

**Interfaces:**
- `ReviewViewProps` unchanged plus `top`, `children`, and `assistOpen?: boolean; onAssistToggle?(): void` (the shell owns whether the assist sheet is open so the `assist-toggle` in the toolbar and the sheet agree). `assistPanel` stays the node the shell supplies; the view renders it inside a `Sheet` when `assistOpen`.
- Row = one attribute group (`group`, `data-key`); sheet = every candidate (`proposal`, `data-fact`, `data-state`) with `accept`/`reject`/`edit`.
- `ConfidenceBadge` renders `<span class="label" data-testid="confidence">48 %</span>`; `SourceRef` unchanged output, class `label normal-case tracking-normal`; `VerdictChip` renders `<span class="label" data-testid="verdict" data-verdict=…>` red for `invalid`.

- [ ] **Step 1: Update `ReviewView.test.tsx`**

Pass `top={<span />}` in every mount. Before any click on `accept`, `edit`, `Clear` (group-level) or a read of `proposal`, open the group: `fireEvent.click(screen.getByTestId('group'))`. `getByText('Match')` (the `why`) is in the sheet — open first. The invalid-decision and conflict tests read `InlineStatus` lines above the list: unchanged. The German test asserts `'0 übernommen, 1 offen'` — this string stays in `review-summary` (hidden span in the hero strip): change to `expect(screen.getByTestId('review-summary').textContent).toBe('0 übernommen, 1 offen')`. Array tests: the `array-entry` row shows the count; `array-edit` is in its sheet — open the row first. Critique test: open the group, then `assist-critique-chip`. Add:

```tsx
it('walks the pending queue with next and keeps the list', () => {
  const two = buildGroups([
    { ...groups[0]!.proposals[0]!, attributeId: 'ratedCapacity', factId: 'f1' },
    { ...groups[0]!.proposals[0]!, attributeId: 'batteryMass', factId: 'f2', value: '412', unit: 'kg' },
  ], {});
  mount(<ReviewView top={<span />} lang="en" category="EV" groups={two} manual={[]} conflicts={[]} accepted={0} pending={2} verdict="invalid" onDecide={() => undefined} onClear={() => undefined} onContinue={() => undefined} {...noArrays} />);
  fireEvent.click(screen.getAllByTestId('group')[0]!);
  expect(screen.getByTestId('review-sheet').textContent).toContain('1 of 2');
  fireEvent.keyDown(screen.getByTestId('review-sheet'), { key: 'ArrowRight' });
  expect(screen.getByTestId('review-sheet').textContent).toContain('2 of 2');
  expect(screen.getAllByTestId('group')).toHaveLength(2);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run apps/web/test/views/ReviewView.test.tsx` → FAIL.

- [ ] **Step 3: `ReviewView.tsx`**

```tsx
import type { BatteryCategory, MappingConflict, MappingProposal, Verdict } from '@passwerk/core';
import { getAttribute } from '@passwerk/rules';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type LangText, type Language, pick, rowsCount, t } from '../i18n/index.ts';
import type { AssistCritique } from '../workflow/assist/types.ts';
import type { InvalidDecision } from '../workflow/derive/index.ts';
import type { Decision, DecisionKey } from '../workflow/state.ts';
import { validateValue } from '../workflow/validateValue.ts';
import { AddValueDialog } from './AddValueDialog.tsx';
import { ConfidenceBadge } from './parts/ConfidenceBadge.tsx';
import { SourceRef } from './parts/SourceRef.tsx';
import { VerdictChip } from './parts/VerdictChip.tsx';
import { type ArrayEntry, filterGroups, keyOf, type ReviewFilter, type ReviewGroup } from './reviewModel.ts';
import { RowEditorDialog } from './RowEditor.tsx';
import { Field } from './shell/Field.tsx';
import { GroupHeader } from './shell/GroupHeader.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { SegmentedBar } from './shell/SegmentedBar.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface ReviewViewProps {
  lang: Language;
  top: ReactNode;
  category: BatteryCategory;
  groups: ReviewGroup[];
  manual: Decision[];
  arrays: ArrayEntry[];
  conflicts: MappingConflict[];
  invalidDecisions?: InvalidDecision[];
  critiques?: AssistCritique[];
  assistPanel?: ReactNode;
  assistOpen?: boolean;
  onAssistToggle?(): void;
  accepted: number;
  pending: number;
  verdict: Verdict;
  onDecide(d: Decision): void;
  onClear(key: DecisionKey): void;
  onContinue(): void;
  arrayRows(attributeId: string): unknown;
  children?: ReactNode;
}

/** One candidate inside the sheet: value, provenance, why, and the three decisions. */
function Candidate({ lang, group, p, critique, onDecide }: { lang: Language; group: ReviewGroup; p: MappingProposal; critique?: AssistCritique; onDecide(d: Decision): void }) {
  const d = group.decision;
  const chosen = d && d.kind !== 'manual' && d.factId === p.factId ? d.kind : undefined;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(p.value ?? ''));
  const [unit, setUnit] = useState(p.unit ?? '');
  const [recordedAt, setRecordedAt] = useState('');
  const [error, setError] = useState<LangText | null>(null);
  const dynamic = getAttribute(group.attributeId)?.dynamic === true;
  const base = { attributeId: group.attributeId, ...(group.path !== undefined ? { path: group.path } : {}), factId: p.factId };
  const save = () => {
    const stamp = recordedAt.trim() === '' ? undefined : recordedAt;
    const check = validateValue(group.attributeId, group.path, value, stamp);
    if (!check.ok) { setError(check.message); return; }
    setError(null);
    onDecide({ kind: 'edit', ...base, value, ...(unit ? { unit } : {}), ...(stamp === undefined ? {} : { recordedAt: new Date(stamp).toISOString() }) });
    setEditing(false);
  };
  return (
    <div className="grid gap-2 border-t border-border py-3 first:border-t-0 first:pt-0" data-testid="proposal" data-fact={p.factId} data-state={chosen ?? 'pending'}>
      {editing ? (
        <div className="flex flex-wrap items-end gap-3">
          <Input className="w-40" value={value} onChange={(e) => setValue(e.target.value)} data-testid="edit-value" />
          <Input className="w-20" value={unit} onChange={(e) => setUnit(e.target.value)} data-testid="edit-unit" />
          {dynamic && (
            <Field label={t(lang, 'review.recordedAt')} htmlFor={`recorded-${p.factId}`}>
              <Input className="w-56" id={`recorded-${p.factId}`} type="datetime-local" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} data-testid="edit-recorded-at" />
            </Field>
          )}
          <Button variant="primary" size="sm" onClick={save}>{t(lang, 'review.save')}</Button>
          {error && <InlineStatus kind="error" text={pick(lang, error)} data-testid="value-error" />}
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[22px] text-display" data-testid="proposal-value">{chosen === 'edit' && d?.kind === 'edit' ? d.value : String(p.value)}</span>
          <span className="label">{chosen === 'edit' && d?.kind === 'edit' ? (d.unit ?? '') : (p.unit ?? '')}</span>
          {chosen === 'edit' && <span className="label">{t(lang, 'review.edited')}</span>}
          <ConfidenceBadge value={p.confidence} />
          <SourceRef lang={lang} source={p.source} />
        </div>
      )}
      <p className="text-[13px]">{pick(lang, p.why)}</p>
      {critique && <p className="text-[12px] text-warning" data-testid="assist-critique-chip">{t(lang, 'assist.critique.chip')}: {critique.reason}</p>}
      <div className="flex gap-2">
        <Button variant={chosen === 'accept' ? 'primary' : 'secondary'} size="sm" data-testid="accept" onClick={() => onDecide({ kind: 'accept', ...base })}>{t(lang, 'review.accept')}</Button>
        <Button variant={chosen === 'reject' ? 'destructive' : 'secondary'} size="sm" data-testid="reject" onClick={() => onDecide({ kind: 'reject', ...base })}>{t(lang, 'review.reject')}</Button>
        <Button variant="ghost" size="sm" data-testid="edit" onClick={() => setEditing((v) => !v)}>{t(lang, 'review.edit')}</Button>
      </div>
    </div>
  );
}

const stateTag = (g: ReviewGroup, lang: Language): RowTag[] => {
  if (!g.decision) return [];
  if (g.decision.kind === 'reject') return [{ label: t(lang, 'review.filter.rejected'), tone: 'dim' }];
  if (g.decision.kind === 'edit') return [{ label: t(lang, 'review.edited'), tone: 'success' }];
  return [{ label: t(lang, 'review.filter.accepted'), tone: 'success' }];
};

export function ReviewView(props: ReviewViewProps) {
  const { lang } = props;
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const [search, setSearch] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editingArray, setEditingArray] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const visible = filterGroups(props.groups, filter, search, lang);
  const openIndex = visible.findIndex((g) => g.key === openKey);
  const openGroup = openIndex >= 0 ? visible[openIndex] : undefined;
  const openArray = props.arrays.find((a) => `array:${a.attributeId}` === openKey);
  const openManual = props.manual.find((d) => `manual:${keyOf(d)}` === openKey);
  const total = props.accepted + props.pending;
  const critiqueOf = (g: ReviewGroup, p: MappingProposal) =>
    (props.critiques ?? []).find((c) => c.factId === p.factId && c.attributeId === g.attributeId && c.path === g.path);

  const sheet = openGroup ? (
    <Sheet
      lang={lang}
      open
      title={`${pick(lang, openGroup.name)}${openGroup.path ? ` · ${openGroup.path}` : ''}`}
      meta={openGroup.legalRefs.join('; ')}
      position={{ index: openIndex + 1, total: visible.length }}
      {...(openIndex > 0 ? { onPrev: () => setOpenKey(visible[openIndex - 1]?.key ?? null) } : {})}
      {...(openIndex < visible.length - 1 ? { onNext: () => setOpenKey(visible[openIndex + 1]?.key ?? null) } : {})}
      onClose={() => setOpenKey(null)}
      actions={openGroup.decision && <Button variant="ghost" size="sm" onClick={() => props.onClear(openGroup.key)}>{t(lang, 'review.clear')}</Button>}
      data-testid="review-sheet"
    >
      {openGroup.proposals.map((p) => {
        const critique = critiqueOf(openGroup, p);
        return <Candidate key={p.factId} lang={lang} group={openGroup} p={p} {...(critique ? { critique } : {})} onDecide={props.onDecide} />;
      })}
    </Sheet>
  ) : openArray ? (
    <Sheet lang={lang} open title={pick(lang, openArray.name)} meta={rowsCount(lang, openArray.rows)} onClose={() => setOpenKey(null)}
      actions={<Button size="sm" data-testid="array-edit" onClick={() => setEditingArray(openArray.attributeId)}>{t(lang, 'rows.edit')}</Button>} data-testid="review-sheet">
      <p>{openArray.origin === 'manual' ? t(lang, 'review.manual') : ''}</p>
    </Sheet>
  ) : openManual ? (
    <Sheet lang={lang} open title={`${openManual.attributeId}${openManual.path ? `.${openManual.path}` : ''}`} meta={t(lang, 'review.manual')} onClose={() => setOpenKey(null)}
      actions={<Button variant="ghost" size="sm" onClick={() => { props.onClear(keyOf(openManual)); setOpenKey(null); }}>{t(lang, 'review.clear')}</Button>} data-testid="review-sheet">
      <span className="font-mono text-[22px] text-display">{openManual.kind === 'manual' ? (Array.isArray(openManual.value) ? rowsCount(lang, openManual.value.length) : openManual.value) : ''}</span>
    </Sheet>
  ) : props.assistOpen && props.assistPanel ? (
    <Sheet lang={lang} open title={t(lang, 'review.assist')} onClose={() => props.onAssistToggle?.()} data-testid="assist-sheet">{props.assistPanel}</Sheet>
  ) : undefined;

  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.pending')} value={String(props.pending)} />
          <div className="flex-1 pb-1.5">
            <SegmentedBar filled={props.accepted} total={total} />
            <div className="label mt-1.5 flex gap-2">
              <span data-testid="review-summary">{t(lang, 'review.summary', { accepted: props.accepted, pending: props.pending })}</span>
              <span>·</span>
              <VerdictChip lang={lang} verdict={props.verdict} />
            </div>
          </div>
        </>
      }
      toolbar={
        <>
          <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v as ReviewFilter)}>
            {(['pending', 'accepted', 'rejected', 'all'] as const).map((f) => <ToggleGroupItem key={f} value={f} data-testid={`filter-${f}`}>{t(lang, `review.filter.${f}`)}</ToggleGroupItem>)}
          </ToggleGroup>
          <span className="flex-1" />
          <Input className="w-32" placeholder={t(lang, 'review.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          {props.assistPanel && props.onAssistToggle && (
            <Button variant="ghost" size="sm" data-testid="assist-toggle" aria-pressed={props.assistOpen ?? false} onClick={props.onAssistToggle}>{t(lang, 'review.assist')}</Button>
          )}
          <Button variant="ghost" size="sm" data-testid="add-value" onClick={() => setAddOpen(true)}>+ {t(lang, 'review.addValue')}</Button>
        </>
      }
      footer={
        <>
          <span className="flex-1" />
          <Button variant="primary" data-testid="to-gaps" onClick={props.onContinue}>{t(lang, 'review.continue')} →</Button>
        </>
      }
      sheet={sheet}
    >
      {props.conflicts.map((c) => (
        <div key={`${c.attributeId}${c.path ?? ''}`} className="py-1">
          <InlineStatus kind="error" data-testid="conflict" text={`${c.attributeId}${c.path ? `.${c.path}` : ''}: ${t(lang, 'review.conflict', { existing: JSON.stringify(c.existing), incoming: JSON.stringify(c.incoming) })}`} />
        </div>
      ))}
      {(props.invalidDecisions ?? []).map((d) => (
        <div key={d.key} className="py-1">
          <InlineStatus kind="error" data-testid="invalid-decision" text={`${d.key}: ${t(lang, 'review.invalidDecision', { reason: typeof d.message === 'string' ? d.message : pick(lang, d.message) })}`}
            action={<Button variant="ghost" size="sm" onClick={() => props.onClear(d.key)}>{t(lang, 'review.clear')}</Button>} />
        </div>
      ))}
      {visible.length === 0 && props.manual.length === 0 && props.arrays.length === 0 && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">{t(lang, 'review.empty')}</p>
      )}
      {visible.map((g) => {
        const best = g.proposals[0];
        return (
          <Row
            key={g.key}
            name={`${pick(lang, g.name)}${g.path ? ` · ${g.path}` : ''}`}
            value={best ? (g.decision?.kind === 'edit' ? g.decision.value : String(best.value)) : undefined}
            unit={best ? (g.decision?.kind === 'edit' ? (g.decision.unit ?? '') : (best.unit ?? '')) : undefined}
            tags={[
              ...(best ? [{ label: `${Math.round(best.confidence * 100)} %`, tone: 'dim' as const }] : []),
              ...(g.proposals.length > 1 ? [{ label: t(lang, 'review.candidates', { count: g.proposals.length }), tone: 'dim' as const }] : []),
              ...stateTag(g, lang),
            ]}
            dot={g.proposals.some((p) => critiqueOf(g, p)) ? 'bad' : 'none'}
            open={g.key === openKey}
            onOpen={() => setOpenKey(g.key)}
            data-testid="group"
            data-key={g.key}
          />
        );
      })}
      {props.manual.length > 0 && <GroupHeader name={t(lang, 'review.manualSection')} count={String(props.manual.length)} open onToggle={() => undefined} />}
      {props.manual.map((d) => (
        <Row key={keyOf(d)} name={`${d.attributeId}${d.path ? `.${d.path}` : ''}`}
          value={d.kind === 'manual' ? (Array.isArray(d.value) ? rowsCount(lang, d.value.length) : d.value) : ''}
          tags={[{ label: t(lang, 'review.manual'), tone: 'dim' }]} indent open={openKey === `manual:${keyOf(d)}`} onOpen={() => setOpenKey(`manual:${keyOf(d)}`)} data-testid="manual" />
      ))}
      {props.arrays.length > 0 && <GroupHeader name={t(lang, 'review.rowsSection')} count={String(props.arrays.length)} open onToggle={() => undefined} />}
      {props.arrays.map((a) => (
        <Row key={a.attributeId} name={pick(lang, a.name)} value={rowsCount(lang, a.rows)}
          tags={a.origin === 'manual' ? [{ label: t(lang, 'review.manual'), tone: 'dim' }] : []} indent open={openKey === `array:${a.attributeId}`} onOpen={() => setOpenKey(`array:${a.attributeId}`)} data-testid="array-entry" data-attribute={a.attributeId} />
      ))}
      <AddValueDialog lang={lang} category={props.category} onAdd={(d) => { props.onDecide(d); setAddOpen(false); }} arrayRows={props.arrayRows} open={addOpen} onOpenChange={setAddOpen} hideTrigger />
      <RowEditorDialog lang={lang} attributeId={editingArray ?? ''} initial={editingArray ? props.arrayRows(editingArray) : undefined} open={editingArray !== null}
        onOpenChange={(open) => { if (!open) setEditingArray(null); }} onSave={(rows) => { if (editingArray) props.onDecide({ kind: 'manual', attributeId: editingArray, value: rows }); }} />
      {props.children}
    </Instrument>
  );
}
```

`AddValueDialog` currently renders its own trigger button carrying `data-testid="add-value"`; with `hideTrigger` the toolbar button above carries that id instead — check `AddValueDialog.tsx` renders no second `add-value` when `hideTrigger` is set.

- [ ] **Step 4: Parts and dialogs**

`ConfidenceBadge.tsx`: `<span className={['label', value >= 0.7 ? 'text-foreground' : value >= 0.4 ? '' : 'text-disabled'].join(' ')} data-testid="confidence">{Math.round(value * 100)} %</span>`.
`VerdictChip.tsx`: `<span className={['label', verdict === 'invalid' ? 'text-destructive' : verdict === 'valid' ? 'text-success' : 'text-warning'].join(' ')} data-testid="verdict" data-verdict={verdict}>{t(lang, verdictKey(verdict))}</span>`.
`SourceRef.tsx`: outer class `'font-mono text-[12px] text-muted-foreground'`.

`AssistPanel.tsx`: replace `Card`/`CardHeader`/`CardContent`/`CardTitle` with a `<div className="grid gap-3" data-testid="assist">`; the panel no longer owns an `open` state or its own toggle button (the shell/ReviewView does) — remove the `assist-toggle` button from this file and render the body unconditionally; every `Label`+`Input`/`Select` pair becomes a `Field`; `Badge` → `label` spans; `Button variant="default"` → `primary`, `outline` → `secondary`; the error `<p className="text-destructive">` → `InlineStatus kind="error"` with `data-testid="assist-error"`; the request disclosure `<pre>` keeps `data-testid="assist-request"` with class `'max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground'`. Every other `data-testid` stays on the same kind of element.

`AddValueDialog.tsx` and `RowEditor.tsx`: `Dialog`/`DialogContent` already re-skinned in Task 2; inside, `Label`+control → `Field`; `Button` variants renamed as in Task 2; the row editor's `Table` keeps `table.tsx` (header cells get class `label`, cell padding `px-3 py-2`, no zebra). `RowEditorDialog` content width `max-w-[640px]`.

Update `AssistPanel.test.tsx`: any test that clicked `assist-toggle` to reveal the body removes that click (the body is always rendered by the panel; the toggle moved to `ReviewView`); assertions otherwise unchanged. `AddValueDialog.test.tsx`, `RowEditor.test.tsx`: no assertion changes expected; run them.

- [ ] **Step 5: Run** — `pnpm vitest run apps/web/test/views/ReviewView.test.tsx apps/web/test/views/AssistPanel.test.tsx apps/web/test/views/AddValueDialog.test.tsx apps/web/test/views/RowEditor.test.tsx` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views apps/web/test/views
git commit -m "feat(web): review screen as rows with a candidate sheet; assist as a sheet"
```

---

### Task 10: `05 GAPS` and `06 EXPORT`

**Files:**
- Create: `apps/web/src/views/GapsView.tsx`, `apps/web/src/views/ExportView.tsx`
- Delete: `apps/web/src/views/GapsExportView.tsx`
- Test: `apps/web/test/views/GapsView.test.tsx`, `ExportView.test.tsx` (replace `GapsExportView.test.tsx`)

**Interfaces:**

```ts
export interface GapsViewProps { lang: Language; top: ReactNode; report: ValidationReport; gap: GapReport; onFixInReview(attributeId: string): void; onContinue(): void; children?: ReactNode }
export interface ExportViewProps { lang: Language; top: ReactNode; report: ValidationReport; gap: GapReport; carrier: CarrierView; exportError?: LangText; onExport(kind: ExportKind): void; children?: ReactNode }
```

- [ ] **Step 1: Tests**

`GapsView.test.tsx` (same fixtures as the old `GapsExportView.test.tsx`):

```tsx
/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GapsView } from '@/views/GapsView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });
const props = { lang: 'en' as const, top: <span />, report, gap, onFixInReview: () => undefined, onContinue: () => undefined };

describe('GapsView', () => {
  it('shows verdict, completeness and every item, grouped by owner, open ones first', () => {
    mount(<GapsView {...props} />);
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    expect(screen.getByTestId('completeness-mandatory').textContent).toContain(gap.completeness.mandatory.percent);
    fireEvent.click(screen.getByTestId('gaps-filter-all'));
    expect(screen.getAllByTestId('gap-item')).toHaveLength(gap.items.length);
    expect(screen.getAllByTestId('gap-group')).toHaveLength(gap.byDataOwner.length);
  });
  it('lists the findings under their tab and opens a gap item in the sheet', () => {
    const onFix = vi.fn();
    mount(<GapsView {...props} onFixInReview={onFix} />);
    fireEvent.click(screen.getByTestId('gaps-view-findings'));
    expect(screen.getAllByTestId('finding')).toHaveLength(report.findings.length);
    fireEvent.click(screen.getByTestId('gaps-view-owner'));
    const first = screen.getAllByTestId('gap-item')[0] as HTMLElement;
    fireEvent.click(first);
    const sheet = screen.getByTestId('gaps-sheet');
    expect(sheet.textContent).toContain('Legal basis');
    fireEvent.click(screen.getByTestId('gaps-fix'));
    expect(onFix).toHaveBeenCalledWith(first.getAttribute('data-attribute'));
  });
  it('renders German', () => {
    mount(<GapsView {...props} lang="de" />);
    expect(screen.getByText('Pflichtangaben')).toBeTruthy();
  });
});
```

`ExportView.test.tsx`:

```tsx
/** @vitest-environment jsdom */
import { gapReport, getSample, type PassportDraft, validate } from '@passwerk/core';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExportView } from '@/views/ExportView.tsx';
import { mount } from './render.tsx';

const draft = getSample('ev-missing-material-identifier') as PassportDraft;
const report = validate(draft, { asOf: '2026-09-05T12:00:00Z' });
const gap = gapReport(draft, { report, asOf: '2026-09-05T12:00:00Z' });
const ok = { ok: true as const, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', payload: 'https://p.example/1' };

describe('ExportView', () => {
  it('states the verdict once, lists five files and the QR', () => {
    const onExport = vi.fn();
    mount(<ExportView lang="en" top={<span />} report={report} gap={gap} carrier={ok} onExport={onExport} />);
    expect(screen.getByTestId('verdict').getAttribute('data-verdict')).toBe('invalid');
    for (const k of ['aasJson', 'aasx', 'html', 'gaps', 'draft']) fireEvent.click(screen.getByTestId(`export-${k}`));
    expect(onExport.mock.calls.map((c) => c[0])).toEqual(['aasJson', 'aasx', 'html', 'gaps', 'draft']);
    fireEvent.click(screen.getByTestId('qr-download'));
    expect(onExport).toHaveBeenLastCalledWith('qr');
    expect(screen.getByTestId('not-legal-advice')).toBeTruthy();
  });
  it('shows the reason when there is no QR, and the export error inline', () => {
    mount(<ExportView lang="en" top={<span />} report={report} gap={gap} carrier={{ ok: false, message: { de: 'kein', en: 'none' } }} exportError={{ de: 'kaputt', en: 'broken' }} onExport={() => undefined} />);
    expect(screen.getByTestId('qr-none').textContent).toContain('none');
    expect(screen.getByTestId('export-error').textContent).toContain('broken');
  });
});
```

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: `GapsView.tsx`**

```tsx
import type { GapReport, ValidationReport } from '@passwerk/core';
import { explainAttribute } from '@passwerk/core';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { type Key, type Language, pick, t } from '../i18n/index.ts';
import { VerdictChip } from './parts/VerdictChip.tsx';
import { GroupHeader } from './shell/GroupHeader.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row, type RowTag } from './shell/Row.tsx';
import { SegmentedBar } from './shell/SegmentedBar.tsx';
import { Sheet } from './shell/Sheet.tsx';

export interface GapsViewProps {
  lang: Language;
  top: ReactNode;
  report: ValidationReport;
  gap: GapReport;
  onFixInReview(attributeId: string): void;
  onContinue(): void;
  children?: ReactNode;
}

type View = 'owner' | 'submodel' | 'findings';
type Item = GapReport['items'][number];
const DOT: Record<Item['status'], 'ok' | 'bad' | 'missing'> = { present: 'ok', missing: 'missing', conflict: 'bad', invalid: 'bad', not_applicable: 'missing' };

export function GapsView(props: GapsViewProps) {
  const { lang, report, gap } = props;
  const [view, setView] = useState<View>('owner');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const q = search.trim().toLowerCase();
  const show = (i: Item) => (!onlyOpen || i.status !== 'present') && (q === '' || pick(lang, i.name).toLowerCase().includes(q) || i.attributeId.toLowerCase().includes(q));
  const groups = (view === 'owner' ? gap.byDataOwner.map((g) => ({ key: `owner-${g.owner.en}`, title: pick(lang, g.owner), ids: g.attributeIds })) : gap.bySubmodel.map((g) => ({ key: `part-${g.part ?? 'none'}`, title: g.submodelIdShort ?? '—', ids: g.attributeIds })))
    .map((g) => ({ ...g, items: g.ids.map((id) => byId.get(id)).filter((i): i is Item => i !== undefined && show(i)) }))
    .filter((g) => g.items.length > 0);
  const flat = groups.flatMap((g) => g.items);
  const openIndex = flat.findIndex((i) => i.attributeId === openKey);
  const open = openIndex >= 0 ? flat[openIndex] : undefined;
  const openFinding = view === 'findings' ? report.findings.find((_, i) => `finding-${i}` === openKey) : undefined;
  const explanation = open ? explainAttribute(open.attributeId) : undefined;
  const bucket = (i: Item): RowTag => ({ label: t(lang, `gaps.bucket.${i.bucket}` as Key), tone: i.bucket === 'required' ? 'default' : 'dim' });
  const layers = (['L1', 'L2', 'L3', 'L4'] as const);

  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.mandatory')} value={String(gap.completeness.mandatory.present)} unit={`/ ${gap.completeness.mandatory.total}`} data-testid="completeness-mandatory-hero" />
          <div className="flex-1 pb-1.5">
            <SegmentedBar filled={Number(gap.completeness.mandatory.present)} total={Number(gap.completeness.mandatory.total)} />
            <div className="label mt-1.5 flex flex-wrap gap-2">
              <span data-testid="completeness-mandatory">{gap.completeness.mandatory.present}/{gap.completeness.mandatory.total} ({gap.completeness.mandatory.percent} %)</span>
              <span>·</span>
              <span data-testid="completeness-overall">{t(lang, 'hero.gaps.meta', { percent: gap.completeness.mandatory.percent, present: gap.completeness.overall.present, total: gap.completeness.overall.total })}</span>
              <span>·</span>
              <VerdictChip lang={lang} verdict={report.verdict} />
              {layers.map((l) => (
                <span key={l} data-testid={`layer-${l}`} title={t(lang, 'gaps.layer', { layer: l, errors: report.layers[l].errors, warnings: report.layers[l].warnings })}>
                  {l} <span className={report.layers[l].errors > 0 ? 'text-display' : ''}>{report.layers[l].errors}</span>
                </span>
              ))}
            </div>
          </div>
        </>
      }
      toolbar={
        <>
          <ToggleGroup type="single" value={view} onValueChange={(v) => { if (v) { setView(v as View); setOpenKey(null); } }}>
            <ToggleGroupItem value="owner" data-testid="gaps-view-owner">{t(lang, 'gaps.view.owner')}</ToggleGroupItem>
            <ToggleGroupItem value="submodel" data-testid="gaps-view-submodel">{t(lang, 'gaps.view.submodel')}</ToggleGroupItem>
            <ToggleGroupItem value="findings" data-testid="gaps-view-findings">{t(lang, 'gaps.view.findings')} {report.findings.length}</ToggleGroupItem>
          </ToggleGroup>
          <span className="flex-1" />
          {view !== 'findings' && (
            <ToggleGroup type="single" value={onlyOpen ? 'open' : 'all'} onValueChange={(v) => v && setOnlyOpen(v === 'open')}>
              <ToggleGroupItem value="open" data-testid="gaps-filter-open">{t(lang, 'gaps.filter.open')}</ToggleGroupItem>
              <ToggleGroupItem value="all" data-testid="gaps-filter-all">{t(lang, 'gaps.filter.all')}</ToggleGroupItem>
            </ToggleGroup>
          )}
          <Input className="w-28" placeholder={t(lang, 'review.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </>
      }
      footer={
        <>
          <span className="label" data-testid="not-legal-advice">{t(lang, 'app.notLegalAdvice')}</span>
          <span className="flex-1" />
          <Button variant="primary" data-testid="to-export" onClick={props.onContinue}>{t(lang, 'gaps.continue')} →</Button>
        </>
      }
      sheet={open ? (
        <Sheet lang={lang} open title={pick(lang, open.name)} meta={`${t(lang, `gaps.status.${open.status}` as Key)} · ${t(lang, `gaps.bucket.${open.bucket}` as Key)}`}
          position={{ index: openIndex + 1, total: flat.length }}
          {...(openIndex > 0 ? { onPrev: () => setOpenKey(flat[openIndex - 1]?.attributeId ?? null) } : {})}
          {...(openIndex < flat.length - 1 ? { onNext: () => setOpenKey(flat[openIndex + 1]?.attributeId ?? null) } : {})}
          onClose={() => setOpenKey(null)}
          actions={<Button size="sm" data-testid="gaps-fix" onClick={() => props.onFixInReview(open.attributeId)}>{t(lang, 'gaps.fixInReview')}</Button>}
          data-testid="gaps-sheet">
          <p><span className="label">{t(lang, 'gaps.legalRefs')}</span> {open.legalRefs.join(' · ')}</p>
          <p className="mt-1"><span className="label">{t(lang, 'gaps.nextAction')}</span> {pick(lang, open.suggestedAction)}</p>
          {open.verify && <p className="mt-1 text-warning">{t(lang, 'gaps.verify')}</p>}
          {explanation && <details className="mt-2"><summary className="label cursor-pointer">{t(lang, 'gaps.explain')}</summary><p className="mt-1">{pick(lang, explanation.explanation)}</p></details>}
        </Sheet>
      ) : openFinding ? (
        <Sheet lang={lang} open title={openFinding.ruleId} meta={`${openFinding.layer} · ${openFinding.severity}`} onClose={() => setOpenKey(null)} data-testid="gaps-sheet">
          <p>{pick(lang, openFinding.message)}</p>
          <p className="mt-1 font-mono text-[12px]">{openFinding.path}</p>
        </Sheet>
      ) : undefined}
    >
      {view === 'findings'
        ? report.findings.map((f, i) => (
            <Row key={`${f.layer}-${f.ruleId}-${f.path}-${i}`} name={pick(lang, f.message)} tags={[{ label: f.layer, tone: f.severity === 'error' ? 'accent' : 'warning' }, { label: f.ruleId, tone: 'dim' }]}
              open={openKey === `finding-${i}`} onOpen={() => setOpenKey(`finding-${i}`)} data-testid="finding" data-rule={f.ruleId} data-attribute={f.attributeId ?? ''} />
          ))
        : groups.map((g) => {
            const isOpen = !closed.has(g.key);
            return (
              <div key={g.key} data-testid="gap-group">
                <GroupHeader name={g.title} count={t(lang, 'gaps.openCount', { count: g.items.filter((i) => i.status !== 'present').length })} open={isOpen}
                  onToggle={() => setClosed((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} />
                <div hidden={!isOpen}>
                  {g.items.map((item) => (
                    <Row key={item.attributeId} name={pick(lang, item.name)} dot={DOT[item.status]}
                      tags={[bucket(item), ...(item.status === 'invalid' || item.status === 'conflict' ? [{ label: t(lang, `gaps.status.${item.status}` as Key), tone: 'accent' as const }] : []), ...(item.verify ? [{ label: t(lang, 'gaps.verify.short'), tone: 'warning' as const }] : [])]}
                      indent open={openKey === item.attributeId} onOpen={() => setOpenKey(item.attributeId)}
                      data-testid="gap-item" data-attribute={item.attributeId} data-status={item.status} data-bucket={item.bucket} />
                  ))}
                </div>
              </div>
            );
          })}
      {props.children}
    </Instrument>
  );
}
```

Note `finding` rows are only in the DOM under the `FINDINGS` view, and `gap-item` rows only under the two grouped views with the `OPEN` filter on by default. The e2e specs (Task 13) switch tabs and the filter before counting; `not_applicable` items count as open for the filter (status ≠ present), matching core's item list.

`explainAttribute(id).explanation` is a `LangText` — confirm the field name against `packages/core/src/explain/index.ts` (`AttributeExplanation`) before using; if it is `explanation: LangText | undefined`, guard it.

- [ ] **Step 4: `ExportView.tsx`**

```tsx
import type { GapReport, ValidationReport } from '@passwerk/core';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { type Key, type LangText, type Language, pick, t, verdictKey } from '../i18n/index.ts';
import type { CarrierView } from '../workflow/derive/carrier.ts';
import type { ExportKind } from '../workflow/exports.ts';
import { QrPreview } from './parts/QrPreview.tsx';
import { HeroNumber } from './shell/HeroNumber.tsx';
import { InlineStatus } from './shell/InlineStatus.tsx';
import { Instrument } from './shell/Instrument.tsx';
import { Row } from './shell/Row.tsx';

export interface ExportViewProps {
  lang: Language;
  top: ReactNode;
  report: ValidationReport;
  gap: GapReport;
  carrier: CarrierView;
  exportError?: LangText;
  onExport(kind: ExportKind): void;
  children?: ReactNode;
}

const FILES: { kind: Exclude<ExportKind, 'qr'>; note: Key; primary: boolean }[] = [
  { kind: 'aasJson', note: 'export.aasJson.note', primary: true },
  { kind: 'aasx', note: 'export.aasx', primary: true },
  { kind: 'html', note: 'export.html.note', primary: false },
  { kind: 'gaps', note: 'export.gaps.note', primary: false },
  { kind: 'draft', note: 'export.draft.note', primary: false },
];

export function ExportView(props: ExportViewProps) {
  const { lang, report, gap } = props;
  return (
    <Instrument
      top={props.top}
      hero={
        <>
          <HeroNumber label={t(lang, 'hero.verdictCarried')} value={t(lang, verdictKey(report.verdict))} tone={report.verdict === 'invalid' ? 'accent' : 'display'} data-testid="verdict" data-verdict={report.verdict} />
          <span className="label pb-1.5">{t(lang, 'hero.findings', { count: report.findings.length })} · {t(lang, 'hero.mandatoryShort', { present: gap.completeness.mandatory.present, total: gap.completeness.mandatory.total })}</span>
        </>
      }
      footer={<span className="label" data-testid="not-legal-advice">{t(lang, 'app.notLegalAdvice')}</span>}
    >
      <div className="grid gap-6 py-2 md:grid-cols-[1fr_200px]">
        <div>
          {FILES.map((f) => (
            <Row key={f.kind} name={<>{t(lang, `export.${f.kind}` as Key)} <span className="text-disabled">· {t(lang, f.note)}</span></>}
              action={<Button variant={f.primary ? 'primary' : 'secondary'} size="sm" data-testid={`export-${f.kind}`} onClick={() => props.onExport(f.kind)}>{t(lang, 'export.download')}</Button>} />
          ))}
          {props.exportError && <div className="py-2"><InlineStatus kind="error" text={t(lang, 'export.failed', { reason: pick(lang, props.exportError) })} data-testid="export-error" /></div>}
        </div>
        <div className="grid content-start gap-2 md:border-l md:border-border md:pl-6">
          <span className="label">{t(lang, 'hero.carrier')}</span>
          <QrPreview lang={lang} carrier={props.carrier} onDownload={() => props.onExport('qr')} />
        </div>
      </div>
      {props.children}
    </Instrument>
  );
}
```

(`export.aasx` is reused as its own note since the key holds the file's name; add `'export.aasx.note': 'AASX package' / 'AASX-Paket'` to both dictionaries if the rendered row reads doubled — the implementer decides after seeing it.)

- [ ] **Step 5: Run** — `pnpm vitest run apps/web/test/views/GapsView.test.tsx apps/web/test/views/ExportView.test.tsx` → PASS. Delete `GapsExportView.tsx` and its test.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views apps/web/test/views
git commit -m "feat(web): gaps as grouped rows with a legal-basis sheet; export as its own screen"
```

---

### Task 11: The shell — `App.tsx`, platform, theme, error boundary, no toasts

**Files:**
- Modify: `apps/web/src/app/App.tsx`, `platform.ts`, `main.tsx`, `ErrorBoundary.tsx`
- Modify: `apps/mcp-app/src/main.tsx`, `bridge.ts`
- Delete: `apps/web/src/components/ui/sonner.tsx`, `card.tsx`, `progress.tsx`, `separator.tsx`
- Modify: `apps/web/package.json`, `apps/mcp-app/package.json` (remove `sonner`, `next-themes`), `apps/web/test/views/render.tsx` (drop the `matchMedia` shim comment about Sonner; keep the shim, the theme code reads `matchMedia`)
- Test: `apps/web/test/views/App.test.tsx`, `apps/mcp-app/test/bridge.test.ts`

**Interfaces:**

```ts
// platform.ts additions
export interface Platform {
  download(file: ExportFile): void;
  clearPersisted(): void;
  pdfWorkerSrc?: string;
  assist?: AssistPlatform;
  /** Web app only: the reviewer's theme choice. Absent in an MCP host, which owns the theme. */
  theme?: { current(): 'dark' | 'light'; set(theme: 'dark' | 'light'): void };
  /** MCP host only: fullscreen when the host offers it. Absent in the web app. */
  display?: { available(): ('inline' | 'fullscreen')[]; current(): 'inline' | 'fullscreen'; request(mode: 'inline' | 'fullscreen'): Promise<void> };
  /** Where a host-level message lands when no screen owns it (the MCP app's "ask Claude to run emit_passport"). */
}
// App.tsx: status is shell state
type ShellStatus = { kind: 'error' | 'info'; text: string } | null;
```

- [ ] **Step 1: Update `App.test.tsx`**

`platform` fixture stays `{ download, clearPersisted }`. Assertions: `'Batterietyp'` and `'Battery type'` are still labels (unchanged); `screen.getByText('Upload documents')` → `screen.getByTestId('file-input')` exists; `'Extracted facts'` → `screen.getByTestId('facts-count')` exists; `'Fortsetzen'` (resume) → `screen.getByText('Fortsetzen')` still a button label (unchanged). Add:

```tsx
it('shows six steps and reaches export exactly when gaps is reachable', () => {
  const store = createStore(initialState);
  mount(<App store={store} platform={platform} />);
  expect(screen.getAllByTestId(/^step-/)).toHaveLength(6);
  expect((screen.getByTestId('step-export') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTestId('step-gaps') as HTMLButtonElement).disabled).toBe(true);
});
it('shows the fullscreen control only when the platform offers it', () => {
  const request = vi.fn(async () => undefined);
  const { unmount } = mount(<App store={createStore(initialState)} platform={platform} />);
  expect(screen.queryByTestId('display-toggle')).toBeNull();
  unmount();
  mount(<App store={createStore(initialState)} platform={{ ...platform, display: { available: () => ['inline', 'fullscreen'], current: () => 'inline', request } }} />);
  fireEvent.click(screen.getByTestId('display-toggle'));
  expect(request).toHaveBeenCalledWith('fullscreen');
});
it('reports an ingest failure inline, not as a toast', async () => {
  ingestFiles.mockRejectedValueOnce(new Error('body too large'));
  const store = createStore(initialState);
  mount(<App store={store} platform={platform} />);
  fireEvent.click(screen.getByTestId('project-continue'));
  await act(async () => {
    fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['a'], 'a.csv', { type: 'text/csv' })] } });
  });
  expect(screen.getByTestId('upload-error').textContent).toContain('body too large');
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run apps/web/test/views/App.test.tsx` → FAIL.

- [ ] **Step 3: `App.tsx`**

Keep `ProjectStep`, `randomId`, the assist wiring (`onAssistRun`, `persistKey`, `assistPanel`), `onFiles`, `onExport`, `reachable`, `accepted`/`groups`/`pending`. Changes:

1. Remove `sonner` imports and `Toaster`. Replace `fail` with:

```tsx
const [status, setStatus] = useState<ShellStatus>(null);
const fail = (e: unknown) => setStatus({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
```

and clear it at the start of `onFiles` and `onExport` (`setStatus(null)`).

2. Add `const [assistOpen, setAssistOpen] = useState(false);`.

3. Build `top` once:

```tsx
const display = platform.display;
const canFullscreen = display?.available().includes('fullscreen') ?? false;
const top = (
  <>
    <span className="font-mono text-[13px] tracking-[0.1em] text-display">PASSWERK</span>
    <Stepper lang={lang} steps={STEPS} current={state.step} reachable={reachable} onGo={(step) => dispatch({ type: 'goTo', step, at: nowIso() })} />
    <span className="ml-auto flex items-center gap-2">
      {platform.theme && (
        <Button variant="ghost" size="sm" data-testid="theme-toggle" aria-label={t(lang, platform.theme.current() === 'dark' ? 'shell.theme.light' : 'shell.theme.dark')}
          onClick={() => { platform.theme?.set(platform.theme.current() === 'dark' ? 'light' : 'dark'); setStatus((s) => s); }}>
          {platform.theme.current() === 'dark' ? '☼' : '☾'}
        </Button>
      )}
      {canFullscreen && display && (
        <Button variant="ghost" size="sm" data-testid="display-toggle" aria-label={t(lang, display.current() === 'fullscreen' ? 'shell.inline' : 'shell.fullscreen')}
          onClick={() => void display.request(display.current() === 'fullscreen' ? 'inline' : 'fullscreen')}>
          <Maximize2 />
        </Button>
      )}
      <Button variant="ghost" size="sm" data-testid="lang-toggle" onClick={() => dispatch({ type: 'setLanguage', language: lang === 'de' ? 'en' : 'de', at: nowIso() })}>
        {lang === 'de' ? 'EN' : 'DE'}
      </Button>
      {state.project && (<AlertDialog>…unchanged, buttons `variant="ghost"` / `AlertDialogAction` primary…</AlertDialog>)}
    </span>
  </>
);
```

(`setStatus((s) => s)` after a theme change forces a render so the icon flips; the theme itself lives on `<html>`. `Maximize2` from `lucide-react`.)

4. The `view` switch: every screen gets `top={top}`; `UploadView` gets `{...(status?.kind === 'error' ? { error: status.text } : {})}`; the facts-step `AddValueDialog` becomes the `children` of `FactsView`; `ReviewView` gets `assistOpen={assistOpen}` and `onAssistToggle={() => setAssistOpen((o) => !o)}`; the assist-prefill `AddValueDialog` becomes `children` of `ReviewView`; new cases:

```tsx
case 'gaps':
  if (!derived) return null;
  return <GapsView lang={lang} top={top} report={derived.report} gap={derived.gap}
    onFixInReview={() => dispatch({ type: 'goTo', step: 'review', at: nowIso() })}
    onContinue={() => dispatch({ type: 'goTo', step: 'export', at: nowIso() })} />;
case 'export':
  if (!derived) return null;
  return <ExportView lang={lang} top={top} report={derived.report} gap={derived.gap} carrier={derived.carrier} {...(exportError ? { exportError } : {})} onExport={onExport} />;
```

5. The outer `return` becomes:

```tsx
return (
  <>
    {storageNotice && <div className="mx-auto max-w-[1024px] px-4 py-1"><InlineStatus kind="info" text={t(lang, storageNotice === 'version' ? 'app.storage.version' : 'app.storage.unavailable')} data-testid="storage-notice" /></div>}
    <ErrorBoundary lang={lang} onReset={reset}>{view}</ErrorBoundary>
  </>
);
```

6. `reachable`: unchanged logic; `'export'` falls into the last `return derived !== null`.

- [ ] **Step 4: `platform.ts` and `main.tsx` (web)**

`browserPlatform.theme`:

```ts
const THEME_KEY = 'passwerk.theme';
const readTheme = (): 'dark' | 'light' => {
  try { const v = localStorage.getItem(THEME_KEY); if (v === 'dark' || v === 'light') return v; } catch { /* storage blocked: follow the system */ }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};
export const applyTheme = (theme: 'dark' | 'light') => document.documentElement.classList.toggle('dark', theme === 'dark');
export const browserPlatform: Platform = {
  …existing…,
  theme: {
    current: readTheme,
    set(theme) { try { localStorage.setItem(THEME_KEY, theme); } catch { /* keep in DOM only */ } applyTheme(theme); },
  },
};
```

In `main.tsx` `boot()`, before `createRoot`: `applyTheme(browserPlatform.theme?.current() ?? 'light');`.

- [ ] **Step 5: `ErrorBoundary.tsx`**

Replace the fallback JSX with a Nothing empty state:

```tsx
<div className="grid min-h-[60vh] place-content-center gap-3 px-4 text-center" role="alert">
  <p className="label text-destructive">[ERROR]</p>
  <p className="text-muted-foreground">{t(lang, 'app.error.title')}</p>
  <pre className="max-w-[560px] overflow-auto text-left font-mono text-[12px] text-disabled">{this.state.error.message}</pre>
  <div className="flex justify-center gap-2">
    <Button variant="primary" size="sm" onClick={() => window.location.reload()}>{t(lang, 'app.error.reload')}</Button>
    <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard?.writeText(details).catch(() => undefined)}>{t(lang, 'app.error.copy')}</Button>
    <Button variant="destructive" size="sm" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>{t(lang, 'app.startOver')}</Button>
  </div>
</div>
```

- [ ] **Step 6: MCP app**

`bridge.ts`: remove the `sonner` import; `hostDownload`'s `notify` parameter loses its default (callers must pass one). `main.tsx`:

```tsx
// The host's "cannot download" message is not workflow state: it lives beside the store and
// re-renders the tree through `render()`.
let notice: string | undefined;
const platform: Platform = {
  download: (file) => void hostDownload(host, file, store.getState().language, sync.draftId, (text) => { notice = text; render(); }),
  clearPersisted: () => {},
  pdfWorkerSrc: workerUrlOf(pdfWorkerUrl),
  display: {
    available: () => host.getHostContext()?.availableDisplayModes ?? [],
    current: () => host.getHostContext()?.displayMode ?? 'inline',
    request: async (mode) => { await host.requestDisplayMode({ mode }); applyHeight(host.getHostContext()?.displayMode); render(); },
  },
};
const applyHeight = (mode: string | undefined) =>
  document.documentElement.style.setProperty('--instrument-height', mode === 'fullscreen' ? '100vh' : '640px');
applyHeight('inline');
const reactRoot = createRoot(root);
const render = () =>
  reactRoot.render(
    <ErrorBoundary lang={store.getState().language} onReset={() => store.dispatch({ type: 'reset', at: nowIso() })}>
      <App store={store} platform={platform} {...(notice ? { hostNotice: notice } : {})} />
    </ErrorBoundary>,
  );
render();
```

`App` gains an optional `hostNotice?: string` prop rendered as an `InlineStatus kind="info" data-testid="host-notice"` beside the storage notice. In `host.onhostcontextchanged`, add `applyHeight(ctx.displayMode)` and call `render()` after `applyTheme`. Remove the `--instrument-height` fallback issue: the web app never sets the property, so `100vh` from `:root` applies.

- [ ] **Step 7: Delete the four primitives and the two packages**

`git rm apps/web/src/components/ui/sonner.tsx card.tsx progress.tsx separator.tsx`; remove `sonner` and `next-themes` from both `package.json` files; `pnpm install`. Grep `Card\b|Progress\b|Separator\b|sonner|next-themes` under `apps/` — must return nothing but this plan's text.

- [ ] **Step 8: Run everything**

Run: `pnpm check` (lint, typecheck, all unit tests) → PASS, including `apps/mcp-app/test/bridge.test.ts` (update its `hostDownload` calls to pass a `notify` spy and assert the message when `downloadFile` is absent) and `boundary.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add -A apps/web apps/mcp-app pnpm-lock.yaml
git commit -m "feat(web,mcp-app): the shell on the instrument; inline status replaces toasts; fullscreen and theme controls"
```

---

### Task 12: Playwright, web

**Files:**
- Modify: `apps/web/e2e/helpers.ts`, `musterwerk.spec.ts`, `golden.spec.ts`, `facts.spec.ts`, `rows.spec.ts`, `sovereignty.spec.ts`, `project.spec.ts`, `persistence.spec.ts`, `assist.spec.ts`
- Create: `apps/web/e2e/instrument.spec.ts`

**Interfaces (helpers):**

```ts
export async function openSection(page: Page, id: 'identifier' | 'import'): Promise<void>; // clicks section-<id> if the section content is not visible
export async function openRow(scope: Page | FrameLocator, selector: string): Promise<void>; // clicks the row and waits for [data-testid$="-sheet"] to be visible
export async function toExport(scope: Page | FrameLocator): Promise<void>; // to-gaps → verdict visible → to-export
```

- [ ] **Step 1: Helpers**

```ts
export async function openSection(page: Page, id: 'identifier' | 'import'): Promise<void> {
  const probe = id === 'identifier' ? page.getByTestId('identifier-mode-https') : page.getByTestId('import-draft');
  if (!(await probe.isVisible())) await page.getByTestId(`section-${id}`).click();
  await expect(probe).toBeVisible();
}
export async function openRow(scope: Page | FrameLocator, selector: string): Promise<void> {
  await scope.locator(selector).click();
  await expect(scope.locator('[data-testid$="-sheet"]')).toBeVisible();
}
export async function toExport(scope: Page | FrameLocator): Promise<void> {
  await scope.getByTestId('to-gaps').click();
  await expect(scope.getByTestId('verdict')).toBeVisible();
  await scope.getByTestId('to-export').click();
  await expect(scope.getByTestId('export-aasx')).toBeVisible();
}
```

`startProject`: call `openSection(page, 'identifier')` before clicking `identifier-mode-*`.

- [ ] **Step 2: Spec edits**

- `musterwerk.spec.ts`: the accept loop becomes `await openRow(page, `[data-testid="group"][data-key="${key}"]`); await page.locator(`[data-testid="proposal"][data-fact="${p.factId}"]`).getByTestId('accept').click();`. After `to-gaps`: click `gaps-view-findings` before counting `finding`; then `gaps-view-owner` and `gaps-filter-all` before counting `gap-item`.
- `golden.spec.ts`: `openSection(page, 'import')` before `import-draft`; after `to-gaps`, click `gaps-view-findings` before counting; replace the `export-html` click with `await toExport(page)` first (`to-gaps` already clicked, so: `await page.getByTestId('to-export').click()` then export).
- `facts.spec.ts`, `rows.spec.ts`: before `fact-edit`/`fact-map`: `openRow(page, '[data-testid="fact-row"]…')`; before `accept`: `openRow` on the group; `to-gaps` → `toExport(page)` before `export-draft`. `rows.spec.ts` `array-edit`: `openRow(page, '[data-testid="array-entry"][data-attribute="criticalRawMaterials"]')` first; the `toHaveText(/\b2 Zeilen/)` assertion targets the row, unchanged.
- `sovereignty.spec.ts`: the same three changes; the `step-project` → `identifier-mode-gs1` part calls `openSection(page, 'identifier')`; `step-gaps` → `to-export` before `export-aasJson`.
- `project.spec.ts`: `openSection(page, 'identifier')` before every `identifier-mode-*`; `timeline-entry` ids are read from hidden elements — `evaluateAll` works on hidden nodes, unchanged; `getByRole('option', …)` unchanged.
- `persistence.spec.ts`, `assist.spec.ts`: apply `openSection`/`openRow` where they touch identifier fields or `accept`; `assist-toggle` is now in the review toolbar and opens `assist-sheet` — replace any `assist` visibility wait with `await expect(page.getByTestId('assist-sheet')).toBeVisible()` after the toggle.

Where a spec matched a button by visible text (`getByRole('button', { name: 'AASX' })` etc.), switch to the test id: Chromium's accessible name applies `text-transform: uppercase`.

- [ ] **Step 3: `instrument.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { fixturePaths, PASSPORT_ID, pinClock, startProject } from './helpers.ts';

for (const viewport of [{ width: 735, height: 800 }, { width: 1280, height: 900 }]) {
  for (const theme of ['dark', 'light'] as const) {
    test(`instrument at ${viewport.width}px, ${theme}: fixed height, bundled fonts, keyboard sheet`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await pinClock(page);
      await startProject(page, { identifier: { mode: 'https', uri: PASSPORT_ID } });
      expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(theme === 'dark');
      await page.getByTestId('file-input').setInputFiles(fixturePaths());
      await expect(page.getByTestId('upload-busy')).toHaveCount(0, { timeout: 60_000 });
      const noScroll = async () =>
        page.evaluate(() => ({
          h: document.documentElement.scrollHeight === document.documentElement.clientHeight,
          w: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        }));
      for (const step of ['upload', 'facts', 'review', 'gaps', 'export'] as const) {
        await page.getByTestId(`step-${step}`).click();
        expect(await noScroll(), step).toEqual({ h: true, w: true });
      }
      await page.getByTestId('step-review').click();
      await page.getByTestId('filter-all').click();
      await page.getByTestId('group').first().click();
      await expect(page.getByTestId('review-sheet')).toContainText('1 of');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('review-sheet')).toContainText('2 of');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('review-sheet')).toHaveCount(0);
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready;
        return { mono: document.fonts.check('11px "Space Mono"'), sans: document.fonts.check('14px "Space Grotesk"'), doto: document.fonts.check('40px "Doto"') };
      });
      expect(fonts).toEqual({ mono: true, sans: true, doto: true });
      const foreignFonts = await page.evaluate(() =>
        performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(woff2?|ttf|otf)(\?|$)/.test(n) && !n.startsWith(location.origin)),
      );
      expect(foreignFonts).toEqual([]);
    });
  }
}
```

- [ ] **Step 4: Run** — `pnpm build && pnpm build:web && pnpm e2e` → all specs PASS. Fix what fails in the views (not by loosening assertions on verdicts, findings or counts).

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e
git commit -m "test(web): Playwright on the instrument: sheet, sections, export step, height and fonts"
```

---

### Task 13: Playwright, MCP app

**Files:**
- Modify: `apps/mcp-app/e2e/host/host.ts`, `index.html`, `apps/mcp-app/playwright.config.ts`, `apps/mcp-app/e2e/helpers.ts`, `musterwerk.spec.ts`, `golden.spec.ts`, `sovereignty.spec.ts`, `context.spec.ts`

- [ ] **Step 1: Host page records sizes and offers fullscreen**

`host.ts`: `window.__sizes = [] as { width?: number; height?: number }[]`; `bridge.onsizechange = (p) => { window.__sizes.push(p); byTestId('host-sizes').textContent = JSON.stringify(window.__sizes); }`; host context gains `availableDisplayModes: ['inline', 'fullscreen']`; `bridge.onrequestdisplaymode = async (p) => { bridge.sendHostContextChanged?.({ displayMode: p.mode }); return { mode: p.mode }; }` (check the exact `AppBridge` handler and notification names in `@modelcontextprotocol/ext-apps/app-bridge` 1.7.5 with `grep -n "displayMode\|onrequestdisplaymode\|HostContextChanged" node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.d.ts`; use what exists). `index.html`: iframe height `640px`; add `<pre data-testid="host-sizes"></pre>`. `playwright.config.ts`: viewport `{ width: 1280, height: 900 }` and drop the comment about the 1800 px iframe. `containerDimensions.height` in the host context: `640`.

- [ ] **Step 2: Spec edits**

`helpers.ts`: `startProject(frame, …)` opens the identifier section first (same probe logic as the web helper, on the `FrameLocator`); export `openRow` and `toExport` for frames (import them from `../../web/e2e/helpers.ts` — they accept `Page | FrameLocator`). `musterwerk.spec.ts`, `golden.spec.ts`, `sovereignty.spec.ts`: the same edits as Task 12 (open the group before `accept`, findings tab before counting, `toExport(frame)` before any `export-*`). `context.spec.ts`: `add-value` is in the review toolbar (unchanged id); add at the end of the Musterwerk spec:

```ts
const sizes = await page.evaluate(() => (window as unknown as { __sizes: { height?: number }[] }).__sizes);
expect(sizes.length).toBeGreaterThan(0);
expect(new Set(sizes.map((s) => s.height))).toEqual(new Set([640]));
```

and a new test in `context.spec.ts`:

```ts
test('fullscreen is offered by the host and requested by the workbench', async ({ page }) => {
  const frame = await openWorkbench(page, 'ev-valid');
  await frame.getByTestId('display-toggle').click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __sizes: { height?: number }[] }).__sizes.at(-1)?.height)).not.toBe(640);
});
```

(If the bridge cannot deliver a host-context change back to the app in 1.7.5, keep the first assertion — the request reaches the host — and drop the height poll; say so in the commit.)

- [ ] **Step 3: Run** — `pnpm build && pnpm build:mcp-app && pnpm --filter @passwerk/mcp-app build:host && pnpm e2e:mcp-app` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-app
git commit -m "test(mcp-app): host page proves a constant 640 px frame and offers fullscreen"
```

---

### Task 14: Visual review with Claude in Chrome, screenshots

**Files:**
- Replace: `docs/screenshots/mcp-app-01-project.png` … `05-gaps-by-owner.png` with `workbench-01-project.png`, `02-documents.png`, `03-facts.png`, `04-review.png`, `05-gaps.png`, `06-export.png` (dark, 735 px) and `workbench-light-04-review.png` (light, 1280 px)
- Modify: whatever the review finds in `views/`, `index.css`

- [ ] **Step 1: Serve the built web app** — `pnpm build:web && pnpm --filter @passwerk/web preview` (port 4173).

- [ ] **Step 2: Walk it in Chrome** — with the `claude-in-chrome` skill: open `http://localhost:4173/`, resize the window to 735 × 800, dark. Walk project → documents (upload `packages/core/test/fixtures/musterwerk/*`) → facts → review (open a row, accept, `→`, Esc) → gaps (open an item, Fix in review) → export. Screenshot each step. Repeat at 1280 × 900 in light for the review step. Judge against the spec §2 principles and §4 tokens: three text sizes per screen, mono caps only on labels, one hero, no competing badges, nothing truncated that matters, nothing overflowing the frame, contrast of readable text ≥ 4.5:1.

- [ ] **Step 3: Fix findings** — each fix is a normal commit (`fix(web): …`) with `pnpm check` and the affected Playwright spec re-run.

- [ ] **Step 4: Commit screenshots**

```bash
git rm docs/screenshots/mcp-app-0*.png
git add docs/screenshots
git commit -m "docs: workbench screenshots after the redesign"
```

---

### Task 15: Records

**Files:**
- Modify: `docs/DECISIONS.md` (append D-040), `docs/BUILD_PLAN.md` §7 (Phase 7a and 7b paragraphs), `AGENTS.md` (status), `README.md` (web app paragraph)

- [ ] **Step 1: ADR D-040** — append:

```markdown
## D-040: The workbench is a fixed-height instrument (2026-09-10)

**Context.** Inside Claude Desktop the workbench rendered as a wall of cards the whole chat scrolled through. The cause was structural: the MCP Apps SDK's `autoResize` reports the document's height to the host, the host grows the iframe to match (up to 5000 px), and the app was laid out as a document — `max-w-6xl`, stacked cards, every list expanded, one text size for everything.

**Decision.**
1. **The app owns its height.** `--instrument-height` is 640 px inline in a host, `100vh` in the host's fullscreen mode and in the web app; only the list region scrolls; dialogs and the sheet portal into the instrument. The host page in `apps/mcp-app/e2e` records every `size-changed` notification and asserts each is 640.
2. **Six steps.** Export leaves the gaps screen: the verdict is stated once, on the export screen. `Step` gains `'export'`; `STATE_VERSION` stays 3 because a saved `step: 'gaps'` is still valid.
3. **The Nothing idiom is the design system**, with two adaptations recorded here: mono caps are only for labels of one to four words (prose stays sentence case), and `--text-disabled` (below WCAG AA by design) is never used for text a person must read. Colour appears only on values; red is the one interrupt.
4. **Fonts are bundled.** Space Grotesk, Space Mono and Doto (OFL) from a pinned commit of `google/fonts`, subsetted to WOFF2 by `apps/web/scripts/fonts.mjs`, committed with `apps/web/src/fonts/PROVENANCE.md`, verified offline by `apps/web/test/fonts.test.ts`. No font host is contacted; the sovereignty specs are unchanged.
5. **ReUI was evaluated and not adopted.** Its icons are a paid tier and animated; its registry answers 401 for the base primitives without a licence key. The four primitives the design needs (`toggle-group`, `scroll-area`, `kbd`, `spinner`) come from the official shadcn registry, MIT, and `lucide-react` stays the only icon set.
6. **No toasts.** `sonner` is removed; every failure is an `InlineStatus` next to its trigger.

**Consequences.** `views/shell` is the component library Phase 7b reuses unchanged; the `data-testid` contract survived name-for-name, and the Musterwerk, golden and sovereignty assertions are the proof that the redesign moved pixels and not results. `docs/screenshots/workbench-*.png` replace the Phase 7b screenshots.
```

- [ ] **Step 2: Status lines** — `BUILD_PLAN.md` §7 Phase 7a: append "**Redesign done (2026-09-10, ADR D-040):** the app is a fixed-height instrument in the Nothing idiom, six steps, bundled fonts, no toasts; `views/shell` is the design system in code." Phase 7b: "The workbench inherits the redesign unchanged; the host page asserts a constant 640 px frame and fullscreen." `AGENTS.md` status: one bullet "**Workbench redesign: done (2026-09-10).**" with the same sentence; `README.md` "Web app" paragraph: six steps, "runs as a fixed-height instrument inside Claude Desktop".

- [ ] **Step 3: Final verification and commit**

Run: `pnpm check && pnpm build:web && pnpm e2e && pnpm build:mcp-app && pnpm --filter @passwerk/mcp-app build:host && pnpm e2e:mcp-app` — report the real output.

```bash
git add docs AGENTS.md README.md
git commit -m "docs: ADR D-040, the workbench as a fixed-height instrument"
```

Then open the PR (`feat/workbench-redesign` → `main`) with the spec, the ADR and the six screenshots in the description, ending with `https://claude.ai/code/session_01DQ5RW9Q3C7EyWcRo6g7tb1`.

---

## Self-review (done while writing)

- **Spec coverage.** §3 sizing → Tasks 5, 11, 13; §4.1–4.3 tokens → Task 2; §4.4 fonts → Task 1; §5.1 shell → Task 5; §5.2 primitives, deletions, ReUI → Tasks 2, 11 (amendment in Task 1); §5.3 dialogs → Task 9; §6.1–6.6 screens → Tasks 6–10; §7 workflow → Task 3; §8 language → Task 4; §9 status → Tasks 5, 11; §10 tests → every task plus 12, 13; §10 visual review → Task 14; §11 records → Task 15; §12 out of scope → nothing planned.
- **Type consistency.** `Row` tags use `RowTag` everywhere; `Sheet` props `position/onPrev/onNext/onClose` are the same in Facts, Review and Gaps; screens all take `top: ReactNode; children?: ReactNode`; `Platform.display.available/current/request` match between `App.tsx` and `apps/mcp-app/src/main.tsx`; test ids in the plan match the spec §6 list.
- **Known judgement calls left to the implementer, named in place:** `explainAttribute`'s field shape (Task 10), the `export.aasx` note doubling (Task 10), the bridge's display-mode handler names in ext-apps 1.7.5 (Task 13).
