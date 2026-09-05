/**
 * Held-out supplier documents (ADR D-024, Phase 5b).
 *
 * Every label and value below is transcribed **verbatim** from a public datasheet listed in
 * `SOURCES`; only the layout is re-typeset by our writers so that no third-party PDF is
 * redistributed. Nothing here was used to tune the knowledge base: the synonym index was not
 * touched in the PR that added this file, and it must not be edited in response to these
 * numbers without saying so in `docs/EVALUATION.md`.
 *
 * Deviations from the printed source are listed per source under `substitutions` (glyphs the
 * writers cannot encode, columns left out). Anything not listed is as printed.
 */

export const ACCESSED = '2026-09-05';

export interface HeldoutSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  version: string;
  /** What part of the source was transcribed. */
  transcribed: string;
  /** Deviations from the printed text, or none. */
  substitutions: string[];
}

export const SOURCES: HeldoutSource[] = [
  {
    id: 'eve-lf280k',
    title: 'Product Specification, Prismatic LFP Cells, Model LF280K',
    publisher: 'EVE Power Co., Ltd (PDF hosted by battery-germany.de)',
    url: 'https://www.battery-germany.de/wp-content/uploads/2022/02/LF280K-280Ah-Product-Specification-Version-B-2023.pdf',
    version: 'Specification No. PBRI-LF280K-D06-01, Version B, Feb. 2023',
    transcribed:
      'Section 2.1 "Fundamental Parameters" table (Items / Standards / Remarks), English column only.',
    substitutions: ['Chinese text of the bilingual cells omitted.'],
  },
  {
    id: 'byd-hvs',
    title: 'Battery-Box Premium HVS / HVM Datasheet',
    publisher: 'BYD Company Limited',
    url: 'https://bydbatterybox.com/uploads/downloads/230530_BYD_Battery-Box_Premium_HVS&HVM_Datasheet_V1.7_EN-647eedf90f9c3.pdf',
    version: 'V1.7 EN (2023-05-30)',
    transcribed:
      'Page 2 "Technical Parameters": the HVS 5.1 column of the HVS table, and the "HVS & HVM" common table. Footnote markers [1]..[5] dropped.',
    substitutions: ['Footnote markers after labels removed.'],
  },
  {
    id: 'tesvolt-ts-i-hv-e',
    title: 'Technisches Datenblatt TS-I-HV-E-Serie, Technische Daten Batteriespeicher',
    publisher: 'TESVOLT GmbH',
    url: 'https://www.tesvolt.com/_media/06%20UNTERNEHMEN/01_Presse/2022/05-02/Datenblatt_TS-I-HV-E-Serie.pdf',
    version: 'RD.TI.075.E_de-DE_v.A.01',
    transcribed: 'Page 1 table, TS-I HV 80 E column, rows Typbezeichnung to Schutzklasse.',
    substitutions: [
      "The DC symbol (U+2393) after voltages is dropped; the PDF writer's Helvetica cannot encode it.",
      'Rows with a sub-label (Gewicht Schrank, Batteriemodul, Kippmaß, Zertifikate) omitted.',
    ],
  },
  {
    id: 'ampere-storage',
    title: 'AMPERE.Storage Datenblatt',
    publisher: 'SOLARMAX GmbH (PDF hosted by ekd-solar.de)',
    url: 'https://www.ekd-solar.de/wp-content/uploads/2022/08/Ampere.Storage_Datenblatt.pdf',
    version: 'Stand: 18.07.2022, v02',
    transcribed:
      'Page 2 "Technische Daten": sections Batteriespeicher, Umgebungsbedingungen, Gewicht & Abmessungen, Garantie, plus the manufacturer footer line.',
    substitutions: ['Footnote markers (superscript digits, asterisks) removed.'],
  },
  {
    id: 'webasto-pro-40',
    title: 'Standard Battery Pro 40, technical specifications',
    publisher: 'Webasto Group (web page)',
    url: 'https://www.webasto.com/en-int/battery/standardized-battery-and-thermo-management/cv-standard-battery-system.html',
    version: 'web page as of the access date',
    transcribed: 'The technical specification list on the product page, all rows.',
    substitutions: [],
  },
  {
    id: 'bosch-powertube-750',
    title: 'E-Bike Akku BOSCH PowerTube 750 horizontal BBP3770, Technische Daten',
    publisher: 'akkushop.de (retailer listing; not a manufacturer document)',
    url: 'https://www.akkushop.de/de/e-bike-akku-bosch-powertube-750-horizontal-bbp3770-eb1210000x-das-smarte-system-vollintegriert-inframe-intube/',
    version: 'web page as of the access date',
    transcribed: 'The "Technische Daten" list, all rows.',
    substitutions: [],
  },
];

