import { join } from 'node:path';
import {
  applyMappings,
  emitAasJson,
  emitAasx,
  emitHtml,
  type Finding,
  gapReport,
  ingest,
  type MappingDecision,
  type Verdict,
  validate,
} from '@passwerk/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadSeries } from '../src/series/load.js';
import { type MappedModel, mapModel } from '../src/series/pipeline.js';
import type { SeriesModel } from '../src/series/types.js';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const AS_OF = '2026-10-24T09:00:00Z';
const OPTIONS = { category: 'EV', asOf: AS_OF } as const;

const PDF = 'lieferantenerklaerung.pdf';
const XLSX = 'stueckliste.xlsx';
const CSV = 'datasheet-en.csv';
const DOCX = 'handover-notes.docx';

interface ReaderDecision {
  attributeId: string;
  path?: string;
  value: unknown;
  unit?: string;
  recordedAt?: string;
  file: string;
  /** Replaces the value the automatic chain accepted without a timestamp (PW-PLAUS-011). */
  override?: true;
}

const CERTIFICATES = {
  classId: '02-04',
  className: { de: 'Zertifikate, Erklärungen', en: 'Certificates, declarations' },
  system: 'VDI2770:2020',
};
const DOCS = 'https://passport.musterwerk.example/docs';

const registered = (attributeId: string, id: string, title: string, version: string) => ({
  attributeId,
  file: DOCX,
  value: [
    {
      id,
      title,
      version,
      languages: attributeId === 'safetyMeasures' ? ['de', 'en'] : ['de'],
      classification: CERTIFICATES,
      fileName: `${id}.pdf`,
      contentType: 'application/pdf',
      uri: `${DOCS}/${id}.pdf`,
    },
  ],
});

