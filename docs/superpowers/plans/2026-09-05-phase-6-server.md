# Phase 6.1: `@passwerk/server` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@passwerk/server` (ten MCP tools, seven resources, three prompts, a bounded content-addressed session store, stdio and Streamable HTTP), the `skills/passwerk` agent skill and the install docs, with the server surface covered by the sovereignty proof.

**Architecture:** A plain array of `ToolDefinition`s (`registry.ts`) is the single description of the tool surface; `createServer()` registers it on an SDK `McpServer`. Big objects cross the wire with compact loose schemas and are validated by core inside the handler. Ids are content hashes stored per connection. Node-only modules (`fs.ts`, `http.ts`, `bin.ts`) are never imported by `index.ts`.

**Tech Stack:** TypeScript 5.9 (NodeNext, ESM), `@modelcontextprotocol/sdk` 1.30.0, Zod 4.5.4, Vitest 4, Biome 2. Node >= 22.13.

**Spec:** `docs/superpowers/specs/2026-09-05-phase-6-mcp-server-skill-cli-design.md`

## Global Constraints

- No `node:*` import reachable from `packages/server/src/index.ts` (spec 7); `fs.ts`, `http.ts`, `bin.ts`, `logging.ts` are entry-only.
- No network call, no LLM call anywhere in the server (ADR D-002, D-013).
- Every tool returns `structuredContent` and one text block in `lang` (`de` | `en`, default `en`).
- Verdicts come only from core's `validate`, `emitAasJson`, `emitAasx`. Never compose a legal reference.
- `asOf` defaults to core's default (`draft.meta.createdAt`); the only wall clock is `ctx.clock`, read in `bin.ts`.
- Canonical JSON (`canonicalJson` from core) for every serialised payload and for ids.
- Dependencies at least 3 days old: SDK 1.30.0 (2026-07-27), zod 4.5.4 (2026-08-29).
- Conventional Commits, branch `feat/phase-6-mcp-server`, `pnpm check` green before every commit.
- Tests use `InMemoryTransport` plus the SDK `Client`; nothing spawns a process except the HTTP test, which binds an ephemeral loopback port.

---

## File structure

```
packages/server/
  package.json                    deps, bin, exports (index + bin)
  tsconfig.json                   unchanged shape, types: node
  src/index.ts                    createServer, exports of registry/session/types
  src/types.ts                    ToolDefinition, ToolContext, ToolResult, Lang, LangText, FileSystemAdapter
  src/base64.ts                   encode/decode without Buffer
  src/session.ts                  SessionStore (bounded LRU, content ids)
  src/registry.ts                 TOOLS array + `toolByName`
  src/server.ts                   createServer(): registers tools, resources, prompts
  src/refs.ts                     resolveDraft / resolveBundle / resolveFacts (id or object)
  src/summary.ts                  DE/EN text summaries
  src/tools/listCapabilities.ts
  src/tools/checkObligations.ts
  src/tools/explainAttribute.ts
  src/tools/validatePassport.ts
  src/tools/gapReport.ts
  src/tools/emitPassport.ts
  src/tools/ingestDocuments.ts
  src/tools/extractFacts.ts
  src/tools/suggestMappings.ts
  src/tools/applyMappings.ts
  src/resources/index.ts          registerResources(server, ctx)
  src/resources/cheatsheet.ts     generated markdown, DE + EN
  src/prompts/index.ts            registerPrompts(server)
  src/prompts/texts.ts            the three prompt bodies, DE + EN
  src/fs.ts                       nodeFileSystem(root?)
  src/logging.ts                  stderr logger
  src/http.ts                     startHttp(options)
  src/bin.ts                      CLI entry
  test/harness.ts                 connect(), memoryFileSystem(), call()
  test/session.test.ts
  test/base64.test.ts
  test/tools.simple.test.ts       list_capabilities, check_obligations, explain_attribute
  test/tools.draft.test.ts        validate_passport, gap_report, emit_passport, apply_mappings on golden samples
  test/tools.ingest.test.ts       ingest_documents, extract_facts, suggest_mappings, apply_mappings on Musterwerk
  test/resources.test.ts
  test/prompts.test.ts
  test/http.test.ts
  test/sovereignty.test.ts
packages/core/test/helpers/networkGuard.ts   extracted from core's sovereignty test, shared
skills/passwerk/SKILL.md, references/{workflow,resources,cli}.md
docs/install/{claude-code,codex,opencode,cursor,claude-desktop,http,inspector}.md
.mcp.json
docs/DECISIONS.md (D-031), AGENTS.md status, README tools table
```

---

### Task 1: Package setup, types, base64

**Files:**
- Modify: `packages/server/package.json`
- Create: `packages/server/src/types.ts`, `packages/server/src/base64.ts`
- Test: `packages/server/test/base64.test.ts`