export type Category = 'EV' | 'LMT' | 'INDUSTRIAL_GT_2KWH';

export interface HeldoutFile {
  name: string;
  source: string;
  category: Category;
  lang: 'de' | 'en';
  layout: string;
}

export const FILES: HeldoutFile[] = [
  {
    name: 'eve-lf280k-fundamental-parameters.csv',
    source: 'eve-lf280k',
    category: 'INDUSTRIAL_GT_2KWH',
    lang: 'en',
    layout: 'UTF-8 CSV, three columns with a text header row (Items / Standards / Remarks)',
  },
  {
    name: 'byd-battery-box-premium-hvs.xlsx',
    source: 'byd-hvs',
    category: 'INDUSTRIAL_GT_2KWH',
    lang: 'en',
    layout: 'Two sheets, two columns each (label / value)',
  },
  {
    name: 'tesvolt-ts-i-hv-80-e.pdf',
    source: 'tesvolt-ts-i-hv-e',
    category: 'INDUSTRIAL_GT_2KWH',
    lang: 'de',
    layout: 'One page, label and value in two text columns, no colons',
  },
  {
    name: 'ampere-storage-datenblatt.docx',
    source: 'ampere-storage',
    category: 'INDUSTRIAL_GT_2KWH',
    lang: 'de',
    layout: 'Three paragraphs and one two-column table without a header row',
  },
  {
    name: 'webasto-standard-battery-pro-40.txt',
    source: 'webasto-pro-40',
    category: 'EV',
    lang: 'en',
    layout: 'Plain text, label and value separated by two spaces',
  },
  {
    name: 'bosch-powertube-750-haendlerdaten.csv',
    source: 'bosch-powertube-750',
    category: 'LMT',
    lang: 'de',
    layout: 'windows-1252 CSV, two columns, no header row',
  },
];

/** eve-lf280k-fundamental-parameters.csv */
export const EVE_ROWS: string[][] = [
  ['Items', 'Standards', 'Remarks'],
  ['Min. Capacity', '280Ah', '0.5P, 25±2℃, 2.5-3.65V'],
  ['Min. Energy', '896Wh', '0.5P, 25±2℃, 2.5-3.65V'],
  ['Initial IR', '≤0.25mΩ', 'AC, 1kHz, 40%SOC'],
  ['Nominal Voltage', '3.2V', '0.5P, 2.5~3.65V'],
  ['Weight', '5490g±300g', ''],
  ['Charging Cut-off Voltage', '3.65V', ''],
  ['Discharging Cut-off Voltage', '2.5V (T >0℃)', ''],
  ['Standard Charging Power', '448W', '0.5P'],
  ['Standard Discharging Power', '448W', '0.5P'],
  [
    '25℃ Standard Cycle',
    '6000 Cycles',
    'Under 300kgf±20kgf clamping force, 25℃±2℃ 0.5P/0.5P, 2.5~3.65V, Energy retention≥80%.',
  ],
];

/** byd-battery-box-premium-hvs.xlsx */
export const BYD_HVS_5_1: string[][] = [
  ['Battery Module', 'HVS (2.56 kWh, 102.4 V, 38 kg)'],
  ['Number of Modules', '2'],
  ['Usable Energy', '5.12 kWh'],
  ['Max Output Current', '25 A'],
  ['Peak Output Current', '50 A, 3 s'],
  ['Nominal Voltage', '204.8 V'],
  ['Operating Voltage', '160~240 V'],
  ['Dimensions (H / W / D)', '762 x 585 x 298 mm'],
  ['Weight', '91 kg'],
];
export const BYD_COMMON: string[][] = [
  ['Operating Temperature', '-10 °C to +50 °C'],
  ['Battery Cell Technology', 'Lithium Iron Phosphate (cobalt-free)'],
  ['Communication', 'CAN / RS485'],
  ['Enclosure Protection Rating', 'IP55'],
  ['Round-trip Efficiency', '≥ 96%'],
  ['Certification', 'VDE2510-50 / IEC62619 / CEC / CE / UN38.3'],
  ['Applications', 'ON Grid / ON Grid + Backup / OFF Grid'],
  ['Warranty', '10 Years'],
];

