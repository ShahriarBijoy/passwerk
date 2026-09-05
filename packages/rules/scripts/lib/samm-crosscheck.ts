/**
 * Joins the knowledge-base attributes to the Battery Pass Data Model (SAMM) property index and
 * reports where the two disagree on unit, data type, enumeration or range. Pure function.
 *
 * Two deterministic join keys, both read from bundled data:
 *   - `din`:  the SAMM property description cites the attribute's DIN DKE SPEC 99100 chapter;
 *   - `name`: an IDTA 02035 template element the attribute maps to carries a semanticId whose
 *             local name equals the SAMM property name (IDTA derived its battery-passport
 *             semanticIds from the consortium model).
 *
 * Findings are review prompts for a human, never corrections: the knowledge base stays the
 * authored source and this check only surfaces disagreements (ADR D-030).
 */
import type { Attribute, SammModel, SammProperty } from '../../src/types.ts';

export type JoinKind = 'din' | 'name';
export type Severity = 'mismatch' | 'note';

export interface Finding {
  code: 'unit' | 'valueKind' | 'enum' | 'range' | 'chapter';
  severity: Severity;
  text: string;
}

export interface SammMatch {
  section: string;
  name: string;
  urn: string;
  joins: JoinKind[];
  dinChapters: string[];
  kind: string | null;
  dataType: string | null;
  unit: string | null;
  /** SAMM unit translated to the knowledge-base unit vocabulary, or null when unmapped. */
  unitMapped: string | null;
  values: string[] | null;
  range: { min: string | null; max: string | null } | null;
  optional: boolean;
  findings: Finding[];
}

export interface AttributeCrossCheck {
  id: string;
  /** ok: joined, nothing to report; note: context only; mismatch: a human must decide. */
  status: 'ok' | 'note' | 'mismatch' | 'unmatched';
  matches: SammMatch[];
}

export interface UnclaimedProperty {
  section: string;
  name: string;
  dinChapters: string[];
}

export interface SammCrossCheck {
  attributes: AttributeCrossCheck[];
  /** SAMM properties that cite a DIN chapter no attribute matched. */
  unclaimed: UnclaimedProperty[];
  summary: { ok: number; note: number; mismatch: number; unmatched: number; unclaimed: number };
}

/**
 * SAMM catalogue unit (local name) or model-local unit symbol -> knowledge-base unit vocabulary
 * (kb/attributes/README.md). Only identities and the consortium's own description of its custom
 * unit ("kg of carbon dioxide equivalent per one kWh") are encoded here.
 */
export const SAMM_UNIT_TO_KB: Readonly<Record<string, string>> = {
  percent: '%',
  percentPerMonth: '%/month',
  kilogram: 'kg',
  kg: 'kg',
  gram: 'g',
  ampereHour: 'Ah',
  kilowattHour: 'kWh',
  wattHour: 'Wh',
  volt: 'V',
  watt: 'W',
  kilowatt: 'kW',
  ohm: 'Ohm',
  degreeCelsius: 'degC',
  minuteUnitOfTime: 'min',
  cycle: 'cycles',
  year: 'years',
  month: 'months',
  C: 'C',
  kilogramperkilowatthour: 'kgCO2e/kWh',
};

const NUMERIC_KINDS = new Set(['decimal', 'integer', 'percentage']);

/** Which knowledge-base valueKinds a SAMM xsd data type can carry without contradiction. */
function compatibleValueKinds(dataType: string): ReadonlySet<string> {
  switch (dataType) {
    case 'xsd:float':
    case 'xsd:double':
    case 'xsd:decimal':
      // An integer-valued attribute is tighter than a float, not contradicted by it.
      return new Set(['decimal', 'percentage', 'integer']);
    case 'xsd:integer':
    case 'xsd:long':
    case 'xsd:int':
    case 'xsd:short':
    case 'xsd:nonNegativeInteger':
    case 'xsd:positiveInteger':
      return new Set(['integer', 'decimal', 'percentage']);
    case 'xsd:date':
    case 'xsd:gMonth':
    case 'xsd:gYearMonth':
      return new Set(['date']);
    case 'xsd:dateTime':
    case 'xsd:dateTimeStamp':
      return new Set(['dateTime', 'date']);
    case 'xsd:boolean':
      return new Set(['boolean']);
    case 'xsd:anyURI':
      return new Set(['uri', 'document', 'graphic']);
    default:
      // xsd:string and anything else: no numeric or temporal claim to contradict.
      return new Set([
        'identifier',
        'text',
        'multilingualText',
        'enum',
        'document',
        'uri',
        'graphic',
        'composite',
      ]);
  }
}

