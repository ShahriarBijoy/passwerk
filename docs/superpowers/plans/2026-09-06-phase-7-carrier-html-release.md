# Phase 7: carrier, HTML sheet, Docker, release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the pipeline (UID, GS1 Digital Link, QR, HTML passport sheet), expose it through the server, the CLI and the web export, and make passwerk installable from a clean machine (`npx -y @passwerk/server`, `ghcr.io/shahriarbijoy/passwerk`, Official MCP Registry entry).

**Architecture:** `packages/core/src/carrier/` is a pure, browser-safe module (GS1 builder, QR matrix from `qrcode-generator`, in-house SVG and PNG renderers). `emit/htmlSheet.ts` is one more fail-honest emitter that reuses `assembleReport` and `gapReport`. The server registers `generate_carrier` and the `html` target; the CLI and the web app are adapters over those. Publication is unblocked by routing every AAS SDK import through one vendor module that `esbuild` inlines after `tsc`. Docker, the release workflow and the registry manifest are configuration plus two smoke scripts that CI runs.

**Tech Stack:** TypeScript strict / ESM / NodeNext, `qrcode-generator` 2.0.4, `fflate` (already in core), `esbuild` 0.28.2, dev-only `jsqr` 1.4.0 + `pngjs` 7.0.0 + `@types/pngjs` 6.0.5, vitest 4, biome 2, Docker (distroless Node 22), GitHub Actions, `mcp-publisher`.

**Spec:** `docs/superpowers/specs/2026-09-06-phase-7-carrier-html-release-design.md`. ADRs D-033 and D-034 are written in Task 16.

## Global Constraints

- Dependency direction `rules`, `core`, `server`, `cli`; `web` depends on `core` only. Never import upward.
- `core` and `rules` stay browser-safe: no `node:*` import at module level (a test walks `src`). No wall clock in core: the sheet prints a time only when `asOf` is given.
- No network and no model call at runtime in `core` or `server`. The sovereignty tests iterate the registry; a new tool needs an argument set there.
- A verdict comes only from the validators. `emitHtml` returns `assembleReport`'s verdict; `generate_carrier` never says "valid".
- Every user-facing string in the knowledge base and every tool text summary exists in DE and EN. Every legal claim carries `sources[]` and `isNotLegalAdvice: true`.
- Never invent a URL, standard version or legal reference. The GS1 syntax is transcribed from the build plan and marked `verify: true`.
- Deterministic output: sorted keys, byte-identical re-runs, injected clock in tests.
- Dependency versions at least 3 days old (pnpm `minimumReleaseAge`): `qrcode-generator` 2.0.4 (2025-08-07), `esbuild` 0.28.2 (2026-08-08), `jsqr` 1.4.0 (2021), `pngjs` 7.0.0 (2023), `@types/pngjs` 6.0.5 (2025-08-03).
- Conventional Commits with the session trailer, one PR on `feat/phase-7-release`. Run `pnpm check` before every commit that touches code. On Windows, write multi-line files with the Write tool, not heredocs.
- The server wrapper reserves the input key `lang` and strips it before the handler runs; a tool that needs a language for its output uses another key (`htmlLang`).
- Versions: the four published packages move to `0.1.0` in Task 11; `SERVER_VERSION` and `CLI_VERSION` follow (tests assert equality).

---

## File structure

```
packages/core/src/vendor/aasCore.ts                 the only module naming the AAS SDK (export *)
packages/core/scripts/bundle-vendor.mjs             esbuild: inline the SDK into dist/vendor/aasCore.js
packages/core/src/carrier/error.ts                  CarrierInputError (DE/EN)
packages/core/src/carrier/gs1DigitalLink.ts         gtinCheckDigit, normaliseGtin, buildGs1DigitalLink
packages/core/src/carrier/qr.ts                     qrMatrix, renderQrSvg, renderQrPng (in-house PNG encoder)
packages/core/src/carrier/index.ts                  generateCarrier(input): CarrierResult
packages/core/src/emit/htmlSheet.ts                 emitHtml(draft, options): EmitResult<string>
packages/core/src/emit/htmlSheet.css.ts             the inline stylesheet as a string constant
packages/core/test/vendor.test.ts                   no other src file names the SDK
packages/core/test/carrier.gs1.test.ts              check digit, builder, errors
packages/core/test/carrier.qr.test.ts               SVG snapshot, PNG round trip through pngjs + jsqr
packages/core/test/carrier.test.ts                  generateCarrier on the golden samples
packages/core/test/emit.htmlSheet.test.ts           snapshots, verdict parity, escaping, self-containment
packages/rules/kb/carrier.json                      the two GS1 Digital Link schemes, verify: true
packages/rules/src/types.ts                         CarrierScheme, CarrierFile
packages/rules/src/index.ts                         carrierSchemes, getCarrierScheme
packages/rules/scripts/review-sheet.ts              "Carrier schemes" section
packages/server/src/tools/generateCarrier.ts        the generate_carrier tool
packages/server/src/tools/emitPassport.ts           html target, htmlLang input
packages/server/server.json                         MCP registry manifest
packages/server/test/tools.carrier.test.ts          tool tests
packages/server/test/manifest.test.ts               server.json <-> package.json agreement
packages/cli/src/commands/carrier.ts                passwerk carrier
packages/cli/test/carrier.test.ts
apps/web/src/workflow/exports.ts                    + html sheet + QR SVG
apps/web/src/views/GapsExportView.tsx               + two buttons
tools/release/pack-smoke.mjs                        pack, install into a temp project, prove npx works
tools/release/docker-smoke.sh                       healthz + authenticated tools/list against the image
Dockerfile, .dockerignore, docker-compose.yml, .env.example
.github/workflows/ci.yml                            + pack and docker jobs
.github/workflows/release.yml                       tag -> npm, GHCR, registry, GitHub release
docs/RELEASE.md                                     owner checklist
docs/media/passwerk-web.gif                         demo
```

---

### Task 1: Route every AAS SDK import through one vendor module and bundle it for publication

**Files:**
- Create: `packages/core/src/vendor/aasCore.ts`, `packages/core/scripts/bundle-vendor.mjs`, `packages/core/test/vendor.test.ts`
- Modify: the 12 core files that import `@aas-core-works/aas-core3.0-typescript` (`emit/aasJson.ts`, `emit/elements.ts`, `emit/environment.ts`, `emit/submodels/{carbonFootprint,circularity,handoverDocumentation,materialComposition,nameplate,productCondition,shared,technicalData}.ts`, `validate/aas.ts`), `packages/core/package.json`, root `package.json`, `NOTICE`

**Interfaces:**
- Produces: `import * as aas from '../vendor/aasCore.js'` (or `../../vendor/aasCore.js` from `emit/submodels/`) exposes `aas.types`, `aas.jsonization`, `aas.verification`, `aas.stringification`, `aas.common`, `aas.constants` exactly as the SDK does.

- [ ] **Step 1: Write the failing test**

`packages/core/test/vendor.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const VENDOR = join('vendor', 'aasCore.ts');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('AAS SDK access (ADR D-034)', () => {
  it('only src/vendor/aasCore.ts names @aas-core-works/aas-core3.0-typescript', () => {
    const offenders = walk(SRC)
      .filter((f) => readFileSync(f, 'utf8').includes('aas-core3.0-typescript'))
      .map((f) => relative(SRC, f));
    expect(offenders).toEqual([VENDOR]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run packages/core/test/vendor.test.ts`
Expected: FAIL, the offenders list has 12 entries.

- [ ] **Step 3: Create the vendor module and rewrite the imports**

`packages/core/src/vendor/aasCore.ts`:

```ts
/**
 * The only module in core that names the AAS SDK. `scripts/bundle-vendor.mjs` replaces the
 * compiled `dist/vendor/aasCore.js` with an esbuild bundle that inlines the SDK, because the
 * SDK's ESM build has extensionless relative imports that Node cannot resolve outside this
 * repository's pnpm patch (ADR D-011, D-034). Every other module imports this file.
 */
export * from '@aas-core-works/aas-core3.0-typescript';
```

Rewrite the imports (Git Bash from the repository root):

```sh
for f in packages/core/src/emit/aasJson.ts packages/core/src/emit/elements.ts packages/core/src/emit/environment.ts packages/core/src/validate/aas.ts; do
  sed -i "s#from '@aas-core-works/aas-core3.0-typescript'#from '../vendor/aasCore.js'#" "$f"; done
for f in packages/core/src/emit/submodels/*.ts; do
  sed -i "s#from '@aas-core-works/aas-core3.0-typescript'#from '../../vendor/aasCore.js'#" "$f"; done
```

`import * as aas from …` and `import type * as aas from …` both keep working because `export *` re-exports the six namespaces.

- [ ] **Step 4: Run the test and the whole core suite**

Run: `pnpm vitest run packages/core`
Expected: PASS (the vendor test and every existing emitter and validator test).

- [ ] **Step 5: Add the bundle step**

Install: `pnpm add -Dw esbuild@0.28.2`

`packages/core/scripts/bundle-vendor.mjs`:

```js
#!/usr/bin/env node
/**
 * Replaces dist/vendor/aasCore.js (a one-line re-export emitted by tsc) with a bundle that
 * inlines @aas-core-works/aas-core3.0-typescript, so consumers installing @passwerk/core
 * from npm never load the SDK's unpatched ESM build (ADR D-034). Run after `tsc -b`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const entry = join(here, '..', 'src', 'vendor', 'aasCore.ts');
const outfile = join(here, '..', 'dist', 'vendor', 'aasCore.js');
const sdk = JSON.parse(
  readFileSync(
    join(here, '..', 'node_modules', '@aas-core-works', 'aas-core3.0-typescript', 'package.json'),
    'utf8',
  ),
);

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  legalComments: 'inline',
  banner: {
    js: `// Bundled from ${sdk.name} ${sdk.version} (${sdk.license}); see NOTICE. Generated by scripts/bundle-vendor.mjs.`,
  },
  logLevel: 'warning',
});
console.log(`bundled ${sdk.name} ${sdk.version} into ${outfile}`);
```

`packages/core/package.json` scripts: `"build": "tsc -b && node scripts/bundle-vendor.mjs"`.
Root `package.json` scripts: `"build": "tsc -b && node packages/core/scripts/bundle-vendor.mjs"`.

Append to `NOTICE`:

```
The published @passwerk/core bundles @aas-core-works/aas-core3.0-typescript
(MIT, Copyright Marko Ristin-Kaufmann and the aas-core-works contributors) inside
dist/vendor/aasCore.js; the licence text ships with the package in node_modules.
```

- [ ] **Step 6: Build and verify the bundle has no SDK import left**

Run: `pnpm build && grep -c "from \"@aas-core-works" packages/core/dist/vendor/aasCore.js; head -c 200 packages/core/dist/vendor/aasCore.js`
Expected: `0` and the banner line. Then `pnpm oracle` still reports 16/16 (the oracle runs against `dist`, so this is the first real consumer of the bundle).

- [ ] **Step 7: Lint, typecheck, commit**

Run: `pnpm check`
Expected: PASS.

```sh
git add -A packages/core NOTICE package.json pnpm-lock.yaml
git commit -m "build(core): route the AAS SDK through one vendor module and bundle it for publication"
```

---

### Task 2: Carrier schemes in the knowledge base and the review sheet

**Files:**
- Create: `packages/rules/kb/carrier.json`
- Modify: `packages/rules/src/types.ts`, `packages/rules/src/index.ts`, `packages/rules/scripts/review-sheet.ts`, `packages/rules/test/review-sheet.test.ts`, `packages/rules/test/index.test.ts`, `packages/rules/PROVENANCE.md`, `docs/KB_REVIEW.md` (regenerated)

**Interfaces:**
- Produces: `carrierSchemes: CarrierScheme[]`, `getCarrierScheme(id: string): CarrierScheme | undefined`, `CarrierSchemeId = 'gs1-digital-link-gtin-serial' | 'gs1-digital-link-giai'`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/rules/test/index.test.ts` inside the existing `describe`:

```ts
  it('bundles the two carrier schemes, both languages, marked verify', () => {
    expect(carrierSchemes.map((s) => s.id)).toEqual([
      'gs1-digital-link-gtin-serial',
      'gs1-digital-link-giai',
    ]);
    for (const s of carrierSchemes) {
      expect(s.verify).toBe(true);
      expect(s.pattern).toMatch(/^https:\/\/\{resolverBase\}\//);
      for (const text of [s.name, s.explanation, s.whoTypicallyHasIt]) {
        expect(text.de.length).toBeGreaterThan(0);
        expect(text.en.length).toBeGreaterThan(0);
      }
    }
    expect(getCarrierScheme('gs1-digital-link-giai')?.pattern).toBe(
      'https://{resolverBase}/8004/{giai}',
    );
    expect(getCarrierScheme('nope')).toBeUndefined();
  });
```

(add `carrierSchemes, getCarrierScheme` to the import from `@passwerk/rules`).

In `packages/rules/test/review-sheet.test.ts` add:

```ts
  it('lists every carrier scheme marked verify', () => {
    const sheet = renderReviewSheet();
    expect(sheet).toContain('## Carrier schemes');
    for (const s of carrierSchemes.filter((s) => s.verify)) {
      expect(sheet).toContain(`| \`${s.id}\` |`);
    }
  });
```

(import `carrierSchemes` from `@passwerk/rules`).

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run packages/rules`
Expected: FAIL, `carrierSchemes` is not exported.

- [ ] **Step 3: Write the data and the accessors**

`packages/rules/kb/carrier.json`:

```json
{
  "$comment": "Data carrier schemes for the battery passport identifier: the URI patterns and length limits were transcribed from docs/BUILD_PLAN.md (section 3, 'QR / GS1') and the author's recollection of the GS1 General Specifications, not from a bundled artefact. No GS1 or ISO/IEC 15459 document is bundled (PROVENANCE.md). Every entry stays verify: true until a domain expert confirms it against the GS1 Digital Link URI syntax standard.",
  "lastVerified": "2026-09-06",
  "schemes": [
    {
      "id": "gs1-digital-link-gtin-serial",
      "name": {
        "en": "GS1 Digital Link (GTIN + serial number)",
        "de": "GS1 Digital Link (GTIN + Seriennummer)"
      },
      "standard": "GS1 Digital Link URI syntax; GS1 General Specifications, application identifiers 01 and 21",
      "pattern": "https://{resolverBase}/01/{gtin14}/21/{serial}",
      "limits": { "gtinDigits": [8, 12, 13, 14], "serialMaxLength": 20 },
      "explanation": {
        "en": "The battery model's GTIN (padded to 14 digits, mod-10 check digit verified) and the unit's serial number form the path of a resolver URL. Scanning the QR code opens that URL, which the operator's resolver redirects to the passport.",
        "de": "Die GTIN des Batteriemodells (auf 14 Stellen aufgefüllt, Mod-10-Prüfziffer geprüft) und die Seriennummer der Einheit bilden den Pfad einer Resolver-URL. Das Scannen des QR-Codes öffnet diese URL, die der Resolver des Betreibers zum Pass weiterleitet."
      },
      "whoTypicallyHasIt": {
        "en": "The pack manufacturer or importer holds the GTIN (assigned through a GS1 member organisation) and the serial number; the resolver domain belongs to the economic operator placing the battery on the market.",
        "de": "Pack-Hersteller oder Importeur halten die GTIN (über eine GS1-Mitgliedsorganisation vergeben) und die Seriennummer; die Resolver-Domain gehört dem Wirtschaftsakteur, der die Batterie in Verkehr bringt."
      },
      "verify": true
    },
    {
      "id": "gs1-digital-link-giai",
      "name": {
        "en": "GS1 Digital Link (GIAI, individual asset)",
        "de": "GS1 Digital Link (GIAI, einzelnes Anlagegut)"
      },
      "standard": "GS1 Digital Link URI syntax; GS1 General Specifications, application identifier 8004",
      "pattern": "https://{resolverBase}/8004/{giai}",
      "limits": { "giaiMaxLength": 30 },
      "explanation": {
        "en": "A Global Individual Asset Identifier names one physical battery without a product GTIN. It suits industrial batteries tracked as assets rather than as serialised products.",
        "de": "Ein Global Individual Asset Identifier benennt eine einzelne physische Batterie ohne Produkt-GTIN. Er passt zu Industriebatterien, die als Anlagegut statt als serialisiertes Produkt geführt werden."
      },
      "whoTypicallyHasIt": {
        "en": "The asset owner or operator that registered the GIAI with its GS1 company prefix.",
        "de": "Eigentümer oder Betreiber, der die GIAI unter seinem GS1-Basisnummernkreis vergeben hat."
      },
      "verify": true
    }
  ]
}
```

