# Architecture Decision Records

One entry per non-obvious choice. Newest at the bottom. Status is `accepted` unless noted.
Format: context, decision, consequences. Keep each under about 15 lines.

## D-001: Deliver as MCP server + agent skill + CLI + library (2026-09-03)

**Context.** The product must work inside whichever coding agent a supplier already uses
(Claude Code, Codex CLI, OpenCode, Cursor, Claude Desktop) and also in scripts and CI.

**Decision.** The MCP server is the primary interface. Around it: an Agent Skill
(`skills/passwerk/SKILL.md`) that teaches the workflow, a no-LLM CLI with exit codes,
and the plain `@passwerk/core` library for anyone building their own agent or UI.

**Consequences.** One core, several thin surfaces. All product logic lives in `core`;
`server` and `cli` are adapters and must contain no domain rules.

## D-002: The LLM lives in the host agent, never in the server (2026-09-03)

**Context.** Semantic mapping (deciding that the Excel column `Kobalt rec. %` is
`recycledContentCobalt`) needs a model. Putting one inside the server would require API
keys, break offline operation and tie the project to one vendor.

**Decision.** `core` and `server` make zero LLM calls. They provide deterministic extraction,
the target schema with synonyms, confidence-scored candidate mappings, and a validator that
says exactly what is still wrong. The host agent does the semantic step. The only places a
model key may appear are the optional `passwerk chat` demo command in `cli` and the optional
bring-your-own-key mode of the web app (D-006).

**Consequences.** Sovereign (no keys, no network), agent-agnostic, unit-testable. The
`sovereignty.test.ts` gate enforces this from Phase 3 on.

## D-003: Zod 4 (2026-09-03)

**Context.** The build plan said Zod 3. Zod 4 is current and the MCP TypeScript SDK supports it.

**Decision.** Use Zod 4 everywhere. Tool input schemas derive from the same Zod objects as
runtime validation.

**Consequences.** Slightly different API surface from Zod 3 docs. JSON Schema conversion is
built in (`z.toJSONSchema`), so no `zod-to-json-schema` dependency.

## D-004: Plain pnpm workspaces + `tsc -b`, no Turborepo, TypeScript 5.x (2026-09-03)

**Context.** Four small packages with a linear dependency graph (rules, then core, then
server and cli).

**Decision.** pnpm workspaces with TypeScript project references (`tsc -b` at the root) for
builds, a single root Vitest config that aliases `@passwerk/*` to `src/`, and Biome for lint
and format. Pin TypeScript 5.9.x. The 7.x native-port line stays out until its tooling
(project references, declaration emit, editor support) is proven.

**Consequences.** No task-runner config to maintain. Revisit if builds exceed about 30 s.
Dependency versions must also respect the owner's pnpm `minimumReleaseAge` of 3 days.

## D-005: Full scope, all 7 IDTA 02035 submodels, built as a vertical slice first (2026-09-03)

**Context.** The build plan fenced v1.0 to three MVP submodels (Nameplate, Material
Composition, Carbon Footprint). The owner wants the complete passport.

**Decision.** Target all seven submodels for v1.0. Design the knowledge base, the
`PassportDraft` model and the template-diff engine for seven from day one, and pin all seven
official templates in Phase 1. Implement the pipeline end to end on the three MVP submodels
first so the oracle CI gate exists early (Phase 3), then fill in Handover Documentation,
Technical Data, Product Condition and Circularity before Phase 6.

**Consequences.** Phases 1, 2 and 5 grow. The attribute KB is about 90 entries, not 35.
Nothing in the architecture changes.

## D-006: A client-side web app is a first-class delivery surface (2026-09-03)

**Context.** Suppliers without a coding agent need a UI: drop files, review mappings, see the
gap report, preview the passport and the QR code.

**Decision.** Add `apps/web`: a static, fully client-side app bundling `@passwerk/core`.
Ingest, extract, mapping suggestions, validation, gap report, AAS/AASX emit and QR preview
all run in the browser. Semantic mapping is done either manually (a UI driven by core's
deterministic suggestions) or through an optional bring-your-own-key model call made
directly from the browser. No backend, no telemetry.

**Consequences.** `core` must stay browser-safe: no `node:fs` at module top level, file
input as bytes, filesystem access only behind an injected adapter used by `cli` and
`server`. Replaces the "browser demo in `site/`" item and gets its own build phase (7a).

## D-007: The build plan is committed, the market research stays local (2026-09-03)

**Decision.** `docs/BUILD_PLAN.md` is versioned so every agent session and contributor reads
the same source of truth. `docs/research-passwerk.md` contains personal career context and
stays in `.gitignore`.

## D-008: Knowledge base grain and source of truth per field (2026-09-03)

**Context.** Three official sources describe the passport content at different grains: the
Commission's 71 data points (legal applicability per category, v2.0 guidance of 15 August 2026),
the 93 DIN DKE SPEC 99100 attributes (Battery Pass longlist v1.2), and 211 elements across the
seven IDTA 02035 templates (semanticIds, cardinalities, value types).

**Decision.** The attribute knowledge base uses the **DIN grain (93 attributes)** because the
IDTA templates are built to it. Each attribute is authored once (DE/EN names, synonyms,
who-has-it, explanation) and *references* the other two sources: `ecDataPoints` (the first entry
is primary and decides applicability) and `templatePaths` into the generated catalogue. Legal
references, applicability, semanticIds, cardinalities and units are never typed by hand; they
are joined at runtime. Attributes that exist in DIN but not in the Commission matrix carry an
explicit `applicabilityOverride` and `verify: true`. Applicability has five states; the
Commission's "not to be filled/displayed as of February 2027" becomes `not_yet_applicable` and
must not be reported as a gap.

**Consequences.** `test/attributes.test.ts` enforces full coverage of the 93 rows and of the
Commission data points (except the three that have no attribute: 16 and 25 are repetitions, 44
is a document). Domain experts review JSON, not code. A template update changes the generated
catalogue and is caught by the parity test.

## D-009: Generated data is committed and re-derived in CI (2026-09-03)

**Decision.** `kb/generated/*.json` and `PROVENANCE.md` are committed for reviewability, and a
test rebuilds them from the bundled artefacts in-process and asserts byte equality. The
generators (`scripts/lib/*.ts`) are pure functions with no I/O so the tests can call them
directly. Dev-only scripts may use Node APIs; `src/` may not.

## D-010: Attribute-keyed PassportDraft on the knowledge-base grain (2026-09-03)

**Context.** The build plan sketched hand-typed nested objects per submodel. The knowledge
base (D-008) already defines 93 attributes with value kinds and template paths.

**Decision.** `PassportDraft = { meta, attributes: { [attributeId]: Field } }`. Value shapes
come from the attribute's `valueKind`; composite attributes get explicit Zod shapes in
`model/composites.ts`. Quantities are decimal strings (decimal.js), never JS numbers.
AAS identifiers derive from `meta.passportId`: shell `${id}/aas`, asset `${id}`, submodel
`${id}/submodels/${templateIdShort}`, all overridable through `EmitOptions.ids`.

**Consequences.** All seven submodels are modelled from day one; emitters and L3 cover
three in Phase 2. Gap report, mapping and the KB address the same ids. The literal id union
is not expressible in TypeScript because ids come from data; `AttributeIdSchema` checks at
runtime.

## D-011: aas-core3.0-typescript as the AAS engine, JSON inside the AASX (2026-09-03)

**Context.** The SDK verifies the metamodel and serialises JSON but has no XML serialiser.
The official IDTA packages carry XML. The official test engine dispatches AASX parts by file
extension and accepts `.json` parts.

**Decision.** AASX packages carry the canonical JSON as `aasx/passwerk/passwerk.aas.json`.
The SDK's ESM build has extensionless relative imports that plain Node cannot resolve; a
committed pnpm patch (`patches/`) adds the `.js` extensions. Instances never set `idShort`
on direct children of a `SubmodelElementList` (AASd-120); the templates do, because they
are templates. L3 does not cap the number of list items from the item template's cardinality,
because the IDTA templates qualify list items inconsistently ("One" on
`3/.../LifeCyclePhase`, "OneToMany" on `1/Markings/Markings__00__`).

**Consequences.** One serialiser, byte-stable output, oracle-checkable in Phase 3. An XML
part can be added later behind the same `emitAasx` if a consumer requires it, which needs
an XML serialiser verified against the AAS XSD. The nameplate's `AddressInformation` is a
drop-in whose children (ZVEI Contact Information) are not bundled; they are emitted by
idShort without semanticId until that template is pinned.

## D-012: Oracle parity is L2 parity; the Python oracle is pinned through uv (2026-09-03)

**Context.** `aas-test-engines` 1.0.3 checks the AAS 3.0 metamodel and its constraints and
knows two ZVEI templates, none of the IDTA 02035 battery templates. It cannot see passwerk's
L1 (draft rules) or L3 (template diff). The report must be committed and CI-verified, but a
dated report is never byte-identical across runs.

**Decision.** Parity per emitted file is `oracle.ok == (L2 errors == 0)`; a CRITICAL or
missing oracle result never counts. All six golden samples, valid and broken, in both JSON
and AASX, form the set (12 files), so agreement is proven in both directions. `tools/oracle`
is a private workspace package: tsx emits the files with passwerk's verdicts, `oracle.py`
(pinned `aas-test-engines==1.0.3` via `pyproject.toml` and `uv.lock`) runs the oracle and
renders `docs/CONFORMANCE.md` and a shields.io endpoint `docs/conformance-badge.json`. CI
regenerates both and fails on any difference except the `Generated:` line. The hand-kept
"Manual oracle runs" section survives regeneration.