/** tesvolt-ts-i-hv-80-e.pdf */
export const TESVOLT_TITLE = 'TECHNISCHES DATENBLATT TS-I-HV-E-SERIE / TS-I HV 80 E';
export const TESVOLT_LINES: [string, string][] = [
  ['Typbezeichnung', 'TS HV 90/10-20'],
  ['Energieinhalt', '80 kWh (bei 100 % DOD)'],
  ['Nennspannung', '810 V'],
  ['Min. Betriebsspannung', '704 V'],
  ['Max. Betriebsspannung', '913 V'],
  ['Max. Lade-/Entladestrom', '100 A'],
  ['Max. C-Rate', '1C'],
  ['Zelle', 'Lithium-NMC prismatisch (Samsung SDI)'],
  ['Zellen-Balancing', 'DynamiX Battery Optimizer'],
  ['erwartete Zyklen @ 100 % DoD | 70 % EoL | 23 °C +/-5 °C 1C/1C', '6000'],
  ['Wirkungsgrad (Batterie)', 'bis zu 98 %'],
  ['Eigenverbrauch (Standby)', '5 W (ohne Batteriewechselrichter)'],
  ['Betriebstemperatur', '0 °C bis 50 °C'],
  ['Umgebungstemperatur', '0 °C bis 50 °C'],
  ['Luftfeuchtigkeit', '0 bis 80 % (nicht kondensierend)'],
  ['Gewicht Gesamt', '656 kg'],
  ['Abmessungen (H x B x T)', '2008 x 608 x 990 mm'],
  ['Garantie', '10 Jahre Kapazitätsgarantie, 5 Jahre Systemgarantie'],
  ['Schutzart', 'IP 20'],
  ['Schutzklasse', 'I'],
];

/** ampere-storage-datenblatt.docx */
export const AMPERE_PARAGRAPHS = [
  'AMPERE.Storage Datenblatt I Stand: 18.07.2022 I v02',
  'Technische Daten',
  'Hersteller SOLARMAX GmbH, Zur Schönhalde 10, D-89352 Ellzee',
];
export const AMPERE_TABLE: string[][] = [
  ['Technologie', 'Lithium-Ionen'],
  ['Nennspannung', '51,1 V'],
  ['Kapazität Batterie', '6 - 15 kWh'],
  ['DoD', '90 %'],
  [
    'Maximale Leistung Laden / Entladen',
    '4 - 8 kW Be- und Entladeleistung (abhängig von Speichergröße)',
  ],
  ['Zyklenzahl', '12.000'],
  ['Schutzart', 'IP20'],
  ['Umgebungstemperaturbereich (Nennleistung)', '0 °C - 40 °C'],
  ['Relative Luftfeuchtigkeit', '0 % - 95 % (nicht kondensierend)'],
  ['Maximale Betriebshöhe über Meeresspiegel', '2.000 m'],
  ['Gewicht ohne Batterien', '60 kg'],
  ['Gewicht Batteriepack je 3 kWh', '19,2 kg'],
  ['Abmessungen (B x H x T)', '660 mm × 1.220 mm × 400 mm'],
  ['Garantie', '10 Jahre Herstellergarantie, kostenpflichtig erweiterbar auf 20 Jahre'],
];

/** webasto-standard-battery-pro-40.txt */
export const WEBASTO_LINES: [string, string][] = [
  ['Dimensions (L x W x H)', '960 x 687 x 302 mm'],
  ['Dry weight', '297 kg'],
  ['Installed energy', '~ 40 kWh'],
  ['Nominal capacity', '116 Ah'],
  ['Voltage range', '333 - 407 V'],
  ['Energy density', '~ 232 Wh/l, > 135 Wh/kg'],
  ['Continuous power (CH / DCH) (@25 °C, SoC dependent)', '45 / 55 kW'],
  ['Peak power (CH / DCH) (10 s, @25 °C, SoC dependent)', '60 / 112 kW'],
  ['Lifetime (DoD, temperature and C-rate dependent)', 'Up to 3,000 cycles'],
  ['Volume flow', '10 l/min'],
  ['Pressure loss', '< 50 mbar'],
  ['Cell type', 'prismatic NMC'],
  ['Operating temperature', '-30 °C to +55 °C'],
];