`packages/rules/src/types.ts`, after the `RulesFile` block:

```ts
// ---------------------------------------------------------------------------
// kb/carrier.json
// ---------------------------------------------------------------------------
export type CarrierSchemeId = 'gs1-digital-link-gtin-serial' | 'gs1-digital-link-giai';

export interface CarrierScheme {
  id: CarrierSchemeId;
  name: LangText;
  /** Name of the standard only; no artefact is bundled (PROVENANCE.md). */
  standard: string;
  pattern: string;
  limits: { gtinDigits?: number[]; serialMaxLength?: number; giaiMaxLength?: number };
  explanation: LangText;
  whoTypicallyHasIt: LangText;
  verify: boolean;
}

export interface CarrierFile {
  $comment: string;
  lastVerified: string;
  schemes: CarrierScheme[];
}
```

`packages/rules/src/index.ts`: import `carrierJson from '../kb/carrier.json' with { type: 'json' }` and the two types; next to `plausibilityRules` add

```ts
export const carrierSchemes: CarrierScheme[] = (carrierJson as unknown as CarrierFile).schemes;
```

and next to `getRule`:

```ts
export function getCarrierScheme(id: string): CarrierScheme | undefined {
  return carrierSchemes.find((s) => s.id === id);
}
```

`packages/rules/scripts/review-sheet.ts`: import `carrierSchemes`; in `renderReviewSheet` push `...carrierSection()` right after `...crossCheckSection(check)`; add

```ts
function carrierSection(): string[] {
  const L: string[] = [];
  const flagged = carrierSchemes.filter((s) => s.verify);
  L.push('## Carrier schemes (`packages/rules/kb/carrier.json`)');
  L.push('');
  L.push(
    'The data carrier (`generate_carrier`) builds GS1 Digital Link URIs from these patterns. They',
    'were transcribed from the build plan, not from a bundled GS1 artefact, so each stays',
    '`verify: true` until confirmed against the GS1 Digital Link URI syntax standard.',
  );
  L.push('');
  L.push('| Scheme | Name (en / de) | Standard | Pattern | Limits | Explanation (en) | Erklärung (de) | Decision |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const s of flagged) {
    L.push(
      `| \`${s.id}\` | ${cell(s.name.en)} / ${cell(s.name.de)} | ${cell(s.standard)} | \`${s.pattern}\` | ${cell(JSON.stringify(s.limits))} | ${cell(s.explanation.en)} | ${cell(s.explanation.de)} | [ ] confirm [ ] change [ ] remove |`,
    );
  }
  L.push('');
  return L;
}
```

Also update the sheet's first paragraph to say `kb/attributes/*.json and kb/carrier.json`.

`packages/rules/PROVENANCE.md`, under "Not bundled on purpose", add:

```
- **GS1 Digital Link URI syntax** and **ISO/IEC 15459** are not bundled. The carrier module builds `/01/{gtin14}/21/{serial}` and `/8004/{giai}` URIs from the patterns in `kb/carrier.json`, which were transcribed from the build plan and carry `verify: true` (see `docs/KB_REVIEW.md`).
```

- [ ] **Step 4: Regenerate the sheet and run the tests**

Run: `pnpm review-sheet && pnpm vitest run packages/rules`
Expected: PASS; `docs/KB_REVIEW.md` gains the "Carrier schemes" section.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/rules docs/KB_REVIEW.md
git commit -m "feat(rules): carrier schemes (GS1 Digital Link) in the knowledge base, marked verify"
```

---

### Task 3: GS1 Digital Link builder

**Files:**
- Create: `packages/core/src/carrier/error.ts`, `packages/core/src/carrier/gs1DigitalLink.ts`, `packages/core/test/carrier.gs1.test.ts`
- Modify: `packages/core/src/index.ts` (export both modules)

**Interfaces:**
- Produces:
  - `class CarrierInputError extends Error { readonly text: { de: string; en: string } }`
  - `gtinCheckDigit(digits: string): number` (digits without the check digit)
  - `normaliseGtin(gtin: string): string` (14 digits, throws `CarrierInputError`)
  - `type Gs1Key = { gtin: string; serial: string } | { giai: string }`
  - `buildGs1DigitalLink(resolverBase: string, key: Gs1Key): string`
  - `isHttpsUri(s: string): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/core/test/carrier.gs1.test.ts`:

```ts
import {
  buildGs1DigitalLink,
  CarrierInputError,
  gtinCheckDigit,
  isHttpsUri,
  normaliseGtin,
} from '@passwerk/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Hand-computed with the GS1 mod-10 algorithm (weights 3,1,3,1,... from the right):
// 400638133393 -> sum 89 -> check 1; 9638507 -> sum 86 -> check 4.
describe('gtinCheckDigit', () => {
  it('matches hand-computed vectors', () => {
    expect(gtinCheckDigit('400638133393')).toBe(1);
    expect(gtinCheckDigit('9638507')).toBe(4);
    expect(gtinCheckDigit('0400638133393')).toBe(1);
  });
  it('appending the digit always validates; changing any digit never does', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{13}$/), (body) => {
        const gtin = `${body}${gtinCheckDigit(body)}`;
        expect(normaliseGtin(gtin)).toBe(gtin);
        const i = 3;
        const flipped = `${gtin.slice(0, i)}${(Number(gtin[i]) + 1) % 10}${gtin.slice(i + 1)}`;
        expect(() => normaliseGtin(flipped)).toThrow(CarrierInputError);
      }),
    );
  });
});

describe('normaliseGtin', () => {
  it('pads 8, 12 and 13 digit GTINs to 14', () => {
    expect(normaliseGtin('4006381333931')).toBe('04006381333931');
    expect(normaliseGtin('96385074')).toBe('00000096385074');
    expect(normaliseGtin('04006381333931')).toBe('04006381333931');
  });
  it('rejects other lengths, non-digits and a wrong check digit with DE/EN text', () => {
    for (const bad of ['4006381333932', '12345', 'ABCD', '4006 381333931', '']) {
      try {
        normaliseGtin(bad);
        throw new Error(`accepted ${bad}`);
      } catch (e) {
        expect(e).toBeInstanceOf(CarrierInputError);
        const err = e as CarrierInputError;
        expect(err.text.de.length).toBeGreaterThan(0);
        expect(err.text.en.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('buildGs1DigitalLink', () => {
  it('builds the GTIN + serial form', () => {
    expect(
      buildGs1DigitalLink('https://id.musterwerk.example', {
        gtin: '4006381333931',
        serial: 'MW-EV-2026-000123',
      }),
    ).toBe('https://id.musterwerk.example/01/04006381333931/21/MW-EV-2026-000123');
  });
  it('builds the GIAI form, strips a trailing slash and keeps a base path', () => {
    expect(buildGs1DigitalLink('https://id.example.com/', { giai: 'MW-ASSET-7' })).toBe(
      'https://id.example.com/8004/MW-ASSET-7',
    );
    expect(buildGs1DigitalLink('https://example.com/resolver/', { giai: 'A1' })).toBe(
      'https://example.com/resolver/8004/A1',
    );
  });
  it('percent-encodes reserved characters in the serial', () => {
    expect(
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'A/B#1?x y' }),
    ).toBe('https://id.example.com/01/00000096385074/21/A%2FB%231%3Fx%20y');
  });
  it('rejects a non-https base, a base with query or fragment, and over-long keys', () => {
    expect(() => buildGs1DigitalLink('http://id.example.com', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('https://id.example.com?x=1', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('https://id.example.com#f', { giai: 'A' })).toThrow(
      CarrierInputError,
    );
    expect(() => buildGs1DigitalLink('id.example.com', { giai: 'A' })).toThrow(CarrierInputError);
    expect(() =>
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'x'.repeat(21) }),
    ).toThrow(/20/);
    expect(() =>
      buildGs1DigitalLink('https://id.example.com', { giai: 'x'.repeat(31) }),
    ).toThrow(/30/);
    expect(() => buildGs1DigitalLink('https://id.example.com', { giai: '' })).toThrow(
      CarrierInputError,
    );
    expect(() =>
      buildGs1DigitalLink('https://id.example.com', { gtin: '96385074', serial: 'a\tb' }),
    ).toThrow(CarrierInputError);
  });
});

describe('isHttpsUri', () => {
  it('accepts only absolute https URIs', () => {
    expect(isHttpsUri('https://passport.musterwerk.example/battery/MW-EV-2026-000123')).toBe(true);
    expect(isHttpsUri('http://passport.example')).toBe(false);
    expect(isHttpsUri('urn:passwerk:draft:1')).toBe(false);
    expect(isHttpsUri('MW-EV-2026-000123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/carrier.gs1.test.ts`
Expected: FAIL, exports missing.

- [ ] **Step 3: Implement**

`packages/core/src/carrier/error.ts`:

```ts
/** A carrier input the caller has to fix: bad GTIN, non-https base, over-long key. DE/EN. */
export class CarrierInputError extends Error {
  readonly text: { de: string; en: string };
  constructor(text: { de: string; en: string }) {
    super(text.en);
    this.name = 'CarrierInputError';
    this.text = text;
  }
}
```

`packages/core/src/carrier/gs1DigitalLink.ts`:

```ts
/**
 * GS1 Digital Link URIs for the data carrier (build plan section 3, kb/carrier.json).
 * Patterns: https://{resolverBase}/01/{gtin14}/21/{serial} and https://{resolverBase}/8004/{giai}.
 * The syntax and the limits are transcribed, not verified against the GS1 standard: the
 * knowledge-base entries carry verify: true. Pure, browser-safe.
 */
import { getCarrierScheme } from '@passwerk/rules';
import { CarrierInputError } from './error.js';

export type Gs1Key = { gtin: string; serial: string } | { giai: string };

const SERIAL_MAX = getCarrierScheme('gs1-digital-link-gtin-serial')?.limits.serialMaxLength ?? 20;
const GIAI_MAX = getCarrierScheme('gs1-digital-link-giai')?.limits.giaiMaxLength ?? 30;
/** Printable ASCII without space; the GS1 character set is a subset (verify). */
const KEY_CHARS = /^[\x21-\x7E ]+$/;

/** Mod-10 check digit for the digits before it: weights 3,1,3,1,... counted from the right. */
export function gtinCheckDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = digits.charCodeAt(digits.length - 1 - i) - 48;
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** GTIN-8, -12, -13 or -14 with a valid check digit, left-padded to 14 digits. */
export function normaliseGtin(gtin: string): string {
  if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) {
    throw new CarrierInputError({
      de: `GTIN "${gtin}" muss aus 8, 12, 13 oder 14 Ziffern bestehen.`,
      en: `GTIN "${gtin}" must be 8, 12, 13 or 14 digits.`,
    });
  }
  const body = gtin.slice(0, -1);
  const check = Number(gtin.at(-1));
  if (gtinCheckDigit(body) !== check) {
    throw new CarrierInputError({
      de: `GTIN "${gtin}" hat eine falsche Prüfziffer (erwartet ${gtinCheckDigit(body)}).`,
      en: `GTIN "${gtin}" has a wrong check digit (expected ${gtinCheckDigit(body)}).`,
    });
  }
  return gtin.padStart(14, '0');
}

export function isHttpsUri(s: string): boolean {
  try {
    return new URL(s).protocol === 'https:';
  } catch {
    return false;
  }
}

