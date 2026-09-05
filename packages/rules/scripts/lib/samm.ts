/**
 * Reads the Battery Pass Data Model aspect models (SAMM 2.x, Turtle) into a flat, deterministic
 * property index. Pure function over the Turtle text, no I/O.
 *
 * Nothing here is invented: names, preferred names, descriptions, characteristics, units,
 * enumeration values and range constraints are copied from the Turtle. Derived fields are
 * `paths` (aspect / entity walk), `dinChapters` (parsed from the "DIN DKE Spec 99100 chapter
 * reference" sentence in the description) and the resolved characteristic of a Trait.
 */
import { Parser, type Quad_Object, type Quad_Subject, Store, type Term } from 'n3';
import type { SammCharacteristic, SammModel, SammProperty, SammSection } from '../../src/types.ts';

export type { SammCharacteristic, SammModel, SammProperty, SammSection };

export interface SammInput {
  /** Section key used in file names and ids, e.g. "Circularity" */
  key: string;
  /** Model version as published, e.g. "1.2.0" */
  version: string;
  /** Bundled path relative to the package root (recorded for provenance) */
  file: string;
  /** Turtle text */
  turtle: string;
}

const SAMM = 'urn:samm:org.eclipse.esmf.samm:meta-model:2.1.0#';
const SAMM_C = 'urn:samm:org.eclipse.esmf.samm:characteristic:2.1.0#';
const SAMM_UNIT = 'urn:samm:org.eclipse.esmf.samm:unit:2.1.0#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

const DIN_SENTENCE =
  /DIN\s*DKE\s*Spec(?:ification)?\s*99100\s*chapter\s*reference\s*:\s*([\s\S]*)$/i;
const CHAPTER = /\d+(?:\.\d+)+/y;

/**
 * "6.6.1.2" -> ["6.6.1.2"]; "6.7.7.5 - 8" -> 6.7.7.5..6.7.7.8; "6.5.3-6.5.4" -> both;
 * "6.3.3: Raw material extraction\n6.3.4: Main production" -> ["6.3.3", "6.3.4"].
 * Sorted numerically, no duplicates. Empty when the sentence is absent.
 */
export function parseDinChapters(description: string): string[] {
  const match = DIN_SENTENCE.exec(description);
  if (!match) return [];
  const text = match[1] ?? '';
  const out = new Set<string>();
  const tokens = text.match(/\d+(?:\.\d+)*/g) ?? [];
  const ranges = /(\d+(?:\.\d+)+)\s*-\s*(\d+(?:\.\d+)*)/g;
  const consumed = new Set<string>();
  for (const r of text.matchAll(ranges)) {
    const start = r[1] as string;
    const rawEnd = r[2] as string;
    const startParts = start.split('.');
    const endParts = rawEnd.includes('.')
      ? rawEnd.split('.')
      : [...startParts.slice(0, -1), rawEnd];
    const prefix = startParts.slice(0, -1).join('.');
    if (endParts.slice(0, -1).join('.') !== prefix) {
      out.add(start);
      out.add(endParts.join('.'));
    } else {
      const from = Number(startParts.at(-1));
      const to = Number(endParts.at(-1));
      for (let i = from; i <= to; i += 1) out.add(`${prefix}.${i}`);
    }
    consumed.add(start);
    consumed.add(rawEnd);
  }
  for (const token of tokens) {
    if (consumed.has(token)) continue;
    CHAPTER.lastIndex = 0;
    if (CHAPTER.test(token)) out.add(token);
  }
  return [...out].sort(compareChapters);
}

