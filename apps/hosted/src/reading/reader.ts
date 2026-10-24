/**
 * The AI reading step. Code finds candidates (facts, comma segments, tables, columns, rows),
 * Jev chooses among them or judges them, and code assembles every value from the chosen
 * facts and cells, checks it against core's schemas and applies the reading policy.
 */
import {
  byCodePoint,
  COMPOSITE_SCHEMAS,
  canonicalJson,
  type DocumentBundle,
  type Fact,
  GraphicRef,
  getPath,
  IsoDateTime,
  type MappingDecision,
  type Provenance,
  parsePath,
  proposalValue,
  setPath,
  valueSchemaFor,
} from '@passwerk/core';
import { type Attribute, attributes, getAttribute, getRule } from '@passwerk/rules';
import type { ChoiceResponse, ContentValue, Question } from '@typesafe-ai/sdk';
import type { z } from 'zod';
import {
  columnQuestion,
  DOCUMENT_TARGET,
  isDateish,
  isNumericFact,
  joinQuestion,
  leafQuestion,
  listTableQuestion,
  location,
  NONE,
  type ReadingTable,
  registerRowQuestion,
  registerTableQuestion,
  rowQuestion,
  type Segment,
  scalarQuestion,
  segmentsOf,
  seriesQuestion,
  sourceTableQuestion,
  tableState,
  timestampQuestion,
  vetoQuestion,
} from './questions.js';
import {
  DOCUMENT_LEAVES,
  ENTRY_LEAVES,
  type LeafKind,
  leafKind,
  leafSchema,
  OBJECT_LEAVES,
  SERIES,
} from './schema.js';
import { JEV_MODEL } from './transport.js';
import type { Answer, Ask, Reader, ReadingInput, ReadingResult } from './types.js';

export const POLICY = {
  /**
   * A choice is applied when its confidence reaches this: Choice confidence for tables,
   * columns, register rows and timestamps, value mass for fact and leaf picks. A Noul is
   * decisive when its probability is at least this or at most one minus this.
   */
  apply: 0.9,
  /** A table is considered for a list (or as a register) from this Noul on. */
  candidate: 0.5,
  /**
   * A rule-based accept is dropped when P(no) reaches this. Dropping a correct accept costs a
   * value the documents state, keeping a wrong one costs what the chain costs today, so only a
   * near-certain no vetoes: at 0.95 the model gives the fact one chance in twenty of stating
   * the attribute.
   */
  veto: 0.95,
  /** Characters / 4 per request; measured requests come out about 1.5 times this in tokens. */
  requestEstimate: 22_000,
} as const;

const TIMESTAMPED = new Set(getRule('PW-PLAUS-011')?.attributes ?? []);
const DOCUMENT_ATTRIBUTES = attributes.filter(
  (a) => a.valueKind === 'document' || a.valueKind === 'graphic',
);
const REGISTER = 'register';

type Route = 'register' | 'list' | 'series' | 'object' | 'scalar';

function routeOf(a: Attribute): Route | undefined {
  if (a.valueKind === 'document' || a.valueKind === 'graphic') return 'register';
  if (SERIES[a.id]) return 'series';
  if (a.valueKind !== 'composite') return 'scalar';
  if (ENTRY_LEAVES[a.id]) return 'list';
  return OBJECT_LEAVES[a.id] ? 'object' : undefined;
}