**Interfaces (Produces):**

```ts
// types.ts
export type Lang = 'de' | 'en';
export interface LangText { de: string; en: string }
export interface FileSystemAdapter {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  stat(path: string): Promise<{ kind: 'file' | 'directory' | 'missing' }>;
  readDir(path: string): Promise<string[]>;      // names, not paths
  resolve(path: string): string;                 // absolute; throws PathOutsideRootError
  join(...parts: string[]): string;
}
export class PathOutsideRootError extends Error {}
export interface ToolContext { store: SessionStore; fs?: FileSystemAdapter; clock: string; log: Logger }
export type Logger = (level: 'info' | 'debug' | 'error', message: string, data?: unknown) => void;
export interface ToolResult<O> { structured: O; text: LangText; isError?: boolean }
export interface ToolDefinition<I extends z.ZodRawShape, O extends z.ZodRawShape> {
  name: string; title: string; description: string;
  inputSchema: I; outputSchema: O;
  annotations: { readOnlyHint: boolean; destructiveHint: false; idempotentHint: boolean; openWorldHint: false };
  handler(input: z.infer<z.ZodObject<I>>, ctx: ToolContext): Promise<ToolResult<z.infer<z.ZodObject<O>>>>;
}
export const LangSchema = z.enum(['de', 'en']);
export function pick(text: LangText, lang: Lang | undefined): string;
// base64.ts
export function encodeBase64(bytes: Uint8Array): string;
export function decodeBase64(text: string): Uint8Array;   // throws on invalid input
```

- [ ] **Step 1: package.json**

```json
{
  "name": "@passwerk/server",
  "version": "0.0.0",
  "description": "MCP server exposing passwerk tools, resources and prompts over stdio and Streamable HTTP",
  "license": "Apache-2.0",
  "type": "module",
  "sideEffects": ["./dist/bin.js"],
  "bin": { "passwerk-server": "./dist/bin.js" },
  "exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } },
  "files": ["dist", "README.md"],
  "engines": { "node": ">=22.13" },
  "scripts": { "build": "tsc -b", "clean": "rimraf dist", "start": "node dist/bin.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.0",
    "@passwerk/core": "workspace:*",
    "@passwerk/rules": "workspace:*",
    "zod": "4.5.4"
  }
}
```

- [ ] **Step 2: failing base64 test**

```ts
import { decodeBase64, encodeBase64 } from '../src/base64.ts';
import { describe, expect, it } from 'vitest';

describe('base64', () => {
  it('round-trips bytes including zero and high values', () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });
  it('matches Buffer for a known string', () => {
    expect(encodeBase64(new TextEncoder().encode('passwerk'))).toBe('cGFzc3dlcms=');
  });
  it('rejects invalid input', () => {
    expect(() => decodeBase64('***')).toThrow();
  });
});
```

Run: `pnpm vitest run packages/server/test/base64.test.ts` → FAIL (module not found).

- [ ] **Step 3: implement**

```ts
// base64.ts — atob/btoa are globals in Node 22 and browsers; no Buffer (spec 7).
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
export function decodeBase64(text: string): Uint8Array {
  const cleaned = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    throw new Error('invalid base64');
  }
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
```

`types.ts` as in the interface block; `pick = (t, lang) => (lang === 'de' ? t.de : t.en)`.

- [ ] **Step 4: run, lint, commit** `feat(server): package setup, types and base64 helpers`

---

### Task 2: SessionStore

**Files:** Create `packages/server/src/session.ts`; Test `packages/server/test/session.test.ts`

**Interfaces (Produces):**

```ts
export type StoreKind = 'bundle' | 'facts' | 'draft';
export const ID_PREFIX: Record<StoreKind, string> = { bundle: 'bnd_', facts: 'fct_', draft: 'drf_' };
export interface StoreStats { entries: number; bytes: number; maxEntries: number; maxBytes: number }
export class SessionStore {
  constructor(options?: { maxEntries?: number; maxBytes?: number });  // defaults 256, 256 MiB
  put(kind: StoreKind, value: unknown): Promise<string>;   // id = prefix + first 16 hex of sha256(canonicalJson(value))
  get<T = unknown>(kind: StoreKind, id: string): T | undefined;   // touches LRU
  has(kind: StoreKind, id: string): boolean;
  stats(): StoreStats;
}
export function contentId(kind: StoreKind, value: unknown): Promise<string>;
```

Use `canonicalJson` and `sha256Hex` from `@passwerk/core`. Store the canonical string (so `get` returns a fresh `JSON.parse`, never a shared mutable object). Evict least-recently-used until both caps hold; a single value larger than `maxBytes` is rejected with `Error('value exceeds session store byte cap')`.

- [ ] **Step 1: failing tests**