/** What a person reading the five documents fills in where the automatic chain stops. */
const READER: ReaderDecision[] = [
  {
    attributeId: 'batteryChemistry',
    path: 'clearName',
    value: 'Lithium nickel manganese cobalt oxide',
    file: PDF,
  },
  { attributeId: 'manufacturerInformation', path: 'identifier', value: 'DE-MW-0001', file: PDF },
  {
    attributeId: 'manufacturerInformation',
    path: 'address',
    value: {
      street: 'Werkstrasse 1',
      zipCode: '28199',
      cityTown: 'Bremen',
      nationalCode: 'DE',
      email: 'passport@musterwerk.example',
    },
    file: PDF,
  },
  {
    attributeId: 'separateCollectionSymbol',
    value: {
      fileName: 'separate-collection.png',
      contentType: 'image/png',
      uri: 'https://passport.musterwerk.example/files/separate-collection.png',
    },
    file: DOCX,
  },
  registered('euDeclarationOfConformity', 'DoC-MW-EV-2026-01', 'EU-Konformitätserklärung', 'V1.0'),
  registered(
    'testReportsProvingCompliance',
    'TR-2026-0457',
    'Prüfbericht zum Konformitätsnachweis',
    'V1.0',
  ),
  registered('dismantlingInformation', 'DISM-MW-EV-2026', 'Demontageanleitung', 'V2.1'),
  registered('safetyMeasures', 'SAFETY-MW-EV-2026', 'Sicherheitshinweise', 'V1.3'),
  registered(
    'endUserInfoWastePrevention',
    'EOL-PREVENTION-MW-EV-2026',
    'Endnutzerinformation zur Abfallvermeidung',
    'V1.0',
  ),
  registered(
    'endUserInfoSeparateCollection',
    'EOL-SEPARATE-MW-EV-2026',
    'Endnutzerinformation zur getrennten Sammlung',
    'V1.0',
  ),
  registered(
    'endUserInfoCollectionAndTreatment',
    'EOL-COLLECTION-MW-EV-2026',
    'Information zu Sammlung, Zweitnutzung und Behandlung am Lebensende',
    'V1.0',
  ),
  {
    attributeId: 'criticalRawMaterials',
    unit: 'kg',
    value: [
      {
        name: 'Lithium',
        identifier: '7439-93-2',
        massKg: '6.4',
        location: { componentName: 'Cathode' },
      },
      {
        name: 'Cobalt',
        identifier: '7440-48-4',
        massKg: '4.1',
        location: { componentName: 'Cathode' },
      },
      {
        name: 'Natural graphite',
        identifier: '7782-42-5',
        massKg: '38',
        location: { componentName: 'Anode' },
      },
    ],
    file: XLSX,
  },
  {
    attributeId: 'electrodeAndElectrolyteMaterials',
    value: [
      { name: 'Lithium', identifier: '7439-93-2', location: { componentName: 'Cathode' } },
      { name: 'Cobalt', identifier: '7440-48-4', location: { componentName: 'Cathode' } },
      { name: 'Natural graphite', identifier: '7782-42-5', location: { componentName: 'Anode' } },
      { name: 'Copper', identifier: '7440-50-8', location: { componentName: 'Anode' } },
      {
        name: 'Lithium hexafluorophosphate',
        identifier: '21324-40-3',
        location: { componentName: 'Electrolyte' },
      },
    ],
    file: XLSX,
  },
  {
    attributeId: 'hazardousSubstances',
    unit: '%',
    value: [
      {
        name: 'Lithium hexafluorophosphate',
        identifier: '21324-40-3',
        class: 'AcuteToxicity',
        concentrationPercent: '1.2',
        location: { componentName: 'Electrolyte' },
        impacts: ['H301 Toxic if swallowed', 'H314 Causes severe skin burns and eye damage'],
      },
    ],
    file: XLSX,
  },
  {
    attributeId: 'componentPartNumbers',
    value: [
      { partName: 'Battery management system', partNumber: 'MW-BMS-7' },
      { partName: 'Battery module', partNumber: 'MW-MOD-48-A' },
      { partName: 'Cooling plate', partNumber: 'MW-CP-12' },
    ],
    file: XLSX,
  },
  {
    attributeId: 'sparePartSources',
    value: [
      {
        name: { de: 'Musterwerk Ersatzteile GmbH' },
        address: { nationalCode: 'DE', postalCode: '28199', street: 'Werkstrasse 2' },
        email: 'ersatzteile@musterwerk.example',
        website: 'https://ersatzteile.musterwerk.example',
        components: [
          { partName: 'Battery module', partNumber: 'MW-MOD-48-A' },
          { partName: 'Cooling plate', partNumber: 'MW-CP-12' },
        ],
      },
    ],
    file: XLSX,
  },
  {
    attributeId: 'initialInternalResistance',
    path: 'packOhm',
    value: '0.0125',
    unit: 'Ohm',
    file: XLSX,
  },
  {
    attributeId: 'initialInternalResistance',
    path: 'cellOhm',
    value: '0.0012',
    unit: 'Ohm',
    file: XLSX,
  },
  {
    attributeId: 'originalPowerCapability',
    unit: 'W',
    value: [
      { atSocPercent: '80', powerW: '100000' },
      { atSocPercent: '20', powerW: '72000' },
    ],
    file: CSV,
  },
  {
    attributeId: 'stateOfCertifiedEnergy',
    value: '99.5',
    unit: '%',
    recordedAt: '2026-08-31T06:00:00Z',
    file: XLSX,
    override: true,
  },
  // SOCE brings in the Product Condition submodel, whose template requires these three.
  {
    attributeId: 'stateOfCharge',
    value: '70',
    unit: '%',
    recordedAt: '2026-08-31T06:00:00Z',
    file: XLSX,
  },
  {
    attributeId: 'numberOfFullCycles',
    value: '12',
    recordedAt: '2026-08-30T18:30:00Z',
    file: XLSX,
  },
  {
    attributeId: 'temperatureInformation',
    value: '23.5',
    unit: 'degC',
    recordedAt: '2026-08-31T06:00:00Z',
    file: XLSX,
  },
];

/** Product Condition elements the template needs once SOCE is present; not in the EV gap list. */
const TEMPLATE_COMPANIONS = ['numberOfFullCycles', 'stateOfCharge', 'temperatureInformation'];

