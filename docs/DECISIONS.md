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

**Context.** `kb/rules.json` holds 25 `PW-PLAUS` rules as reviewable data (severity, DE/EN
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

**Context.** The Commission's v2.0 guidance marks the state-of-health data points (61-66)
"not to be filled/displayed" for EV batteries as of February 2027. IDTA 02035-5 declares the
same blocks (`RemainingCapacity`, `RemainingPowerCapability`,
`RemainingRoundTripEnergyEfficiency`, `EvolutionOfSelfDischarge`) with cardinality `One`. An
EV passport cannot satisfy both: omitting the block makes L3 report `PW-L3-MISSING`, filling
it makes PW-PLAUS-012 warn. Separately, PW-PLAUS-013 was authored to fire on a *missing*
deferred attribute, which would have emitted a dozen warnings on every draft and made
`valid` unreachable.

**Decision.** PW-PLAUS-012 stays silent for an attribute whose template element is mandatory,
and keeps its teeth where the element is `ZeroToOne` and the supplier can genuinely leave it
out. The emitted file therefore always follows the template (L3 stays authoritative for
conformance) and the advice follows the guidance wherever the supplier has a choice.
PW-PLAUS-013 is removed from `kb/rules.json`; reassurance that a deferred data point is not a
gap belongs to the gap report's `deferred` bucket, not to a validation finding. The catalogue
holds 24 rules.

**Consequences.** No golden sample is warned about a value the template obliges it to carry.
The conflict is recorded rather than papered over, and is worth raising with IDTA when the
templates are next revised. L4 never reports a missing value, which keeps the layer boundary
with the gap report clean.
