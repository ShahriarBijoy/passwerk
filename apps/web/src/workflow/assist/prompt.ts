import type { AssistRequest, CatalogueEntry, RequestFact, RequestProposal } from './types.ts';

export interface Prompt {
  system: string;
  user: string;
}

const LANGUAGE_NAME = { de: 'German', en: 'English' } as const;

const CATEGORY_NAME = {
  EV: 'electric vehicle battery',
  LMT: 'light means of transport battery (e-bike, e-scooter)',
  INDUSTRIAL_GT_2KWH: 'industrial battery above 2 kWh',
} as const;

/**
 * The contract, stated once. `parseResponse` enforces every line of it, so a model that
 * ignores the instructions loses its output to a counted discard rather than to silence.
 */
const SYSTEM = `You map labelled values from a battery supplier's documents onto the data points of the EU Digital Battery Passport (Regulation (EU) 2023/1542, DIN DKE SPEC 99100).

You have exactly two jobs.

1. SUGGEST. For each fact, decide whether it is one of the catalogue attributes. Most facts are not: a supplier document is full of order numbers, contact details and packaging notes that no passport attribute wants. Suggest nothing for those. Only suggest when the label and the value together clearly identify the attribute.
2. CRITIQUE. Some existing mappings are given to you. Flag only the ones that look wrong — a label that means something adjacent but different (charging voltage where nominal voltage is wanted), a unit or magnitude that cannot be right for that attribute. Say nothing about the ones that look correct.

Rules you must follow:

- You choose attribute ids. You never supply a value, a unit or a confidence. The value of an accepted suggestion is taken from the document by the application itself, so any value you write is discarded.
- Use only attribute ids that appear in the catalogue below, spelled exactly. An id that is not in the catalogue is thrown away.
- Use only the fact ids that are given to you. Do not invent one.
- For an attribute with sub-fields, give the "path" of the sub-field. Otherwise leave "path" out.
- Prefer saying nothing to guessing. A wrong suggestion costs the reviewer more than a missing one.

Answer with a single JSON object and no other text:

{"suggestions":[{"fact":"f0","attribute":"someAttributeId","path":"optional.sub.field","reason":"one short sentence"}],"critiques":[{"proposal":"p0","reason":"one short sentence"}]}

Use an empty array where you have nothing to say.`;

const unitOf = (unit: string | null): string => (unit === null ? '' : ` [${unit}]`);

function rangeOf(range: CatalogueEntry['range']): string {
  if (!range) return '';
  const { min, max } = range;
  if (min !== null && max !== null) return ` (${min}..${max})`;
  if (min !== null) return ` (>= ${min})`;
  if (max !== null) return ` (<= ${max})`;
  return '';
}

const catalogueLine = (e: CatalogueEntry): string =>
  `- ${e.id}${unitOf(e.unit)}${rangeOf(e.range)} — ${e.name.en} / ${e.name.de} — ${e.valueKind} — ${e.hint}`;

const factLine = (f: RequestFact): string =>
  `- ${f.id}: "${f.label}" = "${f.value}"${f.unit === undefined ? '' : ` ${f.unit}`} (${f.lang})`;

// The source label leads the line: the question is whether that label means that attribute,
// and the value alone cannot tell a wrong mapping from a right one.
const proposalLine = (p: RequestProposal): string =>
  `- ${p.id}: "${p.label}" = "${p.value}"${p.unit === undefined ? '' : ` ${p.unit}`} was mapped to ${
    p.attributeId
  }${p.path === undefined ? '' : `.${p.path}`} (confidence ${p.confidence})`;

const listOrNone = (lines: string[]): string => (lines.length === 0 ? '(none)' : lines.join('\n'));

/**
 * The request as the text that is actually sent. Everything here comes from `AssistRequest`,
 * which carries no provenance, so no file name, page or cell can reach the wire;
 * `prompt.test.ts` asserts that over the assembled string.
 */
export function buildPrompt(request: AssistRequest): Prompt {
  const language = LANGUAGE_NAME[request.language];
  const user = [
    `The battery is an ${CATEGORY_NAME[request.category]} (category ${request.category}).`,
    `Write every "reason" in ${language}.`,
    '',
    'CATALOGUE (the only attribute ids you may use):',
    listOrNone(request.catalogue.map(catalogueLine)),
    '',
    'FACTS to place (most will not belong to any attribute):',
    listOrNone(request.facts.map(factLine)),
    '',
    'EXISTING MAPPINGS to critique (flag only the wrong ones):',
    listOrNone(request.proposals.map(proposalLine)),
  ].join('\n');
  return { system: SYSTEM, user };
}