function resolverPrefix(resolverBase: string): string {
  let url: URL;
  try {
    url = new URL(resolverBase);
  } catch {
    throw new CarrierInputError({
      de: `Resolver-Basis "${resolverBase}" ist keine absolute URL.`,
      en: `Resolver base "${resolverBase}" is not an absolute URL.`,
    });
  }
  if (url.protocol !== 'https:' || url.search !== '' || url.hash !== '') {
    throw new CarrierInputError({
      de: `Resolver-Basis "${resolverBase}" muss eine https-URL ohne Query und Fragment sein.`,
      en: `Resolver base "${resolverBase}" must be an https URL without query or fragment.`,
    });
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function checkKey(value: string, label: { de: string; en: string }, max: number): string {
  if (value.length === 0 || value.length > max || !KEY_CHARS.test(value)) {
    throw new CarrierInputError({
      de: `${label.de} muss 1 bis ${max} druckbare ASCII-Zeichen haben.`,
      en: `${label.en} must be 1 to ${max} printable ASCII characters.`,
    });
  }
  return encodeURIComponent(value);
}

export function buildGs1DigitalLink(resolverBase: string, key: Gs1Key): string {
  const prefix = resolverPrefix(resolverBase);
  if ('giai' in key) {
    return `${prefix}/8004/${checkKey(key.giai, { de: 'GIAI', en: 'GIAI' }, GIAI_MAX)}`;
  }
  const gtin = normaliseGtin(key.gtin);
  const serial = checkKey(key.serial, { de: 'Seriennummer', en: 'Serial number' }, SERIAL_MAX);
  return `${prefix}/01/${gtin}/21/${serial}`;
}
```

Add to `packages/core/src/index.ts` (alphabetical block before `./emit/`):

```ts
export * from './carrier/error.js';
export * from './carrier/gs1DigitalLink.js';
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/core/test/carrier.gs1.test.ts packages/core/test/browser-safety.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/core
git commit -m "feat(core): GS1 Digital Link builder with GTIN check digit"
```

---

### Task 4: QR matrix, SVG and PNG renderers with an independent decode

**Files:**
- Create: `packages/core/src/carrier/qr.ts`, `packages/core/test/carrier.qr.test.ts`
- Modify: `packages/core/package.json` (dependency `qrcode-generator`), root `package.json` (dev deps `jsqr`, `pngjs`, `@types/pngjs`), `packages/core/src/index.ts`

**Interfaces:**
- Produces:
  - `interface QrMatrix { size: number; modules: boolean[][] }`
  - `qrMatrix(payload: string): QrMatrix` (error correction M, byte mode, UTF-8)
  - `renderQrSvg(m: QrMatrix, opts?: { moduleSize?: number; margin?: number }): string`
  - `renderQrPng(m: QrMatrix, opts?: { moduleSize?: number; margin?: number }): Uint8Array`

- [ ] **Step 1: Install**

```sh
pnpm --filter @passwerk/core add qrcode-generator@2.0.4
pnpm add -Dw jsqr@1.4.0 pngjs@7.0.0 @types/pngjs@6.0.5
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/carrier.qr.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { qrMatrix, renderQrPng, renderQrSvg } from '@passwerk/core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const PAYLOAD = 'https://passport.musterwerk.example/battery/MW-EV-2026-000123';

function decodePng(bytes: Uint8Array): string | null {
  const png = PNG.sync.read(Buffer.from(bytes));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code?.data ?? null;
}

describe('qrMatrix', () => {
  it('is square, has the three finder patterns and is deterministic', () => {
    const m = qrMatrix(PAYLOAD);
    expect(m.size % 4).toBe(1);
    expect(m.modules).toHaveLength(m.size);
    for (const row of m.modules) expect(row).toHaveLength(m.size);
    // Finder pattern corners are dark.
    expect(m.modules[0]?.[0]).toBe(true);
    expect(m.modules[0]?.[m.size - 1]).toBe(true);
    expect(m.modules[m.size - 1]?.[0]).toBe(true);
    expect(qrMatrix(PAYLOAD)).toEqual(m);
  });
});

describe('renderQrSvg', () => {
  it('is a self-contained SVG with a white background and a black path', () => {
    const svg = renderQrSvg(qrMatrix(PAYLOAD));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
    expect(svg.endsWith('</svg>\n')).toBe(true);
    expect(svg).toMatchSnapshot();
  });
});

describe('renderQrPng', () => {
  it('is a PNG an independent decoder reads back', () => {
    const png = renderQrPng(qrMatrix(PAYLOAD));
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(decodePng(png)).toBe(PAYLOAD);
  });
  it('round-trips a 300 character payload and a UTF-8 payload', () => {
    const long = `https://id.example.com/8004/${'X'.repeat(30)}?${'k=v&'.repeat(60)}`.slice(0, 300);
    expect(decodePng(renderQrPng(qrMatrix(long)))).toBe(long);
    const utf8 = 'https://id.example.com/21/Größe-1';
    expect(decodePng(renderQrPng(qrMatrix(utf8)))).toBe(utf8);
  });
  it('is byte-identical across runs (pinned hash)', () => {
    const a = renderQrPng(qrMatrix(PAYLOAD));
    const b = renderQrPng(qrMatrix(PAYLOAD));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(createHash('sha256').update(a).digest('hex')).toMatchSnapshot();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run packages/core/test/carrier.qr.test.ts`
Expected: FAIL, exports missing.

- [ ] **Step 4: Implement**

`packages/core/src/carrier/qr.ts`:

```ts
/**
 * QR code for the data carrier: matrix from qrcode-generator (pure JS), SVG and PNG rendered
 * in-house so the bytes are identical on every platform. PNG: 8-bit greyscale, filter 0,
 * zlib via fflate. Browser-safe, no wall clock.
 */
import { zlibSync } from 'fflate';
import qrcode from 'qrcode-generator';

// Byte mode over UTF-8 bytes (the library's default is Latin-1).
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

export interface QrRenderOptions {
  /** Pixels per module. */
  moduleSize?: number;
  /** Quiet zone in modules on every side (the standard asks for 4). */
  margin?: number;
}

export function qrMatrix(payload: string): QrMatrix {
  const qr = qrcode(0, 'M');
  qr.addData(payload, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    modules.push(row);
  }
  return { size, modules };
}

export function renderQrSvg(m: QrMatrix, opts: QrRenderOptions = {}): string {
  const moduleSize = opts.moduleSize ?? 4;
  const margin = opts.margin ?? 4;
  const total = m.size + 2 * margin;
  const px = total * moduleSize;
  const d: string[] = [];
  for (let r = 0; r < m.size; r++) {
    const row = m.modules[r] ?? [];
    let c = 0;
    while (c < m.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      let len = 0;
      while (c + len < m.size && row[c + len]) len++;
      d.push(`M${c + margin} ${r + margin}h${len}v1h-${len}z`);
      c += len;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d.join('')}" fill="#000"/></svg>\n`
  );
}

// --- PNG encoder -------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function renderQrPng(m: QrMatrix, opts: QrRenderOptions = {}): Uint8Array {
  const moduleSize = opts.moduleSize ?? 8;
  const margin = opts.margin ?? 4;
  const size = (m.size + 2 * margin) * moduleSize;
  const stride = size + 1; // filter byte + one byte per pixel
  const raw = new Uint8Array(stride * size).fill(0xff);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type None
    const r = Math.floor(y / moduleSize) - margin;
    if (r < 0 || r >= m.size) continue;
    const row = m.modules[r] ?? [];
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / moduleSize) - margin;
      if (c >= 0 && c < m.size && row[c]) raw[y * stride + 1 + x] = 0;
    }
  }
  const ihdr = concat([u32(size), u32(size), new Uint8Array([8, 0, 0, 0, 0])]);
  return concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
```

Add `export * from './carrier/qr.js';` to `packages/core/src/index.ts`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/test/carrier.qr.test.ts -u` once to write the snapshots, then again without `-u`.
Expected: PASS; `decodePng` returns the payload for all three payloads.

- [ ] **Step 6: Commit**

```sh
pnpm check
git add packages/core package.json pnpm-lock.yaml
git commit -m "feat(core): QR matrix with in-house SVG and PNG renderers, decoded back by jsqr in tests"
```

---

### Task 5: `generateCarrier`

**Files:**
- Create: `packages/core/src/carrier/index.ts`, `packages/core/test/carrier.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/test/sovereignty.test.ts` (exercise the carrier)

**Interfaces:**
- Produces:

```ts
export interface CarrierInput {
  draft?: unknown;
  uid?: string;
  gs1?: Gs1Key;
  resolverBase?: string;
  format?: 'svg' | 'png';
}
export interface CarrierResult {
  uid: string;
  digitalLink?: string;
  payload: string;
  format: 'svg' | 'png';
  mediaType: 'image/svg+xml' | 'image/png';
  image: Uint8Array;
  isNotLegalAdvice: true;
  sources: string[];
}
export function generateCarrier(input: CarrierInput): CarrierResult;
```

- [ ] **Step 1: Write the failing tests**

`packages/core/test/carrier.test.ts`:

```ts
import {
  CarrierInputError,
  generateCarrier,
  PassportDraftError,
  samples,
  VALID_SAMPLE_NAMES,
} from '@passwerk/core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const decode = (png: Uint8Array) => {
  const p = PNG.sync.read(Buffer.from(png));
  return jsQR(new Uint8ClampedArray(p.data), p.width, p.height)?.data ?? null;
};
const RESOLVER = 'https://id.musterwerk.example';

describe('generateCarrier', () => {
  it.each(VALID_SAMPLE_NAMES)('%s: encodes the passport identifier as SVG by default', (name) => {
    const r = generateCarrier({ draft: samples[name] });
    expect(r.uid).toBe(samples[name].meta.passportId);
    expect(r.payload).toBe(r.uid);
    expect(r.digitalLink).toBeUndefined();
    expect(r.format).toBe('svg');
    expect(r.mediaType).toBe('image/svg+xml');
    expect(new TextDecoder().decode(r.image).startsWith('<svg')).toBe(true);
    expect(r.isNotLegalAdvice).toBe(true);
    expect(r.sources.length).toBeGreaterThan(0);
  });
  it('encodes the Digital Link when GS1 data is given, and reports both identifiers', () => {
    const r = generateCarrier({
      draft: samples['ev-valid'],
      gs1: { gtin: '4006381333931', serial: 'MW-EV-2026-000123' },
      resolverBase: RESOLVER,
      format: 'png',
    });
    expect(r.digitalLink).toBe(`${RESOLVER}/01/04006381333931/21/MW-EV-2026-000123`);
    expect(r.payload).toBe(r.digitalLink);
    expect(r.uid).toBe(samples['ev-valid'].meta.passportId);
    expect(r.mediaType).toBe('image/png');
    expect(decode(r.image)).toBe(r.digitalLink);
    expect(r.sources).toContain('gs1-digital-link-gtin-serial');
  });
  it('accepts a bare uid', () => {
    const r = generateCarrier({ uid: 'https://passport.example/b/1' });
    expect(r.uid).toBe('https://passport.example/b/1');
    expect(r.payload).toBe(r.uid);
  });
  it('rejects a non-https uid, neither or both inputs, and gs1 without a resolver', () => {
    expect(() => generateCarrier({ uid: 'urn:passwerk:1' })).toThrow(CarrierInputError);
    expect(() => generateCarrier({})).toThrow(CarrierInputError);
    expect(() =>
      generateCarrier({ draft: samples['ev-valid'], uid: 'https://passport.example/b/1' }),
    ).toThrow(CarrierInputError);
    expect(() =>
      generateCarrier({ draft: samples['ev-valid'], gs1: { giai: 'A1' } }),
    ).toThrow(CarrierInputError);
  });
  it('a structurally invalid draft throws PassportDraftError', () => {
    expect(() => generateCarrier({ draft: { meta: { category: 'EV' } } })).toThrow(
      PassportDraftError,
    );
  });
  it('is byte-identical across runs', () => {
    const a = generateCarrier({ draft: samples['lmt-valid'], format: 'png' }).image;
    const b = generateCarrier({ draft: samples['lmt-valid'], format: 'png' }).image;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/carrier.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`packages/core/src/carrier/index.ts`:

```ts
/**
 * The data carrier (build plan section 2.2, step 8): the passport's unique identifier, an
 * optional GS1 Digital Link, and the QR image. The identifier must be an absolute https URI,
 * the rule PW-PLAUS-008 already applies to the attribute; no new rule id is created.
 */
import { getCarrierScheme, getRule } from '@passwerk/rules';
import { PassportDraftError } from '../emit/aasJson.js';
import { validateSchema } from '../validate/schema.js';
import { CarrierInputError } from './error.js';
import { buildGs1DigitalLink, type Gs1Key, isHttpsUri } from './gs1DigitalLink.js';
import { qrMatrix, renderQrPng, renderQrSvg } from './qr.js';

export type CarrierFormat = 'svg' | 'png';

export interface CarrierInput {
  /** A PassportDraft; its meta.passportId is the identifier. */
  draft?: unknown;
  /** The identifier itself, when no draft is at hand. */
  uid?: string;
  gs1?: Gs1Key;
  /** Required with gs1: the https base of the resolver. */
  resolverBase?: string;
  /** Default svg. */
  format?: CarrierFormat;
}

export interface CarrierResult {
  uid: string;
  digitalLink?: string;
  /** What the QR code encodes: the Digital Link when built, else the identifier. */
  payload: string;
  format: CarrierFormat;
  mediaType: 'image/svg+xml' | 'image/png';
  image: Uint8Array;
  isNotLegalAdvice: true;
  sources: string[];
}

function identifierFrom(input: CarrierInput): string {
  if (input.draft !== undefined && input.uid !== undefined) {
    throw new CarrierInputError({
      de: 'Entweder draft oder uid angeben, nicht beides.',
      en: 'Give either draft or uid, not both.',
    });
  }
  if (input.draft !== undefined) {
    const l1 = validateSchema(input.draft);
    if (!l1.draft) throw new PassportDraftError(l1.findings);
    return l1.draft.meta.passportId;
  }
  if (input.uid === undefined) {
    throw new CarrierInputError({
      de: 'draft oder uid fehlt.',
      en: 'draft or uid is required.',
    });
  }
  return input.uid;
}

export function generateCarrier(input: CarrierInput): CarrierResult {
  const uid = identifierFrom(input);
  if (!isHttpsUri(uid)) {
    throw new CarrierInputError({
      de: `Die Kennung "${uid}" ist keine absolute https-URI (siehe PW-PLAUS-008).`,
      en: `The identifier "${uid}" is not an absolute https URI (see PW-PLAUS-008).`,
    });
  }
  const sources: string[] = [];
  const rule = getRule('PW-PLAUS-008');
  if (rule?.legalRef) sources.push(rule.legalRef);
  let digitalLink: string | undefined;
  if (input.gs1 !== undefined) {
    if (input.resolverBase === undefined) {
      throw new CarrierInputError({
        de: 'resolverBase ist mit gs1 erforderlich.',
        en: 'resolverBase is required with gs1.',
      });
    }
    digitalLink = buildGs1DigitalLink(input.resolverBase, input.gs1);
    const scheme = getCarrierScheme(
      'giai' in input.gs1 ? 'gs1-digital-link-giai' : 'gs1-digital-link-gtin-serial',
    );
    if (scheme) sources.push(scheme.id);
  }
  const payload = digitalLink ?? uid;
  const format = input.format ?? 'svg';
  const matrix = qrMatrix(payload);
  const image =
    format === 'png' ? renderQrPng(matrix) : new TextEncoder().encode(renderQrSvg(matrix));
  return {
    uid,
    ...(digitalLink !== undefined ? { digitalLink } : {}),
    payload,
    format,
    mediaType: format === 'png' ? 'image/png' : 'image/svg+xml',
    image,
    isNotLegalAdvice: true,
    sources,
  };
}
```

Add `export * from './carrier/index.js';` to `packages/core/src/index.ts`.

In `packages/core/test/sovereignty.test.ts`, inside the "whole public surface" test after the existing core calls, add:

```ts
    core.generateCarrier({ draft: core.samples['ev-valid'], format: 'png' });
    core.generateCarrier({
      uid: 'https://passport.example/b/1',
      gs1: { giai: 'A1' },
      resolverBase: 'https://id.example.com',
    });
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/core/test/carrier.test.ts packages/core/test/sovereignty.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/core
git commit -m "feat(core): generateCarrier (identifier, GS1 Digital Link, QR image)"
```

---

### Task 6: HTML passport sheet

**Files:**
- Create: `packages/core/src/emit/htmlSheet.ts`, `packages/core/src/emit/htmlSheet.css.ts`, `packages/core/test/emit.htmlSheet.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/test/sovereignty.test.ts`, `packages/core/test/golden.test.ts`

**Interfaces:**
- Consumes: `assembleReport`, `buildEnvironment`, `environmentToJsonable`, `validateSchema`, `gapReport`, `qrMatrix`, `renderQrSvg`, `attributes`, `templates`, `getAttribute`, `listCapabilities` from rules.
- Produces: `interface HtmlOptions extends ValidateOptions { lang?: 'de' | 'en' }`, `emitHtml(input: unknown, options?: HtmlOptions): EmitResult<string>`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/emit.htmlSheet.test.ts`:

```ts
import {
  BROKEN_SAMPLE_NAMES,
  brokenSamples,
  emitHtml,
  type PassportDraftInput,
  samples,
  VALID_SAMPLE_NAMES,
  validate,
} from '@passwerk/core';
import { describe, expect, it } from 'vitest';

const AS_OF = '2026-09-06T12:00:00Z';

/** Every href / src value in the document. */
function links(html: string): string[] {
  return [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? '');
}

describe('emitHtml', () => {
  for (const name of VALID_SAMPLE_NAMES) {
    it(`${name}: valid, both languages, snapshot in de and en`, () => {
      const de = emitHtml(samples[name], { lang: 'de' });
      const en = emitHtml(samples[name]);
      expect(de.verdict).toBe('valid');
      expect(de.findings).toEqual([]);
      expect(de.output).toContain('id="lang-de" checked');
      expect(en.output).toContain('id="lang-en" checked');
      expect(de.output).toContain('lang="de"');
      expect(de.output).toContain('lang="en"');
      expect(de.output).toContain('<svg');
      expect(de.output).toMatchSnapshot();
      expect(en.output).toMatchSnapshot();
    });
  }
  it.each([...VALID_SAMPLE_NAMES, ...BROKEN_SAMPLE_NAMES])(
    '%s: the verdict equals validate() for the same clock',
    (name) => {
      const draft = name in samples
        ? samples[name as keyof typeof samples]
        : brokenSamples[name as keyof typeof brokenSamples].draft;
      const expected = validate(draft, { asOf: AS_OF });
      const r = emitHtml(draft, { asOf: AS_OF });
      expect(r.verdict).toBe(expected.verdict);
      expect(r.findings.map((f) => f.ruleId)).toEqual(expected.findings.map((f) => f.ruleId));
      for (const f of expected.findings) expect(r.output).toContain(f.ruleId);
      expect(r.output).toContain(AS_OF);
    },
  );
  it('is self-contained: no script, no external stylesheet, the identifier is the only link', () => {
    const draft = samples['ev-valid'];
    const html = emitHtml(draft).output;
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/@import|url\(/i);
    expect(html).not.toContain('<link');
    for (const l of links(html)) {
      expect(l === draft.meta.passportId || l.startsWith('#'), l).toBe(true);
    }
    // The SVG namespace is the only http:// text.
    expect(html.split('http://').length - 1).toBe(html.split('http://www.w3.org/2000/svg').length - 1);
  });
  it('escapes values, labels and the identifier', () => {
    const draft = structuredClone(samples['ev-valid']) as PassportDraftInput;
    (draft.attributes as Record<string, unknown>)['batteryIdentifier'] = {
      value: '<b>&"x"</b>',
      status: 'present',
      source: [],
    };
    const html = emitHtml(draft).output;
    expect(html).toContain('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;');
    expect(html).not.toContain('<b>&"x"</b>');
  });
  it('prints no time without asOf and is byte-identical across runs', () => {
    const a = emitHtml(samples['industrial-valid']).output;
    expect(a).toBe(emitHtml(samples['industrial-valid']).output);
    expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z<\/(span|td)>/);
  });
});
```

Add to `packages/core/test/golden.test.ts`, first test, inside the loop: `expect(emitHtml(samples[name]).verdict, `${name} html`).toBe('valid');` (import `emitHtml`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/core/test/emit.htmlSheet.test.ts`
Expected: FAIL, `emitHtml` missing.

- [ ] **Step 3: Implement the stylesheet**

`packages/core/src/emit/htmlSheet.css.ts`:

```ts
/** Inline stylesheet of the passport sheet. No external resource, print-friendly. */
export const SHEET_CSS = `
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.45;color:#111;background:#fff}
body{margin:0;padding:24px;max-width:960px;margin-inline:auto}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font-size:1.15rem;margin:1.6rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:.2rem}
table{border-collapse:collapse;width:100%;margin:.4rem 0}th,td{text-align:left;vertical-align:top;padding:.3rem .5rem;border-bottom:1px solid #eee}th{font-weight:600;background:#f6f6f6}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.92em}
.head{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}.head .qr{flex:0 0 auto}.head .qr svg{width:160px;height:160px}
.meta dt{font-weight:600}.meta dd{margin:0 0 .4rem}
.verdict{display:inline-block;padding:.15rem .6rem;border-radius:4px;font-weight:600}
.verdict.valid{background:#e3f6e8;color:#0a5d2a}.verdict.valid_with_warnings{background:#fff4d6;color:#7a5200}.verdict.invalid{background:#fde4e4;color:#8f1b1b}
.sev-error{color:#8f1b1b;font-weight:600}.sev-warning{color:#7a5200;font-weight:600}
.toggle{display:flex;gap:.5rem;justify-content:flex-end;margin-bottom:.5rem}.toggle label{cursor:pointer;padding:.15rem .6rem;border:1px solid #ccc;border-radius:4px}
input[name=lang]{position:absolute;opacity:0;pointer-events:none}
#lang-de:checked~.toggle label[for=lang-de],#lang-en:checked~.toggle label[for=lang-en]{background:#111;color:#fff;border-color:#111}
#lang-de:checked~.sheet [lang=en]{display:none}#lang-en:checked~.sheet [lang=de]{display:none}
ul.nested{margin:0;padding-left:1rem}
footer{margin-top:2rem;font-size:.85rem;color:#555;border-top:1px solid #ddd;padding-top:.6rem}
@media print{.toggle{display:none}body{padding:0}}
`;
```

- [ ] **Step 4: Implement the emitter**

`packages/core/src/emit/htmlSheet.ts`:

```ts
/**
 * The human-readable passport sheet: one self-contained HTML file, inline CSS, no JavaScript,
 * both languages inside with a CSS-only toggle. Fail-honest like the AAS emitters: the verdict
 * is the full L1 to L4 report on the emitted AAS environment (assembleReport), the gap section
 * is gapReport's. Deterministic: knowledge-base order, no wall clock (the generation time is
 * printed only when asOf is given).
 */
import { attributes, type BatteryCategory, listCapabilities, templates } from '@passwerk/rules';
import { qrMatrix, renderQrSvg } from '../carrier/qr.js';
import { gapReport, type GapItem, type GapReport } from '../gap/report.js';
import type { AnyFieldValue } from '../model/field.js';
import type { PassportDraft } from '../model/passport.js';
import type { Finding, ValidationReport } from '../validate/finding.js';
import { assembleReport, type ValidateOptions } from '../validate/index.js';
import { validateSchema } from '../validate/schema.js';
import { type EmitResult, PassportDraftError } from './aasJson.js';
import { buildEnvironment, environmentToJsonable } from './environment.js';
import { SHEET_CSS } from './htmlSheet.css.js';

export type SheetLang = 'de' | 'en';
export interface HtmlOptions extends ValidateOptions {
  /** Which language the sheet opens in; both are in the file. Default en. */
  lang?: SheetLang;
}

type LangText = { de: string; en: string };

const T = {
  title: { de: 'Batteriepass', en: 'Battery passport' },
  subtitle: {
    de: 'Lesbare Ansicht des Digitalen Batteriepasses (IDTA 02035). Massgeblich sind die AAS-Dateien.',
    en: 'Human-readable view of the Digital Battery Passport (IDTA 02035). The AAS files are authoritative.',
  },
  identifier: { de: 'Batteriepass-Kennung', en: 'Battery passport identifier' },
  category: { de: 'Batteriekategorie', en: 'Battery category' },
  created: { de: 'Entwurf angelegt', en: 'Draft created' },
  generated: { de: 'Erzeugt', en: 'Generated' },
  qr: { de: 'QR-Code der Kennung', en: 'QR code of the identifier' },
  verdict: { de: 'Prüfergebnis', en: 'Verdict' },
  layer: { de: 'Ebene', en: 'Layer' },
  rule: { de: 'Regel', en: 'Rule' },
  severity: { de: 'Schwere', en: 'Severity' },
  path: { de: 'Pfad', en: 'Path' },
  message: { de: 'Meldung', en: 'Message' },
  legalRef: { de: 'Rechtsgrundlage', en: 'Legal reference' },
  noFindings: { de: 'Keine Befunde.', en: 'No findings.' },
  attribute: { de: 'Attribut', en: 'Attribute' },
  value: { de: 'Wert', en: 'Value' },
  unit: { de: 'Einheit', en: 'Unit' },
  status: { de: 'Status', en: 'Status' },
  otherData: { de: 'Weitere Datenpunkte', en: 'Other data points' },
  gaps: { de: 'Offene Datenpunkte', en: 'Open data points' },
  completeness: { de: 'Vollständigkeit', en: 'Completeness' },
  mandatory: { de: 'Pflicht', en: 'mandatory' },
  overall: { de: 'gesamt', en: 'overall' },
  owner: { de: 'Wer die Daten typischerweise hat', en: 'Who typically has the data' },
  bucket: { de: 'Einstufung', en: 'Bucket' },
  action: { de: 'Nächster Schritt', en: 'Next step' },
  noGaps: { de: 'Keine offenen Pflicht- oder bedingten Datenpunkte.', en: 'No open required or conditional data points.' },
  notLegal: {
    de: 'Dieses Dokument ist keine Rechtsberatung. Jede rechtliche Aussage stammt aus den zitierten Quellen.',
    en: 'This document is not legal advice. Every legal statement comes from the cited sources.',
  },
  sources: { de: 'Quellen', en: 'Sources' },
  kb: { de: 'Wissensbasis abgerufen am', en: 'Knowledge base retrieved' },
  generator: { de: 'Erzeugt mit passwerk', en: 'Generated with passwerk' },
} satisfies Record<string, LangText>;

const CATEGORY: Record<BatteryCategory, LangText> = {
  EV: { de: 'Elektrofahrzeugbatterie', en: 'Electric vehicle battery' },
  LMT: { de: 'Batterie für leichte Verkehrsmittel', en: 'Light means of transport battery' },
  INDUSTRIAL_GT_2KWH: { de: 'Industriebatterie > 2 kWh', en: 'Industrial battery > 2 kWh' },
};

const FIELD_STATUS: Record<string, LangText> = {
  present: { de: 'vorhanden', en: 'present' },
  conflict: { de: 'Konflikt', en: 'conflict' },
  not_applicable: { de: 'nicht anwendbar', en: 'not applicable' },
  missing: { de: 'fehlt', en: 'missing' },
};

const BUCKET: Record<string, LangText> = {
  required: { de: 'Pflicht', en: 'required' },
  conditional: { de: 'bedingt', en: 'conditional' },
  optional: { de: 'optional', en: 'optional' },
  deferred: { de: 'später', en: 'deferred' },
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Both languages as sibling spans; the CSS toggle hides one. */
const both = (t: LangText): string =>
  `<span lang="de">${escapeHtml(t.de)}</span><span lang="en">${escapeHtml(t.en)}</span>`;

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return `<ul class="nested">${v.map((x) => `<li>${renderValue(x)}</li>`).join('')}</ul>`;
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `<ul class="nested">${entries
      .map(([k, x]) => `<li><code>${escapeHtml(k)}</code>: ${renderValue(x)}</li>`)
      .join('')}</ul>`;
  }
  return escapeHtml(String(v));
}

function attributeRows(draft: PassportDraft, part: number | null): string {
  const rows: string[] = [];
  for (const a of attributes) {
    if (a.part !== part) continue;
    const field = draft.attributes[a.id as keyof typeof draft.attributes] as
      | AnyFieldValue
      | undefined;
    if (!field || field.status === 'missing') continue;
    const unit = field.unit ?? a.unit ?? '';
    rows.push(
      `<tr><td>${both(a.name)}<br><code>${escapeHtml(a.id)}</code></td><td>${renderValue(field.value)}</td><td>${escapeHtml(unit)}</td><td>${both(FIELD_STATUS[field.status] ?? FIELD_STATUS['missing'] as LangText)}</td></tr>`,
    );
  }
  return rows.join('\n');
}

function attributeSections(draft: PassportDraft): string {
  const out: string[] = [];
  const header = `<tr><th>${both(T.attribute)}</th><th>${both(T.value)}</th><th>${both(T.unit)}</th><th>${both(T.status)}</th></tr>`;
  for (const t of templates) {
    const rows = attributeRows(draft, t.part);
    if (rows === '') continue;
    out.push(
      `<h2>${escapeHtml(`IDTA ${t.idta} ${t.version}: ${t.submodelIdShort}`)}</h2><table>${header}${rows}</table>`,
    );
  }
  const other = attributeRows(draft, null);
  if (other !== '') out.push(`<h2>${both(T.otherData)}</h2><table>${header}${other}</table>`);
  return out.join('\n');
}

function findingsSection(report: ValidationReport): string {
  const badge = `<span class="verdict ${report.verdict}">${escapeHtml(report.verdict)}</span>`;
  if (report.findings.length === 0) return `<h2>${both(T.verdict)}</h2><p>${badge} ${both(T.noFindings)}</p>`;
  const rows = report.findings
    .map(
      (f: Finding) =>
        `<tr><td>${escapeHtml(f.layer)}</td><td><code>${escapeHtml(f.ruleId)}</code></td><td class="sev-${f.severity}">${escapeHtml(f.severity)}</td><td><code>${escapeHtml(f.path)}</code></td><td>${both(f.message)}${f.legalRef ? `<br><small>${both(T.legalRef)}: ${escapeHtml(f.legalRef)}</small>` : ''}</td></tr>`,
    )
    .join('\n');
  return `<h2>${both(T.verdict)}</h2><p>${badge}</p><table><tr><th>${both(T.layer)}</th><th>${both(T.rule)}</th><th>${both(T.severity)}</th><th>${both(T.path)}</th><th>${both(T.message)}</th></tr>${rows}</table>`;
}

function gapSection(gap: GapReport): string {
  const open = (i: GapItem) =>
    (i.bucket === 'required' || i.bucket === 'conditional') &&
    (i.status === 'missing' || i.status === 'invalid' || i.status === 'conflict');
  const byId = new Map(gap.items.map((i) => [i.attributeId, i]));
  const completeness = `<p>${both(T.completeness)}: ${both(T.mandatory)} ${gap.completeness.mandatory.present}/${gap.completeness.mandatory.total} (${gap.completeness.mandatory.percent} %), ${both(T.overall)} ${gap.completeness.overall.present}/${gap.completeness.overall.total} (${gap.completeness.overall.percent} %)</p>`;
  const groups: string[] = [];
  for (const g of gap.byDataOwner) {
    const items = g.attributeIds.map((id) => byId.get(id)).filter((i): i is GapItem => !!i && open(i));
    if (items.length === 0) continue;
    const rows = items
      .map(
        (i) =>
          `<tr><td>${both(i.name)}<br><code>${escapeHtml(i.attributeId)}</code></td><td>${both(BUCKET[i.bucket] ?? BUCKET['optional'] as LangText)}</td><td>${i.legalRefs.map(escapeHtml).join('<br>')}</td><td>${both(i.suggestedAction)}</td></tr>`,
      )
      .join('\n');
    groups.push(
      `<h3>${both(g.owner)}</h3><table><tr><th>${both(T.attribute)}</th><th>${both(T.bucket)}</th><th>${both(T.legalRef)}</th><th>${both(T.action)}</th></tr>${rows}</table>`,
    );
  }
  return `<h2>${both(T.gaps)}</h2>${completeness}${groups.length === 0 ? `<p>${both(T.noGaps)}</p>` : groups.join('\n')}`;
}

function renderSheet(
  draft: PassportDraft,
  report: ValidationReport,
  gap: GapReport,
  options: HtmlOptions,
): string {
  const lang = options.lang ?? 'en';
  const uid = draft.meta.passportId;
  const qr = renderQrSvg(qrMatrix(uid)).trim();
  const caps = listCapabilities();
  const generated =
    options.asOf !== undefined
      ? `<dt>${both(T.generated)}</dt><dd>${escapeHtml(options.asOf)}</dd>`
      : '';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(lang === 'de' ? T.title.de : T.title.en)}: ${escapeHtml(uid)}</title>
<style>${SHEET_CSS}</style>
</head>
<body>
<input type="radio" name="lang" id="lang-de"${lang === 'de' ? ' checked' : ''}>
<input type="radio" name="lang" id="lang-en"${lang === 'en' ? ' checked' : ''}>
<nav class="toggle"><label for="lang-de">Deutsch</label><label for="lang-en">English</label></nav>
<main class="sheet">
<header class="head">
<div>
<h1>${both(T.title)}</h1>
<p>${both(T.subtitle)}</p>
<dl class="meta">
<dt>${both(T.identifier)}</dt><dd><a href="${escapeHtml(uid)}"><code>${escapeHtml(uid)}</code></a></dd>
<dt>${both(T.category)}</dt><dd>${both(CATEGORY[draft.meta.category])} (<code>${escapeHtml(draft.meta.category)}</code>)</dd>
<dt>${both(T.created)}</dt><dd>${escapeHtml(draft.meta.createdAt)}</dd>
${generated}
</dl>
</div>
<figure class="qr"><figcaption>${both(T.qr)}</figcaption>${qr}</figure>
</header>
${findingsSection(report)}
${attributeSections(draft)}
${gapSection(gap)}
<footer>
<p>${both(T.notLegal)}</p>
<p>${both(T.sources)}: ${gap.sources.map(escapeHtml).join('; ')}</p>
<p>${both(T.kb)} ${escapeHtml(caps.artefactsRetrievedAt)}. ${both(T.generator)}.</p>
</footer>
</main>
</body>
</html>
`;
}

export function emitHtml(input: unknown, options: HtmlOptions = {}): EmitResult<string> {
  const l1 = validateSchema(input);
  if (!l1.draft) throw new PassportDraftError(l1.findings);
  const environment = buildEnvironment(l1.draft, options);
  const jsonable = environmentToJsonable(environment);
  const report = assembleReport({ ...l1, draft: l1.draft }, jsonable, options);
  const gap = gapReport(l1.draft, {
    report,
    ...(options.asOf !== undefined ? { asOf: options.asOf } : {}),
  });
  return {
    output: renderSheet(l1.draft, report, gap, options),
    environment,
    verdict: report.verdict,
    findings: report.findings,
    report,
  };
}
```

Field names used above are verified: `BundledTemplate` has `part`, `idta`, `version`, `submodelIdShort`; `Finding.legalRef` is an optional string; `PassportMeta` has `createdAt`, `category`, `passportId`.

Add `export * from './emit/htmlSheet.js';` to `packages/core/src/index.ts`. In the sovereignty test add `core.emitHtml(core.samples['ev-valid'], { lang: 'de' });`.

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/core/test/emit.htmlSheet.test.ts -u` once, then `pnpm vitest run packages/core`
Expected: PASS. Open one snapshot and read it: header, QR, verdict, tables, gaps, footer, both languages.

- [ ] **Step 6: Commit**

```sh
pnpm check
git add packages/core
git commit -m "feat(core): HTML passport sheet with QR, verdict, attribute tables and gaps, DE/EN toggle"
```

---

### Task 7: Server: `html` target and `generate_carrier`

**Files:**
- Create: `packages/server/src/tools/generateCarrier.ts`, `packages/server/test/tools.carrier.test.ts`
- Modify: `packages/server/src/tools/emitPassport.ts`, `packages/server/src/registry.ts`, `packages/server/src/index.ts` (export `encodeBase64`, `decodeBase64`), `packages/server/test/sovereignty.test.ts`, `packages/server/test/tools.draft.test.ts` (emit html), `packages/cli/test/tools.test.ts` (11 tools)

**Interfaces:**
- Produces: tool `generate_carrier` with input `{ draft?, uid?, gs1?, resolverBase?, format?, outDir? }` and output `{ draftId?, uid, digitalLink?, payload, format, mediaType, image: { name, size, path?, bytes? }, isNotLegalAdvice, sources }`; `emit_passport` target `html` and input `htmlLang`.

- [ ] **Step 1: Write the failing tests**

`packages/server/test/tools.carrier.test.ts`:

```ts
import { generateCarrier, getSample } from '@passwerk/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeBase64 } from '../src/base64.ts';
import { call, connect, memoryFileSystem } from './harness.ts';

interface Out {
  draftId?: string;
  uid: string;
  digitalLink?: string;
  payload: string;
  format: string;
  mediaType: string;
  image: { name: string; size: number; path?: string; bytes?: string };
  isNotLegalAdvice: true;
  sources: string[];
}

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect({ fs: memoryFileSystem({}) });
});
afterAll(() => session.close());

describe('generate_carrier', () => {
  it('a draft yields an SVG of its identifier inline, with a draft id', async () => {
    const draft = getSample('ev-valid');
    const r = await call<Out>(session.client, 'generate_carrier', { draft });
    expect(r.isError).toBe(false);
    expect(r.structured.draftId).toMatch(/^drf_/);
    expect(r.structured.uid).toBe(draft.meta.passportId);
    expect(r.structured.payload).toBe(draft.meta.passportId);
    expect(r.structured.mediaType).toBe('image/svg+xml');
    expect(r.structured.image.name).toMatch(/\.qr\.svg$/);
    const svg = new TextDecoder().decode(decodeBase64(r.structured.image.bytes ?? ''));
    expect(svg).toBe(new TextDecoder().decode(generateCarrier({ draft }).image));
    expect(r.structured.isNotLegalAdvice).toBe(true);
    expect(r.text).toMatch(/^QR payload: https:\/\//);
  });
  it('a uid with GS1 data yields a PNG Digital Link written into outDir', async () => {
    const r = await call<Out>(session.client, 'generate_carrier', {
      uid: 'https://passport.musterwerk.example/battery/MW-EV-2026-000123',
      gs1: { gtin: '4006381333931', serial: 'MW-EV-2026-000123' },
      resolverBase: 'https://id.musterwerk.example',
      format: 'png',
      outDir: 'out',
      lang: 'de',
    });
    expect(r.isError).toBe(false);
    expect(r.structured.digitalLink).toBe(
      'https://id.musterwerk.example/01/04006381333931/21/MW-EV-2026-000123',
    );
    expect(r.structured.payload).toBe(r.structured.digitalLink);
    expect(r.structured.image.path).toBe('/work/out/passport.musterwerk.example-battery-mw-ev-2026-000123.qr.png');
    expect(r.structured.image.bytes).toBeUndefined();
    expect(r.structured.sources).toContain('gs1-digital-link-gtin-serial');
    expect(r.text).toMatch(/^QR-Inhalt: /);
  });
  it('input errors are fail-honest results with DE/EN text, not crashes', async () => {
    const bad = await call<{ error: string }>(session.client, 'generate_carrier', {
      uid: 'urn:passwerk:1',
    });
    expect(bad.isError).toBe(true);
    expect(bad.structured.error).toMatch(/https/);
    const gtin = await call<{ error: string }>(session.client, 'generate_carrier', {
      uid: 'https://passport.example/1',
      gs1: { gtin: '4006381333932', serial: 'S' },
      resolverBase: 'https://id.example.com',
      lang: 'de',
    });
    expect(gtin.isError).toBe(true);
    expect(gtin.text).toMatch(/Prüfziffer/);
  });
  it('accepts a draftId it returned earlier', async () => {
    const draft = getSample('lmt-valid');
    const a = await call<Out>(session.client, 'generate_carrier', { draft });
    const b = await call<Out>(session.client, 'generate_carrier', {
      draft: { draftId: a.structured.draftId },
    });
    expect(b.structured.image.bytes).toBe(a.structured.image.bytes);
  });
});
```

In `packages/server/test/tools.draft.test.ts`, in the `emit_passport` describe, add:

```ts
  it('html target: the sheet in the chosen language, same verdict', async () => {
    const draft = getSample('ev-valid');
    const r = await call<{ verdict: string; files: { target: string; name: string; bytes: string }[] }>(
      session.client,
      'emit_passport',
      { draft, targets: ['html'], htmlLang: 'de' },
    );
    expect(r.isError).toBe(false);
    expect(r.structured.verdict).toBe('valid');
    const file = r.structured.files[0];
    expect(file?.target).toBe('html');
    expect(file?.name).toMatch(/\.html$/);
    const html = new TextDecoder().decode(decodeBase64(file?.bytes ?? ''));
    expect(html).toContain('id="lang-de" checked');
    expect(html).toBe(emitHtml(draft, { lang: 'de' }).output);
  });
```

(import `emitHtml` from `@passwerk/core`). In `packages/cli/test/tools.test.ts` change `toHaveLength(10)` to `11`.

In `packages/server/test/sovereignty.test.ts`, after the `emit_passport` calls add:

```ts
      await run('emit_passport', { draft: getSample('ev-valid'), targets: ['html'], htmlLang: 'de' });
      await run('generate_carrier', {
        draft: getSample('ev-valid'),
        gs1: { gtin: '4006381333931', serial: 'MW-EV-2026-000123' },
        resolverBase: 'https://id.musterwerk.example',
        format: 'png',
      });
      await run('generate_carrier', { uid: 'https://passport.example/b/1', outDir: 'out' });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/server`
Expected: FAIL (unknown tool, unknown target).

- [ ] **Step 3: Implement**

`packages/server/src/tools/emitPassport.ts`:
- `EMIT_TARGETS = ['aas-json', 'aasx', 'draft-json', 'html'] as const`.
- targets description adds `html: self-contained HTML passport sheet (DE and EN inside)`.
- input adds `htmlLang: z.enum(['de', 'en']).optional().describe('Language the html sheet opens in (both are in the file; default en)')`.
- in the loop:

```ts
      } else if (target === 'html') {
        const r = emitHtml(draft, { ...opts, lang: input.htmlLang ?? 'en' });
        verdict ??= r.verdict;
        findings ??= r.findings;
        outputs.push({ target, name: `${base}.html`, bytes: utf8(r.output) });
      } else {
```

- import `emitHtml` from `@passwerk/core`; description sentence gains "or the HTML sheet".

`packages/server/src/tools/generateCarrier.ts`:

```ts
import { CarrierInputError, type CarrierResult, generateCarrier } from '@passwerk/core';
import { z } from 'zod';
import { encodeBase64 } from '../base64.js';
import { DraftRef, resolveDraft } from '../refs.js';
import { out, type ToolDefinition } from '../types.js';
import { slug } from './emitPassport.js';

const inputSchema = {
  draft: DraftRef.optional().describe('The draft whose meta.passportId is the identifier'),
  uid: z.string().optional().describe('The passport identifier (absolute https URI) when no draft is given'),
  gs1: z
    .union([
      z.object({ gtin: z.string(), serial: z.string() }),
      z.object({ giai: z.string() }),
    ])
    .optional()
    .describe('GS1 key: GTIN (8, 12, 13 or 14 digits) plus serial, or a GIAI'),
  resolverBase: z.string().optional().describe('https base of the GS1 Digital Link resolver; required with gs1'),
  format: z.enum(['svg', 'png']).optional().describe('Image format (default svg)'),
  outDir: z.string().optional().describe('Directory to write the image into (needs a file system). Omit to receive base64 bytes inline'),
};

const outputSchema = out({
  draftId: z.string().optional(),
  uid: z.string().optional(),
  digitalLink: z.string().optional(),
  payload: z.string().optional(),
  format: z.enum(['svg', 'png']).optional(),
  mediaType: z.string().optional(),
  image: z
    .object({
      name: z.string(),
      size: z.number(),
      path: z.string().optional(),
      bytes: z.string().optional().describe('base64'),
    })
    .optional(),
  isNotLegalAdvice: z.literal(true).optional(),
  sources: z.array(z.string()).optional(),
});

export const generateCarrierTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'generate_carrier',
  title: 'Generate the data carrier (QR code)',
  description:
    'Builds the data carrier for a passport: the unique identifier (the draft’s passportId, an absolute https URI), an optional GS1 Digital Link (/01/{gtin}/21/{serial} or /8004/{giai}) and the QR code as SVG or PNG. The QR encodes the Digital Link when GS1 data is given, else the identifier. Says nothing about validity; validate_passport does.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    if (input.outDir !== undefined && !ctx.fs) {
      const message =
        'File output needs a file system; this server was started without one. Omit outDir to receive bytes inline.';
      return {
        isError: true,
        structured: { error: message },
        text: {
          de: 'Dateiausgabe braucht ein Dateisystem; dieser Server wurde ohne eines gestartet. outDir weglassen, um die Bytes inline zu erhalten.',
          en: message,
        },
      };
    }
    let draftId: string | undefined;
    let carrierInput: Parameters<typeof generateCarrier>[0];
    if (input.draft !== undefined) {
      const resolved = await resolveDraft(input.draft, ctx);
      draftId = resolved.draftId;
      carrierInput = { draft: resolved.draft };
    } else {
      carrierInput = input.uid !== undefined ? { uid: input.uid } : {};
    }
    if (input.gs1 !== undefined) carrierInput.gs1 = input.gs1;
    if (input.resolverBase !== undefined) carrierInput.resolverBase = input.resolverBase;
    if (input.format !== undefined) carrierInput.format = input.format;
    let result: CarrierResult;
    try {
      result = generateCarrier(carrierInput);
    } catch (e) {
      if (e instanceof CarrierInputError) {
        return { isError: true, structured: { error: e.text.en }, text: e.text };
      }
      throw e;
    }
    const name = `${slug(result.uid)}.qr.${result.format}`;
    let image: { name: string; size: number; path?: string; bytes?: string };
    if (input.outDir !== undefined && ctx.fs) {
      const path = ctx.fs.join(ctx.fs.resolve(input.outDir), name);
      await ctx.fs.writeFile(path, result.image);
      image = { name, size: result.image.length, path };
    } else {
      image = { name, size: result.image.length, bytes: encodeBase64(result.image) };
    }
    const { image: _bytes, ...rest } = result;
    const link = result.digitalLink !== undefined ? ` GS1 Digital Link: ${result.digitalLink}.` : '';
    return {
      structured: { ...(draftId !== undefined ? { draftId } : {}), ...rest, image },
      text: {
        de: `QR-Inhalt: ${result.payload}.${link} ${image.path !== undefined ? `Geschrieben: ${image.path}` : `Bild (${result.mediaType}, ${image.size} Bytes) inline`}. Keine Rechtsberatung.`,
        en: `QR payload: ${result.payload}.${link} ${image.path !== undefined ? `Wrote ${image.path}` : `Image (${result.mediaType}, ${image.size} bytes) inline`}. Not legal advice.`,
      },
    };
  },
};
```

`packages/server/src/registry.ts`: import and add `generateCarrierTool` after `emitPassportTool`. `packages/server/src/index.ts`: add `export { decodeBase64, encodeBase64 } from './base64.js';`.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/server packages/cli`
Expected: PASS. If `tools.simple.test.ts` or the resources tests pin the tool count or the list of tool names, update them to include `generate_carrier`.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/server packages/cli/test/tools.test.ts
git commit -m "feat(server): generate_carrier tool and the html emit target"
```

---

### Task 8: Skill, prompts and references

**Files:**
- Modify: `skills/passwerk/SKILL.md`, `skills/passwerk/references/workflow.md`, `packages/server/src/prompts/texts.ts`, `packages/cli/src/chat/skill.ts` (regenerated)

- [ ] **Step 1: Update `SKILL.md`**

Replace step 6 and add step 7:

```
6. **`emit_passport`** (`aas-json`, `aasx`, `draft-json`, `html`) only when the verdict is `valid`
   or the user explicitly accepts `valid_with_warnings`. Quote the re-validation verdict. The
   `html` target is the human-readable sheet (DE and EN inside; `htmlLang` picks the opening
   language); the AAS files stay authoritative.