export function tablesOf(bundle: DocumentBundle): ReadingTable[] {
  const out: ReadingTable[] = [];
  for (const d of bundle.documents) {
    for (const p of d.pages) {
      for (const t of p.tables) {
        const [head, ...body] = t.rows;
        if (!head || body.length === 0) continue;
        out.push({
          ref: `T${out.length + 1}`,
          document: d.name,
          ...(p.title ? { sheet: p.title } : {}),
          lang: p.lang,
          source: t.source,
          header: head.map((c) => c.text),
          rows: body.map((r) => r.map((c) => c.text)),
        });
      }
    }
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const blank = (s: string | undefined): s is undefined =>
  s === undefined || /^[-–—]?$/.test(s.trim());

function cellValue(kind: LeafKind, text: string, lang: string): unknown {
  switch (kind) {
    case 'decimal':
      return norm(text)
        .replace(/(\d),(\d)/g, '$1.$2')
        .replace(/\s*%$/, '');
    case 'multilingual':
      return { [lang]: norm(text) };
    case 'list':
      return text
        .split(text.includes(';') ? ';' : ',')
        .map(norm)
        .filter(Boolean);
    case 'text':
      return norm(text);
  }
}

const round = (n: number) => Number(Math.min(1, n).toFixed(4));
const reaches = (p: number, threshold: number) => p + 1e-9 >= threshold;
const below = (what: string, p: number) =>
  reaches(p, POLICY.apply)
    ? undefined
    : `${what} at ${round(p)}, below the ${POLICY.apply} the policy applies`;
const decisive = (p: number) => Math.max(p, 1 - p);

/** Probability of the picked value, summed over every option that carries the same value. */
function valueMass(answer: ChoiceResponse, keyOf: (option: string) => string | undefined): number {
  const picked = keyOf(answer.choice);
  if (picked === undefined) return answer.probabilities[answer.choice] ?? 0;
  let mass = 0;
  for (const [option, p] of Object.entries(answer.probabilities)) {
    if (keyOf(option) === picked) mass += p;
  }
  return mass;
}

const factSource = (f: Fact, model: string): Provenance => ({
  ...f.source,
  note: `read by ${model}`,
});
const factWhere = (f: Fact) => `${f.source.file} ${location(f)}`;
const tableWhere = (t: ReadingTable) =>
  `${t.document}${t.sheet ? ` sheet ${t.sheet}` : ''}, table ${t.ref}`;

/** One value the reader assembled; `hold` says why it waits for a person. */
interface Found {
  decision: MappingDecision & { confidence: number; source: Provenance[] };
  where: string;
  hold?: string | undefined;
}

class Answers {
  private readonly all = new Map<string, Answer>();

  add(id: string, a: Answer) {
    this.all.set(id, a);
  }

  choice(id: string): ChoiceResponse | undefined {
    const a = this.all.get(id);
    if (a !== undefined && a.type !== 'choice') throw new Error(`answer ${id} is not a choice`);
    return a;
  }

  noul(id: string): number | undefined {
    const a = this.all.get(id);
    if (a !== undefined && a.type !== 'noul') throw new Error(`answer ${id} is not a noul`);
    return a?.noul;
  }
}

type State = { [key: string]: ContentValue };

/** One rule-based accept per attribute and composite leaf, so the slot names it. */
export const slotKey = (p: { attributeId: string; path?: string | undefined }): string =>
  p.path === undefined ? p.attributeId : `${p.attributeId}.${p.path}`;

export function createReader(ask: Ask, model: string = JEV_MODEL): Reader {
  return { read: (input) => read(ask, model, input) };
}

async function read(ask: Ask, model: string, input: ReadingInput): Promise<ReadingResult> {
  const usage = { inputTokens: 0, requests: 0 };
  const answers = new Answers();

  async function askAll(stage: string, state: State, questions: Map<string, Question>) {
    if (questions.size === 0) return;
    const estimate = (v: unknown) => Math.ceil(JSON.stringify(v).length / 4);
    const base = estimate(state);
    const chunks: [string, Question][][] = [];
    let current: [string, Question][] = [];
    let size = base;
    for (const entry of questions) {
      const t = estimate(entry[1]);
      if (current.length > 0 && size + t > POLICY.requestEstimate) {
        chunks.push(current);
        current = [];
        size = base;
      }
      current.push(entry);
      size += t;
    }
    if (current.length > 0) chunks.push(current);
    const responses = await Promise.all(
      chunks.map((chunk, i) =>
        ask(`${stage} ${i + 1}/${chunks.length}`, {
          model,
          state,
          questions: Object.fromEntries(chunk),
        }),
      ),
    );
    responses.forEach((r, i) => {
      usage.requests += 1;
      usage.inputTokens += r.inputTokens;
      for (const [id] of chunks[i] ?? []) {
        const a = r.answers[id];
        if (!a) throw new Error(`Jev returned no answer for ${id}`);
        answers.add(id, a);
      }
    });
  }

  const { category, draft, facts } = input;
  const factById = new Map(facts.map((f) => [f.id, f]));
  const segments = segmentsOf(facts);
  const segmentById = new Map<string, Segment>(segments.map((s) => [s.id, s]));
  const numeric = facts.filter(isNumericFact);
  const tables = tablesOf(input.bundle);
  const field = (id: string) => draft.attributes[id];
  const present = (id: string) => field(id)?.status === 'present';

  const routes: Record<Route, Attribute[]> = {
    register: [],
    list: [],
    series: [],
    object: [],
    scalar: [],
  };
  for (const id of new Set(input.open)) {
    const a = getAttribute(id);
    const route = a && routeOf(a);
    if (a && route) routes[route].push(a);
  }
  const absent = (as: Attribute[]) => as.filter((a) => !present(a.id));
  const lists = absent(routes.list);
  const registers = absent(routes.register);
  const stamped = routes.scalar.filter(
    (a) => TIMESTAMPED.has(a.id) && field(a.id)?.recordedAt === undefined,
  );

  const objectLeaves = routes.object.flatMap((a) =>
    Object.entries(OBJECT_LEAVES[a.id] ?? {})
      .filter(([path]) => getPath(field(a.id)?.value, parsePath(path)) === undefined)
      .map(([path, description]) => ({ a, path, description })),
  );

  const battery: State = {
    battery: `One battery (category ${category}) described by its supplier documents`,
  };
  const factQuestions = new Map<string, Question>();
  for (const { a, path, description } of objectLeaves) {
    const decimal = leafKind(a.id, path) === 'decimal';
    factQuestions.set(
      `leaf|${a.id}|${path}`,
      leafQuestion(
        category,
        a,
        path,
        description,
        decimal ? numeric : facts,
        decimal ? [] : segments,
      ),
    );
  }
  for (const a of absent(routes.scalar)) {
    const isNumber = ['decimal', 'integer', 'percentage'].includes(a.valueKind);
    factQuestions.set(`scalar|${a.id}`, scalarQuestion(category, a, isNumber ? numeric : facts));
  }
  for (const a of stamped) {
    factQuestions.set(`time|${a.id}`, timestampQuestion(category, a, facts.filter(isDateish)));
  }

  const seriesQuestions = new Map<string, Question>();
  for (const a of absent(routes.series)) {
    for (const f of numeric) {
      seriesQuestions.set(`series|${a.id}|${f.id}`, seriesQuestion(a, SERIES[a.id] ?? '', f));
    }
  }

  const vetoQuestions = new Map<string, Question>();
  input.accepted.forEach((p, i) => {
    const a = getAttribute(p.attributeId);
    const f = factById.get(p.factId);
    if (a && f) vetoQuestions.set(`veto|${i}`, vetoQuestion(a, p.path, f));
  });

  const tableQuestions = new Map<string, Question>();
  for (const t of tables) {
    for (const a of lists) tableQuestions.set(`table|${t.ref}|${a.id}`, listTableQuestion(t, a));
    if (registers.length > 0) {
      tableQuestions.set(`table|${t.ref}|${REGISTER}`, registerTableQuestion(t));
    }
  }

  await Promise.all([
    askAll('tables', { tables: tables.map(tableState) }, tableQuestions),
    askAll('facts', battery, factQuestions),
    askAll('series', battery, seriesQuestions),
    askAll('veto', battery, vetoQuestions),
  ]);

  const candidates = new Map<string, ReadingTable[]>();
  for (const id of [...lists.map((a) => a.id), ...(registers.length > 0 ? [REGISTER] : [])]) {
    const ts = tables.filter((t) =>
      reaches(answers.noul(`table|${t.ref}|${id}`) ?? 0, POLICY.candidate),
    );
    if (ts.length > 0) candidates.set(id, ts);
  }

  const detail = new Map<string, Question>();
  for (const a of lists) {
    const ts = candidates.get(a.id) ?? [];
    if (ts.length === 0) continue;
    if (ts.length > 1) detail.set(`source|${a.id}`, sourceTableQuestion(a, ts));
    for (const t of ts) {
      for (const c of t.header.keys()) {
        detail.set(`col|${t.ref}|${a.id}|${c}`, columnQuestion(t, c, a, ENTRY_LEAVES[a.id] ?? {}));
      }
      for (const r of t.rows.keys()) detail.set(`row|${t.ref}|${a.id}|${r}`, rowQuestion(t, r, a));
    }
  }
  for (const t of candidates.get(REGISTER) ?? []) {
    for (const c of t.header.keys()) {
      detail.set(
        `col|${t.ref}|document|${c}`,
        columnQuestion(t, c, DOCUMENT_TARGET, DOCUMENT_LEAVES),
      );
    }
    for (const r of t.rows.keys()) {
      detail.set(`regrow|${t.ref}|${r}`, registerRowQuestion(t, r, DOCUMENT_ATTRIBUTES));
    }
  }
  for (const parent of candidates.get('sparePartSources') ?? []) {
    for (const children of candidates.get('componentPartNumbers') ?? []) {
      if (children !== parent) {
        detail.set(`join|${parent.ref}|${children.ref}`, joinQuestion(parent, children));
      }
    }
  }
  const detailTables = tables.filter((t) => [...candidates.values()].some((ts) => ts.includes(t)));
  await askAll('table detail', { tables: detailTables.map(tableState) }, detail);

  const vetoed = input.accepted.filter((_, i) => {
    const yes = answers.noul(`veto|${i}`);
    return yes !== undefined && reaches(1 - yes, POLICY.veto);
  });
  const vetoedIds = new Set(vetoed.map((p) => p.attributeId));
  const found: Found[] = [];
  const note = (f: Fact) => factSource(f, model);

  const optionFact = (option: string): { fact: Fact; segment?: Segment } | undefined => {
    const segment = segmentById.get(option);
    if (segment) return { fact: segment.of, segment };
    const fact = factById.get(option);
    return fact ? { fact } : undefined;
  };
  const pickedFact = (answer: ChoiceResponse) => {
    const picked = optionFact(answer.choice);
    if (!picked) throw new Error(`Jev chose ${answer.choice}, which is no candidate`);
    return picked;
  };
  const unitHold = (a: Attribute, f: Fact) =>
    a.unit && f.unit && a.unit !== f.unit
      ? `the fact is in ${f.unit}, the attribute in ${a.unit}`
      : undefined;

  for (const { a, path } of objectLeaves) {
    const answer = answers.choice(`leaf|${a.id}|${path}`);
    if (!answer || answer.choice === NONE) continue;
    const kind = leafKind(a.id, path);
    const leafValueOf = (option: string) => {
      const o = optionFact(option);
      return o && cellValue(kind, o.segment?.text ?? o.fact.value ?? o.fact.raw, o.fact.lang);
    };
    const { fact, segment } = pickedFact(answer);
    const mass = valueMass(answer, (o) => {
      const v = leafValueOf(o);
      return v === undefined ? undefined : canonicalJson(v);
    });
    const unit = kind === 'decimal' ? (fact.unit ?? a.unit ?? undefined) : undefined;
    found.push({
      decision: {
        attributeId: a.id,
        path,
        value: leafValueOf(answer.choice),
        ...(unit ? { unit } : {}),
        source: [note(fact)],
        confidence: round(mass),
      },
      where: factWhere(fact),
      hold:
        (segment ? `the value is a part of the longer fact "${fact.raw}"` : undefined) ??
        (kind === 'decimal' ? unitHold(a, fact) : undefined) ??
        below('the fact choice', mass),
    });
  }

  const timestampOf = (a: Attribute) => {
    const answer = answers.choice(`time|${a.id}`);
    if (!answer || answer.choice === NONE) return undefined;
    const { fact } = pickedFact(answer);
    const mass = valueMass(answer, (o) => factById.get(o)?.raw);
    const exact = IsoDateTime.safeParse(fact.raw).success;
    return {
      fact,
      mass,
      ...(exact ? { recordedAt: fact.raw } : {}),
      hold: exact
        ? below('the timestamp choice', mass)
        : `the document states "${fact.raw}", not a date-time with time zone`,
    };
  };

  for (const a of routes.scalar) {
    const stamp = TIMESTAMPED.has(a.id) ? timestampOf(a) : undefined;
    const existing = field(a.id);
    if (present(a.id)) {
      if (!stamp || existing?.recordedAt !== undefined || vetoedIds.has(a.id)) continue;
      found.push({
        decision: {
          attributeId: a.id,
          value: existing?.value,
          ...(existing?.unit ? { unit: existing.unit } : {}),
          ...(stamp.recordedAt ? { recordedAt: stamp.recordedAt } : {}),
          override: true,
          source: [...(existing?.source ?? []), note(stamp.fact)],
          confidence: round(stamp.mass),
        },
        where: factWhere(stamp.fact),
        hold: stamp.hold,
      });
      continue;
    }
    const answer = answers.choice(`scalar|${a.id}`);
    if (!answer || answer.choice === NONE) continue;
    const { fact } = pickedFact(answer);
    const shaped = proposalValue(a, fact);
    const mass = valueMass(answer, (o) => {
      const f = factById.get(o);
      const s = f && proposalValue(a, f);
      return s && f ? canonicalJson([s.value, f.unit ?? '']) : undefined;
    });
    const unit = fact.unit ?? a.unit ?? undefined;
    const missingStamp =
      TIMESTAMPED.has(a.id) && !stamp ? 'no fact states when the value was recorded' : undefined;
    found.push({
      decision: {
        attributeId: a.id,
        value: shaped ? shaped.value : (fact.value ?? fact.raw),
        ...(unit ? { unit } : {}),
        ...(stamp?.recordedAt ? { recordedAt: stamp.recordedAt } : {}),
        source: [note(fact), ...(stamp ? [note(stamp.fact)] : [])],
        confidence: round(mass),
      },
      where: factWhere(fact),
      hold:
        (shaped ? undefined : `"${fact.raw}" does not fit a ${a.valueKind} value`) ??
        unitHold(a, fact) ??
        below('the fact choice', mass) ??
        missingStamp ??
        stamp?.hold,
    });
  }

  for (const a of absent(routes.series)) {
    const scored = numeric.map((f) => ({ f, p: answers.noul(`series|${a.id}|${f.id}`) ?? 0 }));
    const chosen = scored.filter((s) => reaches(s.p, POLICY.candidate));
    if (chosen.length === 0) continue;
    const entries = chosen.map(({ f }) => {
      const socs = [...`${f.rowLabel ?? ''} ${f.label}`.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)];
      const soc = socs.length === 1 ? socs[0]?.[1] : undefined;
      return soc && f.value ? { atSocPercent: soc.replace(',', '.'), powerW: f.value } : undefined;
    });
    const least = Math.min(...scored.map((s) => decisive(s.p)));
    const value = entries.filter((e) => e !== undefined);
    found.push({
      decision: {
        attributeId: a.id,
        value,
        ...(a.unit ? { unit: a.unit } : {}),
        source: chosen.map(({ f }) => note(f)),
        confidence: round(least),
      },
      where: chosen.map(({ f }) => factWhere(f)).join('; '),
      hold:
        (value.length < entries.length
          ? 'a selected fact names no single state of charge'
          : undefined) ??
        chosen.map(({ f }) => unitHold(a, f)).find((h) => h !== undefined) ??
        below('the least decisive fact selection', least),
    });
  }

  const columnsOf = (t: ReadingTable, target: string) => {
    const leaves = new Map<number, string>();
    let least = 1;
    t.header.forEach((_, c) => {
      const answer = answers.choice(`col|${t.ref}|${target}|${c}`);
      if (!answer) return;
      least = Math.min(least, answer.confidence);
      if (answer.choice !== NONE) leaves.set(c, answer.choice);
    });
    return { leaves, least };
  };
  const entryOf = (
    target: string,
    row: readonly string[],
    leaves: Map<number, string>,
    lang: string,
  ) => {
    let entry: Record<string, unknown> = {};
    for (const [c, leaf] of leaves) {
      const text = row[c];
      if (blank(text) || getPath(entry, parsePath(leaf)) !== undefined) continue;
      entry = setPath(entry, leaf, cellValue(leafKind(target, leaf), text, lang));
    }
    return entry;
  };
  const tableNote = (t: ReadingTable): Provenance => ({
    ...t.source,
    note: `read by ${model} from table ${t.ref}`,
  });

  const listOf = new Map<
    string,
    { t: ReadingTable; entries: Record<string, unknown>[]; at: Found }
  >();
  for (const a of lists) {
    const ts = candidates.get(a.id) ?? [];
    const source = ts.length > 1 ? answers.choice(`source|${a.id}`) : undefined;
    const t = source ? ts.find((x) => x.ref === source.choice) : ts[0];
    if (!t) {
      if (ts.length > 0) throw new Error(`Jev chose table ${source?.choice}, no candidate`);
      continue;
    }
    const isList = answers.noul(`table|${t.ref}|${a.id}`) ?? 0;
    const tableHold = source
      ? below('the choice between the competing tables', source.confidence)
      : `only the table judgement (${round(isList)}) says table ${t.ref} lists this attribute; no competing table confirms it`;
    const columns = columnsOf(t, a.id);
    const rows = t.rows.map((_, r) => answers.noul(`row|${t.ref}|${a.id}|${r}`) ?? 0);
    const entries = t.rows
      .filter((_, r) => reaches(rows[r] ?? 0, POLICY.candidate))
      .map((row) => entryOf(a.id, row, columns.leaves, t.lang));
    if (entries.length === 0) continue;
    const leastRow = Math.min(...rows.map(decisive));
    const at: Found = {
      decision: {
        attributeId: a.id,
        value: entries,
        ...(a.unit ? { unit: a.unit } : {}),
        source: [tableNote(t)],
        confidence: round(Math.min(source?.confidence ?? isList, columns.least, leastRow)),
      },
      where: tableWhere(t),
      hold:
        tableHold ??
        below('the least confident column mapping', columns.least) ??
        below('the least decisive row', leastRow),
    };
    found.push(at);
    listOf.set(a.id, { t, entries, at });
  }

  const suppliers = listOf.get('sparePartSources');
  const parts = listOf.get('componentPartNumbers');
  const joinAnswer =
    suppliers && parts && suppliers.t !== parts.t
      ? answers.choice(`join|${suppliers.t.ref}|${parts.t.ref}`)
      : undefined;
  if (suppliers && parts && joinAnswer && joinAnswer.choice !== NONE) {
    const by = Number(joinAnswer.choice.slice(1));
    const leaves = columnsOf(parts.t, 'componentPartNumbers').leaves;
    const nameOf = (e: Record<string, unknown>) => {
      const name = e['name'];
      return typeof name === 'object' && name !== null ? Object.values(name)[0] : name;
    };
    const joined = suppliers.entries.map((e) => {
      const components = parts.t.rows
        .filter((r) => !blank(r[by]) && norm(r[by] ?? '') === nameOf(e))
        .map((r) => entryOf('componentPartNumbers', r, leaves, parts.t.lang))
        .filter((c) => c['partName'] !== undefined && c['partNumber'] !== undefined);
      return components.length > 0 ? { ...e, components } : e;
    });
    const how = `adds the components of table ${parts.t.ref}, joined through its column "${parts.t.header[by] ?? by}" at ${round(joinAnswer.confidence)}`;
    if (joined.some((e, i) => e !== suppliers.entries[i])) {
      if (suppliers.at.hold === undefined) {
        found.push({
          ...suppliers.at,
          decision: { ...suppliers.at.decision, value: joined },
          hold: `${how}; the suppliers without them are applied`,
        });
      } else {
        suppliers.at.decision.value = joined;
        suppliers.at.hold = `${suppliers.at.hold}; ${how}`;
      }
    }
  }

  const registered = new Map<
    string,
    { a: Attribute; t: ReadingTable; entries: Record<string, unknown>[]; least: number }
  >();
  for (const t of candidates.get(REGISTER) ?? []) {
    const columns = columnsOf(t, 'document');
    t.rows.forEach((row, r) => {
      const answer = answers.choice(`regrow|${t.ref}|${r}`);
      if (!answer || answer.choice === NONE) return;
      const a = registers.find((x) => x.id === answer.choice);
      if (!a) return;
      const held = registered.get(a.id) ?? { a, t, entries: [], least: columns.least };
      held.entries.push(entryOf('document', row, columns.leaves, t.lang));
      held.least = Math.min(held.least, answer.confidence);
      registered.set(a.id, held);
    });
  }
  const graphicKeys = Object.keys(GraphicRef.shape);
  for (const { a, t, entries, least } of registered.values()) {
    const graphic = a.valueKind === 'graphic';
    const [first] = entries;
    found.push({
      decision: {
        attributeId: a.id,
        value:
          graphic && first
            ? Object.fromEntries(Object.entries(first).filter(([k]) => graphicKeys.includes(k)))
            : entries,
        source: [tableNote(t)],
        confidence: round(least),
      },
      where: tableWhere(t),
      hold:
        (graphic && entries.length > 1 ? `${entries.length} rows name this graphic` : undefined) ??
        below('the least confident row or column choice', least),
    });
  }

  for (const f of found) f.hold ??= schemaHold(f.decision);
  const order = (x: Found, y: Found) =>
    byCodePoint(x.decision.attributeId, y.decision.attributeId) ||
    byCodePoint(x.decision.path ?? '', y.decision.path ?? '') ||
    byCodePoint(x.hold ?? '', y.hold ?? '');
  found.sort(order);

  return {
    decisions: found.filter((f) => f.hold === undefined).map((f) => f.decision),
    held: found.flatMap(({ decision, where, hold }) =>
      hold === undefined ? [] : [{ decision, where, reason: hold }],
    ),
    confirmed: [],
    vetoed: vetoed.map(slotKey),
    ...usage,
  };
}

function schemaHold(d: MappingDecision): string | undefined {
  const a = getAttribute(d.attributeId);
  if (!a) return `${d.attributeId} is no attribute`;
  const schema: z.ZodType | undefined = d.path
    ? leafSchema(a.id, d.path)
    : a.valueKind === 'composite'
      ? COMPOSITE_SCHEMAS[a.id]
      : valueSchemaFor(a);
  const r = schema?.safeParse(d.value);
  return r && !r.success
    ? `does not fit the passport schema: ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`
    : undefined;
}
