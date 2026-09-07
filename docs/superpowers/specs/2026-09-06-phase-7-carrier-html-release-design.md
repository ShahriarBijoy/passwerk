# Phase 7 design: data carrier, HTML sheet, Docker, release

Date: 2026-09-06. Status: approved by the owner in conversation (publish for real, GS1 syntax
from the plan marked `verify`, one HTML file with a CSS language toggle, web-app demo GIF,
HTML sheet and QR added to the web export).

This document refines build plan section 7 (Phase 7) into the concrete design that the
Phase 7 pull request implements. Where it departs from the plan, the departure is listed in
section 11 and recorded as an ADR.

## 1. Goal

Finish the pipeline's last stage (`carrier`), add the human-readable passport sheet, and make
passwerk installable from a clean machine: `npx -y @passwerk/server` runs the MCP server,
`docker run ghcr.io/shahriarbijoy/passwerk` runs the Streamable HTTP mode, and the server is
listed in the Official MCP Registry. Nothing in this phase adds a network call or a model
call to `core` or `server`.

## 2. Delivery

One pull request on `feat/phase-7-release`. The owner's account actions (npm organisation,
repository visibility, first publish, registry login) are documented in `docs/RELEASE.md`
and happen after the merge; the workflow is idempotent so the tag can follow the manual
first publish.

| Area | Package or path |
|---|---|
| Carrier module (UID, GS1 Digital Link, QR SVG and PNG) | `packages/core/src/carrier/` |
| HTML passport sheet | `packages/core/src/emit/htmlSheet.ts` |
| SDK bundling for publication | `packages/core/src/vendor/aasCore.ts`, `packages/core/scripts/bundle-vendor.mjs` |
| `generate_carrier` tool, `html` emit target | `packages/server/src/tools/` |
| `passwerk carrier`, `emit --targets html` | `packages/cli/src/commands/` |
| Web export list gains HTML sheet and QR | `apps/web/src/workflow/exports.ts` |
| Carrier scheme notes in the knowledge base | `packages/rules/kb/carrier.json` |
| Dockerfile, compose, `.env.example` | repository root |
| Pack-and-install smoke test, Docker smoke test | `tools/release/` |
| Release workflow, registry manifest | `.github/workflows/release.yml`, `packages/server/server.json` |
| Docs | `README.md`, `docs/RELEASE.md`, `docs/install/*`, `docs/media/`, ADRs D-033 and D-034 |

Dependency direction is unchanged: `rules`, `core`, `server`, `cli`; `web` depends on `core`
only.

## 3. Carrier module (`@passwerk/core`)

Browser-safe (ADR D-006): no `node:*` import, no filesystem, no wall clock.

### 3.1 Unique identifier

The passport's unique identifier is `draft.meta.passportId`. The carrier accepts it only as an
absolute `https` URI, the rule PW-PLAUS-008 already enforces on the attribute. No new rule id
is created; a bad identifier is a typed input error (`CarrierInputError`, DE/EN message), not a
finding.

### 3.2 GS1 Digital Link builder

`buildGs1DigitalLink(input)` with

```ts
type Gs1Input =
  | { resolverBase: string; gtin: string; serial: string }
  | { resolverBase: string; giai: string };
```

- `resolverBase` must be an absolute `https` URI without query or fragment; a trailing slash
  is stripped.
- `gtin`: 8, 12, 13 or 14 digits; left-padded with zeros to 14; the mod-10 check digit is
  verified and a wrong digit is an input error. `gtinCheckDigit(digits)` is exported and
  property-tested (appending the computed digit always validates; changing any digit never
  does).
- `serial`: 1 to 20 characters; `giai`: 1 to 30 characters. Both are percent-encoded with
  `encodeURIComponent` in the path. The character-set and length limits are transcribed from
  the build plan and the GS1 General Specifications as remembered by the author, so they carry
  `verify: true` in the knowledge base (section 3.5).
- Output: `https://{resolverBase}/01/{gtin14}/21/{serial}` or `https://{resolverBase}/8004/{giai}`.