```ts
describe('SessionStore', () => {
  it('ids are content-addressed and prefixed', async () => {
    const s = new SessionStore();
    const a = await s.put('draft', { x: 1, y: [1, 2] });
    const b = await s.put('draft', { y: [1, 2], x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^drf_[0-9a-f]{16}$/);
    expect(s.stats().entries).toBe(1);
  });
  it('get returns a copy and reports unknown ids', async () => {
    const s = new SessionStore();
    const id = await s.put('facts', { facts: [] });
    const got = s.get<{ facts: unknown[] }>('facts', id)!;
    got.facts.push(1);
    expect(s.get('facts', id)).toEqual({ facts: [] });
    expect(s.get('facts', 'fct_0000000000000000')).toBeUndefined();
    expect(s.get('draft', id)).toBeUndefined();  // kind is part of the key
  });
  it('evicts least recently used by count and by bytes', async () => {
    const s = new SessionStore({ maxEntries: 2 });
    const a = await s.put('draft', { a: 1 });
    const b = await s.put('draft', { b: 2 });
    s.get('draft', a);
    const c = await s.put('draft', { c: 3 });
    expect(s.has('draft', a)).toBe(true);
    expect(s.has('draft', b)).toBe(false);
    expect(s.has('draft', c)).toBe(true);
    const tiny = new SessionStore({ maxBytes: 40 });
    await tiny.put('draft', { k: 'x'.repeat(20) });
    await tiny.put('draft', { k: 'y'.repeat(20) });
    expect(tiny.stats().entries).toBe(1);
    await expect(tiny.put('draft', { k: 'z'.repeat(100) })).rejects.toThrow(/byte cap/);
  });
});
```

- [ ] **Step 2: run → FAIL. Step 3: implement with a `Map<string, { json: string; bytes: number }>` keyed `${kind}:${id}`; on `get`, delete and re-set the key to move it to the end; eviction pops `map.keys().next()`.**
- [ ] **Step 4: pass, commit** `feat(server): bounded content-addressed session store`

---

### Task 3: Registry, createServer, harness, `list_capabilities`

**Files:** Create `src/registry.ts`, `src/server.ts`, `src/summary.ts`, `src/tools/listCapabilities.ts`, modify `src/index.ts`; Test `test/harness.ts`, `test/tools.simple.test.ts`

**Interfaces (Produces):**

```ts
// server.ts
export interface ServerOptions { fs?: FileSystemAdapter; store?: SessionStore; clock?: string; log?: Logger }
export const SERVER_NAME = 'passwerk'; export const SERVER_VERSION = '0.0.0';  // from package.json at build: keep literal, tested equal to package.json
export function createServer(options?: ServerOptions): { server: McpServer; ctx: ToolContext };
// registry.ts
export const TOOLS: readonly ToolDefinition<any, any>[];
export function toolByName(name: string): ToolDefinition<any, any> | undefined;
// test/harness.ts
export async function connect(options?: ServerOptions): Promise<{ client: Client; ctx: ToolContext; close(): Promise<void> }>;
export async function call<T>(client: Client, name: string, args: Record<string, unknown>): Promise<{ structured: T; text: string; isError: boolean }>;
export function memoryFileSystem(files: Record<string, Uint8Array>, root?: string): FileSystemAdapter & { written: Map<string, Uint8Array> };
```

Registration in `createServer`, for each tool:

```ts
server.registerTool(tool.name, {
  title: tool.title, description: tool.description,
  inputSchema: { ...tool.inputSchema, lang: LangSchema.optional().describe('Language of the text summary') },
  outputSchema: tool.outputSchema, annotations: tool.annotations,
}, async (input) => {
  const { lang, ...rest } = input as { lang?: Lang };
  try {
    const r = await tool.handler(rest, ctx);
    return { content: [{ type: 'text', text: pick(r.text, lang) }], structuredContent: r.structured, ...(r.isError ? { isError: true } : {}) };
  } catch (e) {
    return toolError(e, lang);   // PassportDraftError → its findings; ZodError → issues; else message. isError: true, structuredContent: { error, findings? }
  }
});
```

Because every tool has an `outputSchema`, the SDK validates `structuredContent`; error results must still satisfy it, so `toolError` returns `structuredContent: { error: string, findings: Finding[] }` and every tool's `outputSchema` is `z.looseObject({...}).partial()`-style: declare only the keys that matter, all optional, plus `error: z.string().optional()`. Helper in `types.ts`: `export const out = <S extends z.ZodRawShape>(shape: S) => ({ ...shape, error: z.string().optional() })`, and every tool's success shape uses `.optional()` on its keys. Tests assert presence.

`list_capabilities`:

