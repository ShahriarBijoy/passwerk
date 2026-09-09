# Web app design: bring-your-own-key mapping assist

Date: 2026-09-08. Status: approved by the owner in conversation (suggestion **and** critique,
Anthropic plus an OpenAI-compatible base URL, key persisted only behind an explicit opt-in).

This document refines build plan section 7, Phase 7a ("Optional bring-your-own-key model call
from the browser for semantic mapping (D-002 boundary)") into the design of the last Phase 7a
pull request. It changes `apps/web` only. `@passwerk/core`, `@passwerk/server`,
`@passwerk/cli` and `@passwerk/rules` are not touched.

## 1. Goal and the problem it solves

`suggestMappings` proposes a mapping only when a fact's label scores against the synonym index
(`labelScore(fact.labelKey, entry) > 0` in `packages/core/src/mapping/propose.ts`). A label the
index has never seen produces **no proposal at all**, which is what the held-out evaluation
measures: 42.9 % recall over documents transcribed from public datasheets, against 94.1 % on
the Musterwerk fixtures whose wording the index was authored against (`docs/EVALUATION.md`,
ADR D-028).

The gap is vocabulary, not arithmetic. A model is good at "`Nennspannung (DC)` is
`nominalVoltage`" and bad at everything else in this pipeline. So the assist is scoped to the
one judgement the deterministic path cannot make, and to a second-opinion pass over the
proposals it does make.

Non-goal: raising the numbers in `docs/EVALUATION.md`. That file measures the deterministic
pipeline and continues to. The assist is never part of a recall or precision figure.

## 2. What the model is allowed to decide

**Only which attribute a fact belongs to.** The response contract carries `attributeId`, an
optional composite `path`, and a reason. If the model returns a value, a unit or a confidence,
those fields are discarded without being read.

The value comes from core. For an accepted suggestion the app calls
`proposalValue(attribute, fact)` — core's own shaping, including the attribute's value schema
and its knowledge-base range (ADR D-021) — and the provenance is the fact's real
`source` (file, page, cell). Nothing in the emitted passport can originate in the model.

This is the whole safety argument, and it is what keeps the assist inside the "never invent"
rule in `AGENTS.md`. The model narrows a choice among 93 knowledge-base attributes; it does
not author a legal document.

### 2.1 Guards on the response

Each dropped item is counted and shown, never silently discarded:

| Guard | Condition | Reason code |
|---|---|---|
| Unknown attribute | `attributeId` is not in the catalogue that was sent | `unknown-attribute` |
| Not applicable | the attribute's `applicability[category].status === 'not_displayed'` | `not-applicable` |
| Unknown fact | `factId` is not in the effective fact set | `unknown-fact` |
| Bad leaf | `path` is not a leaf of that composite (`compositeLeaves`) | `unknown-path` |
| Value refused | `proposalValue(attribute, fact)` returns `undefined` | `value-refused` |
| Duplicate | the same `(factId, attributeId, path)` appears twice | `duplicate` |
| Already decided | a decision already exists for that key | `already-decided` |

`value-refused` is the interesting one: it is the honest report that the model named an
attribute core will not carry this fact's value in (wrong type, out of the knowledge-base
band). It is shown with the attribute name so the reviewer can see what was rejected and why.

### 2.2 Critique

A critique carries `{ factId, attributeId, path?, reason }` identifying an existing
deterministic proposal, and renders as a warning chip on that proposal's row in the review
screen with the model's reason underneath. A critique that does not resolve to a proposal
currently on screen is dropped as `unknown-proposal`.

A critique **never** changes a verdict, never touches the draft, never rejects anything. It is
a prompt to the reviewer, who then uses the existing accept / reject / edit controls. It
applies to proposals in any decision state, including already-accepted ones, because catching
a wrong acceptance is the most useful thing it can do.

### 2.3 No synthetic confidence

Assist suggestions carry no numeric confidence and are never merged into the deterministic
proposal list. `MappingProposal.confidence` is a deterministic score with a documented
formula; a number invented next to it would poison the one signal the reviewer has learned to
trust. Suggestions live in their own panel, badged as assist output, sorted by attribute id.

## 3. Where the code lives

`apps/web/src` keeps its three layers and its tested import boundary (ADR D-029). The assist
splits along the same seam: everything pure in `workflow`, the network in `app`.

