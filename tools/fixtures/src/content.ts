export const CREATED = new Date('2026-09-01T08:00:00Z');

/**
 * Zip entry mtime for the OOXML writers. fflate encodes the DOS date/time of an entry from
 * local-time getters (getHours, ...), so an absolute instant would produce different bytes
 * in every timezone. Local components make the fields identical everywhere.
 */
export const ZIP_MTIME = new Date(2026, 8, 1, 8, 0, 0);

/** Lieferantenerklärung: key-value lines, then a two-column table of recycled shares. */
export const DECLARATION_LINES: [string, string][] = [
  ['Hersteller:', 'Musterwerk Batteriesysteme GmbH'],
  ['Herstellernummer:', 'DE-MW-0001'],
  ['Batteriekennung:', 'MW-EV-2026-000123'],
  ['Zellchemie:', 'NMC811'],
  ['Nennkapazität:', '94,5 Ah'],
  ['Nennspannung:', '355,2 V'],
  ['Minimalspannung:', '270 V'],
  ['Maximalspannung:', '403,2 V'],
  ['Batteriemasse:', '412,7 kg'],
  ['Herstellungsdatum:', '10.02.2026'],
  ['Garantiezeit:', '96 Monate'],
  ['Zyklenlebensdauer:', '3000 Zyklen'],
];
export const DECLARATION_TABLE_HEADER = ['Rezyklatanteil', 'Post-Consumer', 'Pre-Consumer'];
export const DECLARATION_TABLE_ROWS: string[][] = [
  ['Kobalt', '12,5 %', '4,0 %'],
  ['Lithium', '6,0 %', '2,5 %'],
  ['Nickel', '8,0 %', '3,0 %'],
];

/** stueckliste.xlsx, three sheets. */
export const STAMMDATEN: [string, string | number | Date][] = [
  ['Batteriepass-ID', 'https://passport.musterwerk.example/battery/MW-EV-2026-000123'],
  ['Seriennummer', 'MW-EV-2026-000123'],
  ['Batteriekategorie', 'EV'],
  ['Nennenergie [kWh]', 33.6],
  ['Batteriemasse [kg]', 412.7],
  ['Betreiber-ID', 'DE-OP-4711'],
  ['Herstellungsort', 'DE-MW-0001-PLANT-BRE'],
  ['Inbetriebnahme', new Date('2026-03-01T00:00:00Z')],
];
export const BOM_HEADER = ['Material', 'CAS-Nr.', 'Masse [kg]', 'Kobalt rec. %'];
export const BOM_ROWS: (string | number)[][] = [
  ['Kathodenaktivmaterial NMC811', '-', 118.4, 12.5],
  ['Graphit-Anode', '7782-42-5', 64.2, 0],
  ['Elektrolyt LiPF6', '21324-40-3', 22.1, 0],
];
export const LEISTUNG_HEADER = ['Kenngröße', 'Wert', 'Einheit'];
export const LEISTUNG_ROWS: (string | number)[][] = [
  ['Ladezustand', 68, '%'],
  ['Kapazitätsverlust', 3.2, '%'],
  ['Anzahl Vollzyklen', 142, 'Zyklen'],
  ['Aktuelle Selbstentladung', 1.1, '%/Monat'],
  ['Innenwiderstand Pack', 0.0125, 'Ohm'],
];

/** energierechnung.pdf: a negative control. */
export const BILL_LINES: [string, string][] = [
  ['Rechnungsnummer:', 'RE-2026-08-0042'],
  ['Abrechnungszeitraum:', '01.07.2026 – 31.07.2026'],
  ['Verbrauch:', '48.250 kWh'],
  ['Arbeitspreis:', '0,2849 EUR/kWh'],
  ['Rechnungsbetrag:', '13.746,43 EUR'],
  ['Zahlungsziel:', '14 Tage'],
];

/** datasheet-en.csv: semicolon-separated, windows-1252 encoded, LF line endings. */
export const DATASHEET_ROWS: string[][] = [
  ['Parameter', 'Value', 'Unit'],
  ['Rated capacity', '94.5', 'Ah'],
  ['Nominal voltage', '355.2', 'V'],
  ['Battery mass', '412.7', 'kg'],
  ['Cycle life', '3000', 'cycles'],
  ['Rated energy', '33600', 'Wh'],
  ['Temperature range – idle, lower', '-20', '°C'],
  ['Temperature range – idle, upper', '45', '°C'],
];

/** handover-notes.docx */
export const HANDOVER_PARAGRAPHS = [
  'Übergabedokumentation Musterwerk EV-Pack MW-EV-2026-000123',
  'Die folgenden Dokumente werden mit der Batterie übergeben.',
];
export const HANDOVER_TABLE: string[][] = [
  ['Dokument', 'Sprache', 'Version'],
  ['EU-Konformitätserklärung', 'de', 'V1.0'],
  ['Demontageanleitung', 'de', 'V2.1'],
  ['Sicherheitshinweise', 'de, en', 'V1.3'],
];