```ts
inputSchema: {}, outputSchema: out({ package: z.string().optional(), templates: z.array(z.looseObject({ part: z.number(), version: z.string() })).optional(), server: z.looseObject({ name: z.string(), version: z.string(), tools: z.array(z.string()), session: z.looseObject({ entries: z.number(), bytes: z.number() }) }).optional() })
handler: async (_i, ctx) => { const caps = listCapabilities(); const server = { name: SERVER_NAME, version: SERVER_VERSION, transports: ['stdio', 'streamable-http'], tools: TOOLS.map(t => t.name), session: ctx.store.stats() }; return { structured: { ...caps, server }, text: { de: `passwerk ${SERVER_VERSION}: ${caps.templates.length} IDTA-Templates, ${caps.knowledgeBase.attributes} Attribute, ${caps.knowledgeBase.plausibilityRules} Plausibilitätsregeln. Keine Netzwerk- oder Modellaufrufe.`, en: `passwerk ${SERVER_VERSION}: ${caps.templates.length} IDTA templates, ${caps.knowledgeBase.attributes} attributes, ${caps.knowledgeBase.plausibilityRules} plausibility rules. No network or model calls.` } }; }
```

`TOOLS` order (final): ingest_documents, extract_facts, suggest_mappings, apply_mappings, validate_passport, gap_report, emit_passport, check_obligations, explain_attribute, list_capabilities. Add entries as tasks land.

- [ ] **Step 1: harness + failing test**

```ts
// harness.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
export async function connect(options = {}) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const { server, ctx } = createServer({ clock: '2026-09-05T12:00:00Z', ...options });
  const client = new Client({ name: 'test', version: '0' });
  await server.connect(st); await client.connect(ct);
  return { client, ctx, close: async () => { await client.close(); await server.close(); } };
}
export async function call<T>(client, name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as { type: string; text?: string }[]).find(c => c.type === 'text')?.text ?? '';
  return { structured: r.structuredContent as T, text, isError: r.isError === true };
}
```

Test: `listTools` returns `list_capabilities` with `outputSchema`; calling it yields `server.name === 'passwerk'`, `templates.length === 7`, text contains `7 IDTA`, `lang: 'de'` text contains `Plausibilitätsregeln`; two calls are byte-identical (`canonicalJson`).

- [ ] **Step 2: FAIL. Step 3: implement. Step 4: pass. Step 5: commit** `feat(server): createServer, tool registry and list_capabilities`

---

### Task 4: `check_obligations`, `explain_attribute`

**Files:** Create `src/tools/checkObligations.ts`, `src/tools/explainAttribute.ts`; extend `test/tools.simple.test.ts`

`check_obligations` input: `{ batteryType: z.enum(BATTERY_TYPES), role: z.enum(ROLES), energyKwh: z.string().optional(), placedOnMarketDate: z.string().optional(), asOf: z.string().optional() }`; call `checkObligations(input)`; `asOf` defaults to `ctx.clock` when absent (record it in the output as `asOf`). Text: `${verdict}: ${reason[lang]}` plus `Mandatory attributes: N` / `Pflichtattribute: N`. Output schema `out({ verdict: z.enum(['required','not_required','insufficient_input']).optional(), category: z.string().nullable().optional(), mandatoryAttributes: z.array(z.string()).optional(), isNotLegalAdvice: z.literal(true).optional(), sources: z.array(z.string()).optional() })`.

`explain_attribute` input `{ id: z.string().min(1) }`; `explain(id)`; undefined → `{ structured: { error }, text: { de: `Unbekannte Kennung "${id}"`, en: `Unknown id "${id}"` }, isError: true }`. Text for attribute: `${name[lang]} (${id}): ${explanation[lang]}` then `Legal: refs.join('; ')`; for rule: `${title[lang]}: ${message[lang]}`.