**Consequences.** The README badge is backed by a file CI verifies on every run. The oracle
runs on Linux in CI only; `pnpm test` does not need Python. When `aas-test-engines` learns
the IDTA 02035 templates, parity can be widened to L3 in one place (`buildExpected`).

## D-013: Sovereignty is proven twice: socket-level guards in-process, Docker offline in CI (2026-09-03)

**Decision.** `packages/core/test/sovereignty.test.ts` patches `net.Socket.prototype.connect`,
the `dns` resolvers, `tls.connect`, `http`/`https` request and get, and `globalThis.fetch`
to record and throw, then dynamically imports `rules` and `core` and exercises every public
accessor and entry point over every golden sample. A self-check asserts the guards bite.
CI additionally builds `tools/sovereignty/Dockerfile` and runs `pnpm test` with
`--network none`, which catches anything the guards cannot (child processes, native code).

**Consequences.** Fast, cross-platform evidence on every `pnpm test`; a hard proof on every
CI run. Phase 6 extends the exercised surface to every MCP tool, resource and prompt.

## D-014: Handover Documentation (IDTA 02035-2) waits for ingest (2026-09-04)

**Context.** No knowledge-base attribute maps into part 2: the Commission's document data
point has no DIN attribute (D-008), and every document-kind attribute already lands in a
`DocumentIdentifier` list of parts 1, 3, 5 or 7. Part 2 additionally requires a VDI 2770
classification (class id, name, system), a language list and digital files per document.

**Decision.** Defer the part 2 emitter to Phase 4, when ingest produces real files with
names, languages and content types. Parts 4, 5 and 7 are emitted now. Nothing in the
architecture changes; the catalogue already carries the part 2 template.

**Consequences.** Six of seven submodels are emitted after Phase 3b. Filling part 2 will need
either VDI 2770 class ids from a verified source or an explicit per-document classification
supplied by the user; both are marked `verify` until then.

## D-015: Conventions for the part 4, 5 and 7 emitters (2026-09-04)

**Decision.**
- `Field.recordedAt` (ISO date-time) is the measurement time of a value. Part 5 `LastUpdate`
  elements use it and fall back to `meta.createdAt`, the passport assembly time, when absent.
  The fallback keeps the file template-conformant (the element is cardinality `One`) but is
  not a measurement; since Phase 5, `PW-PLAUS-011` (severity `error`) fires on every dynamic
  value without a `recordedAt`, so a passport that relies on the fallback can never reach
  `valid`. The emitter keeps L2/L3 honest; L4 keeps the verdict honest.
- Template properties typed `xs:integer` or `xs:unsignedInt` receive the integral lexical form
  when the decimal string is whole (`"95.0"` to `"95"`); a fractional value passes through and
  fails L2 honestly.
- `GeneralInformation/BatteryCategory` uses the strings the part 4 template documents
  (`ev`, `lmt`, `industrial`, `stationary`), derived from the `batteryCategory` attribute or
  `meta.category`.
- `deepDischargeEvents` and `overchargeEvents` share the untyped `NegativeEvent` path; each
  becomes one event whose value is the KB attribute's English name followed by the count.
  `verify`: the template gives no value format.
- The eight recycled-content shares fold into one `RecycledContent` entry per Article 8
  material (`Cobalt`, `Lithium`, `Nickel`, `Lead`) with pre- and post-consumer shares.
- The part 7 template types the supplier address fields as MultiLanguageProperty; they are
  emitted in the first language of the supplier's name.
- Structural lists whose items are `ZeroToMany` (`InformationOnAccidents`,
  `SparePartSources`) are emitted empty whenever their submodel is; every other mandatory
  block is emitted only when its attribute is present, so L3 names the exact gap.

**Consequences.** All three emitters stay data-driven through catalogue paths; no semanticId
or idShort is typed by hand. The oracle set grows to 14 files.

## D-016: Ingest takes bytes; PDF through pdfjs-dist, OOXML through fflate and fast-xml-parser (2026-09-04)

**Context.** Core must run in the browser (D-006) and offline (D-013). SheetJS is unmaintained
on npm, exceljs needs Node streams, and every OCR engine ships models or fetches them.

**Decision.** `ingest(files, options?)` takes `{ name, bytes }` only; `cli` and `server` read
paths. PDF text and glyph positions come from the pdfjs-dist legacy build, loaded lazily,
with `verbosity: 0`, `disableFontFace: true`, `useSystemFonts: false` and `useWorkerFetch:
false`; no cMap, standard-font or wasm URL is set, so pdfjs's binary-data factory throws
before any transport is attempted. (`isEvalSupported` no longer exists in pdfjs-dist 6.x.)
Lines and tables are reconstructed from glyph positions. XLSX and DOCX are read by hand from
the OOXML parts with fflate and fast-xml-parser. CSV sniffs `;`, `,` and tab and falls back to
windows-1252. A page without a text layer is reported as `textless`; there is no OCR. Outside
Node, pdfjs also needs `GlobalWorkerOptions.workerSrc`; `readPdf(file, { pdf: { workerSrc } })`
and `ingest(files, { pdf: { workerSrc } })` set it when given, Node ignores it, and a browser
caller must supply it (Phase 7a).

**Consequences.** One dependency of a few megabytes (pdfjs) and one small XML parser; no
native modules. Provenance is exact: sheet cell, table cell or line number per fact.
Scanned PDFs surface as textless pages the host agent must handle.

## D-017: Part 2 documents need an explicit VDI 2770 classification (2026-09-04)

**Context.** IDTA 02035-2 requires a class id, name and system per document. No bundled
artefact carries the VDI 2770 class table, and inventing ids is forbidden.

**Decision.** `DocumentRef.classification` is supplied by the user or host agent. Only
classified documents are emitted into Handover Documentation; the others raise the L1
warning `PW-L1-DOCUMENT-UNCLASSIFIED` so the gap stays visible. Golden samples use the
example classification the template itself documents (`02-04`, `Certificates, declarations`,
`VDI2770:2020`) and say so. `documentRefFromIngest` seeds id, title, language, file name
and content type from ingest; `DocumentDomainId` defaults to the passport id.

**Consequences.** Seven of seven submodels are emitted. A verified VDI 2770 table can be
bundled later as data with default classes per document attribute without changing code.

## D-018: Node 22.13 is the floor (2026-09-04)

**Context.** pdfjs-dist 6.x declares `engines: node >=22.13.0 || >=24` and uses
`Promise.withResolvers`, which Node 20 lacks; the Phase 4 CI run failed on every Node 20
job. Node 20 reached end of life on 30 April 2026.

**Decision.** Every package declares `engines.node >=22.13`, `.nvmrc` stays at 22, and CI
tests Node 22 and 24 on Linux, macOS and Windows. No polyfill is added to `core`.

**Consequences.** The build plan's "Node 20 & 22" portability row becomes "22 & 24".
Browsers older than the `Promise.withResolvers` baseline (Chrome 119, Safari 17.4,
Firefox 121) cannot run the PDF reader; the Phase 7a web app states that requirement.

## D-019: The web app is the product; MCP is the AI interface; an MCP App joins the surfaces (2026-09-04)

**Context.** D-001 named the MCP server the primary interface. The buyer (a Tier-2 quality
or compliance manager) does not operate a terminal, and D-006 already added a client-side
web app for them. Since January 2026 the MCP Apps extension (`io.modelcontextprotocol/ui`)
lets a server ship a `ui://` HTML resource that Claude web, Claude Desktop, ChatGPT, Cursor
and VS Code render inside the chat; Claude Code and Codex CLI do not render it. The
extension has no file-attachment method, and ChatGPT's `window.openai` upload APIs are not
portable. Local one-click packaging exists for Claude Desktop (MCPB, stdio, offline) and for
ChatGPT and Codex (`.codex-plugin/plugin.json` bundling a skills directory and a stdio server).

**Decision.** Surface hierarchy: `apps/web` is the product for suppliers; the MCP server plus
skill is the AI interface for consultants and agent users; the CLI is the automation
interface; `core` is the foundation. A **passwerk MCP App** is added as a surface: the same
review, gap-report and export views as the web app, wrapped in an iframe shell that talks to
the host over the MCP Apps bridge. Files enter through a plain file input inside the iframe
and are passed to the server as inline bytes, or are ingested by `core` inside the iframe
itself so documents never leave the browser. Build order: Phase 6 (server, skill, CLI),
Phase 7 (carrier, HTML sheet, release), Phase 7a (web app), Phase 7b (MCP App reusing the
web app components), Phase 7c (MCPB, Codex plugin, connector submission checklist). Core's
input type stays `{ name, bytes }` (D-016); path resolution stays in the adapters.

**Consequences.** Build plan §2.5, §5 and §7 are amended. The server gains a session store
keyed by bundle or draft id so the app and the model see the same state. Two facts must be
verified in Phase 7b before they are relied on: that Claude's iframe sandbox permits file
inputs, and the host's message size limit for inline bytes. Directory listing on Claude
requires a Team or Enterprise organisation, Streamable HTTP, production hosting and a privacy
policy; the hosted connector is described as a convenience mode, never as offline.