const localName = (iri: string): string => iri.slice(iri.lastIndexOf('#') + 1);

/**
 * A finding is a `mismatch` only when the SAMM property speaks for the attribute as a whole:
 * it was joined by DIN chapter, or by name while the attribute maps to a single template
 * element. A name join into one of several elements (a value next to its timestamp, a share
 * next to its material enum) describes a part of the attribute, so the finding is a `note`.
 * Composite attributes have no single unit or data type to contradict; only their unit is noted.
 */
function checkLeaf(attribute: Attribute, property: SammProperty, joins: JoinKind[]): Finding[] {
  const findings: Finding[] = [];
  const c = property.characteristic;
  const composite = attribute.valueKind === 'composite';
  const strict = joins.includes('din') || attribute.templateElements.length <= 1;
  const severity: Severity = strict && !composite ? 'mismatch' : 'note';

  if (!joins.includes('din') && property.dinChapters.length > 0) {
    findings.push({
      code: 'chapter',
      severity: strict ? 'mismatch' : 'note',
      text: `SAMM cites DIN chapter ${property.dinChapters.join(', ')}; the attribute is DIN ${attribute.din.chapter}.`,
    });
  }

  // Everything below applies to leaf values only; entity-valued properties carry no unit or type.
  if (c.dataType === null) return findings;

  const mapped = c.unit === null ? null : (SAMM_UNIT_TO_KB[c.unit] ?? null);
  if (c.unit !== null && mapped === null) {
    findings.push({
      code: 'unit',
      severity: 'note',
      text: `SAMM unit "${c.unit}" has no entry in the knowledge-base unit vocabulary.`,
    });
  } else if (mapped !== null && attribute.unit === null) {
    findings.push({
      code: 'unit',
      severity,
      text: `SAMM gives unit ${mapped}; the attribute has no unit.`,
    });
  } else if (mapped !== null && attribute.unit !== mapped) {
    findings.push({
      code: 'unit',
      severity,
      text: `SAMM gives unit ${mapped}; the attribute says ${attribute.unit}.`,
    });
  }

  if (composite) return findings;

  const allowed = compatibleValueKinds(c.dataType);
  if (!allowed.has(attribute.valueKind)) {
    findings.push({
      code: 'valueKind',
      severity,
      text: `SAMM data type ${c.dataType} (${c.kind ?? 'characteristic'}) does not fit valueKind ${attribute.valueKind}.`,
    });
  }

  if (c.kind === 'Enumeration' && c.values && attribute.valueKind !== 'enum') {
    findings.push({
      code: 'enum',
      severity: 'note',
      text: `SAMM enumerates ${c.values.join(' | ')}; the attribute is ${attribute.valueKind}.`,
    });
  }

  if (c.range && NUMERIC_KINDS.has(attribute.valueKind)) {
    const min = c.range.min === null ? null : Number(c.range.min);
    const max = c.range.max === null ? null : Number(c.range.max);
    const kbMin = attribute.range?.min ?? null;
    const kbMax = attribute.range?.max ?? null;
    if (attribute.range === null) {
      findings.push({
        code: 'range',
        severity: 'note',
        text: `SAMM constrains the value to ${min ?? '-inf'} .. ${max ?? 'inf'}; the attribute has no range.`,
      });
    } else if (
      (kbMin !== null && min !== null && kbMin < min) ||
      (kbMax !== null && max !== null && kbMax > max)
    ) {
      findings.push({
        code: 'range',
        severity,
        text: `Attribute range ${kbMin ?? '-inf'} .. ${kbMax ?? 'inf'} allows values outside the SAMM constraint ${min ?? '-inf'} .. ${max ?? 'inf'}.`,
      });
    } else if (kbMin !== min || kbMax !== max) {
      findings.push({
        code: 'range',
        severity: 'note',
        text: `Attribute range ${kbMin ?? '-inf'} .. ${kbMax ?? 'inf'} is tighter than the SAMM constraint ${min ?? '-inf'} .. ${max ?? 'inf'}.`,
      });
    }
  }

  return findings;
}