Tests: EV manufacturer 2027-06-01 → `required`, `isNotLegalAdvice === true`, `sources.length > 0`; PORTABLE → `not_required`; INDUSTRIAL without energy → `insufficient_input`. `explain_attribute` with `batteryChemistry` → `kind === 'attribute'`; with `PW-PLAUS-001`-style id taken from `plausibilityRules[0].id` → `kind === 'rule'`; unknown → `isError`.

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): check_obligations and explain_attribute tools`

---

### Task 5: refs, `validate_passport`, `gap_report`, `apply_mappings`

**Files:** Create `src/refs.ts`, `src/tools/validatePassport.ts`, `src/tools/gapReport.ts`, `src/tools/applyMappings.ts`; Test `test/tools.draft.test.ts`

**Interfaces (Produces):**

```ts
// refs.ts
export const DraftRef = z.union([z.looseObject({ draftId: z.string() }), z.looseObject({ meta: z.unknown() })]).describe('A PassportDraft object, or { draftId } returned by an earlier call');
export const BundleRef = z.union([z.looseObject({ bundleId: z.string() }), z.looseObject({ documents: z.unknown() })]);
export const FactsRef = z.union([z.looseObject({ factSetId: z.string() }), z.looseObject({ facts: z.unknown() })]);
export class UnknownIdError extends Error { constructor(kind: StoreKind, id: string) }  // message: `Unknown ${kind} id "${id}". Ids live for one connection; re-send the object.`
export async function resolveDraft(ref: unknown, ctx: ToolContext): Promise<{ draft: PassportDraft; draftId: string }>;   // id → store; object → validateSchema → PassportDraftError when L1 rejects; store it; return id
export async function resolveBundle(ref, ctx): Promise<{ bundle: DocumentBundle; bundleId: string }>;  // DocumentBundle.parse
export async function resolveFacts(ref, ctx): Promise<{ facts: FactSet; factSetId: string }>;         // FactSet.parse (core exports the Zod schema in extract/types)
```

`validate_passport`: input `{ draft: DraftRef, asOf?: z.string(), skipPlausibility?: z.boolean() }` → `validate(draft, opts)`; output `{ draftId, verdict, findings, layers }`. Text: `Verdict: ${verdict}. ${errors} errors, ${warnings} warnings.` / `Ergebnis: ${verdict}. ${errors} Fehler, ${warnings} Warnungen.` followed by up to 10 findings `- [L?] RULE path: message[lang]`.

`gap_report`: `{ draft: DraftRef, asOf? }` → `report = validate(draft, {asOf})`, `gapReport(draft, { report, asOf })`; output `{ draftId, ...gap }`. Text: `Mandatory ${present}/${total} (${percent} %), overall ${...}. Open mandatory: N` and the first 10 open required items `- attributeId (name[lang]) — whoTypicallyHasIt[lang]`.

`apply_mappings`: input `{ draft: DraftRef.optional(), meta: z.object({ category: z.enum(BATTERY_CATEGORIES), passportId: z.string(), createdAt: z.string().optional() }).optional(), mappings: z.array(z.looseObject({ attributeId: z.string() })) }`; neither or both → `isError` with `Provide either draft or meta`. `meta` → `newDraft({ schemaVersion: SCHEMA_VERSION, category, passportId, createdAt: createdAt ?? ctx.clock })`. `MappingDecision.array().parse(mappings)` then `applyMappings`; store the resulting draft; output `{ draftId, draft, applied, conflicts }`. Text: `Applied N decisions, M conflicts.` and conflicts listed.

Tests (golden): each name in `VALID_SAMPLE_NAMES` → `validate_passport` verdict equals core's `validate(getSample(name)).verdict`, `draftId` matches `/^drf_/`; each broken sample's finding ids contain `expectedFindings`; passing `{ draftId }` back gives the same structured result (byte-identical); unknown id → `isError`, text matches `Unknown draft id`; a draft that fails L1 (`{ meta: {} }`) → `isError` and `structured.findings[0].layer === 'L1'`. `gap_report` on `ev-valid`: `completeness.mandatory.percent === '100.0'`; on `ev-missing-material-identifier`: an item with `status` other than `present` for `batteryMaterials`-family attribute (assert `items.some(i => i.findings.length > 0)`). `apply_mappings` with `meta` and one decision `{ attributeId: 'batteryIdentifier', value: 'X-1' }` → `applied === 1`, `draft.meta.createdAt === '2026-09-05T12:00:00Z'`; applying a different value again without `override` → `conflicts.length === 1`.

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): validate_passport, gap_report and apply_mappings tools`

---

### Task 6: `emit_passport` and the file system adapter contract

**Files:** Create `src/tools/emitPassport.ts`; add `memoryFileSystem` to `test/harness.ts`; extend `test/tools.draft.test.ts`

Input: `{ draft: DraftRef, targets: z.array(z.enum(['aas-json','aasx','draft-json'])).min(1), outDir: z.string().optional(), asOf: z.string().optional() }`. For each target: `aas-json` → `emitAasJson(draft, opts)` bytes = utf8(output), name `${slug}.aas.json`; `aasx` → `emitAasx`, `${slug}.aasx`; `draft-json` → `canonicalJson(draft)`, `${slug}.draft.json`. `slug` copied from `apps/web/src/workflow/exports.ts` (`passportId` without scheme, lowercase, non-alphanumerics to `-`). Verdict and findings: from the `aas-json` or `aasx` result (they agree, D-026); when only `draft-json` is requested run `validate` to get them. With `outDir`: require `ctx.fs` (else `isError` `File output needs a file system; this server was started without one`), `fs.writeFile(fs.join(fs.resolve(outDir), name), bytes)`, return `path` and `size`, no `bytes`. Without: `bytes` base64. Output `{ draftId, verdict, findings, files: [{ target, name, size, path?, bytes? }] }`. Text: `Verdict ${verdict}; wrote/returned N file(s): names`.