### 3.3 QR code

- Matrix: `qrcode-generator` 2.0.4 (pure JavaScript, zero dependencies, released 2025-08-07).
  Error-correction level `M`, automatic version, byte mode, UTF-8.
- `renderQrSvg(matrix, { moduleSize = 4, margin = 4 })`: one `<path>` per row run, black on
  white, `shape-rendering="crispEdges"`, `viewBox` in module units, no XML prologue variance.
- `renderQrPng(matrix, { moduleSize = 8, margin = 4 })`: an in-house PNG encoder (8-bit
  greyscale, filter type 0 on every scanline, `zlibSync` from `fflate` at a fixed level, CRC-32
  and Adler-32 in-house). Byte-identical across runs and platforms.

### 3.4 `generateCarrier`

```ts
interface CarrierInput {
  draft?: unknown;          // a PassportDraft (validated by L1 structure only)
  uid?: string;             // alternative to draft
  gs1?: { gtin: string; serial: string } | { giai: string };
  resolverBase?: string;    // required when gs1 is given
  format?: 'svg' | 'png';   // default 'svg'
}
interface CarrierResult {
  uid: string;
  digitalLink?: string;
  payload: string;          // digitalLink ?? uid; what the QR encodes
  format: 'svg' | 'png';
  image: Uint8Array;        // SVG bytes (UTF-8) or PNG bytes
  mediaType: 'image/svg+xml' | 'image/png';
  isNotLegalAdvice: true;
  sources: string[];        // the carrier scheme ids from kb/carrier.json
}
```

Exactly one of `draft` and `uid` must be given. When both `draft` and `gs1` are given and the
draft's identifier differs from the Digital Link, the result still encodes the Digital Link and
`uid` reports the draft's identifier; the caller sees both and decides. The function is pure.

### 3.5 Knowledge base

`packages/rules/kb/carrier.json` describes the two schemes (`gs1-digital-link-gtin-serial`,
`gs1-digital-link-giai`) with `name`, `pattern`, `explanation` and `whoTypicallyHasIt` in DE and
EN, `standard` (a name only: "GS1 Digital Link URI syntax", "ISO/IEC 15459"), `verify: true`
and `lastVerified`. `@passwerk/rules` exports `carrierSchemes` and `getCarrierScheme(id)`.
`pnpm review-sheet` renders them in a "Carrier schemes" section of `docs/KB_REVIEW.md`, and
`PROVENANCE.md` states that no GS1 or ISO artefact is bundled and the syntax is unverified.

### 3.6 Tests

- Check-digit vectors computed by hand in the test file, plus the `fast-check` properties.
- Percent-encoding of a serial containing `/`, `#`, `?`, space and a non-ASCII character.
- Input errors: non-https resolver, wrong check digit, over-long serial, both `draft` and `uid`,
  neither, `gs1` without `resolverBase`.
- Round trip: the emitted PNG is decoded by `jsqr` 1.4.0 (dev dependency, independent
  decoder) and returns the payload for every golden sample and for a 300-character payload.
- SVG snapshot for one payload; PNG byte length and sha256 pinned for the same payload.
- The browser-safety test already covers the new directory.

## 4. HTML passport sheet (`@passwerk/core`)

`emitHtml(input, options)` in `emit/htmlSheet.ts`, exported from the package index.

```ts
interface HtmlOptions extends ValidateOptions { lang?: 'de' | 'en' }  // default 'en'
function emitHtml(input: unknown, options?: HtmlOptions): EmitResult<string>
```

- Fail-honest like the other emitters: builds the AAS environment, runs the full L1 to L4
  report through `assembleReport` and the gap report through `gapReport`, then renders. The
  `verdict` in the result is the report's verdict, never derived separately.
- One self-contained document: inline CSS, no JavaScript, no external `src` or `href`. The only
  outbound link is the passport identifier itself. A test rejects `<script`, `http://` and any
  `https://` other than the identifier.
