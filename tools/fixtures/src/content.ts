import type { Sheet } from './writers/xlsx.js';

export const CREATED = new Date('2026-09-01T08:00:00Z');

/**
 * Zip entry mtime for the OOXML writers. fflate encodes the DOS date/time of an entry from
 * local-time getters (getHours, ...), so an absolute instant would produce different bytes
 * in every timezone. Local components make the fields identical everywhere.
 */
export const ZIP_MTIME = new Date(2026, 8, 1, 8, 0, 0);

type Share = { post: string; pre: string };

/**
 * What differs between two battery models of one Musterwerk series. Decimals are dot-separated
 * strings with exactly one fractional digit, so no value passes through float arithmetic.
 */
export interface ModelVariant {
  serial: string;
  ratedCapacityAh: string;
  massKg: string;
  cycleLife: number;
  recycled: { cobalt: Share; lithium: Share; nickel: Share };
}

/** The model behind packages/core/test/fixtures/musterwerk. */
export const MUSTERWERK: ModelVariant = {
  serial: 'MW-EV-2026-000123',
  ratedCapacityAh: '94.5',
  massKg: '412.7',
  cycleLife: 3000,
  recycled: {
    cobalt: { post: '12.5', pre: '4.0' },
    lithium: { post: '6.0', pre: '2.5' },
    nickel: { post: '8.0', pre: '3.0' },
  },
};

export const NOMINAL_VOLTAGE_V = '355.2';

const tenths = (s: string): number => {
  const m = /^(\d+)\.(\d)$/.exec(s);
  if (!m) throw new Error(`expected one fractional digit: ${s}`);
  return Number(m[1]) * 10 + Number(m[2]);
};

/**
 * Rated energy in tenths of a kWh: capacity times nominal voltage, rounded half up, in integer
 * arithmetic. Deriving it keeps PW-PLAUS-016 satisfied for every variant.
 */
export function ratedEnergyTenthsKwh(v: ModelVariant): number {
  return Math.floor((tenths(v.ratedCapacityAh) * tenths(NOMINAL_VOLTAGE_V) + 5000) / 10000);
}

const de = (s: string) => s.replace('.', ',');

/** Every text and cell of the five Musterwerk documents for one model. */
export function musterwerkContent(v: ModelVariant) {
  const energy = ratedEnergyTenthsKwh(v);
  const { cobalt, lithium, nickel } = v.recycled;
  return {
    /** Lieferantenerklärung: key-value lines, then a two-column table of recycled shares. */
    declarationTitle: `Lieferantenerklärung Batteriesystem ${v.serial}`,
    declarationLines: [
      ['Hersteller:', 'Musterwerk Batteriesysteme GmbH'],
      ['Herstellernummer:', 'DE-MW-0001'],
      ['Batteriekennung:', v.serial],
      ['Zellchemie:', 'NMC811'],
      ['Nennkapazität:', `${de(v.ratedCapacityAh)} Ah`],
      ['Nennspannung:', `${de(NOMINAL_VOLTAGE_V)} V`],
      ['Minimalspannung:', '270 V'],
      ['Maximalspannung:', '403,2 V'],
      ['Batteriemasse:', `${de(v.massKg)} kg`],
      ['Herstellungsdatum:', '10.02.2026'],
      ['Garantiezeit:', '96 Monate'],
      ['Zyklenlebensdauer:', `${v.cycleLife} Zyklen`],
    ] as [string, string][],
    declarationTableHeader: ['Rezyklatanteil', 'Post-Consumer', 'Pre-Consumer'],
    declarationTableRows: [
      ['Kobalt', `${de(cobalt.post)} %`, `${de(cobalt.pre)} %`],
      ['Lithium', `${de(lithium.post)} %`, `${de(lithium.pre)} %`],
      ['Nickel', `${de(nickel.post)} %`, `${de(nickel.pre)} %`],
    ],

    /** stueckliste.xlsx, three sheets. */
    stammdaten: [
      ['Batteriepass-ID', `https://passport.musterwerk.example/battery/${v.serial}`],
      ['Seriennummer', v.serial],
      ['Batteriekategorie', 'EV'],
      ['Nennenergie [kWh]', energy / 10],
      ['Batteriemasse [kg]', Number(v.massKg)],
      ['Betreiber-ID', 'DE-OP-4711'],
      ['Herstellungsort', 'DE-MW-0001-PLANT-BRE'],
      ['Inbetriebnahme', new Date('2026-03-01T00:00:00Z')],
    ] as [string, string | number | Date][],
    bomHeader: ['Material', 'CAS-Nr.', 'Masse [kg]', 'Kobalt rec. %'],
    bomRows: [
      ['Kathodenaktivmaterial NMC811', '-', 118.4, Number(cobalt.post)],
      ['Graphit-Anode', '7782-42-5', 64.2, 0],
      ['Elektrolyt LiPF6', '21324-40-3', 22.1, 0],
    ],
    leistungHeader: ['Kenngröße', 'Wert', 'Einheit'],
    leistungRows: [
      ['Ladezustand', 68, '%'],
      ['Kapazitätsverlust', 3.2, '%'],
      ['Anzahl Vollzyklen', 142, 'Zyklen'],
      ['Aktuelle Selbstentladung', 1.1, '%/Monat'],
      ['Innenwiderstand Pack', 0.0125, 'Ohm'],
    ],
    /** Sheets of stueckliste.xlsx after Leistung. */
    moreSheets: [] as Sheet[],

    /** energierechnung.pdf: a negative control, the same for every model. */
    billTitle: 'Stromrechnung August 2026',
    billLines: [
      ['Rechnungsnummer:', 'RE-2026-08-0042'],
      ['Abrechnungszeitraum:', '01.07.2026 – 31.07.2026'],
      ['Verbrauch:', '48.250 kWh'],
      ['Arbeitspreis:', '0,2849 EUR/kWh'],
      ['Rechnungsbetrag:', '13.746,43 EUR'],
      ['Zahlungsziel:', '14 Tage'],
    ] as [string, string][],

    /** datasheet-en.csv: semicolon-separated, windows-1252 encoded, LF line endings. */
    datasheetRows: [
      ['Parameter', 'Value', 'Unit'],
      ['Rated capacity', v.ratedCapacityAh, 'Ah'],
      ['Nominal voltage', NOMINAL_VOLTAGE_V, 'V'],
      ['Battery mass', v.massKg, 'kg'],
      ['Cycle life', String(v.cycleLife), 'cycles'],
      ['Rated energy', String(energy * 100), 'Wh'],
      ['Temperature range – idle, lower', '-20', '°C'],
      ['Temperature range – idle, upper', '45', '°C'],
    ],

    /** handover-notes.docx */
    handoverParagraphs: [
      `Übergabedokumentation Musterwerk EV-Pack ${v.serial}`,
      'Die folgenden Dokumente werden mit der Batterie übergeben.',
    ],
    handoverTable: [
      ['Dokument', 'Sprache', 'Version'],
      ['EU-Konformitätserklärung', 'de', 'V1.0'],
      ['Demontageanleitung', 'de', 'V2.1'],
      ['Sicherheitshinweise', 'de, en', 'V1.3'],
    ],
  };
}