`memoryFileSystem(files, root = '/work')`: paths are POSIX; `resolve` normalises `./x` to `${root}/x`, absolute paths kept, throws `PathOutsideRootError` when the normalised path does not start with `root`; `readDir` lists direct children; `writeFile` records into `written`.

Tests: `ev-valid` with all three targets inline → three files, `verdict === 'valid'`, decoding `aasx` bytes and `readAasxEnvironment` succeeds, `aas-json` bytes equal `emitAasJson(...).output`; with `outDir: 'out'` and `memoryFileSystem` → `written` has 3 keys under `/work/out/`, no `bytes` in the result; broken sample `lmt-missing-state-of-charge` → `verdict === 'invalid'` and files still returned; `outDir` without fs → `isError`.

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): emit_passport with inline or file output`

---

### Task 7: `ingest_documents`, `extract_facts`, `suggest_mappings`

**Files:** Create `src/tools/ingestDocuments.ts`, `src/tools/extractFacts.ts`, `src/tools/suggestMappings.ts`; Test `test/tools.ingest.test.ts`

`ingest_documents` input: `{ paths: z.array(z.string()).optional(), inline: z.array(z.object({ name: z.string().min(1), base64: z.string() })).optional(), detail: z.enum(['summary','full']).default('summary'), limits: z.looseObject({}).optional() }`. Neither given → `isError` `Provide paths or inline`. `paths` without `ctx.fs` → `isError` `Paths need a file system; send inline bytes instead`. Path expansion: `stat`; `directory` → `readDir` sorted, keep names whose lower-cased extension is in `pdf xlsx csv docx txt`; `missing` → collected into `errors[]` of the output, not fatal; `PathOutsideRootError` → same. File name in the bundle is the base name. `ingest(files, { limits })`. `documents` summary: `{ name, format, contentType, sha256, lang, pages: pages.length, tables: sum of page.tables.length, lines: sum of page.lines.length, error? }` (check the `Page` shape in `core/src/ingest/types.ts` for the exact field names before writing). Output `{ bundleId, documents, errors, bundle? }`. Text: `Ingested N document(s): name (format, p pages, lang)…`, errors appended.

`extract_facts`: `{ bundle: BundleRef }` → `resolveBundle`, `extractFacts`, `put('facts')`; output `{ factSetId, bundleId, facts }`. Text: `Extracted N facts from M documents.`

`suggest_mappings`: `{ facts: FactsRef, category: z.enum(BATTERY_CATEGORIES), minConfidence: z.number().min(0).max(1).default(0) }` → `suggestMappings(facts, { category })` filtered; output `{ factSetId, category, proposals, counts: { total, atLeast07: n } }`. Text: `N proposals, M at confidence >= 0.7. Top: attributeId = value (conf) …` first 10.

Tests: read the five Musterwerk files from `packages/core/test/fixtures/musterwerk` into `memoryFileSystem({ '/work/docs/<name>': bytes })`; `ingest_documents` with `paths: ['docs']` → `documents.length === 5`, formats and langs equal `expected.files`, no `bundle` key; `detail: 'full'` → `bundle.documents.length === 5`; inline base64 of the same files → identical `bundleId`; a path outside root and a missing path → listed in `errors`, other files still ingested. Chain through ids: `extract_facts({ bundle: { bundleId } })` → `facts.facts.length > 0`; `suggest_mappings({ facts: { factSetId }, category: 'EV', minConfidence: 0.7 })` → the proposals reproduce core's recall gate: `>= 0.8` of `expected.attributes` matched by the `matches` predicate copied from `packages/core/test/mapping.recall.test.ts`; then `apply_mappings({ meta: {...}, mappings: proposals.map(p => ({ attributeId, value, unit, path, source, confidence })) })` → `applied >= 30`, then `gap_report({ draft: { draftId } })` → `completeness.mandatory.present > 0` and `< total`.

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): ingest_documents, extract_facts and suggest_mappings tools`

---

### Task 8: Resources

**Files:** Create `src/resources/index.ts`, `src/resources/cheatsheet.ts`; wire in `server.ts`; Test `test/resources.test.ts`