function compareChapters(a: string, b: string): number {
  const xs = a.split('.').map(Number);
  const ys = b.split('.').map(Number);
  for (let i = 0; i < Math.max(xs.length, ys.length); i += 1) {
    const d = (xs[i] ?? -1) - (ys[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

const localName = (iri: string): string => iri.slice(iri.lastIndexOf('#') + 1);

/** "urn:samm:...:2.1.0#float" -> "xsd:float" | ":Entity" (model-local) | raw IRI */
function compactIri(iri: string, namespace: string): string {
  if (iri.startsWith(XSD)) return `xsd:${localName(iri)}`;
  if (iri.startsWith(namespace)) return `:${localName(iri)}`;
  if (iri.startsWith(SAMM_C)) return `samm-c:${localName(iri)}`;
  return iri;
}

class Graph {
  readonly store: Store;
  constructor(turtle: string) {
    this.store = new Store(new Parser({ format: 'Turtle' }).parse(turtle));
  }
  objects(subject: Term, predicate: string): Quad_Object[] {
    return this.store.getObjects(subject as Quad_Subject, predicate, null);
  }
  object(subject: Term, predicate: string): Quad_Object | null {
    return this.objects(subject, predicate)[0] ?? null;
  }
  literal(subject: Term, predicate: string, language = 'en'): string | null {
    const all = this.objects(subject, predicate).filter((o) => o.termType === 'Literal');
    const preferred = all.find((o) => o.termType === 'Literal' && o.language === language);
    return (preferred ?? all[0])?.value ?? null;
  }
  types(subject: Term): string[] {
    return this.objects(subject, `${RDF}type`)
      .map((o) => o.value)
      .sort();
  }
  subjectsOfType(type: string): Quad_Subject[] {
    return this.store
      .getSubjects(`${RDF}type`, type, null)
      .sort((a, b) => a.value.localeCompare(b.value));
  }
  /** Walks an RDF collection (rdf:first / rdf:rest) in order. */
  list(head: Term | null): Term[] {
    const items: Term[] = [];
    let node: Term | null = head;
    const guard = new Set<string>();
    while (node && node.value !== `${RDF}nil` && !guard.has(node.value)) {
      guard.add(node.value);
      const first = this.object(node, `${RDF}first`);
      if (first) items.push(first);
      node = this.object(node, `${RDF}rest`);
    }
    return items;
  }
}

interface PropertyRef {
  term: Term;
  optional: boolean;
}

/** A samm:properties list entry is either a property IRI or a blank node with samm:property. */
function propertyRefs(g: Graph, subject: Term): PropertyRef[] {
  const head = g.object(subject, `${SAMM}properties`);
  return g.list(head).map((item) => {
    if (item.termType === 'BlankNode') {
      const property = g.object(item, `${SAMM}property`);
      const optional = g.object(item, `${SAMM}optional`);
      return { term: property ?? item, optional: optional?.value === 'true' };
    }
    return { term: item, optional: false };
  });
}

function resolveCharacteristic(g: Graph, term: Term | null, namespace: string): SammCharacteristic {
  const empty: SammCharacteristic = {
    name: null,
    kind: null,
    dataType: null,
    unit: null,
    unitSymbol: null,
    values: null,
    entity: null,
    range: null,
  };
  if (!term) return empty;
  const name = term.termType === 'NamedNode' ? localName(term.value) : null;
  const types = g.types(term);
  let kind = types.map((t) => localName(t)).find((t) => t !== 'Characteristic') ?? null;
  if (kind === null && types.length > 0) kind = 'Characteristic';
  // Built-in characteristics (samm-c:Text, samm-c:MimeType, ...) carry no triples here.
  if (types.length === 0 && term.termType === 'NamedNode' && term.value.startsWith(SAMM_C)) {
    kind = localName(term.value);
  }

  let base: Term = term;
  let range: SammCharacteristic['range'] = null;
  if (kind === 'Trait') {
    const baseTerm = g.object(term, `${SAMM_C}baseCharacteristic`);
    for (const constraint of g.objects(term, `${SAMM_C}constraint`)) {
      if (g.types(constraint).includes(`${SAMM_C}RangeConstraint`)) {
        range = {
          min: g.object(constraint, `${SAMM_C}minValue`)?.value ?? null,
          max: g.object(constraint, `${SAMM_C}maxValue`)?.value ?? null,
        };
      }
    }
    if (baseTerm) {
      base = baseTerm;
      const baseTypes = g.types(base).map((t) => localName(t));
      kind = baseTypes.find((t) => t !== 'Characteristic') ?? baseTypes[0] ?? null;
      // A Trait over a built-in characteristic (samm-c:Text with a regex constraint, ...).
      if (kind === null && base.termType === 'NamedNode' && base.value.startsWith(SAMM_C)) {
        kind = localName(base.value);
      }
    }
  }

  const dataTypeTerm = g.object(base, `${SAMM}dataType`);
  const dataTypeIri = dataTypeTerm?.value ?? null;
  const isEntity = dataTypeIri !== null && g.types(dataTypeTerm as Term).includes(`${SAMM}Entity`);
  const dataType = dataTypeIri === null || isEntity ? null : compactIri(dataTypeIri, namespace);
  const entity = isEntity ? localName(dataTypeIri as string) : null;

  const unitTerm = g.object(base, `${SAMM_C}unit`);
  let unit: string | null = null;
  let unitSymbol: string | null = null;
  if (unitTerm) {
    unit = localName(unitTerm.value);
    if (!unitTerm.value.startsWith(SAMM_UNIT)) {
      unitSymbol = g.literal(unitTerm, `${SAMM}symbol`);
      unit = unitSymbol ?? unit;
    }
  }

  const valuesHead = g.object(base, `${SAMM_C}values`);
  const values = valuesHead ? [...new Set(g.list(valuesHead).map((v) => v.value))] : null;

  return { name, kind, dataType, unit, unitSymbol, values, entity, range };
}

function buildSection(g: Graph, input: SammInput): SammSection {
  const aspects = g.subjectsOfType(`${SAMM}Aspect`);
  const aspect = aspects[0];
  if (!aspect || aspects.length !== 1) {
    throw new Error(`${input.file}: expected exactly one samm:Aspect, found ${aspects.length}`);
  }
  const namespace = aspect.value.slice(0, aspect.value.lastIndexOf('#') + 1);
  const aspectName = localName(aspect.value);

  // Walk aspect -> properties -> (characteristic dataType entity) -> properties to record paths
  // and the optional flag as declared at each occurrence.
  const paths = new Map<string, string[]>();
  const optionalAt = new Map<string, boolean>();
  const visit = (subject: Term, prefix: string, seen: Set<string>): void => {
    for (const ref of propertyRefs(g, subject)) {
      const name = localName(ref.term.value);
      const path = `${prefix}/${name}`;
      const list = paths.get(ref.term.value) ?? [];
      if (!list.includes(path)) list.push(path);
      paths.set(ref.term.value, list);
      if (!optionalAt.has(ref.term.value)) optionalAt.set(ref.term.value, ref.optional);
      const characteristic = g.object(ref.term, `${SAMM}characteristic`);
      const resolved = resolveCharacteristic(g, characteristic, namespace);
      if (resolved.entity && !seen.has(`${resolved.entity}@${path}`)) {
        const entityTerm = g.object(
          characteristicBase(g, characteristic as Term),
          `${SAMM}dataType`,
        );
        if (entityTerm) visit(entityTerm, path, new Set([...seen, `${resolved.entity}@${path}`]));
      }
    }
  };
  visit(aspect, aspectName, new Set());

  const properties: SammProperty[] = g.subjectsOfType(`${SAMM}Property`).map((subject) => {
    const description = g.literal(subject, `${SAMM}description`) ?? '';
    return {
      name: localName(subject.value),
      urn: subject.value,
      preferredName: g.literal(subject, `${SAMM}preferredName`),
      description: description === '' ? null : description,
      dinChapters: parseDinChapters(description),
      paths: paths.get(subject.value) ?? [],
      optional: optionalAt.get(subject.value) ?? false,
      characteristic: resolveCharacteristic(
        g,
        g.object(subject, `${SAMM}characteristic`),
        namespace,
      ),
    };
  });

  return {
    key: input.key,
    version: input.version,
    file: input.file,
    aspect: aspectName,
    namespace,
    description: g.literal(aspect, `${SAMM}description`),
    propertyCount: properties.length,
    properties,
  };
}

/** Trait -> its base characteristic; anything else -> itself. */
function characteristicBase(g: Graph, term: Term): Term {
  if (g.types(term).includes(`${SAMM_C}Trait`)) {
    return g.object(term, `${SAMM_C}baseCharacteristic`) ?? term;
  }
  return term;
}

export function extractSammModel(inputs: SammInput[]): SammModel {
  const sections = [...inputs]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((input) => buildSection(new Graph(input.turtle), input));
  return {
    $comment:
      'GENERATED by scripts/generate.ts from artefacts/batterypass/samm/*.ttl (Battery Pass Data Model, SAMM). Do not edit. Every name, description, unit, data type, enumeration value and range is copied from the Turtle; derived fields are paths, dinChapters and the resolved characteristic of a Trait. Dev-time cross-check only: the runtime never loads this file.',
    sections,
  };
}