export type MusterwerkContent = ReturnType<typeof musterwerkContent>;

/** The model behind demo/series/musterwerk-complete: the base Musterwerk pack, one serial on. */
export const MUSTERWERK_COMPLETE: ModelVariant = { ...MUSTERWERK, serial: 'MW-EV-2026-000124' };

const DOCS = 'https://passport.musterwerk.example/docs';
const VDI_2770_CERTIFICATES = ['02-04', 'Zertifikate, Erklärungen', 'Certificates, declarations'];

/** One handed-over PDF in the register: id, title, version, languages, then its class and file. */
const registered = (id: string, title: string, version: string, languages: string) => [
  id,
  title,
  version,
  languages,
  ...VDI_2770_CERTIFICATES,
  'VDI2770:2020',
  `${id}.pdf`,
  'application/pdf',
  `${DOCS}/${id}.pdf`,
];

/**
 * The Musterwerk documents of a new battery, extended until every required EV value is stated
 * in them with every leaf its schema and template need, whether or not extract and suggest can
 * read it yet. Chemical, regulatory and document values come from the golden sample
 * ev-valid.json: CAS numbers, masses, hazard class and statements, VDI 2770 class, document
 * ids, addresses, part numbers, cell resistance and the BMS read-out. The powers of the
 * original power capability are fictional, scaled below this pack's 110 kW maximum; so are the
 * document versions, file names and the URIs that ev-valid.json does not give.
 */