Static resources (`registerResource(name, uri, meta, cb)`): `passwerk://samples` (JSON `{ valid: [{name, category, description}], broken: [{name, expectedFindings}] }`, descriptions from the sample's `$comment` when present else `''`), `passwerk://reference/attributes` (JSON array of `attributes.map(a => ({ id, name, valueKind, unit, applicability, legalRefs, synonyms, whoTypicallyHasIt, verify }))` — read `AuthoredAttribute` in `rules/src/types.ts` for the exact field names), `passwerk://reference/rules` (`plausibilityRules`), `passwerk://reference/cheatsheet` (`text/markdown`). Templates (`new ResourceTemplate(uri, { list })`): `passwerk://samples/{name}` (list callback enumerates valid and broken names), `passwerk://reference/template/{part}` (`templateCatalogue` filtered by part; 404-style error for unknown part), `passwerk://session/{kind}/{id}` (kind ∈ bundle|facts|draft; `list: undefined`).

Cheat sheet content (both languages in one document, `## Deutsch` then `## English`): the three passport categories with their mandatory attribute count from `getAttributesForCategory`; every timeline event `date — title[lang] (legalRef)`, `verify` flagged with `(zu prüfen)`/`(verify)`; the workflow order; the confidence rule; the disclaimer.

Tests: `listResources` contains the four static URIs; `listResourceTemplates` contains three; reading `passwerk://samples/ev-valid` parses to an object with `meta.category === 'EV'`; `passwerk://reference/template/1` items all have `part === 1`; the cheat sheet contains `2027-02-18` and `Batteriepass` and `isNotLegalAdvice`; after `validate_passport` on a sample, `passwerk://session/draft/{draftId}` returns the draft; unknown id → rejected promise.

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): samples, reference and session resources`

---

### Task 9: Prompts

**Files:** Create `src/prompts/index.ts`, `src/prompts/texts.ts`; wire in `server.ts`; Test `test/prompts.test.ts`

`registerPrompt(name, { title, description, argsSchema: { category: z.string().optional(), lang: z.string().optional() } }, cb)`. `texts.ts` exports `buildPassportInterview(lang, category?)`, `auditSupplierSubmission(lang)`, `draftDataRequest(lang)` returning strings; each ends with the shared `honesty(lang)` block (no validity claim without `validate_passport`, answer in the user's language, `isNotLegalAdvice`). Messages: one `user` message.

Tests: `listPrompts` has the three names; `getPrompt('build-passport-interview', { lang: 'de', category: 'EV' })` text contains `check_obligations`, `validate_passport`, `EV` and `Rechtsberatung`; English contains `legal advice`; each prompt mentions the tool names it needs (`gap_report` for the data request).

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): the three workflow prompts`

---

### Task 10: Node file system, logger, stdio entry

**Files:** Create `src/fs.ts`, `src/logging.ts`, `src/bin.ts`; Test: `test/fs.test.ts` (node adapter on a temp dir)

`nodeFileSystem(root?: string)`: `node:fs/promises` and `node:path`; `resolve` = `path.resolve(root ?? process.cwd(), p)`; when `root` given, throw `PathOutsideRootError` unless `resolved === root || resolved.startsWith(root + sep)`. `stat` maps ENOENT to `missing`.

`stderrLogger(level: 'info' | 'debug')`: writes `[passwerk] ${message}` JSON-lines to `process.stderr`; `debug` lines only when enabled; payloads only when `PASSWERK_LOG_PAYLOADS=1` (the tool wrapper in `server.ts` logs `{ tool, inBytes, outBytes }` at info when payload logging is on, and the payloads at debug).

`bin.ts`: shebang; parse `process.argv.slice(2)` by hand (`--http [port]`, `--host <h>`, `--root <dir>`, `--version`, `--help`); env `PASSWERK_ROOT`, `PASSWERK_AUTH_TOKEN`, `PASSWERK_LOG_PAYLOADS`, `PASSWERK_LOG_LEVEL`. Default: `createServer({ fs: nodeFileSystem(root), clock: new Date().toISOString(), log })`, `StdioServerTransport`, `server.connect`. `--http` → `startHttp` (Task 11).

Test: temp dir with a file and a sub directory; `readDir`, `stat`, `readFile`, `writeFile`, `resolve('../x')` throws under a root.

- [ ] Steps: test → FAIL → implement → PASS → `pnpm build` and a smoke run `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"x","version":"0"}}}' | node packages/server/dist/bin.js` prints one JSON line → commit `feat(server): stdio entry point with file system root and stderr logging`

---

### Task 11: Streamable HTTP

**Files:** Create `src/http.ts`; Test `test/http.test.ts`

```ts
export interface HttpOptions { host: string; port: number; token: string; root?: string; log: Logger; clock?: () => string; maxBodyBytes?: number }
export async function startHttp(o: HttpOptions): Promise<{ url: string; close(): Promise<void> }>;
```

`node:http` server. Routes: `GET /healthz` → 200 `{ status: 'ok', name, version }`. `/mcp` (POST, GET, DELETE): check `Authorization: Bearer ${token}` with a constant-time compare (`timingSafeEqual` on equal-length buffers) → else 401 `{ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null }`. POST: read body up to `maxBodyBytes` (default core `DEFAULT_INGEST_LIMITS.maxInputBytes * 1.4`) else 413; `JSON.parse`. Session map `Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>`; header `mcp-session-id` known → reuse; unknown and `isInitializeRequest(body)` → new `createServer({ fs: nodeFileSystem(root), clock: clock(), log })` and `new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: id => map.set(id, …), onsessionclosed: id => map.delete(id), enableDnsRebindingProtection: host is loopback, allowedHosts: [`${host}:${port}`, 'localhost', '127.0.0.1'] })` (verify the option names in `webStandardStreamableHttp.d.ts` before use); otherwise 404 session not found. `transport.onclose` deletes the entry and closes the server. Anything else → 404.

