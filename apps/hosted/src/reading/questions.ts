/**
 * Question builders. Each one hands Jev candidates that code found and asks it to choose or
 * judge; none asks it to write a value. Long candidate lists go into option texts, not state,
 * so every question carries only what it needs (about 3.5k tokens per fact Choice).
 */
import type { Fact, Lang, Provenance } from '@passwerk/core';
import type { Attribute } from '@passwerk/rules';
import { type ChoiceQuestion, choice, type NoulQuestion, noul } from '@typesafe-ai/sdk';

export interface ReadingTable {
  ref: string;
  document: string;
  sheet?: string;
  lang: Lang;
  source: Provenance;
  header: string[];
  rows: string[][];
}

/** A comma-separated part of a text fact, or a word of such a part, as its own candidate. */
export interface Segment {
  id: string;
  of: Fact;
  text: string;
}

export const NONE = 'none';

export const location = (f: Fact): string =>
  [
    f.source.page !== undefined ? `page ${f.source.page}` : undefined,
    f.source.cell ? `cell ${f.source.cell}` : undefined,
    f.source.note,
  ]
    .filter((s) => s !== undefined)
    .join(', ');

export const factText = (f: Fact): string => {
  const what = f.rowLabel ? `${f.rowLabel} / ${f.label}` : f.label;
  const norm =
    f.value !== undefined && f.value !== f.raw
      ? ` (normalised ${f.value}${f.unit ? ` ${f.unit}` : ''})`
      : f.unit
        ? ` [${f.unit}]`
        : '';
  return `${what} = "${f.raw}"${norm}, in ${f.source.file} ${location(f)}`;
};

const segmentText = (s: Segment): string =>
  `part "${s.text}" of ${s.of.rowLabel ? `${s.of.rowLabel} / ` : ''}${s.of.label} = "${s.of.raw}", in ${s.of.source.file} ${location(s.of)}`;

export function segmentsOf(facts: readonly Fact[]): Segment[] {
  const out: Segment[] = [];
  for (const f of facts) {
    if (f.kind !== 'text' || !f.raw.includes(',')) continue;
    const parts = f.raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    parts.forEach((part, i) => {
      const pieces = [part, ...(part.includes(' ') && /\d/.test(part) ? part.split(/\s+/) : [])];
      pieces.forEach((text, j) => {
        if (seen.has(text)) return;
        seen.add(text);
        out.push({ id: `${f.id}~${i}.${j}`, of: f, text });
      });
    });
  }
  return out;
}

export const isNumericFact = (f: Fact): boolean => f.kind === 'decimal' || f.kind === 'integer';
export const isDateish = (f: Fact): boolean =>
  f.kind === 'date' || /^\d{4}-\d{2}-\d{2}T/.test(f.raw);

const stateFact = (f: Fact) => ({
  id: f.id,
  ...(f.rowLabel ? { row: f.rowLabel } : {}),
  label: f.label,
  asWritten: f.raw,
  value: f.value ?? f.raw,
  ...(f.unit ? { unit: f.unit } : {}),
  document: f.source.file,
  location: location(f),
});

const attributeInfo = (a: Attribute) => ({
  id: a.id,
  name_en: a.name.en,
  name_de: a.name.de,
  description: a.explanation.en,
});

const FACT_RULES = [
  'Labels are often German. Match by meaning, not by spelling.',
  'The candidate must state exactly this value for this battery: same property, same party, same level. A related or similar-looking value does not count.',
  'Facts from documents unrelated to the battery, such as an electricity bill, never state a battery attribute.',
  'If no candidate states it, choose none.',
];

const parsedFacts = (category: string) =>
  `The supplier documents of one ${category} battery were parsed into facts; each option is one fact written as label = value as written, with its document and location.`;

export function leafQuestion(
  category: string,
  a: Attribute,
  path: string,
  description: string,
  facts: readonly Fact[],
  segments: readonly Segment[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const f of facts) criteria[f.id] = factText(f);
  for (const s of segments) criteria[s.id] = segmentText(s);
  criteria[NONE] = 'None of these candidates states this value.';
  return choice(
    {
      question: `${parsedFacts(category)} Which single candidate states ${description}, for the passport attribute below? A candidate may be a whole fact or a part of a fact.`,
      attribute: attributeInfo(a),
      field: path,
      rules: FACT_RULES,
    },
    criteria,
  );
}

export function scalarQuestion(
  category: string,
  a: Attribute,
  facts: readonly Fact[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const f of facts) criteria[f.id] = factText(f);
  criteria[NONE] = 'None of these facts states this attribute for this battery.';
  return choice(
    {
      question: `${parsedFacts(category)} Which single fact states this battery's value for the EU battery passport attribute described here?`,
      attribute: {
        ...attributeInfo(a),
        valueKind: a.valueKind,
        ...(a.unit ? { unit: a.unit } : {}),
      },
      rules: FACT_RULES,
    },
    criteria,
  );
}

export function timestampQuestion(
  category: string,
  a: Attribute,
  facts: readonly Fact[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const f of facts) criteria[f.id] = factText(f);
  criteria[NONE] = 'None of these facts says when this value was measured or recorded.';
  return choice(
    {
      question: `${parsedFacts(category)} This battery passport attribute is a dynamic value that must carry the time it was measured or recorded. Which fact states when this battery's value for the attribute was measured or recorded?`,
      attribute: attributeInfo(a),
      rules: [
        'Pick the timestamp that belongs to the reading of this attribute (same row or same record), not a manufacturing, commissioning or billing date.',
        'If no fact states when this value was recorded, choose none.',
      ],
    },
    criteria,
  );
}