7. **`generate_carrier`** after the emit: the QR code of the passport identifier (SVG or PNG),
   or of a GS1 Digital Link when the user supplies `gs1` (GTIN plus serial, or GIAI) and
   `resolverBase`. It says nothing about validity.
```

- [ ] **Step 2: Update `references/workflow.md`**

Append a section:

````
## 7. generate_carrier

```json
{ "draft": { "draftId": "drf_…" }, "format": "svg" }
{ "uid": "https://passport.example/battery/1", "gs1": { "gtin": "4006381333931", "serial": "MW-EV-2026-000123" }, "resolverBase": "https://id.example.com", "format": "png", "outDir": "./out" }
```

Read: `uid`, `digitalLink` (when built), `payload` (what the QR encodes), `image` (`name`,
`size`, `path` or base64 `bytes`), `sources[]`. A wrong GTIN check digit or a non-https
identifier is an error result with a DE/EN message, never a crash.
````

- [ ] **Step 3: Update the prompt text**

In `packages/server/src/prompts/texts.ts`, `buildPassportInterview`, change both step 6 lines to list `html` too and add step 7:

- de: `'6. emit_passport (aas-json, aasx, draft-json, html) nur bei valid oder wenn der Nutzer die Warnungen ausdrücklich akzeptiert. Das Ergebnis der Nachvalidierung wörtlich nennen.'`, `'7. generate_carrier: QR-Code der Kennung (svg oder png), oder eines GS1 Digital Link, wenn der Nutzer gs1 und resolverBase liefert.'`
- en: `'6. emit_passport (aas-json, aasx, draft-json, html) only on valid or when the user explicitly accepts the warnings. Quote the re-validation verdict verbatim.'`, `'7. generate_carrier: the QR code of the identifier (svg or png), or of a GS1 Digital Link when the user supplies gs1 and resolverBase.'`

- [ ] **Step 4: Regenerate the chat prompt and run the tests**

Run: `pnpm --filter @passwerk/cli sync-skill && pnpm vitest run packages/server/test/skill.test.ts packages/cli/test/skill.test.ts packages/server/test/prompts.test.ts`
Expected: PASS (the prompts snapshot, if any, is updated with `-u` after reading the diff).

- [ ] **Step 5: Commit**

```sh
pnpm check
git add skills packages/server/src/prompts packages/cli/src/chat/skill.ts packages/server/test
git commit -m "docs(skill): html target and generate_carrier in the workflow"
```

---

### Task 9: CLI: `emit --targets html` and `passwerk carrier`

**Files:**
- Create: `packages/cli/src/commands/carrier.ts`, `packages/cli/test/carrier.test.ts`
- Modify: `packages/cli/src/commands/emit.ts`, `packages/cli/src/commands/index.ts`, `packages/cli/test/emit.test.ts`, `packages/cli/test/index.test.ts`, `packages/cli/test/sovereignty.test.ts`, `skills/passwerk/references/cli.md`, `packages/cli/scripts/demo.sh`, `packages/cli/scripts/demo.ps1`

**Interfaces:**
- Produces: `passwerk carrier [draft.json] [--uid <https>] [--gtin <d> --serial <s> | --giai <g>] [--resolver-base <https>] [--format svg|png] --out <file> [--lang] [--json]`; exit 0, or 3 on usage or carrier input error.

- [ ] **Step 1: Write the failing tests**

`packages/cli/test/carrier.test.ts`:

```ts
import { run } from '@passwerk/cli';
import { generateCarrier, getSample } from '@passwerk/core';
import { describe, expect, it } from 'vitest';
import { captureIo, sampleFiles, utf8 } from './harness.ts';