Test: `startHttp({ host: '127.0.0.1', port: 0, token: 't0ken', log: noop })`; `fetch(url + '/healthz')` → 200; `fetch(url + '/mcp', { method: 'POST', body })` without header → 401; SDK `StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { Authorization: 'Bearer t0ken' } } })` + `Client` → `listTools().tools.length === 10` and `list_capabilities` works; a second client gets a different `transport.sessionId` and its `list_capabilities.server.session.entries === 0` after the first stored a draft; `close()` stops the listener. `bin.ts` behaviour "no token → exit 2" is tested by spawning `node dist/bin.js --http 0` with an empty env and asserting the exit code (skip when `dist` is absent, `pnpm build` runs before tests in CI).

- [ ] Steps: test → FAIL → implement → PASS → commit `feat(server): Streamable HTTP with bearer auth, per-session stores and /healthz`

---

### Task 12: Sovereignty coverage

**Files:** Create `packages/core/test/helpers/networkGuard.ts` (move the guard install/uninstall and attempt list out of `packages/core/test/sovereignty.test.ts`, keep that test's behaviour unchanged); Create `packages/server/test/sovereignty.test.ts`

Server test: install guards; `connect({ fs: memoryFileSystem(musterwerk) })`; call every tool in `TOOLS` with a valid argument set (paths ingest, inline ingest, the id chain, all three emit targets, obligations, explain, capabilities); read every static resource and one of each template; get every prompt; assert `attempts` is empty and `listTools().tools.map(t => t.name)` equals the registry names (so a new tool cannot be added without joining this test: the test iterates `TOOLS` and fails on any name it has no argument set for).

- [ ] Steps: refactor core test (run it, still green) → server test → PASS → commit `test(server): the whole server surface makes no network attempt`

---

### Task 13: Skill, install docs, `.mcp.json`

**Files:** Create `skills/passwerk/SKILL.md`, `skills/passwerk/references/workflow.md`, `references/resources.md`, `references/cli.md`, `docs/install/{claude-code,codex,opencode,cursor,claude-desktop,http,inspector}.md`, `.mcp.json`; Test: `packages/server/test/skill.test.ts`

`SKILL.md` frontmatter: `name: passwerk`, `description:` the sentence from build plan 5.4. Body: the six workflow steps naming the tools, confidence rule, fix loop bound (5), stop conditions (missing category, ingest errors, unresolved conflicts, verdict invalid after 5 loops), honesty rules, DE/EN rule, disclaimer, pointers to `references/`. `cli.md` describes the commands planned for PR 6.2 and says so.

`.mcp.json`: `{ "mcpServers": { "passwerk": { "command": "node", "args": ["packages/server/dist/bin.js"], "env": { "PASSWERK_ROOT": "." } } } }`.

Install pages: each shows the config block, the build prerequisite (`pnpm build`), and a first prompt (`Use the passwerk skill to build a passport from ./docs`). Config keys not confirmed from the host's documentation carry `<!-- verify -->`. `http.md`: `PASSWERK_AUTH_TOKEN=… passwerk-server --http 3777`, the header, `/healthz`, the privacy note from build plan 2.5. `inspector.md`: `npx @modelcontextprotocol/inspector --cli node packages/server/dist/bin.js --method tools/list` and a `tools/call` example.

Test: `SKILL.md` parses (frontmatter has `name` and `description`), mentions every tool name in `TOOLS` except none missing, and contains `validate_passport` before `emit_passport`; `.mcp.json` parses and points at an existing path after build (assert the string only).

- [ ] Steps: test → FAIL → write → PASS → commit `docs: passwerk agent skill and per-host install pages`

---

### Task 14: ADR, status, README, final check

**Files:** Modify `docs/DECISIONS.md` (append D-031), `AGENTS.md` (Phase 6.1 status line, dependency direction sentence), `README.md` (tools table, install pointer), `docs/BUILD_PLAN.md` section 7 Phase 6 (note the two-PR split and the adjusted DoD, one paragraph).

D-031 text: the six departures from spec section 8 with context, decision, consequences.

- [ ] `pnpm check` → paste real output. `pnpm build` green. `pnpm oracle` unaffected (no emitter change) but run `pnpm test` in full.
- [ ] Commit `docs: ADR D-031 and Phase 6.1 status`, push, open PR "feat(server): Phase 6.1 MCP server, skill and install docs" with the session link.