export function musterwerkCompleteContent(v: ModelVariant): MusterwerkContent {
  const c = musterwerkContent(v);
  return {
    ...c,
    declarationLines: [
      ...c.declarationLines,
      ['Batteriestatus:', 'Original'],
      ['Bedeutung der Symbole:', 'Durchgestrichene Mülltonne – getrennt sammeln'],
      ['Löschmittel:', 'Wasser in großen Mengen'],
      ['Gefahrenhinweise:', 'H301, H314 (Elektrolyt LiPF6)'],
      ['Anteil erneuerbarer Materialien:', '0 %'],
      ['Referenztest Zyklenlebensdauer:', 'IEC 62660-1'],
      ['Zellchemie, Klarname:', 'Lithium nickel manganese cobalt oxide'],
      ['Anschrift:', 'Werkstrasse 1, 28199 Bremen, DE'],
      ['E-Mail:', 'passport@musterwerk.example'],
    ],
    bomRows: [
      [
        'Kathodenaktivmaterial NMC811',
        'siehe Materialdeklaration',
        118.4,
        Number(v.recycled.cobalt.post),
      ],
      ...c.bomRows.slice(1),
    ],
    moreSheets: [
      {
        name: 'Materialdeklaration',
        rows: [
          ['Material', 'CAS-Nr.', 'Masse [kg]', 'Komponente', 'Kritischer Rohstoff'],
          ['Lithium', '7439-93-2', 6.4, 'Cathode', 'ja'],
          ['Cobalt', '7440-48-4', 4.1, 'Cathode', 'ja'],
          ['Natural graphite', '7782-42-5', 38, 'Anode', 'ja'],
          ['Copper', '7440-50-8', '-', 'Anode', 'nein'],
          ['Lithium hexafluorophosphate', '21324-40-3', '-', 'Electrolyte', 'nein'],
        ],
      },
      {
        name: 'Gefahrstoffe',
        rows: [
          [
            'Stoff',
            'CAS-Nr.',
            'Gefahrenklasse',
            'Konzentration [%]',
            'Komponente',
            'Gefahrenhinweise',
          ],
          [
            'Lithium hexafluorophosphate',
            '21324-40-3',
            'AcuteToxicity',
            1.2,
            'Electrolyte',
            'H301 Toxic if swallowed; H314 Causes severe skin burns and eye damage',
          ],
        ],
      },
      {
        name: 'Ersatzteile',
        rows: [
          ['Komponente', 'Teilenummer', 'Bezugsquelle'],
          ['Battery management system', 'MW-BMS-7', 'Musterwerk Batteriesysteme GmbH'],
          ['Battery module', 'MW-MOD-48-A', 'Musterwerk Ersatzteile GmbH'],
          ['Cooling plate', 'MW-CP-12', 'Musterwerk Ersatzteile GmbH'],
        ],
      },
      {
        name: 'Bezugsquellen',
        rows: [
          ['Lieferant', 'Straße', 'PLZ', 'Land', 'E-Mail', 'Website'],
          [
            'Musterwerk Ersatzteile GmbH',
            'Werkstrasse 2',
            '28199',
            'DE',
            'ersatzteile@musterwerk.example',
            'https://ersatzteile.musterwerk.example',
          ],
        ],
      },
      {
        name: 'BMS-Auslesung',
        rows: [
          ['Kenngröße', 'Wert', 'Einheit', 'Zeitstempel'],
          ['State of Certified Energy (SOCE)', 99.5, '%', '2026-08-31T06:00:00Z'],
          ['Ladezustand (SoC)', 70, '%', '2026-08-31T06:00:00Z'],
          ['Anzahl Vollzyklen', 12, 'Zyklen', '2026-08-30T18:30:00Z'],
          ['Batterietemperatur', 23.5, '°C', '2026-08-31T06:00:00Z'],
        ],
      },
    ],
    datasheetRows: [
      ...c.datasheetRows,
      ['Original power capability at 80 % SoC', '100000', 'W'],
      ['Original power capability at 20 % SoC', '72000', 'W'],
    ],
    handoverTable: [
      [
        'Dokument-ID',
        'Titel',
        'Version',
        'Sprache',
        'VDI-2770-Klasse',
        'Klassenname',
        'Class name',
        'Klassifikationssystem',
        'Datei',
        'Inhaltstyp',
        'URI',
      ],
      registered('DoC-MW-EV-2026-01', 'EU-Konformitätserklärung', 'V1.0', 'de'),
      registered('TR-2026-0457', 'Prüfbericht zum Konformitätsnachweis', 'V1.0', 'de'),
      registered('DISM-MW-EV-2026', 'Demontageanleitung', 'V2.1', 'de'),
      registered('SAFETY-MW-EV-2026', 'Sicherheitshinweise', 'V1.3', 'de, en'),
      registered(
        'EOL-PREVENTION-MW-EV-2026',
        'Endnutzerinformation zur Abfallvermeidung',
        'V1.0',
        'de',
      ),
      registered(
        'EOL-SEPARATE-MW-EV-2026',
        'Endnutzerinformation zur getrennten Sammlung',
        'V1.0',
        'de',
      ),
      registered(
        'EOL-COLLECTION-MW-EV-2026',
        'Information zu Sammlung, Zweitnutzung und Behandlung am Lebensende',
        'V1.0',
        'de',
      ),
      [
        '-',
        'Symbol für die getrennte Sammlung (durchgestrichene Mülltonne)',
        'V1.0',
        '-',
        '-',
        '-',
        '-',
        '-',
        'separate-collection.png',
        'image/png',
        'https://passport.musterwerk.example/files/separate-collection.png',
      ],
    ],
    leistungRows: [
      ['Kapazitätsverlust', 0, '%'],
      ['Leistungsverlust', 0, '%'],
      ['Widerstandszunahme', 0, '%'],
      ['Innenwiderstand Pack', 0.0125, 'Ohm'],
      ['Innenwiderstand Zelle', 0.0012, 'Ohm'],
      ['Anfänglicher Round-Trip-Wirkungsgrad', 96, '%'],
      ['Wirkungsgrad halbe Lebensdauer', 93, '%'],
      ['Maximal zulässige Batterieleistung', 110, 'kW'],
      ['Kalendarische Lebensdauer', 12, 'Jahre'],
      ['C-Rate', 0.5, 'C'],
      ['Erschöpfungsschwelle', 70, '%'],
    ],
  };
}