- Both languages are in the file. Every text is rendered twice as sibling elements with
  `lang="de"` and `lang="en"`; two radio inputs before the sheet and CSS
  `#lang-de:checked ~ .sheet [lang="en"] { display: none }` (and the mirror) implement the
  toggle. `options.lang` decides which radio is `checked`. The print stylesheet hides the toggle.
- Sections, in order: identity header (identifier as link, category, manufacturer and model when
  present); QR code of the identifier inline as SVG; verdict and findings table (layer, rule id,
  severity, path, message); one table per IDTA part in template order (attribute label, value,
  unit, field status) listing the attributes the draft holds, composites as nested lists; open
  gaps grouped by data owner with legal references and both completeness figures; footer with
  the not-legal-advice statement, the sources of the gap report, the knowledge-base retrieval
  date and, only when `asOf` is given, the generation time.
- Values, labels and identifiers are HTML-escaped. Decimal strings are printed as they are
  stored; units come from the knowledge base.
- Deterministic: attribute order follows the knowledge base, finding order follows the report,
  no wall clock.

Tests: snapshot per golden sample in both default languages; verdict equals `validate()` for
the same options; both `lang` blocks present; the escaping test injects `<`, `&` and `"` through
a manual field; the sovereignty regex test above.

## 5. Server (`@passwerk/server`)

- `emit_passport`: target enum gains `html`; file name `${slug}.html`; the sheet's verdict
  feeds the shared verdict the same way the AAS targets do. The tool input gains an optional
  `htmlLang` (`de` | `en`, default `en`) that only the sheet uses (named apart from `lang`
  because the wrapper reserves `lang`).
- New tool `generate_carrier` (build plan section 5.1):

  input `{ draft?: DraftRef, uid?: string, gs1?, resolverBase?, format?, outDir? }`;
  output `{ uid, digitalLink?, payload, format, mediaType, image: { name, size, path? | bytes? }, isNotLegalAdvice, sources }`;
  annotations `readOnlyHint: false, idempotentHint: true, openWorldHint: false`.
  `outDir` behaves like `emit_passport` (needs the injected file system; inline base64
  otherwise); the file name is `${slug}.qr.svg` or `.png`.
- The sovereignty test gains an argument set for `generate_carrier` so the registry iteration
  stays complete; `list_capabilities` picks the tool up from the registry.
- `skills/passwerk/SKILL.md` gains step 7 (carrier after a `valid` or accepted verdict) and the
  `html` target; the prompt `build-passport-interview` mentions both.

## 6. CLI (`@passwerk/cli`)

- `emit --targets` accepts `html`.
- `passwerk carrier <draft.json> [--gtin <n> --serial <s> | --giai <g>] [--resolver-base <https://…>] [--format svg|png] --out <file> [--json] [--lang]`.
  Prints the identifier, the Digital Link when built, the payload and the written path; exit 0,
  or 3 on a usage or carrier input error, like every other usage error. `--uid <https://…>`
  replaces the draft argument.
- `skills/passwerk/references/cli.md` and the skill sync test are updated.

## 7. Web app (`apps/web`)