/** bosch-powertube-750-haendlerdaten.csv */
export const BOSCH_ROWS: string[][] = [
  ['Spannung', '36V'],
  ['Kapazität (Ah)', '21Ah'],
  ['Energie (Wh)', '750 Wh'],
  ['Gewicht', '4.3 kg'],
  ['Abmessungen', '484 x 84 x 65 mm'],
  ['Zellentyp', 'Auf Anfrage'],
  ['Artikelnummer', 'EB1210000X'],
  ['Hersteller-Artikelnummer', 'BBP3770'],
  ['Hersteller', 'BOSCH'],
  ['Bauform', 'Vollintegriert (InFrame, InTube)'],
  ['BMS Typ', 'Smart-BMS'],
  ['Ladebuchse', 'Runde BOSCH Ladebuchse 6-polig (das smarte System / Gen3)'],
  ['Farbe', 'Black'],
  ['EAN/GTIN', '4054289005733'],
];

/**
 * What a domain reviewer would want mapped from each document: attribute id, the value in the
 * knowledge-base unit, and the printed label it comes from. Values are normalised the way the
 * pipeline normalises them (decimal point, canonical unit). Anything printed that is *not*
 * listed here is, by definition, something that must not be proposed at high confidence.
 */
export interface ExpectedMapping {
  file: string;
  attributeId: string;
  value: string;
  unit?: string;
  path?: string;
  /** The printed label, for the report. */
  label: string;
  /** Why the pipeline is expected to struggle, when known in advance. */
  note?: string;
}

