# @passwerk/rules

Bundled, checksummed, offline knowledge base for the EU Digital Battery Passport. Pure data plus
typed accessors; no filesystem, no network, no model calls. Runs in Node and in the browser.

## What is inside

| Directory | Content | Origin |
|---|---|---|
| `artefacts/idta/02035-{1..7}/<version>/` | The seven official IDTA 02035 submodel templates (JSON with and without example values, AASX) | admin-shell-io/submodel-templates, pinned commit, CC-BY-4.0 |
| `artefacts/aas/{3.0.9,3.1.2}/aas.json` | AAS metamodel JSON Schemas | admin-shell-io/aas-specs, tagged releases, CC-BY-4.0 |
| `artefacts/ec/` | Commission guidance "Digital Batteries Passport: data points by category" v2.0 (PDF) | European Commission, CC-BY-4.0 |
| `artefacts/batterypass/` | Battery Pass Data Attribute Longlist v1.2 (xlsx) | Battery Pass consortium, CC-BY-4.0 |
| `artefacts/manifest.json` | Source URL, version, sha256 and size of every artefact | maintained by `pnpm artefacts:write` |
| `kb/ec-datapoints.json` | The 71 Commission data points with legal reference and per-category applicability | transcribed from the PDF above |
| `kb/generated/template-catalogue.json` | Every template element (211) with path, semanticId, cardinality, value type, unit, DIN chapter | generated from the templates |
| `kb/generated/din-longlist.json` | The 93 DIN DKE SPEC 99100 attributes with chapter, applicability, unit, format, access rights | generated from the xlsx |
| `kb/attributes/*.json` | 93 authored attributes: DE/EN names, synonyms, who-has-it, explanations, mapping to EC data points and template elements | authored, human-reviewed |
| `kb/rules.json` | Plausibility rules `PW-PLAUS-*` (validation layer L4), DE/EN | authored |
| `kb/timeline.json` | Legal dates with article references and status | verified against the consolidated regulation |
| `PROVENANCE.md` | Human-readable rendering of the manifest | generated |

See `kb/attributes/README.md` for the attribute schema and the runtime joins.

## Usage

```ts
import { attributes, getAttribute, getAttributesForCategory, templates, listCapabilities } from '@passwerk/rules';

const mass = getAttribute('batteryMass');
mass?.name.de;                 // "Batteriemasse"
mass?.applicability.LMT;       // { status: "mandatory" }
mass?.legalRefs;               // ["BR Annex VI Part A (5)", "DIN longlist: Annex XIII (1a); Annex VI Part A (5)"]
mass?.templateElements[0]?.semanticId;

getAttributesForCategory('EV', ['mandatory']).length;
templates[5]?.environment;     // IDTA 02035-6 Material Composition, AAS V3.0 JSON
listCapabilities();            // versions, checksums, counts, sovereignty statement
```

## Maintenance

```sh
pnpm --filter @passwerk/rules run artefacts          # fetch + verify against pinned checksums
pnpm --filter @passwerk/rules run artefacts:write    # re-pin after a deliberate upstream update
pnpm --filter @passwerk/rules run artefacts:verify   # offline verification only
pnpm --filter @passwerk/rules run generate           # regenerate kb/generated/* and PROVENANCE.md
```

The test suite fails if a bundled file does not match its checksum, if a generated file is
stale, or if any attribute references an unknown longlist row, EC data point or template path.

## Honesty flags

Attributes and timeline events carry `verify: true` when the mapping or date came from a
secondary source or a judgement call. `listCapabilities()` reports how many are open. Nothing in
this package is legal advice.