const normalise = (s: string) =>
  s
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();

function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  throw new Error(`unexpected leaf ${String(value)}`);
}

const RANK: Record<Verdict, number> = { valid: 0, valid_with_warnings: 1, invalid: 2 };

const decisionOf = (r: ReaderDecision): MappingDecision => ({
  attributeId: r.attributeId,
  value: r.value,
  ...(r.path !== undefined ? { path: r.path } : {}),
  ...(r.unit !== undefined ? { unit: r.unit } : {}),
  ...(r.recordedAt !== undefined ? { recordedAt: r.recordedAt } : {}),
  ...(r.override ? { override: true } : {}),
  source: [{ file: r.file, note: 'read by a person' }],
  confidence: 1,
});

describe('the complete Musterwerk pack states every required EV value', () => {
  let model: SeriesModel;
  let automatic: MappedModel;
  const textOf = new Map<string, string>();

  beforeAll(async () => {
    const models = await loadSeries(join(ROOT, 'demo', 'series'), 'musterwerk-complete');
    model = models[0] as SeriesModel;
    automatic = await mapModel(model, OPTIONS);
    const bundle = await ingest(
      model.files.map((f) => ({ name: f.name, bytes: new Uint8Array(f.bytes) })),
    );
    for (const d of bundle.documents) {
      const cells = d.pages.flatMap((p) => [
        ...p.lines.map((l) => l.text),
        ...p.tables.flatMap((t) => t.rows.flatMap((r) => r.map((c) => c.text))),
      ]);
      textOf.set(d.name, normalise(cells.join('\n')));
    }
  });

  it('automatic chain alone: invalid at 61.7 % mandatory completeness with 39 attributes mapped', () => {
    const report = validate(automatic.draft, { asOf: AS_OF });
    const gap = gapReport(automatic.draft, { report, asOf: AS_OF });
    expect(report.verdict).toBe('invalid');
    expect(gap.completeness.mandatory.percent).toBe('61.7');
    expect(automatic.mapped).toBe(39);
  });

  it('a reader decision exists for exactly the required attributes the chain leaves open', () => {
    const report = validate(automatic.draft, { asOf: AS_OF });
    const open = gapReport(automatic.draft, { report, asOf: AS_OF })
      .items.filter((i) => i.bucket === 'required' && i.status !== 'present')
      .map((i) => i.attributeId)
      .sort();
    const decided = [...new Set(READER.map((r) => r.attributeId))]
      .filter((id) => !TEMPLATE_COMPANIONS.includes(id))
      .sort();
    expect(decided).toEqual(open);
  });

  it.each(READER)('$attributeId $path is written in $file', (r) => {
    const text = textOf.get(r.file);
    expect(text, r.file).toBeDefined();
    const stated = [...leaves(r.value), ...(r.recordedAt ? [r.recordedAt] : [])];
    for (const leaf of stated) expect(text, `${r.attributeId}: ${leaf}`).toContain(normalise(leaf));
  });

  it('with the reader decisions, validates and emits valid at 100 % mandatory completeness', () => {
    const { draft, conflicts } = applyMappings(automatic.draft, READER.map(decisionOf));
    expect(conflicts).toEqual([]);
    const asOf = { asOf: AS_OF };
    const report = validate(draft, asOf);
    const emitted = [
      emitAasJson(draft, asOf),
      emitAasx(draft, asOf),
      emitHtml(draft, { ...asOf, lang: 'en' }),
    ];
    let worst: { verdict: Verdict; findings: Finding[] } = report;
    for (const r of emitted) if (RANK[r.verdict] > RANK[worst.verdict]) worst = r;
    expect(worst.findings.map((f) => `${f.ruleId} ${f.attributeId ?? ''} ${f.message.en}`)).toEqual(
      [],
    );
    expect(worst.verdict).toBe('valid');
    expect(gapReport(draft, { report, ...asOf }).completeness.mandatory.percent).toBe('100.0');
  });
});