```
workflow/assist/
  types.ts       AssistRequest, AssistResponse, AssistSuggestion, AssistCritique,
                 AssistDiscard, AssistClient, AssistState
  catalogue.ts   the attribute catalogue sent to the model, from @passwerk/rules
  request.ts     buildRequest(facts, proposals, decisions, category) -> AssistRequest
  response.ts    parseResponse(text, context) -> { suggestions, critiques, discards }
  accept.ts      suggestion -> the prefill AddValueDialog already understands

app/assist/
  anthropic.ts   the Anthropic Messages envelope
  openai.ts      the OpenAI-compatible chat/completions envelope
  client.ts      makeAssistClient(config) -> AssistClient, over plain fetch
  key.ts         the key's own IndexedDB record

views/
  AssistPanel.tsx     settings, disclosure, run, results
  AssistBadge.tsx     the chip on a critiqued proposal row
```

`workflow` must not learn what an endpoint is. `AssistClient` is
`(request: AssistRequest, signal: AbortSignal) => Promise<string>` — it takes the structured
request and returns the model's raw text. Building the payload and parsing the answer are
pure and unit-tested without a network or a fake server.

### 3.1 The shell reaches it through `Platform`

`Platform` (`app/platform.ts`) already carries `download`, `clearPersisted` and
`pdfWorkerSrc` for exactly this reason (ADR D-037). It gains:

```ts
/** Optional browser-side model client (ADR D-038). Absent means the assist is unavailable
 *  and its UI does not render: the MCP App supplies none, because its host already has a model. */
assist?: AssistPlatform;
```

`AssistPlatform` exposes `run`, plus the key's `load` / `save` / `clear`. `browserPlatform`
supplies it; `apps/mcp-app` does not. That single omission keeps the MCP App's sovereignty
proof true without a line of change there, and it is the reason the endpoint constants live in
`app/assist/` rather than in `workflow` — the mcp-app bundle then cannot contain them, which
is asserted as a test.

## 4. Accepting a suggestion: no new decision kind

`AddValueDialog` already accepts `prefill={{ factId, value, unit }}` and emits a `manual`
decision that keeps the fact's provenance; `factsModel.factStatuses` already counts a manual
decision with a `factId` as mapped; `derive/mappings.ts` `toMapping` already turns it into a
`MappingDecision` with `source: [fact.source]` and `override: true`.

The only change is widening the prefill:

```ts
prefill?: { factId: string; value: string; unit?: string; attributeId?: string; path?: string };
```

When `attributeId` is present the dialog opens with the attribute (and leaf) selected and the
reviewer confirms or changes it. So accepting an assist suggestion is the existing manual
mapping flow with one field filled in, and the draft, the conflict detection, the validation
layers and the audit trail are untouched. A "reject" on a suggestion removes it from the
panel for this run and records nothing.

## 5. What leaves the browser

The request payload is fixed and small:

```ts
interface AssistRequest {
  category: BatteryCategory;
  language: Language;
  catalogue: { id, name: {de,en}, valueKind, unit, range, dinCategory, hint }[];
  facts: { id, label, value, unit, lang }[];
  proposals: { factId, attributeId, path?, value, unit?, confidence }[];
}
```

- `catalogue`: knowledge-base attributes eligible for the project's category, with the
  explanation trimmed to a one-line `hint`. This is public reference data.
- `facts`: only facts that are **unmapped or proposed below 0.7**, and only their label, value,
  unit and language. **No file names, no page or cell references, no document bytes, no table
  context.** A file name can carry the supplier's identity; the mapping question does not need
  it.
- `proposals`: the deterministic proposals at or above 0.7, for the critique pass.

The panel discloses this before the first call: the endpoint, the number of facts, and an
expandable view of the literal JSON that will be sent. A snapshot test over `buildRequest`
pins the payload's exact shape, so any future field addition has to be argued for in review.

Nothing is sent automatically. The reviewer presses a button, once, per run.

## 6. Transport and configuration

Plain `fetch`. No SDK: the Anthropic browser SDK would add a dependency and bundle weight for
two request envelopes of about twenty lines each, and `pnpm minimumReleaseAge` friction for
no gain.

| Provider | Endpoint | Auth | Notes |
|---|---|---|---|
| `anthropic` | `https://api.anthropic.com/v1/messages` | `x-api-key` | `anthropic-version: 2023-06-01` and `anthropic-dangerous-direct-browser-access: true`. Default model `claude-sonnet-5`, matching `passwerk chat` (ADR D-032). |
| `openai-compatible` | `<base URL>/chat/completions` | `Authorization: Bearer` | Base URL typed by the reviewer, so `http://localhost:11434/v1` (Ollama) or LM Studio work and nothing leaves the building. The key may be empty for a local runner. |

Both are asked for JSON only, and both responses reduce to a single string of model text that
`parseResponse` handles. The parser takes the first balanced `{...}` block, `JSON.parse`s it
and validates with Zod. A response that will not parse is reported with its raw text shown,
not retried and not repaired: a failed run says so.