const files = sampleFiles();

describe('passwerk carrier', () => {
  it('writes the SVG of the draft identifier to --out and prints the payload', async () => {
    const io = captureIo(files);
    expect(await run(['carrier', 'samples/ev-valid.json', '--out', 'out/qr.svg'], io)).toBe(0);
    const bytes = io.fs.written.get('/work/out/qr.svg');
    expect(bytes).toBeDefined();
    expect(utf8(bytes ?? new Uint8Array())).toBe(
      utf8(generateCarrier({ draft: getSample('ev-valid') }).image),
    );
    expect(io.out()).toContain('Identifier: https://passport.musterwerk.example/battery/MW-EV-2026-000123');
    expect(io.out()).toContain('Wrote: /work/out/qr.svg');
  });
  it('--uid with GS1 data writes a PNG of the Digital Link', async () => {
    const io = captureIo();
    expect(
      await run(
        [
          'carrier',
          '--uid', 'https://passport.example/b/1',
          '--gtin', '4006381333931',
          '--serial', 'MW-1',
          '--resolver-base', 'https://id.example.com',
          '--format', 'png',
          '--out', 'qr.png',
          '--lang', 'de',
        ],
        io,
      ),
    ).toBe(0);
    const bytes = io.fs.written.get('/work/qr.png') ?? new Uint8Array();
    expect([...bytes.slice(0, 4)]).toEqual([137, 80, 78, 71]);
    expect(io.out()).toContain('GS1 Digital Link: https://id.example.com/01/04006381333931/21/MW-1');
    expect(io.out()).toContain('Geschrieben: /work/qr.png');
  });
  it('--json prints the structured result with the path', async () => {
    const io = captureIo(files);
    expect(await run(['carrier', 'samples/lmt-valid.json', '--out', 'q.svg', '--json'], io)).toBe(0);
    const parsed = JSON.parse(io.out()) as { uid: string; payload: string; path: string };
    expect(parsed.uid).toBe(getSample('lmt-valid').meta.passportId);
    expect(parsed.path).toBe('/work/q.svg');
  });
  it('usage errors exit 3: no --out, draft and --uid together, neither, gtin without serial', async () => {
    const a = captureIo(files);
    expect(await run(['carrier', 'samples/ev-valid.json'], a)).toBe(3);
    const b = captureIo(files);
    expect(await run(['carrier', 'samples/ev-valid.json', '--uid', 'https://x.example/1', '--out', 'q.svg'], b)).toBe(3);
    const c = captureIo();
    expect(await run(['carrier', '--out', 'q.svg'], c)).toBe(3);
    const d = captureIo();
    expect(await run(['carrier', '--uid', 'https://x.example/1', '--gtin', '96385074', '--out', 'q.svg'], d)).toBe(3);
    expect(d.err()).toMatch(/--serial/);
  });
  it('a carrier input error (wrong check digit) exits 3 with the message', async () => {
    const io = captureIo();
    expect(
      await run(
        ['carrier', '--uid', 'https://x.example/1', '--gtin', '4006381333932', '--serial', 'S', '--resolver-base', 'https://id.example.com', '--out', 'q.svg'],
        io,
      ),
    ).toBe(3);
    expect(io.err()).toMatch(/check digit/);
    expect(io.fs.written.size).toBe(0);
  });
});
```

In `packages/cli/test/emit.test.ts`: change the invalid target in the usage test from `html` to `pdf` (and the `toMatch(/html/)` to `/pdf/`), and add:

```ts
  it('--targets html writes the sheet in --lang and re-validates', async () => {
    const io = captureIo(files);
    expect(
      await run(['emit', 'samples/ev-valid.json', '--out', 'out', '--targets', 'html', '--lang', 'de'], io),
    ).toBe(0);
    const [path] = written(io);
    expect(path).toMatch(/\.html$/);
    expect(utf8(io.fs.written.get(path ?? '') ?? new Uint8Array())).toContain('id="lang-de" checked');
  });