export function crossCheck(attributes: readonly Attribute[], model: SammModel): SammCrossCheck {
  const byChapter = new Map<string, { section: string; property: SammProperty }[]>();
  const byName = new Map<string, { section: string; property: SammProperty }[]>();
  for (const section of model.sections) {
    for (const property of section.properties) {
      const entry = { section: section.key, property };
      for (const chapter of property.dinChapters) {
        byChapter.set(chapter, [...(byChapter.get(chapter) ?? []), entry]);
      }
      byName.set(property.name, [...(byName.get(property.name) ?? []), entry]);
    }
  }

  const claimed = new Set<string>();
  const results: AttributeCrossCheck[] = [...attributes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((attribute) => {
      const joins = new Map<
        string,
        { section: string; property: SammProperty; kinds: Set<JoinKind> }
      >();
      const add = (entry: { section: string; property: SammProperty }, kind: JoinKind) => {
        const existing = joins.get(entry.property.urn);
        if (existing) existing.kinds.add(kind);
        else joins.set(entry.property.urn, { ...entry, kinds: new Set([kind]) });
      };
      for (const entry of byChapter.get(attribute.din.chapter) ?? []) add(entry, 'din');
      for (const element of attribute.templateElements) {
        const id = element.semanticId;
        if (!id?.includes(':io.admin-shell.idta.batterypass.')) continue;
        for (const entry of byName.get(localName(id)) ?? []) add(entry, 'name');
      }

      const matches: SammMatch[] = [...joins.values()]
        .sort((a, b) => a.property.urn.localeCompare(b.property.urn))
        .map(({ section, property, kinds }) => {
          claimed.add(property.urn);
          const joinKinds = [...kinds].sort() as JoinKind[];
          const c = property.characteristic;
          return {
            section,
            name: property.name,
            urn: property.urn,
            joins: joinKinds,
            dinChapters: property.dinChapters,
            kind: c.kind,
            dataType: c.dataType,
            unit: c.unit,
            unitMapped: c.unit === null ? null : (SAMM_UNIT_TO_KB[c.unit] ?? null),
            values: c.values,
            range: c.range,
            optional: property.optional,
            findings: checkLeaf(attribute, property, joinKinds),
          };
        });

      const severities = new Set(matches.flatMap((m) => m.findings.map((f) => f.severity)));
      const status: AttributeCrossCheck['status'] =
        matches.length === 0
          ? 'unmatched'
          : severities.has('mismatch')
            ? 'mismatch'
            : severities.has('note')
              ? 'note'
              : 'ok';
      return { id: attribute.id, status, matches };
    });

  const unclaimed: UnclaimedProperty[] = model.sections
    .flatMap((section) =>
      section.properties
        .filter((p) => p.dinChapters.length > 0 && !claimed.has(p.urn))
        .map((p) => ({ section: section.key, name: p.name, dinChapters: p.dinChapters })),
    )
    .sort((a, b) => `${a.section}#${a.name}`.localeCompare(`${b.section}#${b.name}`));

  return {
    attributes: results,
    unclaimed,
    summary: {
      ok: results.filter((r) => r.status === 'ok').length,
      note: results.filter((r) => r.status === 'note').length,
      mismatch: results.filter((r) => r.status === 'mismatch').length,
      unmatched: results.filter((r) => r.status === 'unmatched').length,
      unclaimed: unclaimed.length,
    },
  };
}