export function seriesQuestion(a: Attribute, description: string, f: Fact): NoulQuestion {
  return noul({
    question: `Does this fact state ${description}?`,
    fact: stateFact(f),
    attribute: attributeInfo(a),
    rules: [
      'Answer yes only for a measurement of exactly this quantity; a maximum permitted power or any other value is no.',
    ],
  });
}

/** Asked of every rule-based accept: a no here drops the accept. */
export function vetoQuestion(a: Attribute, path: string | undefined, f: Fact): NoulQuestion {
  return noul({
    question: `Does this fact state this battery's value for the EU battery passport attribute below${path ? `, field \`${path}\`` : ''}?`,
    fact: stateFact(f),
    attribute: { ...attributeInfo(a), valueKind: a.valueKind, ...(a.unit ? { unit: a.unit } : {}) },
    rules: [
      'Labels are often German. Match by meaning, not by spelling.',
      'Yes only if the fact states exactly this quantity: same property, same material, same life stage or test condition. A related or similar-looking quantity is no.',
      'Facts from documents unrelated to the battery, such as an electricity bill, never state a battery attribute.',
    ],
  });
}

export const tableState = (t: ReadingTable) => ({
  ref: t.ref,
  document: t.document,
  ...(t.sheet ? { sheet: t.sheet } : {}),
  header: t.header,
  rows: t.rows,
});

export function listTableQuestion(t: ReadingTable, a: Attribute): NoulQuestion {
  return noul({
    question: `Does table ${t.ref} in \`tables\` list entries of the EU battery passport attribute below, one entry per row (possibly only some of its rows)?`,
    attribute: attributeInfo(a),
    rules: [
      'Yes only if each row (or a subset of rows) describes one entry of exactly this attribute.',
      'A table of single parameters or measurements, or a table about something else, is no.',
    ],
  });
}

export function registerTableQuestion(t: ReadingTable): NoulQuestion {
  return noul(
    `Is table ${t.ref} in \`tables\` a register of documents or files handed over with the battery, one document or file per row?`,
  );
}

export interface ColumnTarget {
  id: string;
  name: { en: string; de: string };
  explanation: { en: string };
}

export const DOCUMENT_TARGET: ColumnTarget = {
  id: 'documentRegister',
  name: { en: 'Document reference', de: 'Dokumentverweis' },
  explanation: {
    en: 'A document handed over with the battery and referenced from the passport by id, title, version, languages, VDI 2770 classification, file name, content type and URI.',
  },
};

export function columnQuestion(
  t: ReadingTable,
  c: number,
  target: ColumnTarget,
  leaves: Record<string, string>,
): ChoiceQuestion {
  const criteria: Record<string, string> = { ...leaves };
  criteria[NONE] =
    'This column holds none of these fields (for example a flag, a remark or an unrelated value).';
  return choice(
    {
      question: `Table ${t.ref} in \`tables\` supplies entries of the passport attribute below. Which field of an entry does column ${c + 1} ("${t.header[c]}") hold?`,
      column: { header: t.header[c] ?? '', values: t.rows.map((r) => r[c] ?? '') },
      attribute: {
        id: target.id,
        name_en: target.name.en,
        name_de: target.name.de,
        description: target.explanation.en,
      },
    },
    criteria,
  );
}

const rowObject = (t: ReadingTable, r: number) =>
  Object.fromEntries(t.header.map((h, i) => [h, t.rows[r]?.[i] ?? '']));

export function rowQuestion(t: ReadingTable, r: number, a: Attribute): NoulQuestion {
  return noul({
    question: `Table ${t.ref} in \`tables\` supplies entries of the passport attribute below. Should row ${r + 1} become an entry of this attribute?`,
    row: rowObject(t, r),
    attribute: attributeInfo(a),
    rules: [
      'Use what the row and its columns say, including any yes/no marker column (ja = yes, nein = no).',
      'Yes only if this row is an entry of exactly this attribute.',
    ],
  });
}

export function registerRowQuestion(
  t: ReadingTable,
  r: number,
  documentAttributes: readonly Attribute[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const a of documentAttributes) {
    criteria[a.id] = `${a.name.en} (${a.name.de}): ${a.explanation.en.slice(0, 220)}`;
  }
  criteria[NONE] = 'This document or file provides none of these passport attributes.';
  return choice(
    {
      question: `Table ${t.ref} in \`tables\` is a register of documents handed over with the battery. Which EU battery passport attribute does the document or file in row ${r + 1} provide?`,
      row: rowObject(t, r),
    },
    criteria,
  );
}

export function sourceTableQuestion(a: Attribute, tables: readonly ReadingTable[]): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const t of tables) {
    criteria[t.ref] =
      `table ${t.ref}${t.sheet ? ` (sheet ${t.sheet})` : ''} in ${t.document}, columns ${t.header.join(' | ')}`;
  }
  return choice(
    {
      question:
        'Several tables in `tables` look like lists of the passport attribute below. Which single table should the passport take this attribute’s entries from?',
      attribute: attributeInfo(a),
      rules: [
        'Choose the table whose rows are the individual entries of exactly this attribute, with the fields the attribute needs.',
      ],
    },
    criteria,
  );
}

export function joinQuestion(parent: ReadingTable, children: ReadingTable): ChoiceQuestion {
  const criteria: Record<string, string> = Object.fromEntries(
    children.header.map((h, c) => [
      `c${c}`,
      `column ${c + 1} "${h}", values: ${children.rows.map((r) => r[c] ?? '').join('; ')}`,
    ]),
  );
  criteria[NONE] = 'No column of this table names the supplier a component is obtained from.';
  return choice(
    `Table ${parent.ref} in \`tables\` lists spare part suppliers. Table ${children.ref} lists replaceable components. Which column of table ${children.ref} names the supplier from which each component can be obtained?`,
    criteria,
  );
}