## D-020: L4 is a full verdict layer; rules are data, checks are a keyed code registry (2026-09-04)

**Context.** `kb/rules.json` holds 24 `PW-PLAUS` rules as reviewable data (severity, DE/EN
title, message, fix hint, attribute list, legal reference). The arithmetic they describe
ranges from mass sums to tolerance comparisons to date maths, which no practical JSON
predicate language expresses without becoming a programming language in disguise.

**Decision.** `validate()` runs L1 to L4 and a `PW-PLAUS` rule of severity `error` makes the
verdict `invalid`, exactly as L1 to L3 do. Rules stay data; the checks live in
`CHECKS: Record<string, RuleCheck>` keyed by rule id, and a manifest test asserts the two key
sets are 1:1 in both directions. Messages interpolate the named placeholders the rule
authored (`{min}`, `{value}`, ...). L4 receives L1's findings and its context hides every
attribute L1 rejected, so a bad value is reported once, by the layer that owns it. A check
skips silently when an attribute it needs is absent: L4 never reports a missing value.

**Consequences.** A domain expert reviews JSON and never reads TypeScript to judge a rule's
wording, severity or legal grounding. Adding a rule is two edits that the manifest test
forces to stay in step. Oracle parity is unaffected: it is defined as L2 parity (D-012), and
`expected.ts` reads L1 to L3 only. `ValidationReport.layers` gains an `L4` key, which every
consumer of the type sees at compile time.

## D-021: The knowledge-base `range` is the single source for numeric bands (2026-09-04)

**Context.** `model/values.ts` mapped `valueKind: 'percentage'` to a hardcoded 0-100 band.
Three attributes are authored wider in the knowledge base and were therefore unrepresentable:
`evolutionOfSelfDischarge` (-100 to 1000), `internalResistanceIncrease` (0 to 1000) and
`carbonFootprintShareEndOfLife` (-100 to 100). A battery whose internal resistance had risen
150 % could not be modelled at all; L1 rejected it as a value-type error.

**Decision.** `valueSchemaFor` takes the resolved `Attribute`, not the bare `ValueKind`, and
derives the band for `percentage`, `decimal` and `integer` from `attribute.range`
(`percentage` with `range: null` keeps 0-100). L1 remains the one enforcement point for
bands, so nothing outside a reviewed band reaches the emitted AAS file, and no `PW-PLAUS`
rule restates the check. `valueSchemaForKind` stays for callers that hold only a kind, and
`PercentString` stays for the per-field composite shapes, which are not attribute-keyed.

**Consequences.** Widening or narrowing a band is a knowledge-base edit reviewed by a domain
expert, not a code change. The three attributes above become usable. L4's rules are left to
do what a per-field schema cannot: reason about relationships between values.

## D-022: `checkObligations` answers "no passport needed", and cites only Article 77(1) (2026-09-04)

**Context.** The unserved buyer's first question is whether the Regulation applies to their
battery at all. A tool that only accepts the three passport categories has assumed the answer.
Answering "no" for a portable or SLI battery means naming battery types the knowledge base
does not define: `kb/` holds the Commission's data points and the DIN longlist, not the
Article 3 definitions, and this project does not guess legal references.

**Decision.** The input vocabulary is `EV`, `LMT`, `INDUSTRIAL`,
`STATIONARY_BATTERY_ENERGY_STORAGE`, `PORTABLE`, `SLI`, `OTHER`, plus energy in kWh, the date
placed on the market, the operator role and an injected `asOf`. Every claim cites
`BR Article 77(1), Annex XIII`, read from the `battery-passport` event in `timeline.json`;
no Article 3 point numbers are cited. Type and role labels are DE/EN engine text, not quoted
law. The verdict is `required`, `not_required` or `insufficient_input` with `missingInput[]`,
never a boolean that has to guess when the capacity or the date is unknown. Stationary storage
maps onto the `INDUSTRIAL_GT_2KWH` attribute set with an explicit note.

**Consequences.** The tool can decline to answer, which is the honest outcome when a supplier
does not yet know the pack energy. Adding precise per-type citations later is a knowledge-base
addition (`kb/battery-types.json`) that changes no code path.

## D-023: Where the IDTA template and the Commission guidance disagree, the template wins the file and the guidance wins the advice (2026-09-04)

**Context.** The Commission's v2.0 guidance marks state-of-health data points 62-65 "not to
be filled/displayed" for EV batteries (61, state of certified energy, stays mandatory). A
template could in principle force one of these onto a supplier anyway: IDTA 02035-5 declares
`StateOfCharge` with cardinality `One`, so if the guidance ever excluded it for a category the
supplier would have no choice. As first drafted, this ADR claimed exactly that conflict for
`RemainingCapacity`, `RemainingPowerCapability`, `RemainingRoundTripEnergyEfficiency` and
`EvolutionOfSelfDischarge`. That was a misreading: those four *blocks* are `ZeroToOne` in
IDTA 02035-5 V1.0.2; only the properties inside them (`…Value`, `LastUpdate`) are `One`,
which is mandatory relative to the block, not to the submodel. Checked across all 93
attributes and three categories, **no** not-displayed data point sits in a template element
the supplier is forced to emit. Separately, PW-PLAUS-013 was authored to fire on a *missing*
deferred attribute, which would have emitted a dozen warnings on every draft and made
`valid` unreachable.

**Decision.** PW-PLAUS-012 stays silent for an attribute whose template element is forced —
where forced means every collection from the submodel root down to the leaf is mandatory
(`templatePathIsForced`), not merely the leaf — and keeps its teeth wherever the supplier can
leave the block out. Today that guard has no live case; it exists so that a future template or
guidance revision that does create a conflict resolves the same way: the emitted file follows
the template (L3 stays authoritative for conformance), the advice follows the guidance.
PW-PLAUS-013 is removed from `kb/rules.json`; reassurance that a deferred data point is not a
gap belongs to the gap report's `deferred` bucket, not to a validation finding. The catalogue
holds 24 rules.

**Consequences.** `ev-valid` no longer fills the four EV state-of-health blocks (they were
fictional values for data points the Commission says not to display); the part 5 emitter tests
carry them as a test-only fixture instead. There is nothing to raise with IDTA on this point.
L4 never reports a missing value, which keeps the layer boundary with the gap report clean.

## D-024: Hardening and a minimal web workflow come before the MCP server (2026-09-05)

