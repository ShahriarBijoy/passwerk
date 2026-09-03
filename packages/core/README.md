# @passwerk/core

MCP-free, browser-safe library that turns a neutral `PassportDraft` into an EU Digital Battery
Passport in the official AAS format (IDTA 02035) and validates it in three layers.

```ts
import { emitAasJson, emitAasx, samples, validate } from '@passwerk/core';

const report = validate(samples['ev-valid']); // L1 -> emit -> L2 + L3, verdict 'valid'
const { output, verdict } = emitAasJson(draft); // canonical JSON, re-validated
const aasx = emitAasx(draft); // OPC package with the JSON inside, re-validated from bytes
```

- `PassportDraft`: `{ meta, attributes: { [attributeId]: Field } }` on the DIN DKE SPEC 99100
  grain of `@passwerk/rules`. Numbers are decimal strings, dates ISO-8601.
- Emitters read every idShort, semanticId and valueType from the bundled template catalogue.
- Verdicts are `valid`, `valid_with_warnings` or `invalid` and always come from running the
  validators on the emitted output.

Phase 2 covers IDTA 02035-1 (Nameplate), -3 (Carbon Footprint) and -6 (Material Composition).
The design is in `docs/superpowers/specs/2026-09-03-core-model-emit-validate-design.md`.