```

In `packages/cli/test/index.test.ts` add `'carrier'` to `COMMANDS`. In `packages/cli/test/sovereignty.test.ts` add a `carrier` invocation to the list of commands it runs (follow the file's pattern).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/cli`
Expected: FAIL (unknown command, unknown target).

- [ ] **Step 3: Implement**

`packages/cli/src/commands/emit.ts`: `TARGETS = ['aas-json', 'aasx', 'draft-json', 'html'] as const`; description `(AAS JSON, AASX, draft JSON, HTML sheet)`; pass `htmlLang: lang` in the tool input.

`packages/cli/src/commands/carrier.ts`:

```ts
import { decodeBase64 } from '@passwerk/server';
import { parseLang, printJson, readJsonFile, withOutputOptions } from '../format.js';
import { CliInputError, EXIT_USAGE } from '../io.js';
import { invoke, toolContext } from '../invoke.js';
import { registerCommand } from '../program.js';

interface Options {
  uid?: string;
  gtin?: string;
  serial?: string;
  giai?: string;
  resolverBase?: string;
  format: string;
  out: string;
  lang: string;
  json?: boolean;
}

interface CarrierOut {
  uid: string;
  digitalLink?: string;
  payload: string;
  format: 'svg' | 'png';
  mediaType: string;
  image: { name: string; size: number; bytes?: string };
  sources: string[];
}

function gs1From(o: Options): { gtin: string; serial: string } | { giai: string } | undefined {
  if (o.giai !== undefined) {
    if (o.gtin !== undefined || o.serial !== undefined)
      throw new CliInputError('--giai cannot be combined with --gtin or --serial');
    return { giai: o.giai };
  }
  if (o.gtin !== undefined || o.serial !== undefined) {
    if (o.gtin === undefined || o.serial === undefined)
      throw new CliInputError('--gtin and --serial must be given together');
    return { gtin: o.gtin, serial: o.serial };
  }
  return undefined;
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('carrier')
      .description('write the QR data carrier (SVG or PNG) of a passport identifier or GS1 Digital Link')
      .argument('[draft.json]', 'the PassportDraft file (omit with --uid)')
      .option('--uid <https-uri>', 'the passport identifier instead of a draft')
      .option('--gtin <digits>', 'GTIN (8, 12, 13 or 14 digits) for a GS1 Digital Link')
      .option('--serial <text>', 'serial number (with --gtin)')
      .option('--giai <text>', 'GIAI for a GS1 Digital Link (instead of --gtin/--serial)')
      .option('--resolver-base <https-url>', 'GS1 Digital Link resolver base (required with --gtin or --giai)')
      .option('--format <svg|png>', 'image format', 'svg')
      .requiredOption('--out <file>', 'file to write the image to'),
  ).action(async (path: string | undefined, options: Options) => {
    const lang = parseLang(options.lang);
    if (options.format !== 'svg' && options.format !== 'png')
      throw new CliInputError(`--format must be svg or png, got "${options.format}"`);
    if ((path === undefined) === (options.uid === undefined))
      throw new CliInputError('give either a draft file or --uid');
    const gs1 = gs1From(options);
    if (gs1 !== undefined && options.resolverBase === undefined)
      throw new CliInputError('--resolver-base is required with --gtin or --giai');
    const input: Record<string, unknown> = { format: options.format };
    if (path !== undefined) input['draft'] = await readJsonFile(io, path);
    if (options.uid !== undefined) input['uid'] = options.uid;
    if (gs1 !== undefined) input['gs1'] = gs1;
    if (options.resolverBase !== undefined) input['resolverBase'] = options.resolverBase;
    const result = await invoke('generate_carrier', input, toolContext(io));
    if (result.isError) {
      io.stderr.write(`${String(result.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    const out = result.structured as unknown as CarrierOut;
    const bytes = decodeBase64(out.image.bytes ?? '');
    const target = io.fs.resolve(options.out);
    await io.fs.writeFile(target, bytes);
    if (options.json) {
      const { image, ...rest } = out;
      printJson(io, { ...rest, path: target, size: image.size, mediaType: out.mediaType });
    } else {
      const L =
        lang === 'de'
          ? [
              `Kennung: ${out.uid}`,
              ...(out.digitalLink ? [`GS1 Digital Link: ${out.digitalLink}`] : []),
              `QR-Inhalt: ${out.payload}`,
              `Geschrieben: ${target} (${out.image.size} Bytes, ${out.mediaType})`,
              'Keine Rechtsberatung.',
            ]
          : [
              `Identifier: ${out.uid}`,
              ...(out.digitalLink ? [`GS1 Digital Link: ${out.digitalLink}`] : []),
              `QR payload: ${out.payload}`,
              `Wrote: ${target} (${out.image.size} bytes, ${out.mediaType})`,
              'Not legal advice.',
            ];
      io.stdout.write(`${L.join('\n')}\n`);
    }
    exit(0);
  });
});
```

`packages/cli/src/commands/index.ts`: add `import './carrier.js';` after `./emit.js`.

`skills/passwerk/references/cli.md`: add the table row

```
| `passwerk carrier [draft.json] [--uid <https>] [--gtin <d> --serial <s> \| --giai <g>] [--resolver-base <https>] [--format svg\|png] --out <file> [--lang] [--json]` | `generate_carrier`: the QR code of the identifier, or of a GS1 Digital Link | 0; 3 usage or carrier input error (bad GTIN, non-https identifier) |
```

update the `emit` row's targets to `aas-json,aasx,draft-json,html`, and add an example line `node packages/cli/dist/bin.js carrier passport.draft.json --out passport.qr.svg`. Add the same carrier line to `demo.sh` and `demo.ps1` after the emit step.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/cli packages/server/test/skill.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/cli skills
git commit -m "feat(cli): passwerk carrier and the html emit target"
```

---

### Task 10: Web export: HTML sheet and QR

**Files:**
- Modify: `apps/web/src/workflow/exports.ts`, `apps/web/src/views/GapsExportView.tsx`, `apps/web/src/app/App.tsx`, `apps/web/src/i18n/de.ts`, `apps/web/src/i18n/en.ts`, `apps/web/test/exports.test.ts`, `apps/web/e2e/golden.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/exports.test.ts` replace the file-name expectation with six names and add checks:

```ts
    expect(out.files.map((f) => f.name)).toEqual([
      `${base}.aas.json`,
      `${base}.aasx`,
      `${base}.draft.json`,
      `${base}.gaps.json`,
      `${base}.html`,
      `${base}.qr.svg`,
    ]);
    const html = new TextDecoder().decode(out.files[4]?.bytes);
    expect(html).toContain('id="lang-de" checked');
    expect(html).toContain('<span class="verdict valid">valid</span>');
    expect(new TextDecoder().decode(out.files[5]?.bytes).startsWith('<svg')).toBe(true);
    expect(out.files[4]?.type).toBe('text/html');
    expect(out.files[5]?.type).toBe('image/svg+xml');
```

with `buildExports(d, 'de')`.

In `apps/web/e2e/golden.spec.ts`, after the findings assertion:

```ts
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('export-html').click(),
    ]);
    const html = await download.path().then((p) => (p ? readFileSync(p, 'utf8') : ''));
    expect(download.suggestedFilename()).toMatch(/\.html$/);
    expect(html).toContain(`<span class="verdict ${expected.verdict}">`);
    for (const f of expected.findings) expect(html).toContain(f.ruleId);
```

(import `readFileSync`). A structurally sound broken sample still exports; if a sample has an L1 error that makes `buildExports` return an error, guard with `if (expected.verdict !== 'invalid' || expected.findings.every((f) => f.layer !== 'L1'))` around the export block. Check the existing sovereignty spec still passes: it clicks `export-aasJson`, which is unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run apps/web/test/exports.test.ts`
Expected: FAIL (four files, `buildExports` takes one argument).

- [ ] **Step 3: Implement**

`apps/web/src/workflow/exports.ts`: signature `buildExports(derived: Derived, lang: 'de' | 'en' = 'en')`; import `emitHtml`, `generateCarrier`; after the gaps entry push

```ts
        {
          name: `${base}.html`,
          bytes: utf8(emitHtml(derived.draft, { asOf: derived.asOf, lang }).output),
          type: 'text/html',
        },
        {
          name: `${base}.qr.svg`,
          bytes: generateCarrier({ draft: derived.draft }).image,
          type: 'image/svg+xml',
        },
