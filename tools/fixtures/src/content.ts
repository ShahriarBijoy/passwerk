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