export const EXPECTED: ExpectedMapping[] = [
  // EVE LF280K
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'ratedCapacity',
    value: '280',
    unit: 'Ah',
    label: 'Min. Capacity',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'nominalVoltage',
    value: '3.2',
    unit: 'V',
    label: 'Nominal Voltage',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'batteryMass',
    value: '5.49',
    unit: 'kg',
    label: 'Weight',
    note: 'printed as "5490g±300g"; the tolerance defeats unit parsing',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'maximumVoltage',
    value: '3.65',
    unit: 'V',
    label: 'Charging Cut-off Voltage',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'minimumVoltage',
    value: '2.5',
    unit: 'V',
    label: 'Discharging Cut-off Voltage',
    note: 'printed as "2.5V (T >0℃)"',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'expectedLifetimeCycles',
    value: '6000',
    unit: 'cycles',
    label: '25℃ Standard Cycle',
  },
  {
    file: 'eve-lf280k-fundamental-parameters.csv',
    attributeId: 'initialInternalResistance',
    value: '0.00025',
    unit: 'Ohm',
    path: 'cellOhm',
    label: 'Initial IR',
    note: 'composite; "≤0.25mΩ" is a bound, not a value',
  },
  // BYD HVS 5.1
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'certifiedUsableBatteryEnergy',
    value: '5.12',
    unit: 'kWh',
    label: 'Usable Energy',
  },
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'nominalVoltage',
    value: '204.8',
    unit: 'V',
    label: 'Nominal Voltage',
  },
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'batteryMass',
    value: '91',
    unit: 'kg',
    label: 'Weight',
  },
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'batteryChemistry',
    value: 'Lithium Iron Phosphate (cobalt-free)',
    path: 'shortName',
    label: 'Battery Cell Technology',
  },
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'initialRoundTripEnergyEfficiency',
    value: '96',
    unit: '%',
    label: 'Round-trip Efficiency',
    note: 'printed as "≥ 96%"',
  },
  {
    file: 'byd-battery-box-premium-hvs.xlsx',
    attributeId: 'warrantyPeriod',
    value: '10 Years',
    label: 'Warranty',
    note: 'free text in the knowledge base; months expected downstream',
  },
  // TESVOLT TS-I HV 80 E
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'certifiedUsableBatteryEnergy',
    value: '80',
    unit: 'kWh',
    label: 'Energieinhalt',
    note: '"(bei 100 % DOD)" follows the value',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'nominalVoltage',
    value: '810',
    unit: 'V',
    label: 'Nennspannung',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'minimumVoltage',
    value: '704',
    unit: 'V',
    label: 'Min. Betriebsspannung',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'maximumVoltage',
    value: '913',
    unit: 'V',
    label: 'Max. Betriebsspannung',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'batteryChemistry',
    value: 'Lithium-NMC prismatisch (Samsung SDI)',
    path: 'shortName',
    label: 'Zelle',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'expectedLifetimeCycles',
    value: '6000',
    unit: 'cycles',
    label: 'erwartete Zyklen @ 100 % DoD | 70 % EoL | 23 °C +/-5 °C 1C/1C',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'initialRoundTripEnergyEfficiency',
    value: '98',
    unit: '%',
    label: 'Wirkungsgrad (Batterie)',
    note: 'printed as "bis zu 98 %"',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'batteryMass',
    value: '656',
    unit: 'kg',
    label: 'Gewicht Gesamt',
  },
  {
    file: 'tesvolt-ts-i-hv-80-e.pdf',
    attributeId: 'warrantyPeriod',
    value: '10 Jahre Kapazitätsgarantie, 5 Jahre Systemgarantie',
    label: 'Garantie',
  },
  // AMPERE.Storage
  {
    file: 'ampere-storage-datenblatt.docx',
    attributeId: 'batteryChemistry',
    value: 'Lithium-Ionen',
    path: 'shortName',
    label: 'Technologie',
  },
  {
    file: 'ampere-storage-datenblatt.docx',
    attributeId: 'nominalVoltage',
    value: '51.1',
    unit: 'V',
    label: 'Nennspannung',
  },
  {
    file: 'ampere-storage-datenblatt.docx',
    attributeId: 'expectedLifetimeCycles',
    value: '12000',
    unit: 'cycles',
    label: 'Zyklenzahl',
    note: 'printed as "12.000" (German thousands separator, no unit)',
  },
  {
    file: 'ampere-storage-datenblatt.docx',
    attributeId: 'manufacturerInformation',
    value: 'SOLARMAX GmbH, Zur Schönhalde 10, D-89352 Ellzee',
    path: 'name.de',
    label: 'Hersteller',
    note: 'footer line without a colon',
  },
  {
    file: 'ampere-storage-datenblatt.docx',
    attributeId: 'warrantyPeriod',
    value: '10 Jahre Herstellergarantie, kostenpflichtig erweiterbar auf 20 Jahre',
    label: 'Garantie',
  },
  // Webasto Standard Battery Pro 40
  {
    file: 'webasto-standard-battery-pro-40.txt',
    attributeId: 'ratedCapacity',
    value: '116',
    unit: 'Ah',
    label: 'Nominal capacity',
  },
  {
    file: 'webasto-standard-battery-pro-40.txt',
    attributeId: 'batteryMass',
    value: '297',
    unit: 'kg',
    label: 'Dry weight',
  },
  {
    file: 'webasto-standard-battery-pro-40.txt',
    attributeId: 'expectedLifetimeCycles',
    value: '3000',
    unit: 'cycles',
    label: 'Lifetime (DoD, temperature and C-rate dependent)',
    note: 'printed as "Up to 3,000 cycles"',
  },
  {
    file: 'webasto-standard-battery-pro-40.txt',
    attributeId: 'batteryChemistry',
    value: 'prismatic NMC',
    path: 'shortName',
    label: 'Cell type',
  },
  // Bosch PowerTube 750 (retailer listing)
  {
    file: 'bosch-powertube-750-haendlerdaten.csv',
    attributeId: 'nominalVoltage',
    value: '36',
    unit: 'V',
    label: 'Spannung',
  },
  {
    file: 'bosch-powertube-750-haendlerdaten.csv',
    attributeId: 'ratedCapacity',
    value: '21',
    unit: 'Ah',
    label: 'Kapazität (Ah)',
  },
  {
    file: 'bosch-powertube-750-haendlerdaten.csv',
    attributeId: 'batteryMass',
    value: '4.3',
    unit: 'kg',
    label: 'Gewicht',
  },
  {
    file: 'bosch-powertube-750-haendlerdaten.csv',
    attributeId: 'manufacturerInformation',
    value: 'BOSCH',
    label: 'Hersteller',
  },
];