```

`generateCarrier` throws `CarrierInputError` when the identifier is not https; catch it next to `PassportDraftError` and return `{ error: e.text }`.

`App.tsx`: `onExport` kind union gains `'html' | 'qr'`, the index map `{ aasJson: 0, aasx: 1, draft: 2, gaps: 3, html: 4, qr: 5 }`, and `buildExports(derived, lang)`.

`GapsExportView.tsx`: two more outline buttons with `data-testid="export-html"` and `data-testid="export-qr"`, labels `t(lang, 'export.html')` and `t(lang, 'export.qr')`; the props' `onExport` type follows App's union.

i18n: `'export.html': 'HTML-Passblatt'` / `'HTML sheet'`, `'export.qr': 'QR-Code (SVG)'` / `'QR code (SVG)'`.

- [ ] **Step 4: Run unit tests, build, e2e**

Run: `pnpm vitest run apps/web && pnpm build && pnpm build:web && pnpm e2e`
Expected: PASS. (Playwright needs Chromium: `pnpm --filter @passwerk/web exec playwright install chromium` once.)

- [ ] **Step 5: Commit**

```sh
pnpm check
git add apps/web
git commit -m "feat(web): export the HTML sheet and the QR code"
```

---

### Task 11: Package metadata, versions 0.1.0, registry manifest

**Files:**
- Create: `packages/server/server.json`, `packages/server/test/manifest.test.ts`
- Modify: `packages/{rules,core,server,cli}/package.json`, `packages/server/src/meta.ts`, `packages/cli/src/meta.ts`, root `package.json` (script `release:pack`)

- [ ] **Step 1: Write the failing test**

`packages/server/test/manifest.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../src/meta.ts';

const here = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  mcpName: string;
  publishConfig: { access: string };
  repository: { url: string };
};
const manifest = JSON.parse(readFileSync(join(here, 'server.json'), 'utf8')) as {
  $schema: string;
  name: string;
  version: string;
  repository: { url: string; source: string };
  packages: { registryType: string; identifier: string; version: string; transport: { type: string } }[];
};