**Context.** A post-Phase-5 review of `main` (issues #9 to #15) reproduced five P1 defects in
the mapping and verdict layers: label units are canonicalised without their factor (#9), a
composite `path` can reach `Object.prototype` (#10), a field in `conflict` still validates and
exports `valid` (#11), the emitters compute their verdict from L1 to L3 while `validate` runs
L4 (#12), and two documents that disagree on the same composite leaf silently pick the last
value (#13). Two P2 findings follow: proposals ignore the knowledge-base `range` that D-021
made authoritative (#14), and the XLSX reader expands a sparse sheet into a dense grid with no
size bound (#15). Phase 6 would have exposed every one of these to agents over stdio and HTTP.
Separately, the recall gate (32/34 on the Musterwerk fixtures) is measured on documents written
by the same hands that wrote the synonym index, and the README described 16/16 L2 oracle parity
as proven conformance.

**Decision.** Phase 6 does not start until the P1 findings are closed. The build order after
Phase 5 becomes: **Phase 5b** (hardening: three small fix PRs for #9/#10/#13/#14, #11/#12 and
#15; a held-out evaluation on public supplier datasheets that reports precision at confidence
>= 0.7, recall and correction effort next to the existing recall gate; a review sheet of every
`verify: true` knowledge-base entry for a domain expert), then **Phase 7a** as a minimal web
workflow (upload, review mappings, inspect gaps, export) so the primary product (D-019) is
tested on real documents before any installation surface is built, then Phase 6 (MCP server,
skill, CLI), Phase 7 (carrier, HTML sheet, release), Phase 7b (MCP App) and Phase 7c
(packaging). The conformance badge and README name what CI proves: L2 verdict parity with
`aas-test-engines` on the golden set, including the broken samples both sides reject. It is
not certification of complete battery-passport compliance and is never worded as such.

**Consequences.** Build plan section 7 gains Phase 5b and records the new order; D-019's
build order is amended by this ADR. The Phase 6 definition of done (the `passwerk chat` demo
script) moves with Phase 6. #13 reverses the documented "a `path` decision never conflicts"
contract of `applyMappings`; that change is recorded next to the fix. The held-out set must be
authored without tuning the synonym index against it, or its numbers are training-set numbers
again. Oracle parity stays L2-only (D-012); #12 must not widen the comparison.

## D-025: Composite paths are validated against the shape, and a changed leaf is a conflict (2026-09-05)

**Context.** `applyMappings` accepted any `path` string, walked it with plain property access
(so `__proto__.x` wrote to `Object.prototype`, issue #10), and documented that a `path` decision
"never produces a conflict; a changed sub-field simply overwrites" (issue #13). Phase 6 makes
mapping decisions an external input over stdio and HTTP, and the Phase 7a review UI needs to
show a supplier disagreement on `manufacturerInformation.name.en` just as it shows one on a
scalar attribute.

**Decision.** Every `path` is parsed before any traversal: empty segments and the segments
`__proto__`, `prototype` and `constructor` are rejected, and the remaining segments must exist
in the composite's Zod shape (`COMPOSITE_SCHEMAS`), walking object fields, record values
(language maps) and numeric array indices. `setPath` and `getPath` touch own properties only.
The protection lives in `core`, not only in the input schema, so plain-JavaScript callers get
it too. A `path` decision now behaves like a scalar one at leaf grain: a missing leaf is filled,
an identical leaf merges provenance, a different leaf records a `MappingConflict` carrying
`path` and leaves the existing value in place, and only `override: true` replaces it. Filling a
different leaf while another leaf is in conflict keeps the field in `conflict`; an override is
the resolution and restores `present`.

**Consequences.** The `applyMappings` contract in the Phase 4 spec (6.5) is amended; the
"changed sub-field counts as applied" test was rewritten deliberately. `MappingConflict` gains
an optional `path`. Composite leaf values are still not type-checked at apply time (L1 checks
the object once complete); only the path is.

## D-026: One report assembler; export verdicts include L4; an unresolved conflict is an L1 error (2026-09-05)

**Context.** `validate` ran L1 to L4 while `emitAasJson` and `emitAasx` built their verdict
from L1 to L3 and stamped `L4: false`, so the same draft could be `invalid` when validated and
`valid` when exported (issue #12). Independently, a field whose `status` is `conflict` passed
L1 and was emitted through `presentValue`, so an unresolved supplier disagreement exported as
`valid` (issue #11). Phase 5 deliberately left the emitters untouched (D-020), which is where
the gap came from.

**Decision.** `assembleReport(l1, emitted, options)` in `validate/index.ts` is the only place a
four-layer report is built. `validate` feeds it the in-memory emission; `emitAasJson` feeds it
the JSON it returns; `emitAasx` feeds it the environment read back out of the packaged bytes.
L2 and L3 always run on the emitted output, L4 on the draft with the same injected `asOf`
(default `meta.createdAt`, so output stays deterministic), and L1's findings are carried through
so L4 keeps hiding values L1 rejected. The emitters accept `ValidateOptions` (`asOf`,
`skipPlausibility`); a structural-only export verdict is available only by asking for it, and
`report.layers.L4.ran` says so. L1 raises `PW-L1-CONFLICT-UNRESOLVED` (error, DE/EN, scoped to
the attribute) for every field in `conflict`; the value stays in the draft for review and is
still emitted fail-honestly, but no entry point can return `valid` until an explicit override
resolves it.

**Consequences.** Oracle parity is untouched: `emit-golden.ts` reads `layers.L2` and D-012 stays
L2-only. Emitted bytes do not change, only verdicts. Adapters (Phase 6) pass `asOf` once and get
one answer from every tool. The Phase 5 memory note that L4 "refuses valid when LastUpdate falls
back to createdAt" now holds for the exporters too.

## D-027: Ingestion is bounded; worksheets are read sparse (2026-09-05)

**Context.** The XLSX reader expanded every coordinate from A1 to the furthest occupied cell
into a `Cell` with its own provenance object, so one cell at Z1000 cost 26,000 objects and a
stray note far down a supplier sheet could freeze a browser tab (issue #15). `unzipSync` inflated
the whole OOXML archive, media included, before the XML parts were picked out. Phase 6 accepts
inline bytes over HTTP and Phase 7a accepts browser uploads, so the cost of one input has to be
bounded before either exists.

**Decision.** `IngestLimits` (input bytes, archive entries, inflated XML bytes, occupied cells,
compacted grid cells, row and column range) with `DEFAULT_INGEST_LIMITS` lives in
`ingest/types.ts` and is threaded through `ingest(options.limits)`, `readXlsx` and `readDocx`.
`unzipOoxml` checks the input size first, then walks the zip directory through fflate's
`filter`, which runs before each entry is inflated: entry count and the declared inflated size
of the `.xml` / `.rels` parts are bounded there, non-XML parts are never inflated, and the
actual inflated total is checked again afterwards. Exceeding a limit is
`IngestFailure('limit_exceeded', ...)`, a new `IngestErrorCode`, which `ingest` turns into the
document's structured `error` like every other failure. Worksheets are read **sparse**: only
occupied cells are materialised, rows and columns that are empty everywhere are dropped, every
cell keeps its original A1 reference and every line keeps its original row number in
provenance, and the compacted grid (occupied rows x occupied columns) is bounded by
`maxGridCells`. Out-of-range or malformed coordinates are a `corrupt` file.

**Consequences.** A table that starts at B2 now begins at index 0, which also helps the
pair-table detection in `extractFacts`. A gap cell survives only when its column is occupied
elsewhere in the sheet; the Phase 4 edge-case test was updated accordingly. The Musterwerk
fixtures have no empty rows or columns inside their used range, so their provenance and
extraction results are unchanged. Phase 7a should still parse in a worker with cancellation;
that complements the limits, it does not replace them.

## D-028: Mapping quality is measured on transcribed public datasheets; flagged KB entries get a review sheet (2026-09-05)

**Context.** D-024 asked for a held-out evaluation and for an expert review of the `verify: true`
knowledge-base entries. Redistributing manufacturers' PDFs in the repository is not acceptable,
downloading them in CI is fragile, and inventing "realistic" supplier documents would repeat the
Musterwerk problem (the same hands wrote the documents and the synonym index).

**Decision.** `tools/fixtures/src/heldout` holds label wording and values transcribed **verbatim**
from six public datasheets (an LFP cell specification, a home-storage system, a German commercial
storage datasheet, a German all-in-one home storage datasheet, a commercial-vehicle battery web
page and a retailer listing of an e-bike battery), each with URL, version and access date, and
re-typesets them with the existing writers into the layouts a Tier-2 supplier sends (CSV export,
spreadsheet, PDF, Word table, plain text). Deviations from the printed text are listed per source.
`pnpm heldout` regenerates the documents, the manifest (`packages/core/test/fixtures/heldout/
expected.json`) and `docs/EVALUATION.md`; a test fails when any of them is stale. The scorer
counts, at confidence >= 0.7, **Accept** (attribute, value and unit as expected), **Edit** (right
attribute, wrong value or unit), **Reject** (a confident proposal nobody expected) and **Manual**
(nothing proposed); recall = Accept / Expected, precision = Accept / proposals, effort = Edit +
Reject + Manual. The same scorer runs over the Musterwerk fixtures for comparison. The knowledge
base is not tuned against this set; a change made in response to it must be recorded in the
report. `pnpm review-sheet` renders `docs/KB_REVIEW.md`: every attribute with `verify: true`,
the joins the author made (DIN row, Commission data point, template element and semanticId,
legal references, applicability) and an empty decision block per entry. It contains no new
claims; decisions are recorded in the JSON and the sheet regenerated.

**Consequences.** The first run reports 15 of 35 expected mappings accepted, 2 edits, 4 rejects
and 18 manual entries (recall 42.9 %, precision 71.4 %) against 94.1 % / 100 % on Musterwerk.
The detail table names each gap (colon-less German datasheet lines, "≥ 96 %" and "bis zu 98 %"
bounds, tolerances such as "5490g±300g", `Items / Standards / Remarks` spec tables, and a
`cut-off voltage` synonym that fires for both voltage limits). Those are Phase 7a and knowledge-
base work items, to be fixed with the numbers re-run, not by editing the expectations.

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
autosaves to IndexedDB: the decisions, the extracted facts and the proposals, but never the
uploaded files; a version mismatch is reported, never migrated.
The definition of done has two tracks: the Musterwerk documents must produce in the browser
the same verdict, findings and gap items core computes in Node for the same inputs and clock,
and the eight golden samples imported as draft JSON must show core's verdicts. A browser-side
sovereignty test fails on any request that leaves the preview origin.

**Consequences.** Build plan Phase 7a's definition of done is reworded. The page reads its
clock from one module that honours `window.__passwerkClock` so Playwright and the Node oracle
agree on `asOf`. CI gains an Ubuntu Playwright job with a cached Chromium (about four billed
minutes). The project screen, extracted-facts screen, HTML sheet, QR and bring-your-own-key
mode remain for the rest of Phase 7a and Phase 7.

## D-030: The Battery Pass SAMM model is a dev-time cross-check, not a runtime source (2026-09-05)

**Context.** The Battery Pass consortium publishes its data model as SAMM aspect models
(`batterypass/BatteryPassDataModel`, CC-BY-4.0, seven Turtle files). The knowledge base was
authored from the consortium's attribute longlist at the same pinned commit; the aspect models
add, per property, a data type, unit, enumeration values and range constraints, and most
descriptions cite the DIN DKE SPEC 99100 chapter. IDTA derived its 02035 semanticIds from this
model, so property names line up. The repository calls itself a draft and ships English only.

**Decision.** Pin the newest version of each aspect model at the already-pinned commit
(1.2.0, Performance 1.2.1) and generate `kb/generated/batterypass-samm.json` from them with
`n3`. A pure cross-check joins every attribute to the SAMM properties by DIN chapter and by the
local name of its IDTA semanticId, and reports unit, data type, enumeration and range
disagreements in `docs/KB_REVIEW.md`. A `din` join, or a `name` join into a single template
element, yields a mismatch; a `name` join into one of several elements or into a composite
yields a note. The runtime never loads the SAMM index; IDTA 02035 stays the only emit target and
the authored knowledge base stays the source of truth. Built-in SAMM characteristics without a
declared data type in the file (Text, Timestamp, Boolean, ...) are not compared, so nothing is
inferred from the meta-model.

**Consequences.** Seven more bundled artefacts (31 of 38) and one more generated file that a
test keeps fresh. The review sheet gains a cross-check section and two rows per flagged entry.
Findings are review prompts: a reviewer resolves each one in the JSON, never the script. When
the consortium re-releases, `pnpm artefacts:write` and `pnpm generate` re-pin and re-derive.

## D-031: Phase 6 ships as two PRs; carrier and HTML wait for Phase 7; the CLI reuses the server's registry (2026-09-05)

**Context.** Build plan section 5 fixes the MCP contract, but two of its entries have no core
module yet (`generate_carrier`, the `html` emit target: both Phase 7), its definition of done
names a fixture set that does not exist (`./fixtures/lieferant-a/*`), and the Phase 7a slice
showed that the Musterwerk documents alone cover about a third of the mandatory data points,
so no document-only run can reach `valid`. Registering tools with placeholder handlers would
break the rule that a verdict comes only from the validators.

**Decision.** Phase 6 is delivered as two pull requests: 6.1 (`@passwerk/server`, the agent
skill, install pages, sovereignty coverage) and 6.2 (`@passwerk/cli`, the demo script).
`generate_carrier` and the `html` target are not registered until Phase 7 adds their core
modules; the emit targets are `aas-json`, `aasx` and `draft-json` (the plan's `flat-json`).
Ids are content hashes stored per connection in a bounded LRU, so re-sending the same object
yields the same id and runs stay byte-identical. Big objects cross the wire with compact
loose schemas and are validated by core inside the handler, keeping `tools/list` small. The
definition of done is measured as in Phase 7a: the tool chain on Musterwerk must reproduce
the recall gate and the gap list, and `valid` is proven on the golden drafts. The CLI depends
on the server for the tool registry (dependency order `rules`, `core`, `server`, `cli`), so
`passwerk tools` and `passwerk chat` present exactly the tools an MCP host sees; a `gaps`
command is added and `explain` is not. The HTTP mode uses plain `node:http`, binds loopback,
requires `PASSWERK_AUTH_TOKEN` and keeps one server and store per MCP session.

**Consequences.** Build plan section 5 and Phase 6 are amended by this ADR. `index.ts` of
the server imports nothing from `node:*`, so `createServer` stays usable for the Phase 7b MCP
App; file access goes through an injected adapter with an optional root. The server surface
joins the sovereignty proof through a shared network guard. The install pages mark every
host configuration key not confirmed from the host's own documentation with a verify comment.

## D-032: The CLI runs the registry handlers in-process; the gap exit code follows the `required` bucket (2026-09-06)

**Context.** Phase 6.2 delivers `@passwerk/cli` (ADR D-031). The spec fixes the commands and
exit codes and asks the CLI to present exactly the tools an MCP host sees. Two things the spec
left open surfaced while building it. First, "0 when mandatory completeness is 100 %" for
`gaps` is unreachable on every golden draft: the completeness figure counts deferred data
points that the same report calls "not a gap" (ADR D-023), and even the AAS-valid drafts keep
required Commission data points open (`operatorIdentifier`, `substanceImpacts`). Second, the
Node file system lives in the server package but is not part of its neutral `index.ts`.

**Decision.** Every command parses its input with the tool's own Zod shape and calls the
registry handler in-process (`invoke` mirrors the server's error mapping), so the CLI has no
domain code and no second opinion. `gaps` exits 0 when no `required`-bucket item is open and
1 otherwise; deferred items are counted in the summary line and left out of the to-do list.
`audit` and `emit` map the verdict to 0, 1, 2 and treat a structurally invalid draft (L1
findings) as `invalid`; `emit` stays fail-honest and writes the files. `run(argv, io)` takes
streams, file system, environment and clock by injection; `bin.ts` is the only file that reads
the process. The Node file system is exported as `@passwerk/server/node` beside the neutral
entry. `chat` reads the key from `ANTHROPIC_API_KEY` only, imports the SDK lazily, defaults to
`claude-sonnet-5`, sends the body of `SKILL.md` as its system prompt (a generated copy guarded
by a test), and is the only command that calls a model. The definition of done is met as
measured in D-031: the scripted Musterwerk chain applies at least the server's floor of
mappings and returns the gap list; the golden drafts validate `valid` through `audit` and
through the loop.

**Consequences.** `--json` output is canonical JSON, byte-identical across runs. The CLI
joins the sovereignty proof: every command runs under the network guard, `chat` with a fake
client. The demo script needs a key only for its last step. `packages/cli/src/chat/skill.ts`
must be regenerated when `SKILL.md` changes.

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
bundle on every CI run. A consumer that imports both `@passwerk/core` and
`@aas-core-works/aas-core3.0-typescript` directly gets two independent copies of the SDK's
classes (core's bundled one and the consumer's own), so `instanceof` across that boundary
fails, e.g. on `EmitResult.environment`.

## D-035: QR capacity does not determine passport exportability (2026-09-07)

**Context.** A schema-valid identifier can exceed the QR encoder's byte capacity. Invalid
drafts can also contain executable URI schemes and must remain exportable for review.

**Decision.** The HTML sheet activates only https identifier links; other identifiers remain
escaped text. QR capacity failures become `CarrierInputError` with DE/EN guidance. The sheet
prints that guidance in place of the QR without changing the validators' verdict, and the
web export keeps every document format while reporting the unavailable carrier separately.
Standalone carrier requests return the typed input error through the existing adapters.

**Consequences.** A missing QR never suppresses the passport or its gap report. GS1 keys
equal to `.` or `..` are rejected because URL normalization removes those path segments.

## D-036: Proposals are derived; project inputs and fact edits are state; the QR is a derivation (2026-09-07)

**Context.** The first web slice stored proposals as inputs, computed once at upload with the
category chosen on the start screen. The project screen makes the battery type editable and
derives the category from `checkObligations`, so stored proposals would strand the moment the
type changed. Reviewers also asked to correct extracted values before mapping (a mis-read
decimal on a datasheet), and array composites had no entry path at all (#23). The QR needs an
absolute https identifier, which the start screen could not help with. Separately, running
`checkObligations` for a battery placed on the market before 2027-02-18 returned `category:
null`: the date gate answers whether the duty has attached yet, but the passport's attribute
sets are a property of the battery type, not of the date, and a supplier preparing ahead of
the deadline still needs to know which data set applies. Returning `null` sent every pre-2027
user straight to the voluntary-category fallback.

**Decision.** State v2 keeps only inputs: `project` (battery type, role, energy, placed-on-market
date, an optional hand-picked category in `manualCategory`, the identifier in one of four modes,
`createdAt`), `importedDraft`, files, facts, `factEdits` keyed by fact id, and decisions.
Proposals, the obligations result, the passport meta, the base draft, the validation and the QR
are derived by memoised pure functions keyed on their own inputs, so a language toggle
recomputes nothing and a battery type change re-proposes. A decision whose proposal is absent
under the current category is ignored and returns with it. A fact edit is an override applied
before `suggestMappings`; the marker is looked up at render time and never written into a fact.
`checkObligations` now names the battery type's passport category (and its mandatory/conditional
attribute sets) for a pre-2027-02-18 battery too, with verdict `not_required` and the existing
"obligation starts on 2027-02-18" reason; `packages/core/test/obligations.test.ts` pins this.
The project's `category` is therefore `obligations.category ?? project.manualCategory`: a derived
category always wins, and the hand-picked one applies only when the check derives none (a truly
voluntary passport, or before the obligations result exists). Array composites are entered as
rows validated against core's composite schema before dispatch as one manual decision carrying
the whole array. The QR is a derivation of the passport identifier, shown on the project and
export screens; a non-https identifier shows core's reason (D-035 stands). A stored v1 session
is reported as not restorable, never migrated.

**Consequences.** `ingestFiles` returns summaries and facts only. `Decision.manual` gains an
optional `factId` so a value mapped from the facts screen keeps provenance, stripped when that
fact goes away. Chrome labels for core's battery types and roles live in the app dictionary;
every legal string still comes from core. Issue #23 closes. The bring-your-own-key mode ships
in its own PR with its own ADR. `setProject` never changes the step: it fires on every keystroke
of the project form (so the form can hold an in-progress edit before it is ever committed to
`state.project`), and navigation to `upload` happens only on Continue — the design spec's "step
becomes upload on the first call" line describes an earlier intent, not the built behaviour. The
QR panel on the project and export screens shows the payload URL the code carries but not the
GS1 link's parsed parts (GTIN, serial, resolver), a deliberate simplification of design spec
section 5.4.

## D-037: The MCP App is the web app in the host's iframe; the draft id is the shared state (2026-09-08)

**Context.** D-019 added a passwerk MCP App and left two facts to verify: whether the host's
iframe sandbox permits file inputs, and the host's message size limit for inline bytes. The
web app (D-029, D-036) is three layers with `views` free of the `app` layer, and the server
already stores drafts by content hash, so the same draft always has the same id.

**Decision.** `apps/mcp-app` is a single-file Vite build of the web app's `views`, `workflow`,
`i18n` and `components`, reached through the alias `@` into `apps/web/src`, plus a bridge over
`@modelcontextprotocol/ext-apps`. The web shell takes its platform hooks (download, clearing
persisted state, the pdf.js worker) as a prop, so the same `App` component runs in both. Core
runs inside the iframe: documents never leave the machine; only the derived `PassportDraft`
goes to the server, through `validate_passport`, one second after the last decision, and the
model learns the resulting draft id through `updateModelContext`. One new read-only tool,
`review_passport`, carries `_meta.ui.resourceUri`; the resource `ui://passwerk/workbench.html`
declares an empty CSP and is served through an injected loader so `server.ts` stays free of
`node:fs`. The server does not depend on the MCP Apps SDK: it writes the two literals the
specification defines and a monorepo test compares them with the SDK's constants. Exports are
built in the iframe and handed to the host's `downloadFile` when advertised; otherwise the
user is told to ask Claude for `emit_passport` with an `outDir`, which a local stdio server
can write. Claude Code and Codex CLI see `review_passport` as a text tool and are unchanged.

**Verified in CI.** The bridge is tested against the SDK's own `AppBridge` over a real
in-memory passwerk server. A dev-only host page (`apps/mcp-app/e2e/host`) does what Claude's
host does, with the workbench in an iframe sandboxed `allow-scripts allow-same-origin
allow-forms` and the MCP traffic proxied to the real server on the preview origin: the
Musterwerk documents produce in the iframe the verdict, findings and gap items core computes
in Node; every golden sample renders with core's verdict; the draft id the workbench pushes
resolves through `gap_report` in the same MCP session to the draft the screen shows; no
request leaves the preview origin. The single-file workbench is 4.69 MB (1.23 MB gzipped); the
server tarball grows to 1.29 MB.

**Measured in Claude Desktop (2026-09-08, Claude 1.49585.0, Electron 44, Windows).** The probe
(`pnpm --filter @passwerk/mcp-app probe`, served in place of the workbench) ran from the local
stdio server. The view's origin is a per-server subdomain of `claudemcpcontent.com`; the host
reports itself as `Claude 1.0.0`, platform `desktop`, `inline` display with `fullscreen`
available, 735 px wide, `maxHeight` 5000, locale `en-US`, dark theme, 12 px safe-area insets.
Capabilities: `openLinks`, `downloadFile`, `serverTools`, `serverResources`, `logging`,
`updateModelContext` (text, image), `message` (text), sandbox CSP as declared. `downloadFile`
saved the probe's text file to the Downloads folder. `callServerTool` with inline base64 of
1, 4 and 16 MB took 42, 131 and 866 ms; before the fix in `bin.ts` the 16 MB call ended the
session, because the SDK's stdio read buffer defaults to 10 MB per message. A Worker created
from the inlined `data:` URL failed (`error` event, no message); a Worker from a `blob:` URL and
a dynamic `import()` of a `data:` URL both worked, so the shell re-wraps the inlined pdf.js
worker as a Blob (`workerUrlOf`). Clipboard writes were swallowed until the resource requested
`permissions.clipboardWrite`.

**Workbench run in Claude Desktop (2026-09-08, the Phase 7b definition of done).** The five
Musterwerk documents entered through the file input (the OS picker opens), pdf.js ran in the
iframe with the Blob worker (both PDFs show their page count), 114 proposals were derived, and
the gaps screen showed 15 of 47 mandatory data points (31.9 %), the figure D-029 recorded from
core in Node. The AASX export was saved to the Downloads folder through the host. Asked "what is
the gap report for the current draft", Claude called `gap_report` on the synced id
`drf_f2fca2876baa3f01` and answered with the same 15/47 and 32 open required attributes, so the
model and the user look at one draft. That session was recorded in
`docs/screenshots/mcp-app-*.png`; the workbench redesign replaced those images with
`docs/screenshots/workbench-*.png`, so the screens above no longer look the way they did, and
the measurement stands as written.

**Consequences.** Twelve tools. The server tarball and the Docker image carry the workbench
(`ui/`). CI builds it, runs the Playwright host page, and the pack and docker smokes read the
resource. `PASSWERK_CLOCK` fixes the server clock for test suites. Phase 7c packages the same
server; the MCPB bundle needs no extra step because the workbench travels inside
`@passwerk/server`.

## D-038: The browser assist chooses attributes, never values (2026-09-08)

**Context.** `suggestMappings` proposes a mapping only when a fact's label scores against the
synonym index. A label it has never seen produces no proposal at all, which is what the
held-out evaluation measures: 42.9 % recall over documents transcribed from public datasheets
against 94.1 % on the fixtures the index was authored against (`docs/EVALUATION.md`, D-028).
The gap is vocabulary. The build plan's Phase 7a always carried an optional bring-your-own-key
model call for exactly this, inside the D-002 boundary.

**Decision.** `apps/web` gains an optional assist, off until a reviewer configures it.

1. **The model chooses attribute ids and nothing else.** The response contract carries an
   `attributeId`, an optional composite `path` and a reason. A `value`, `unit` or `confidence`
   in the answer is discarded without being read. An accepted suggestion takes its value from
   core's `proposalValue` and its provenance from the fact, so nothing in an emitted passport
   can originate in the model. This is what keeps the assist inside the "never invent" rule.
2. **Seven guards, each a counted and displayed discard**: unknown attribute, one the category
   does not offer, unknown fact, a path that is not a leaf of that composite, a value core's
   schema refuses, a duplicate, and one the reviewer has already decided. The catalogue offered
   to the model is exactly the set the acceptance dialog can select, so it cannot name
   something the reviewer then cannot enter.
3. **No synthetic confidence.** Suggestions never join the deterministic proposal list and
   never appear in a recall or precision figure. `MappingProposal.confidence` has a documented
   formula; a number invented beside it would poison the one signal the reviewer trusts.
4. **Second opinions mark, they do not decide.** A critique renders under the proposal it is
   about and changes no state, no verdict and no draft.
5. **Accepting is the flow that already existed.** `AddValueDialog` gains `attributeId` and
   `path` on its prefill; the result is the same `manual` decision, with the fact's provenance,
   through the same conflict detection and validation.
6. **Facts travel as per-run tokens.** Core's fact id is `${document}#${page}:${ordinal}` and
   would carry the supplier's file name out inside the key. Only label, value, unit and
   language are sent, under `f0`, `f1`, ...; the real ids stay in a local `refs` map, which
   also gives the parser an exact-match guard against an invented id.
7. **A fixed payload, disclosed before the call.** The panel shows the counts, the endpoint host
   and the literal request JSON. `request.test.ts` and `prompt.test.ts` assert that no file
   name, page or cell survives serialisation, so a future field has to be argued for in review.
8. **The key is its own IndexedDB record**, written only behind an explicit "remember on this
   device". The workflow state is what autosave and every draft export are built from; a key
   there would ride along into a file the supplier sends to their OEM. Memory-only is the
   default and the panel says plainly what remembering costs.
9. **The assist is a `Platform` capability.** Every provider specific — endpoints, default
   model ids, request envelopes — sits behind `Platform.assist`. `apps/mcp-app` supplies none,
   because its host already has a model, so the workbench bundles no endpoint at all; its
   sovereignty spec asserts that on the built HTML.

**Providers.** Plain `fetch`, no SDK: two envelopes of about twenty lines each. Anthropic
Messages (default `claude-sonnet-5`, as `passwerk chat`, D-032) and any OpenAI-compatible base
URL, which is what lets a supplier point the assist at Ollama or LM Studio on localhost and
keep the whole thing inside the building. A local runner gets no `Authorization` header at all,
since an empty bearer token makes some of them refuse the request. One call per run, no
streaming, no retry, no repair: a failed run says so and shows what came back.

**Sovereignty.** `core` and `server` still make zero model calls and zero network calls; nothing
outside `apps/web` changed. The existing `apps/web/e2e/sovereignty.spec.ts` is unchanged and
still passes, which is the load-bearing fact: with the assist unconfigured, no request leaves
the origin. A new spec routes a stubbed endpoint and proves a run reaches that endpoint and no
other, and that the body carries none of the fixture file names.

**Unverified.** The Anthropic browser path needs the
`anthropic-dangerous-direct-browser-access` header. It has not been exercised against the live
API from this repo — CI never calls a real provider — so the OpenAI-compatible path is the one
proven end to end here. If the header proves insufficient in the owner's first real run, the
Anthropic provider ships disabled with an honest message and the compatibility endpoint carries
the feature; this ADR records the outcome then.

**Amended after review (2026-09-09, PR #30).** Four corrections, all to behaviour this ADR
describes:

- *A run never writes the key.* Persistence follows the reviewer's current preference at the
  moment it changes — when the box is ticked, and when the key is edited under a ticked box.
  Writing it when a run succeeded meant an answer arriving after the box was unticked restored
  the secret against an explicit withdrawal of consent, because the handler had captured
  `rememberKey` when the run started.
- *A stale answer is discarded, not installed.* The reviewer keeps working while the model
  thinks. An answer is dropped with a message when the project generation or the battery
  category has moved since the request was built, because the catalogue the model chose from
  was the old category's.
- *The "already decided" guard runs again on arrival*, in the reducer, against current state.
  A decision made during the flight would otherwise be overwritten by a suggestion that
  predates it and passed the guard when the request was built.
- *A rejection frees the fact but not the attribute.* A rejected sub-threshold proposal leaves
  the fact unmapped, which makes it the fact most in need of a suggestion; it stays in the
  request. The rejected attribute key itself stays answered, at request time and on arrival
  alike, because the reviewer has given their answer for that key.

Also: each critique candidate now carries the label of the fact it came from. The critique
question is whether that label means that attribute, and a row showing only the value cannot
distinguish a wrong mapping from a right one — the pass was unanswerable without it.

**Consequences.** `STATE_VERSION` 2 to 3, with a migration, because a stored v2 record can hold
hours of review. `docs/EVALUATION.md` continues to measure the deterministic pipeline alone.
The MCP App does not get bring-your-own-key; the natural route there is MCP sampling, and that
is its own decision.

## D-039: Packaging vendors the release tarballs; the manifests derive their own facts (2026-09-09)

**Context.** Phase 7c (D-019) packages the same server two more ways: a `.mcpb` bundle Claude
Desktop installs in one click, and a Codex CLI plugin. Both need a manifest that names the
tools and prompts the server actually exposes, and the design document proposed committing
`version`, `tools` and `prompts` and checking them against the server in the release workflow,
the same shape as the existing version-agreement loop over the four npm packages.

**Decision.**

1. **The `.mcpb` bundle vendors the `rules`, `core` and `server` release tarballs**, installed
   into `packaging/mcpb/server/node_modules` with `npm install --omit=dev --omit=optional`, so
   the one-click install never touches the network. The CLI tarball is not vendored: it is not
   part of an MCP host's surface. `--omit=optional` is load-bearing, not cosmetic: it keeps
   `pdfjs-dist`'s optional native-canvas dependency out of the bundle. That dependency is only
   for rendering pages to images, never for the text extraction passwerk does, and a platform
   binary would turn one bundle into three (darwin/win32/linux), which `mcpb pack` does not
   support producing from a single build. Without the omission the bundle would need a
   per-platform build matrix; with it, everything vendored is pure JavaScript and one `.mcpb`
   serves all three `compatibility.platforms`.
2. **The launcher `packaging/mcpb/server/index.js` exists because `dist/bin.js` self-executes
   only when it is `process.argv[1]`.** Inside the installed bundle it is imported, not run
   directly, so the launcher imports the exported `main` and calls it, letting `main` read
   `argv`/`env` itself. This is not just an inconvenience to route around: keeping `bin.js` as
   the thing Node actually executes also keeps `new URL('../ui/workbench.html', import.meta.url)`
   resolving inside the installed `@passwerk/server` package (ADR D-037), so the MCP App
   workbench ships inside the bundle and `review_passport` renders it the same way it does from
   a plain `npx` install.
3. **`version`, `tools` and `prompts` are derived at build time, not committed.**
   `packaging/mcpb/scripts/build.mjs` installs the tarballs first, then imports the *installed*
   `@passwerk/server`'s `dist/index.js` for its exported `TOOLS` and `PROMPT_NAMES`, and reads
   `version` off `packages/server/package.json`. `buildManifest` (`packaging/mcpb/scripts/
   manifest.mjs`) folds those into the committed template (`packaging/mcpb/manifest.json`,
   which carries everything that is not derived: description, author, `user_config`,
   `compatibility`). The Codex plugin's `packaging/codex-plugin/scripts/build.mjs` does the same
   for its own `version`. **This is an improvement over the design document**, which proposed
   committing these fields and adding them to the release workflow's version-agreement loop
   (the one that already checks the four npm packages agree). That loop did not need to grow:
   there is no second copy of `tools`/`prompts` that can drift, because the manifest is built
   from the installed server's own registry every time.
4. **`mcpb` 2.1.2 requires `prompts[].text`, which the design document did not anticipate.**
   Its manifest schema (`McpbManifestPromptSchema`) makes `text` a required string — a static
   preview a host can show without calling the server. passwerk's prompts are argument-driven
   (`registerPrompt` takes `lang`/`category`; there is no single canonical rendering), so
   `buildManifest` gained a `promptTexts` map, and `build.mjs` fills it from a deep import of
   the *installed* package's own `dist/prompts/texts.js`, calling each prompt with `'en'` and no
   arguments. This is never authored or paraphrased copy: it is the real English, no-argument
   rendering the server itself would return, read out of the tarball that ships. `texts.js` is
   not on the package's public exports map, but it is a real file inside the tarball, so the
   deep import is stable as long as the compiled layout does not move.
5. **`manifest_version` is `"0.4"`**, which `mcpb validate` 2.1.2 accepts with no downgrade
   needed; the design document had flagged a possible version mismatch as a risk that did not
   materialize.
6. **`privacy_policies` is omitted from the manifest** because passwerk contacts no external
   service to omit a policy link for; the field would have nothing truthful to point at.
7. **The Codex plugin does not vendor a runtime.** `.mcp.json` points at `npx -y
   @passwerk/server`, so the plugin is a thin wrapper: manifests plus a copy of `skills/passwerk`,
   installed with the runtime already on the machine, unlike the `.mcpb`'s offline vendoring.
   The skill has one source (`skills/passwerk`); `packaging/codex-plugin/scripts/build.mjs`
   copies it into `out/codex-plugin/skills/passwerk` on every build, and
   `packaging/codex-plugin/test/plugin.test.ts` asserts the copy is byte-identical, file by file.
8. **State the skill-copy guarantee accurately.** The test proves the *build script's copy step*
   is byte-faithful right now — it rebuilds `out/` from source and diffs the result against
   `skills/passwerk`. It does not, and structurally cannot, catch "a skill edit that forgot to
   update the plugin", because there is no such failure mode to catch: `out/codex-plugin` is
   git-ignored, nothing commits a plugin artefact, and every build re-syncs from the one source.
   There is no stale copy anywhere in the repository for a skill edit to leave behind. The design
   document's original framing — a test that would catch drift between the skill and a shipped
   plugin copy — assumed a committed artefact that this design does not have; recording that
   here is the correction, not a restatement of the plan.
9. **The `.mcpb` is deliberately not byte-reproducible.** `mcpb pack` writes zip timestamps and
   npm may vary tree layout between runs, so two builds of the same source can produce a
   different `.mcpb` file even though their contents are equivalent. Determinism in this project
   is a property of emitted passports (sorted keys, injected clock, byte-identical re-runs), not
   of the installer that ships the tool that emits them.

**Consequences.** CI (`.github/workflows/ci.yml`) builds and smokes the `.mcpb` and the Codex
plugin on `ubuntu-latest`, `macos-latest` and `windows-latest` (job `Packaging (${{ matrix.os
}})`: `pnpm package:mcpb`, `pnpm package:smoke`, `pnpm package:codex`), and the release workflow
uploads the built `.mcpb` as a release asset. `packaging/mcpb/scripts/smoke.mjs` drives the
shipped bundle over stdio and reads a real PDF through it, proving the vendored, offline install
actually answers tool calls, not just that `mcpb validate` accepts the manifest.
`SECURITY.md` remains an open item: it does not exist and was deliberately not created in this
phase, which stays a checklist item under "Definition of done for v1.0" (`docs/BUILD_PLAN.md`
§8) rather than something Phase 7c silently closed.

**Owner measurements (outstanding — Phase 7c is not fully done until both are recorded here).**

1. `.mcpb` one-click install, macOS and Windows: download `out/mcpb/passwerk-<version>.mcpb`
   (or the CI packaging job's artifact), open it in Claude Desktop, confirm the document-folder
   prompt (`user_config.documents_directory`), that all twelve tools are listed, and that asking
   Claude to open the passwerk workbench renders the MCP App via `review_passport`.
   - macOS: *(owner to fill in — version, build, screenshot or note)*
   - Windows: *(owner to fill in — version, build, screenshot or note)*
2. Codex CLI plugin: run `pnpm package:codex`, follow the three printed commands (`cp -r
   out/codex-plugin ~/plugins/passwerk`, install `marketplace.json`, `codex plugin add
   passwerk@personal`), then in a new Codex session confirm the `passwerk` skill and its MCP
   tools are present.
   - This measurement is gated on the first npm publish: the plugin's `.mcp.json` runs `npx -y
     @passwerk/server`, and `@passwerk/server` is not on npm yet, so `codex plugin add
     passwerk@personal` today loads the skill but not the tools (`docs/install/codex.md`). The
     tools half of this measurement cannot be recorded until that publish happens.
   - *(owner to fill in — Codex version, session transcript or note)*

## D-040: The workbench is a fixed-height instrument (2026-09-11)

**Context.** Inside Claude Desktop the workbench rendered as a wall of cards the whole chat
scrolled through. The cause was structural: the MCP Apps SDK's `autoResize` reports the
document's height to the host, the host grows the iframe to match (up to 5000 px, ADR D-037),
and the app was laid out as a document — `max-w-6xl`, stacked cards, every list expanded, one
text size for everything. The design document
(`docs/superpowers/specs/2026-09-10-workbench-redesign-design.md`) was approved 2026-09-10;
this ADR records the ten places implementation ruled differently from that draft, across 43
commits on `feat/workbench-redesign`.

**Decision.**

1. **The app owns its height.** `--instrument-height` is 640 px inline in a host, `100vh` in
   the host's fullscreen mode and in the web app; only the list region scrolls; dialogs and the
   sheet portal into the instrument, not `document.body`, so neither can exceed the frame.
   `apps/mcp-app/e2e`'s host page records every `ui/notifications/size-changed` it receives and
   asserts every reported height across all six steps is 640, and that a fullscreen request
   round-trips through `app.requestDisplayMode`. That six-step assertion lives in
   `musterwerk.spec.ts` (the one track that walks every step, `toExport` included), not in
   `context.spec.ts` as spec §10 named it — a placement inconsistency, accepted as minor.
2. **Six steps.** `Step` gains `'export'`: the verdict is stated once, on its own screen,
   instead of sharing the gaps screen. `STATE_VERSION` stays 3 — the persisted shape did not
   change, so a saved `step: 'gaps'` is still valid and `reachable('export')` equals
   `reachable('gaps')`. The former `GapsExportView` splits into `GapsView` and `ExportView`
   with the same props divided between them.
3. **The Nothing idiom is the design system**, with the two adaptations the spec named — mono
   caps only for labels of one to four words (prose stays sentence case in Space Grotesk), and
   `--text-disabled` (below WCAG AA by design) reserved for disabled controls and decorative
   brackets, never for text a person must read — plus what building the screens showed that
   rule actually costs: the spec's own §6.5 line ("`/ total` in `--text-disabled`") and the
   plan's verbatim `HeroNumber` code both violated it. `HeroNumber`'s unit renders
   `text-muted-foreground`, not `--text-disabled`; `Row`'s default tag is `text-foreground` and
   its dim tag `text-muted-foreground`, keeping two readable emphasis levels instead of one
   readable and one that fails contrast; `ConfidenceBadge` is `text-foreground` at confidence
   ≥ 0.7 and `text-muted-foreground` below; every export row's note and the gaps sheet's note
   are `text-muted-foreground`. Colour otherwise appears only on values; `--accent` red is the
   one interrupt (invalid, conflict, error).
4. **Fonts are bundled.** Space Grotesk, Space Mono and Doto (OFL) from a pinned commit of
   `google/fonts`, subsetted to WOFF2 by `apps/web/scripts/fonts.mjs`, committed with
   `apps/web/src/fonts/PROVENANCE.md` (source, licence, commit, sha256 of the download and of
   the output) and verified offline by `apps/web/test/fonts.test.ts`. No font host is
   contacted; the sovereignty specs are unchanged.
5. **ReUI was evaluated and not adopted.** Its registry answers `401` for the base primitives
   without a licence key (`toggle-group`, `toggle`, `scroll-area`, `kbd`, `spinner` all
   checked 2026-09-10) and its icons are a paid, animated tier; only its blocks are public. The
   primitives the design needs — `toggle-group`, `toggle`, `scroll-area`, `kbd`, `spinner`, and
   (decision 8 below) `calendar` and `popover` — come from the official shadcn registry
   instead, MIT, `https://ui.shadcn.com/r/styles/radix-nova/<name>.json`. `lucide-react` stays
   the only icon set: no filled icon, no animated icon. `card`, `progress`, `separator`,
   `sonner` and `next-themes` are removed; nothing in the redesign is a card, `SegmentedBar`
   replaces `progress`, a `1px --border` replaces `separator`, and the app now follows
   `prefers-color-scheme` on first load with a manual toggle remembered in `localStorage`
   rather than `next-themes`.
6. **No toasts.** `sonner` is gone; every failure that reached a toast is an `InlineStatus`
   next to its trigger — ingest errors and export failures in the footer's status slot, assist
   errors inside the assist sheet.
7. **The sheet's keyboard model.** `Sheet` installs its own document-level `keydown` listener
   through a React 19 callback ref with a cleanup function (this project's sanctioned
   alternative to `useEffect`) so `Esc` closes the sheet regardless of where focus landed,
   including after a nested dialog (`AddValueDialog`, the row editor) returns focus into the
   sheet; Radix's own `onEscapeKeyDown` is prevented so `onClose` fires exactly once. Under a
   filter, deciding a row advances the sheet to the row now at the same index (else the
   previous row, else it closes) rather than stranding on a row the decision just removed from
   the current view — spec §6.4 describes a continuous open → decide → next loop. One open
   question this raises — whether the document-level Escape should discard an unsaved in-sheet
   edit — is recorded once, in the "Open for the owner" list below. Every sheet's own `actions`
   button is `size="md"` (36 px), not the 44 px a touch target guideline would otherwise suggest:
   the sheet is capped at 45 % of a 640 px frame (fix wave item 14), so a 44 px action row would
   have spent an eighth of that budget on the action bar alone.
8. **The date picker.** An owner finding during the visual review (2026-09-11) asked for a real
   date picker on the project screen in place of the native `<input type="date">`; the Nothing
   skill's "no calendar popovers" note and the plan's mono ISO text input yielded to the
   explicit request. `DateField` (`apps/web/src/views/shell/DateField.tsx`) pairs a
   Nothing-styled `calendar` + `popover` (react-day-picker, date-fns — the two dependencies this
   phase adds) with a mono ISO text input that keeps the `placed-on-market` test id, so typing
   the date still works and the picker is an alternative entry path, not the only one.
9. **The instrument's overflow guard.** `instrument.spec.ts` asserts
   `document.documentElement.scrollHeight === clientHeight` and no horizontal overflow at
   735 × 800 and 1280 × 900, in both themes; it caught a real defect (commit `1eee656`, "the
   instrument never renders wider than its frame") where a grid rendered 875 px inside a 735 px
   frame. The fix is a guard, not a one-off patch: the instrument's grid columns are bounded so
   a future screen cannot reintroduce the same overflow.
10. **The Doto grayscale hint and the 26 px multi-word hero.** Doto is a dot-matrix font;
    Windows Chromium rendered each dot with LCD subpixel antialiasing, putting red and blue
    fringes on what should read as monochrome. `.display` (`apps/web/src/index.css`) promotes
    the hero to its own compositing layer (`will-change: transform`, `transform:
    translateZ(0)`) plus `-webkit-font-smoothing: antialiased` for macOS, which makes Chromium
    fall back to grayscale antialiasing. Separately, spec §4.2's "Doto never renders text
    longer than one word" is unmet by German verdict phrases ("Kein Pass erforderlich",
    "Gültig mit Warnungen"): `HeroNumber` drops a multi-word value to 26 px on one line rather
    than wrapping into a second row of dot matrix. 26 px, not the 28 px first suggested: at
    28 px the longest German verdict needs 357 px against the 349 px the obligation column
    offers at 735 px wide, so the string lost its last letters to the ellipsis; at 26 px the
    longest string on either screen in either language is 332 px, so `truncate` stays a guard
    that never fires.

**Consequences.** `views/shell` is the component library Phase 7b reuses unchanged; the
`data-testid` contract survived name-for-name, and the Musterwerk, golden and sovereignty
assertions are the proof that the redesign moved pixels and not results. `docs/screenshots/
workbench-*.png` (produced by the guarded `apps/web/e2e/screenshots.spec.ts`, `SCREENSHOTS=1`)
replace the Phase 7b `mcp-app-0*.png` screenshots referenced in D-037.

*Open for the owner* (deferred minors and questions carried from the task-by-task rulings,
none blocking, none touching a verdict, a finding or an export byte):

- Font `PROVENANCE.md`'s table follows the brief's sample shape (Family + Ref) rather than the
  design document's prose, and its subset includes U+2212 beyond the glyph list the spec named.
- The start-over `AlertDialog`'s placeholder text uses `--text-disabled` (the plan's own class
  string); it also carries an inert `size` prop on `AlertDialogContent`; its focus indicator is
  border-only (an accessibility note); two Biome `noImportantStyles` warnings sit on the
  reduced-motion block.
- The reducer's `Step` report undercounts keys (51 vs. 55 in the generated summary); its new
  test case sits inside the `facts/edits` describe block rather than its own.
- `Row`'s `data-*` guard against an unknown tag is compile-time only; `SegmentedBar`'s cells are
  not `aria-hidden`.
- `QrPreview`'s "Copied" status never auto-dismisses.
- The documents screen's "0 proposals derived" line shows even when every uploaded file
  errored, which reads as "we looked and found nothing" rather than "nothing could be read".
- The facts sheet's "Proposed for: proposed" copy is redundant — `FactStatus` carries no
  separate target to name.
- Review's `MANUAL` and `ROWS` group headers are permanently open with a no-op toggle;
  `assist-critique-chip` prose renders in `text-warning`, one step stronger than the other
  sheet prose.
- Two dead i18n keys, `app.title` and `app.tagline`, were not removed; `App.tsx`'s top-bar JSX
  could be pulled into its own component.
- `apps/mcp-app/dist-host` has been tracked since `eee1cec` (Phase 7b) and was re-staged by
  this branch's `build:host` runs; whether it should be gitignored is a separate chore this ADR
  does not resolve.
- The gaps sheet's row-value column is ragged across differently-named attributes — parked, it
  needs an owner design decision, not a default; group names under `BY OWNER` may truncate
  (accepted, per spec §14's "attribute names may truncate" rule); the stepper shows only the
  current step's name between 640 and 920 px for German labels (accepted as an improvement on
  spec §3.1's "numbers only under 640 px").
- The project screen's resume state renders two Doto heroes side by side (the resume count and
  the obligation verdict), which decision 10 above did not consolidate into one.
- Decision 7's document-level Escape closes the sheet even while an in-sheet text input has
  focus, discarding an unsaved edit; the alternative (Escape blurs the input first) was not
  built because it is unclear which behaviour a reviewer mid-edit actually wants.