`buildExports` adds `${base}.html` (`emitHtml` with the app's language and clock as `asOf`) and
`${base}.qr.svg` (`generateCarrier` with the draft). The export view lists them with the
existing download button. The unit test for exports and the golden Playwright track assert the
two new files exist and that the HTML verdict equals the app's derived verdict. No new screen;
the project screen, QR preview panel and bring-your-own-key stay in the rest of Phase 7a.

## 8. Publishable build

### 8.1 The AAS SDK bundle

Consumers who install `@passwerk/core` from npm would load the AAS SDK's ESM build, whose
extensionless imports Node cannot resolve; the pnpm patch (ADR D-011) does not leave this
repository. Fix:

- `packages/core/src/vendor/aasCore.ts` is the only module in core that imports
  `@aas-core-works/aas-core3.0-typescript`; it re-exports the namespaces core uses
  (`types`, `jsonization`, `verification`, `stringification`, `common`, `constants`). Every other
  core module imports from `../vendor/aasCore.js`. A test asserts no other `src` file names the
  SDK.
- `packages/core/scripts/bundle-vendor.mjs` runs after `tsc -b` in the package's `build`
  script and replaces `dist/vendor/aasCore.js` with an `esbuild` 0.28.2 ESM bundle of that one
  module, platform `neutral`, the SDK inlined, everything else external. The `.d.ts` keeps
  referring to the SDK, which therefore stays a runtime `dependency` for its types only.
- Vitest and Vite keep resolving `src`, so tests and the web app are unaffected.

### 8.2 Package metadata

All four published packages (`rules`, `core`, `server`, `cli`) go to `0.1.0` with
`repository`, `homepage`, `bugs`, `keywords`, `publishConfig: { access: "public" }` and the
existing `files` lists. `@passwerk/server` adds `"mcpName": "io.github.shahriarbijoy/passwerk"`.
`SERVER_VERSION` and `CLI_VERSION` follow (their tests already assert equality). `@passwerk/web`,
`@passwerk/oracle` and `@passwerk/fixtures` stay private.

### 8.3 Pack-and-install smoke test

`tools/release/pack-smoke.sh` (and a PowerShell twin for local use): `pnpm release:pack` (a root
script that packs the four packages into `out/pack/`) into a temporary directory, `npm install` the four tarballs into an empty
project there, then prove

1. `npx passwerk-server --version` prints the version;
2. a stdio `initialize` plus `tools/list` through the MCP client SDK returns eleven tools;
3. `npx passwerk audit <golden ev-valid draft>` exits 0;
4. `npx passwerk carrier <golden draft> --out qr.svg` writes a file starting with `<svg`.

The CI job `pack` runs it on Ubuntu after `test`; step 2 is the proof that the SDK bundle works
outside the monorepo.

## 9. Docker and release

### 9.1 Image

Root `Dockerfile`, two stages:

1. `node:22-bookworm-slim` with `corepack`, `pnpm install --frozen-lockfile`, `pnpm build`,
   `pnpm --filter @passwerk/server --prod deploy --legacy /out`.
2. `gcr.io/distroless/nodejs22-debian12:nonroot`, `COPY --from=build /out /app`, `WORKDIR /app`,
   `ENV NODE_ENV=production PASSWERK_ROOT=/data`, `EXPOSE 3777`,
   `CMD ["dist/bin.js", "--http", "3777", "--host", "0.0.0.0"]` (the distroless entrypoint is
   `node`). OCI labels include `io.modelcontextprotocol.server.name` with the registry name and
   the `org.opencontainers.image.*` set.

`docker-compose.yml` runs the image with `env_file: .env` (`PASSWERK_AUTH_TOKEN`), publishes
`127.0.0.1:3777:3777`, mounts `./documents:/data:ro` and has a healthcheck that runs
`node -e` against `/healthz` (no shell in the image). `.env.example` documents the token.
`docs/install/http.md` gains the Docker section and states again that HTTP mode is a
convenience mode, never offline.

### 9.2 CI

`ci.yml` gains two jobs after `test`: `pack` (section 8.3) and `docker` (build the amd64 image
without pushing, start it with a token, `tools/release/docker-smoke.sh` checks `/healthz` and a
bearer-authenticated `initialize` plus `tools/list`).

### 9.3 Release workflow

`release.yml` on tags `v*`, permissions `contents: write`, `packages: write`, `id-token: write`:

1. Check the tag equals the version in the four `package.json` files; fail otherwise.
2. `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`.
3. For each package in order `rules`, `core`, `server`, `cli`: skip when `npm view
   <name>@<version>` already exists (so the manual first publish and the tag do not collide);
   otherwise `npm publish <tarball> --access public` from a `pnpm pack` tarball, with npm
   trusted publishing (OIDC, npm CLI 11.5.1 or later, provenance automatic).
4. Build and push `ghcr.io/shahriarbijoy/passwerk:<version>` and `:latest` for
   `linux/amd64,linux/arm64` with `docker/build-push-action`.
5. Publish `packages/server/server.json` to the registry: download the `mcp-publisher` release
   binary as the registry's GitHub Actions guide shows, `login github-oidc`, `publish`.
6. Create the GitHub release with generated notes and attach the four tarballs.

`packages/server/server.json` follows schema `2025-12-11`: name
`io.github.shahriarbijoy/passwerk`, one npm package (`@passwerk/server`, transport `stdio`,
`environmentVariables` `PASSWERK_ROOT` optional and `PASSWERK_LOG_LEVEL` optional), the
repository and website URLs. The version is rewritten from the tag by the workflow. A test
asserts that `mcpName`, the manifest name and the manifest package identifier agree, and that
the manifest version equals the package version.

### 9.4 Owner checklist (`docs/RELEASE.md`)

1. Create the npm organisation `passwerk` (the scope is unclaimed as of 2026-09-06).
2. Make the repository public (README badges, registry `repository.url`, GHCR pulls).
3. First publish by hand: `pnpm build`, `pnpm release:pack`, `npm publish --access public` for
   the four tarballs in dependency order.
4. On npmjs.com, add a trusted publisher to each package: repository `ShahriarBijoy/passwerk`,
   workflow `release.yml`.
5. `git tag v0.1.0 && git push --tags`; the workflow skips the already-published tarballs and
   does the image, the registry and the GitHub release.
6. Verify from a machine without the repository: `npx -y @passwerk/server --version`, the
   registry search URL, `docker run` with a token and `curl /healthz`.

## 10. Documentation, ADRs, demo

- README: quick start via `npx -y @passwerk/server` and the host snippets, Docker section, the
  carrier and HTML sheet in the feature list, status paragraph, and the GIF at
  `docs/media/passwerk-web.gif`.
- `docs/install/*`: primary snippets use `npx -y @passwerk/server`; "from source" keeps the
  `node packages/server/dist/bin.js` form.
- `docs/BUILD_PLAN.md` section 7 and `AGENTS.md` status record Phase 7 as done and name the
  remaining Phase 7a items.
- ADR D-033: carrier and HTML conventions (identifier rule reuse, QR payload precedence, PNG
  encoder in-house, HTML language toggle without JavaScript, GS1 syntax marked `verify`).
- ADR D-034: release choices (SDK bundled into one vendor module, version policy `0.1.0` for
  the four packages, `pnpm pack` plus `npm publish` with trusted publishing, idempotent
  workflow, distroless non-root image, GitHub OIDC registry login, private repository made
  public at release).
- GIF: recorded from the built web app in Chrome (upload the five Musterwerk fixtures, accept
  proposals, gaps, export) after everything else passes; under 5 MB; committed with the PR.

## 11. Departures from the build plan

| Plan | This design | Reason |
|---|---|---|
| `site/` static docs | not built | Replaced by `apps/web` (ADR D-006). |
| `qrcode` package | `qrcode-generator` plus in-house renderers | `qrcode` depends on `pngjs` and `yargs`; core must stay browser-safe and dependency-light. |
| `generate_carrier` input `draft \| uid` with `gs1` object | same, plus `resolverBase` required when `gs1` is given | The plan lists `resolverBase?` as optional; a Digital Link has no meaning without one. |
| Publish with the monorepo's patched SDK | bundle the SDK into core | The pnpm patch does not reach consumers. |
| HTML sheet "template literal, inline CSS" | same, both languages in one file | Owner's choice. |

## 12. Definition of done

- `pnpm check` green; oracle parity unchanged at 16/16; Playwright green with the two new
  export files.
- CI `pack` job proves `npx passwerk-server --version`, `tools/list` with eleven tools, `audit`
  and `carrier` from the tarballs on a clean project.
- CI `docker` job proves `/healthz` and an authenticated `tools/list` against the image.
- `release.yml` dry-run reviewed; `docs/RELEASE.md` lists the owner steps; after the owner runs
  them, `npx -y @passwerk/server` works from a clean machine and the registry entry is live.
- Two ADRs, status updates, README with GIF.