describe('MCP registry manifest (packages/server/server.json)', () => {
  it('agrees with package.json and the server version', () => {
    expect(manifest.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
    expect(manifest.name).toBe('io.github.shahriarbijoy/passwerk');
    expect(pkg.mcpName).toBe(manifest.name);
    expect(manifest.version).toBe(pkg.version);
    expect(pkg.version).toBe(SERVER_VERSION);
    expect(manifest.packages).toHaveLength(1);
    expect(manifest.packages[0]).toMatchObject({
      registryType: 'npm',
      identifier: pkg.name,
      version: pkg.version,
      transport: { type: 'stdio' },
    });
    expect(manifest.repository.url).toBe('https://github.com/ShahriarBijoy/passwerk');
    expect(pkg.publishConfig.access).toBe('public');
  });
  it('the four published packages share one version', () => {
    for (const p of ['rules', 'core', 'cli']) {
      const other = JSON.parse(
        readFileSync(join(here, '..', p, 'package.json'), 'utf8'),
      ) as { version: string; publishConfig?: { access: string } };
      expect(other.version, p).toBe(pkg.version);
      expect(other.publishConfig?.access, p).toBe('public');
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run packages/server/test/manifest.test.ts`
Expected: FAIL (no server.json).

- [ ] **Step 3: Update the manifests**

In each of `packages/rules`, `packages/core`, `packages/server`, `packages/cli` `package.json`: `"version": "0.1.0"`, and add

```json
  "repository": { "type": "git", "url": "git+https://github.com/ShahriarBijoy/passwerk.git", "directory": "packages/<name>" },
  "homepage": "https://github.com/ShahriarBijoy/passwerk#readme",
  "bugs": { "url": "https://github.com/ShahriarBijoy/passwerk/issues" },
  "keywords": ["battery-passport", "digital-product-passport", "aas", "idta-02035", "eu-2023-1542", "mcp"],
  "publishConfig": { "access": "public" }
```

(`keywords` for server add `"mcp-server"`, `"model-context-protocol"`; for cli add `"cli"`). `packages/server/package.json` also gets `"mcpName": "io.github.shahriarbijoy/passwerk"`. Set `SERVER_VERSION = '0.1.0'` and `CLI_VERSION = '0.1.0'`.

`packages/server/server.json`:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.shahriarbijoy/passwerk",
  "title": "passwerk",
  "description": "Offline EU Digital Battery Passport toolkit: ingest supplier documents, map, validate (AAS / IDTA 02035), gap report, emit AASX. No network, no model calls.",
  "websiteUrl": "https://github.com/ShahriarBijoy/passwerk#readme",
  "repository": { "url": "https://github.com/ShahriarBijoy/passwerk", "source": "github" },
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "registryBaseUrl": "https://registry.npmjs.org",
      "identifier": "@passwerk/server",
      "version": "0.1.0",
      "runtimeHint": "npx",
      "transport": { "type": "stdio" },
      "environmentVariables": [
        {
          "name": "PASSWERK_ROOT",
          "description": "Directory ingest_documents may read and emit_passport may write (default: the working directory)",
          "isRequired": false,
          "isSecret": false
        },
        {
          "name": "PASSWERK_LOG_LEVEL",
          "description": "info (default) or debug; JSON lines on stderr",
          "isRequired": false,
          "isSecret": false,
          "choices": ["info", "debug"]
        }
      ]
    }
  ]
}
```

Root `package.json` scripts: `"release:pack": "rimraf out/pack && pnpm -r --filter \"./packages/*\" exec pnpm pack --pack-destination ../../out/pack"` (`exec` runs in each package directory, so the destination is relative to it).

- [ ] **Step 4: Run the tests and a pack**

Run: `pnpm vitest run packages/server/test/manifest.test.ts packages/server/test/index.test.ts packages/cli/test/index.test.ts && pnpm build && pnpm release:pack && ls out/pack`
Expected: PASS and four tarballs `passwerk-rules-0.1.0.tgz`, `passwerk-core-0.1.0.tgz`, `passwerk-server-0.1.0.tgz`, `passwerk-cli-0.1.0.tgz`. Then `tar tzf out/pack/passwerk-core-0.1.0.tgz | grep vendor/aasCore.js` shows the bundle, and `tar tzf out/pack/passwerk-rules-0.1.0.tgz | grep kb/carrier.json` shows the data.

- [ ] **Step 5: Commit**

```sh
pnpm check
git add packages/*/package.json packages/server/server.json packages/server/src/meta.ts packages/cli/src/meta.ts packages/server/test/manifest.test.ts package.json
git commit -m "chore(release): version 0.1.0, package metadata, MCP registry manifest"
```

---

### Task 12: Pack-and-install smoke test and CI job

**Files:**
- Create: `tools/release/pack-smoke.mjs`
- Modify: `.github/workflows/ci.yml`, root `package.json` (script `release:smoke`)

- [ ] **Step 1: Write the script**

`tools/release/pack-smoke.mjs`:

```js
#!/usr/bin/env node
/**
 * Proves the published packages work outside the monorepo (spec section 8.3): pack the four
 * packages, install the tarballs into an empty temp project, then run the server binary,
 * a stdio tools/list, `passwerk audit` and `passwerk carrier`. Exit 1 on the first failure.
 *
 *   pnpm build && pnpm release:pack && node tools/release/pack-smoke.mjs
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const PACK = join(ROOT, 'out', 'pack');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'packages', 'server', 'package.json'), 'utf8')).version;
const shell = process.platform === 'win32';

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}
function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, shell, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

const tarballs = readdirSync(PACK).filter((f) => f.endsWith('.tgz')).map((f) => join(PACK, f));
if (tarballs.length !== 4) fail(`expected 4 tarballs in ${PACK}, found ${tarballs.length}`);

const dir = mkdtempSync(join(tmpdir(), 'passwerk-smoke-'));
writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'smoke', private: true }));
console.log(`installing ${tarballs.length} tarballs into ${dir}`);
sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error', ...tarballs], dir);

const serverBin = join(dir, 'node_modules', '@passwerk', 'server', 'dist', 'bin.js');
const cliBin = join(dir, 'node_modules', '@passwerk', 'cli', 'dist', 'bin.js');

// 1. version through npx (the DoD command shape)
const v = sh('npx', ['--no-install', 'passwerk-server', '--version'], dir).trim();
if (v !== VERSION) fail(`passwerk-server --version printed "${v}", expected ${VERSION}`);
console.log(`ok: passwerk-server --version = ${v}`);

// 2. stdio initialize + tools/list
const tools = await new Promise((resolvePromise) => {
  const child = spawn(process.execPath, [serverBin], { cwd: dir, stdio: ['pipe', 'pipe', 'inherit'] });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    for (const line of buf.split('\n')) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        child.kill();
        resolvePromise(msg.result.tools.map((t) => t.name));
      }
    }
  });
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '0' } } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  setTimeout(() => fail('tools/list timed out'), 30000).unref();
});
if (tools.length !== 11 || !tools.includes('generate_carrier')) fail(`tools/list: ${tools.join(', ')}`);
console.log(`ok: tools/list -> ${tools.length} tools`);

// 3. audit a golden draft
copyFileSync(join(ROOT, 'packages', 'core', 'src', 'samples', 'ev-valid.json'), join(dir, 'ev-valid.json'));
const audit = sh(process.execPath, [cliBin, 'audit', 'ev-valid.json'], dir);
if (!audit.startsWith('Verdict: valid.')) fail(`audit: ${audit}`);
console.log('ok: passwerk audit ev-valid.json -> valid');

// 4. carrier
sh(process.execPath, [cliBin, 'carrier', 'ev-valid.json', '--out', 'qr.svg'], dir);
if (!readFileSync(join(dir, 'qr.svg'), 'utf8').startsWith('<svg')) fail('carrier did not write an SVG');
console.log('ok: passwerk carrier -> qr.svg');

rmSync(dir, { recursive: true, force: true });
console.log('pack smoke: OK');
```

Root `package.json`: `"release:smoke": "node tools/release/pack-smoke.mjs"`.

- [ ] **Step 2: Run it locally**

Run: `pnpm build && pnpm release:pack && pnpm release:smoke`
Expected: the four `ok:` lines and `pack smoke: OK`. If `npm install` of the tarballs fails to resolve `@passwerk/rules@0.1.0` from the registry, pass the tarballs in dependency order and add `--install-links`; if it still resolves against the registry, install rules first, then core, then server and cli in separate `npm install` calls.

- [ ] **Step 3: Add the CI job**

In `.github/workflows/ci.yml` after `test`:

```yaml
  # Phase 7 (ADR D-034): the packed tarballs must work outside the monorepo, where the pnpm
  # patch of the AAS SDK does not exist. Installs them into an empty project and runs the
  # server (stdio tools/list) and the CLI (audit, carrier).
  pack:
    name: Pack and install smoke
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm release:pack
      - run: pnpm release:smoke
      - uses: actions/upload-artifact@v7
        with:
          name: tarballs
          path: out/pack/*.tgz
          retention-days: 14
```

- [ ] **Step 4: Commit**

```sh
pnpm check
git add tools/release/pack-smoke.mjs package.json .github/workflows/ci.yml
git commit -m "ci: pack the packages and prove npx passwerk-server works from a clean project"
```

---

### Task 13: Dockerfile, compose, Docker smoke and CI job

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`, `tools/release/docker-smoke.sh`
- Modify: `.github/workflows/ci.yml`, `docs/install/http.md`

- [ ] **Step 1: Write the files**

`.dockerignore`:

```
.git
**/node_modules
**/dist
out
coverage
apps/web/playwright-report
apps/web/test-results
tools/oracle/out
.venv
docs/media
```

`Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# passwerk MCP server, Streamable HTTP mode (ADR D-034). Multi-stage: build with pnpm, run on
# distroless Node 22 as non-root. Needs PASSWERK_AUTH_TOKEN; mounts documents at /data.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @passwerk/server --prod deploy --legacy /out && mkdir -p /data

FROM gcr.io/distroless/nodejs22-debian12:nonroot
LABEL org.opencontainers.image.title="passwerk" \
      org.opencontainers.image.description="Offline EU Digital Battery Passport toolkit: MCP server in Streamable HTTP mode" \
      org.opencontainers.image.source="https://github.com/ShahriarBijoy/passwerk" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.modelcontextprotocol.server.name="io.github.shahriarbijoy/passwerk"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out /app
COPY --from=build --chown=nonroot:nonroot /data /data
ENV NODE_ENV=production PASSWERK_ROOT=/data
EXPOSE 3777
CMD ["dist/bin.js", "--http", "3777", "--host", "0.0.0.0"]
```

`docker-compose.yml`:

```yaml
services:
  passwerk:
    image: ghcr.io/shahriarbijoy/passwerk:latest
    build: .
    env_file: .env
    environment:
      PASSWERK_ROOT: /data
    ports:
      - "127.0.0.1:3777:3777"
    volumes:
      - ./documents:/data:ro
    read_only: true
    healthcheck:
      test: ["CMD", "/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3777/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
```

`.env.example`:

```
# Bearer token every request to /mcp must carry. Generate one: openssl rand -hex 32
PASSWERK_AUTH_TOKEN=
```

`tools/release/docker-smoke.sh`:

```sh
#!/usr/bin/env bash
# Starts the image with a token and proves /healthz and an authenticated initialize + tools/list.
#   docker build -t passwerk:smoke . && tools/release/docker-smoke.sh passwerk:smoke
set -euo pipefail
IMAGE="${1:-passwerk:smoke}"
TOKEN="smoke-$(date +%s)"
ID=$(docker run -d --rm -e PASSWERK_AUTH_TOKEN="$TOKEN" -p 127.0.0.1:3777:3777 "$IMAGE")
trap 'docker rm -f "$ID" >/dev/null 2>&1 || true' EXIT
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3777/healthz >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" = 30 ]; then echo "healthz never answered"; docker logs "$ID"; exit 1; fi
done
echo "ok: /healthz"
HEADERS=$(mktemp)
curl -sS -D "$HEADERS" -o /dev/null -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
SESSION=$(grep -i '^mcp-session-id:' "$HEADERS" | tr -d '\r' | awk '{print $2}')
[ -n "$SESSION" ] || { echo "no Mcp-Session-Id"; cat "$HEADERS"; exit 1; }
curl -sS -o /dev/null -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
LIST=$(curl -sS -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
echo "$LIST" | grep -q '"generate_carrier"' || { echo "tools/list lacks generate_carrier: $LIST"; exit 1; }
echo "ok: authenticated tools/list"
UNAUTH=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3777/mcp -H "Content-Type: application/json" -d '{}')
[ "$UNAUTH" = "401" ] || { echo "expected 401 without token, got $UNAUTH"; exit 1; }
echo "ok: 401 without token"
echo "docker smoke: OK"
```

`chmod +x tools/release/docker-smoke.sh` (on Windows: `git update-index --chmod=+x tools/release/docker-smoke.sh` after adding).

CI job in `ci.yml` after `pack`:

```yaml
  docker:
    name: Docker image smoke
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t passwerk:smoke .
      - run: tools/release/docker-smoke.sh passwerk:smoke
```

`docs/install/http.md`: add a "Docker" section:

````
## Docker

```sh
cp .env.example .env && echo "PASSWERK_AUTH_TOKEN=$(openssl rand -hex 32)" > .env
docker compose up -d          # or: docker run -e PASSWERK_AUTH_TOKEN=… -p 127.0.0.1:3777:3777 -v ./documents:/data:ro ghcr.io/shahriarbijoy/passwerk
curl http://127.0.0.1:3777/healthz
```

The image (`ghcr.io/shahriarbijoy/passwerk`, amd64 and arm64) runs the server in HTTP mode on
port 3777 as a non-root user on a distroless Node 22 base; documents are read from `/data`
(`PASSWERK_ROOT`). Build locally with `docker build -t passwerk .`. The same privacy note
applies: HTTP mode is a convenience mode, never described as offline.
````

- [ ] **Step 2: Build and smoke locally**

Run: `docker build -t passwerk:smoke . && bash tools/release/docker-smoke.sh passwerk:smoke`
Expected: the four `ok:` lines and `docker smoke: OK`. If `pnpm deploy --legacy` complains, add `force-legacy-deploy=true` to a repository `.npmrc` instead of the flag. If the 401 check fails because the server answers another status without a token, read `packages/server/src/http.ts` and assert that status instead.

- [ ] **Step 3: Commit**

```sh
pnpm check
git add Dockerfile .dockerignore docker-compose.yml .env.example tools/release/docker-smoke.sh .github/workflows/ci.yml docs/install/http.md
git commit -m "build: Docker image (distroless, non-root) with compose and a CI smoke test"
```

---

### Task 14: Release workflow and owner checklist

**Files:**
- Create: `.github/workflows/release.yml`, `docs/RELEASE.md`

- [ ] **Step 1: Write the workflow**

`.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ["v*"]

permissions:
  contents: write
  packages: write
  id-token: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  verify:
    name: Verify tag and run checks
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.v.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - id: v
        name: Tag must equal the package versions
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          for p in rules core server cli; do
            PV=$(node -p "require('./packages/$p/package.json').version")
            [ "$PV" = "$VERSION" ] || { echo "packages/$p is $PV, tag is $VERSION"; exit 1; }
          done
          MV=$(node -p "require('./packages/server/server.json').version")
          [ "$MV" = "$VERSION" ] || { echo "server.json is $MV, tag is $VERSION"; exit 1; }
          echo "version=$VERSION" >> "$GITHUB_OUTPUT"
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm build
      - run: pnpm release:pack
      - run: pnpm release:smoke
      - uses: actions/upload-artifact@v7
        with:
          name: tarballs
          path: out/pack/*.tgz

  npm:
    name: Publish to npm (trusted publishing)
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - run: npm install -g npm@11
      - uses: actions/download-artifact@v7
        with:
          name: tarballs
          path: out/pack
      - name: Publish each package unless that version already exists
        env:
          VERSION: ${{ needs.verify.outputs.version }}
        run: |
          for p in rules core server cli; do
            NAME="@passwerk/$p"
            if npm view "$NAME@$VERSION" version >/dev/null 2>&1; then
              echo "skip $NAME@$VERSION: already published"
              continue
            fi
            npm publish "out/pack/passwerk-$p-$VERSION.tgz" --access public
          done

  image:
    name: Push the image to GHCR
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v4
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v6
        with:
          images: ghcr.io/shahriarbijoy/passwerk
          tags: |
            type=semver,pattern={{version}}
            type=raw,value=latest
      - uses: docker/build-push-action@v7
        with:
          context: .
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

  registry:
    name: Publish to the MCP Registry
    needs: [verify, npm]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install mcp-publisher
        run: |
          curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher
      - run: ./mcp-publisher login github-oidc
      - name: Publish (retry while npm propagates the new version)
        run: |
          for i in 1 2 3 4 5 6; do
            ./mcp-publisher publish packages/server/server.json && exit 0
            echo "attempt $i failed; waiting 30 s"; sleep 30
          done
          exit 1

  github-release:
    name: GitHub release
    needs: [verify, npm, image]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v7
        with:
          name: tarballs
          path: out/pack
      - uses: softprops/action-gh-release@v3
        with:
          files: out/pack/*.tgz
          generate_release_notes: true
```

Note for the implementer: `actions/download-artifact` must match the major of `upload-artifact@v7`; check `gh api repos/actions/download-artifact/releases/latest` and pin that major.

- [ ] **Step 2: Write the checklist**

`docs/RELEASE.md`:

```markdown
# Releasing passwerk

The release workflow (`.github/workflows/release.yml`) runs on a `v*` tag and is idempotent:
packages already on npm at that version are skipped, so the first publish can be manual.

## One-time setup (owner)

1. **npm organisation.** Create the `passwerk` organisation on npmjs.com (the `@passwerk`
   scope was unclaimed on 2026-09-06) and log in locally: `npm login`.
2. **Repository visibility.** Make `ShahriarBijoy/passwerk` public: the README badges read
   `raw.githubusercontent.com`, the registry entry links the repository, and GHCR pulls need
   the package to be public (Packages settings after the first push).
3. **First publish, by hand.** From a clean `main`:
   ```sh
   pnpm install && pnpm check && pnpm build && pnpm release:pack && pnpm release:smoke
   for p in rules core server cli; do npm publish out/pack/passwerk-$p-0.1.0.tgz --access public; done
   ```
4. **Trusted publishing.** On npmjs.com, for each of `@passwerk/rules`, `@passwerk/core`,
   `@passwerk/server`, `@passwerk/cli`: Settings, Trusted publisher, GitHub Actions,
   repository `ShahriarBijoy/passwerk`, workflow `release.yml`. Later versions then publish
   from CI without a token.
5. **Registry namespace.** `io.github.shahriarbijoy/*` is granted by GitHub authentication of
   the repository owner; the workflow uses `mcp-publisher login github-oidc`, which needs
   nothing but `id-token: write`. To publish by hand instead:
   ```sh
   mcp-publisher login github && mcp-publisher publish packages/server/server.json
   ```

## Every release

1. Bump the version in the four `package.json` files, `packages/server/server.json`,
   `packages/server/src/meta.ts` and `packages/cli/src/meta.ts` (tests enforce agreement),
   update `README.md` status if needed, merge to `main`.
2. `git tag v<version> && git push origin v<version>`.
3. Watch the workflow: verify (checks, pack smoke), npm, image (amd64 and arm64 on GHCR),
   registry, GitHub release with the tarballs.
4. Verify from a machine without the repository:
   ```sh
   npx -y @passwerk/server --version
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.shahriarbijoy/passwerk"
   docker run --rm -e PASSWERK_AUTH_TOKEN=x -p 127.0.0.1:3777:3777 ghcr.io/shahriarbijoy/passwerk:<version> &
   curl http://127.0.0.1:3777/healthz
   ```
```

- [ ] **Step 3: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"` (PyYAML is available through `uv run --with pyyaml python -c ...` if the system Python lacks it).
Expected: `yaml ok`. The tag-triggered workflow cannot run before a tag exists; the PR's Actions tab reports a parse error if the file is malformed.

- [ ] **Step 4: Commit**

```sh
git add .github/workflows/release.yml docs/RELEASE.md
git commit -m "ci: tag-triggered release to npm (trusted publishing), GHCR, the MCP registry and GitHub releases"
```

---

### Task 15: README, install pages, build plan, AGENTS status

**Files:**
- Modify: `README.md`, `docs/install/{claude-code,claude-desktop,codex,cursor,opencode,inspector}.md`, `docs/BUILD_PLAN.md` (section 7, Phase 7 line), `AGENTS.md` (status), `docs/superpowers/specs/2026-09-06-phase-7-carrier-html-release-design.md` (two corrections)

- [ ] **Step 1: README**

- Status paragraph: "Phases 0 to 7 are done" wording; mention the carrier, the HTML sheet, `npx -y @passwerk/server`, the Docker image and the registry entry; "Next: the rest of Phase 7a (project screen, facts screen, QR preview panel, BYOK), then 7b and 7c."
- New "Quick start" section right after "Why":

````
## Quick start

```sh
npx -y @passwerk/server            # MCP server over stdio, offline, no keys
claude mcp add passwerk -- npx -y @passwerk/server
npx -y @passwerk/cli audit passport.draft.json
docker run -e PASSWERK_AUTH_TOKEN=$(openssl rand -hex 32) -p 127.0.0.1:3777:3777 ghcr.io/shahriarbijoy/passwerk
```

Host snippets for Claude Desktop, Codex, Cursor and OpenCode are in [docs/install](docs/install/claude-code.md);
the server is listed in the Official MCP Registry as `io.github.shahriarbijoy/passwerk`.
````

- Web app section: add `![passwerk web app: upload, review, gaps, export](docs/media/passwerk-web.gif)` after the paragraph.
- Command line section: add `carrier` to the command list and one example line.
- Packages table: core's role already names the HTML sheet and the carrier; server's row adds "eleven tools".

- [ ] **Step 2: Install pages**

In each stdio page put the `npx` form first and keep the from-source form under a "From source" heading (the skill test requires `packages/server/dist/bin.js` to stay on every page):

- claude-code: `claude mcp add passwerk -- npx -y @passwerk/server` (user scope), `.mcp.json` unchanged (project scope, built from source).
- claude-desktop / cursor / opencode: `"command": "npx", "args": ["-y", "@passwerk/server"]`.
- codex: `command = "npx"`, `args = ["-y", "@passwerk/server"]`.
- inspector: `npx @modelcontextprotocol/inspector npx -y @passwerk/server` first.

Keep every verify comment those pages already carry.

- [ ] **Step 3: Build plan and AGENTS**

`docs/BUILD_PLAN.md`, Phase 7 block: append `- **Done (2026-09-06):** carrier (UID, GS1 Digital Link, QR SVG/PNG), HTML sheet, Docker image, release workflow, registry manifest; site/ dropped per D-006; see ADRs D-033, D-034.`
`AGENTS.md` status: add a Phase 7 bullet in the style of the others (carrier, HTML sheet, `generate_carrier`, `passwerk carrier`, web export, publishable build with the bundled SDK, Dockerfile, release workflow, registry manifest, pack and docker smoke jobs) and change "Next" to the rest of 7a, then 7b, 7c.

Spec corrections: section 5 `lang` becomes `htmlLang` (the wrapper reserves `lang`); section 6 exit code for a carrier input error is 3, like every other usage error.

- [ ] **Step 4: Run the doc-sensitive tests and commit**

Run: `pnpm vitest run packages/server/test/skill.test.ts packages/cli/test/skill.test.ts`
Expected: PASS.

```sh
git add README.md docs AGENTS.md
git commit -m "docs: npx quick start, install pages via npx, Phase 7 status"
```

---

### Task 16: ADRs D-033 and D-034

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: Append the two ADRs**

```markdown
## D-033: Carrier and HTML sheet conventions (2026-09-06)

**Context.** Build plan section 2.2 ends the pipeline with a data carrier (UID, GS1 Digital
Link, QR) and section 3 names an HTML sheet. No GS1 or ISO/IEC 15459 artefact is bundled, and
the plan's `qrcode` package depends on `pngjs` and `yargs`, which do not belong in the
browser-safe core. The sheet must not become a second source of verdicts.

**Decision.** The unique identifier is `meta.passportId`, accepted only as an absolute https
URI, the rule PW-PLAUS-008 already applies; the carrier creates no new rule id and reports
input problems as a typed `CarrierInputError` with DE/EN text. The GS1 Digital Link builder
implements `/01/{gtin14}/21/{serial}` and `/8004/{giai}` with a mod-10 GTIN check; the syntax
and the length limits are transcribed into `kb/carrier.json` with `verify: true` and appear in
`docs/KB_REVIEW.md` until confirmed against the GS1 standard. The QR encodes the Digital Link
when GS1 data is given, else the identifier; the matrix comes from `qrcode-generator` (pure
JavaScript) and SVG and PNG are rendered in-house (PNG: greyscale, filter 0, `fflate`), so the
bytes are identical everywhere and an independent decoder (`jsqr`, dev-only) proves them in
tests. `emitHtml` is one more fail-honest emitter: it builds the AAS environment, runs
`assembleReport` and `gapReport`, and renders one self-contained file with inline CSS, no
JavaScript, both languages inside and a CSS-only toggle; the generation time is printed only
when `asOf` is given.

**Consequences.** `generate_carrier` and the `html` target join the server, the CLI gains
`passwerk carrier`, and the web export lists the sheet and the QR. The sheet's SVG namespace is
the only `http://` text in the file, and a test pins that. The rest of Phase 7a (QR preview
panel, project and facts screens, BYOK) still follows.

## D-034: Release: bundled SDK, trusted publishing, distroless image, registry (2026-09-06)

**Context.** The AAS SDK's ESM build has extensionless imports that only this repository's
pnpm patch fixes (D-011); a consumer of `@passwerk/core` from npm would load the unpatched
build. The `@passwerk` npm scope was unclaimed and the repository private. The Official MCP
Registry validates npm ownership through an `mcpName` field and grants `io.github.<owner>/*`
to GitHub authentication, including OIDC from GitHub Actions.

**Decision.** Core imports the SDK only through `src/vendor/aasCore.ts`; after `tsc`, an
`esbuild` step inlines the SDK into `dist/vendor/aasCore.js` (the SDK stays a dependency for
its types). A CI job packs the four packages, installs the tarballs into an empty project and
runs the server and the CLI there, which is the proof the bundle works. The four packages share
one version (`0.1.0` first) and are published from `pnpm pack` tarballs with `npm publish`
under npm trusted publishing; the workflow skips versions already on npm so the owner's manual
first publish and the tag do not collide. The Docker image is multi-stage on distroless Node
22, non-root, HTTP mode only, labelled with the registry name; the release pushes amd64 and
arm64 to GHCR. The registry manifest lives in `packages/server/server.json` and is published
with `mcp-publisher login github-oidc`. The repository becomes public at release.

**Consequences.** `npx -y @passwerk/server` is the primary install path in the README and the
install pages; building from source stays documented. The owner steps live in
`docs/RELEASE.md`. The web app and the oracle now consume core's `dist`, so they exercise the
bundle on every CI run.
```

- [ ] **Step 2: Commit**

```sh
git add docs/DECISIONS.md
git commit -m "docs: ADRs D-033 (carrier, HTML sheet) and D-034 (release)"
```

---

### Task 17: Demo GIF (done by the session owner, not a subagent)

**Files:**
- Create: `docs/media/passwerk-web.gif`

- [ ] **Step 1: Serve the built app**

Run in the background: `pnpm build && pnpm build:web && pnpm --filter @passwerk/web preview` (port 4173).

- [ ] **Step 2: Record with the Chrome tools**

Load `mcp__claude-in-chrome__*` (tabs_context, tabs_create, navigate, computer, gif_creator, file_upload, find). Open `http://localhost:4173/`, start recording, then: choose EV and enter `https://passport.musterwerk.example/battery/MW-EV-2026-000123`, upload the five Musterwerk fixtures from `packages/core/test/fixtures/musterwerk`, accept the proposals at or above 0.7 (the review view's bulk control), open the gaps step, click the HTML and QR exports, stop recording. Capture a frame before and after each action. Save as `passwerk-web.gif`, move it to `docs/media/`, and keep it under 5 MB (reduce the window to 1200x800 and the frame count if needed).

- [ ] **Step 3: Commit**

```sh
git add docs/media/passwerk-web.gif
git commit -m "docs: web app demo GIF"
```

---

### Task 18: Final verification and pull request

- [ ] **Step 1: Full verification**

Run, and paste the real output into the PR description:

```sh
pnpm check
pnpm build && pnpm oracle
pnpm build:web && pnpm e2e
pnpm release:pack && pnpm release:smoke
docker build -t passwerk:smoke . && bash tools/release/docker-smoke.sh passwerk:smoke
```

Expected: all green; oracle parity 16/16; `docs/CONFORMANCE.md` unchanged except the Generated line (revert that line if it is the only diff).

- [ ] **Step 2: Push and open the PR**

Write the PR body to the scratchpad directory with the Write tool, then:

```sh
git push -u origin feat/phase-7-release
gh pr create --title "feat: Phase 7 (carrier, HTML sheet, Docker, release)" --body-file <scratchpad>/pr-body.md
```

The body lists: the spec, what was added per package, the two ADRs, the verification output, the owner checklist link (`docs/RELEASE.md`), and the deferred items (rest of Phase 7a). End the description with the session URL.

- [ ] **Step 3: Update memory**

Write a memory note under the project's memory directory: Phase 7 PR number, that the first publish and the registry login are owner steps, the `htmlLang` wrapper quirk, and that the pack smoke is the SDK-bundle proof.