One call per run, no streaming, no multi-turn, no tool use. `AbortSignal` on a cancel button
and a fixed timeout. An HTTP error surfaces the status and the provider's message verbatim.

### 6.1 The key

In memory for the tab by default. A "remember on this device" checkbox writes it to its own
IndexedDB record (`passwerk.web.assist.key`), deliberately **not** into `WorkflowState`:

- exported draft JSON and the autosaved workflow state can never carry a key,
- "start over" clears the workflow without clearing the key, and clearing the key does not
  discard hours of review,
- the checkbox is the only thing that ever writes it, and unticking deletes the record.

The panel says plainly, in both languages, that a stored key can be read by anything with
access to this browser profile.

## 7. State

`WorkflowState` gains one slice, and it is an **input** like `factEdits`, not a derivation:

```ts
assist: AssistState | null;   // last run only

interface AssistState {
  runAt: string;              // injected clock, never Date.now()
  provider: 'anthropic' | 'openai-compatible';
  model: string;
  suggestions: AssistSuggestion[];
  critiques: AssistCritique[];
  discards: AssistDiscard[];
}
```

`derive` does not read it: the assist changes the draft only through the decisions the
reviewer makes, so verdicts stay a pure function of project, facts, edits and decisions. The
panel reads `assist` directly. Provider and model are recorded so the panel can say which
model produced what is on screen.

Actions: `assistRan`, `assistDismissedSuggestion`, `assistCleared`. `reset` clears it;
`setProject` with a changed category clears it, because a catalogue for another category makes
the suggestions meaningless.

`STATE_VERSION` goes 2 → 3. `loadState` currently discards any record whose version differs,
which would throw away a reviewer's in-progress work on upgrade. It gains a migration step:
a v2 record becomes v3 by adding `assist: null`. Unknown versions still discard.

## 8. Tests

Test-driven, in this order.

**Unit (`apps/web/test/assist/`)**

1. `catalogue.test.ts` — only attributes eligible for the category; `not_displayed` excluded;
   deterministic order; DE and EN names both present.
2. `request.test.ts` — the payload snapshot; only sub-0.7 and unmapped facts included; **no
   file name, page, cell or document text anywhere in the serialised request** (asserted by
   searching the JSON for the fixture's file names).
3. `response.test.ts` — one case per guard in 2.1, including a hallucinated `attributeId` and a
   `value` field in the response proving it is ignored; a malformed body; a body wrapped in
   prose and code fences.
4. `accept.test.ts` — a suggestion becomes the prefill `AddValueDialog` expects, and the
   resulting `manual` decision carries the fact's provenance.
5. `reducer.test.ts` additions — `assistRan`, dismissal, clearing on category change and reset.
6. `persistence.test.ts` addition — a v2 record migrates to v3 with `assist: null`.

**End to end (`apps/web/e2e/`)**

7. `sovereignty.spec.ts` stays green **unchanged**. The assist is off unless configured, so the
   existing proof that no request leaves the origin still holds for the whole workflow.
8. `assist.spec.ts` — `page.route` serves a stubbed model response from a fixture. The run
   reaches only the configured endpoint (every other foreign request fails the test), the
   suggestion appears, accepting it adds the value with the fact's provenance, and a critique
   chip appears on the critiqued row. A second case: a hallucinated attribute in the stub
   response shows up as a discard and never as an accepted value.
9. `boundary.test.ts` addition — no endpoint host string in the `apps/mcp-app` inlined HTML,
   and `workflow/` imports nothing from `app/assist`.

## 9. Out of scope

Auto-running the assist, streaming, cost or token estimation, multi-turn conversation, any
change to `core` or `server`, BYOK inside the MCP App (its host already has a model; the
natural route there is MCP sampling, and that is its own decision), and any use of the assist
in `docs/EVALUATION.md`.

## 10. Risks

- **Anthropic CORS.** The direct-browser path requires
  `anthropic-dangerous-direct-browser-access: true`. This has not been exercised from this
  repo. It is verified on the first real run against the live API; if the header is not
  enough, the Anthropic provider ships disabled with an honest message and the
  OpenAI-compatible path (including Anthropic's own compatibility endpoint) carries the
  feature. This is recorded either way in the ADR.
- **A convincing wrong suggestion.** Mitigated by construction: no synthetic confidence, an
  explicit accept through the existing dialog, core's value schema as the last gate, and the
  provenance shown on the row.
- **Payload creep.** Mitigated by the snapshot test and the disclosure panel showing the
  literal JSON.

## 11. ADR

D-038: "The browser assist chooses attributes, never values" — records the D-002 boundary as
drawn here (the key lives in the browser, `core` and `server` still make zero model calls),
the platform-capability seam, the no-synthetic-confidence rule, the fixed payload, and the
CORS outcome from risk 10.
