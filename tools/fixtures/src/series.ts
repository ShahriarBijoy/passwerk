/**
 * Writes demo/series/, the document sets the hosted server's run_series tool offers. The
 * generator is their only author; `--check` fails when the committed bytes have drifted.
 *
 *   pnpm series            regenerate demo/series
 *   pnpm series --check    exit 1 and name each drifted file
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ModelVariant,
  MUSTERWERK,
  MUSTERWERK_COMPLETE,
  musterwerkCompleteContent,
  type Omission,
  supplierPackContent,
} from './content.js';
import { documentsOf, musterwerkDocuments } from './generate.js';

export const SERIES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'demo',
  'series',
);

export interface SeriesModelVariant extends ModelVariant {
  /** Folder name under musterwerk-12, which the hosted server reports as the model id. */
  id: string;
}

const model = (
  id: string,
  serial: string,
  ratedCapacityAh: string,
  massKg: string,
  cycleLife: number,
  [coPost, coPre, liPost, liPre, niPost, niPre]: [string, string, string, string, string, string],
): SeriesModelVariant => ({
  id,
  serial,
  ratedCapacityAh,
  massKg,
  cycleLife,
  recycled: {
    cobalt: { post: coPost, pre: coPre },
    lithium: { post: liPost, pre: liPre },
    nickel: { post: niPost, pre: niPre },
  },
});

/**
 * Twelve models within 10 % of the Musterwerk base. Recycled shares are post- then
 * pre-consumer for cobalt, lithium, nickel. Rated energy is derived from capacity.
 */
// biome-ignore format: one row per model reads as a table
export const SERIES_MODELS: readonly SeriesModelVariant[] = [
  //     id          serial               Ah       kg      cycles   Co, Li, Ni post and pre
  model('model-01', 'MW-EV-2026-000201', '94.5',  '412.7', 3000,   ['12.5', '4.0', '6.0', '2.5', '8.0', '3.0']),
  model('model-02', 'MW-EV-2026-000202', '88.0',  '389.4', 2800,   ['11.8', '3.8', '5.6', '2.4', '7.6', '2.8']),
  model('model-03', 'MW-EV-2026-000203', '101.5', '440.2', 3200,   ['13.2', '4.2', '6.4', '2.6', '8.5', '3.2']),
  model('model-04', 'MW-EV-2026-000204', '90.0',  '398.1', 2900,   ['12.0', '3.9', '5.8', '2.3', '7.8', '2.9']),
  model('model-05', 'MW-EV-2026-000205', '97.0',  '421.5', 3100,   ['12.9', '4.1', '6.2', '2.6', '8.2', '3.1']),
  model('model-06', 'MW-EV-2026-000206', '92.5',  '405.3', 3000,   ['12.2', '4.0', '5.9', '2.5', '7.9', '3.0']),
  model('model-07', 'MW-EV-2026-000207', '103.0', '451.8', 3300,   ['13.6', '4.3', '6.5', '2.7', '8.7', '3.3']),
  model('model-08', 'MW-EV-2026-000208', '86.5',  '378.6', 2700,   ['11.4', '3.7', '5.5', '2.3', '7.3', '2.7']),
  model('model-09', 'MW-EV-2026-000209', '95.5',  '416.9', 3000,   ['12.6', '4.0', '6.1', '2.5', '8.1', '3.0']),
  model('model-10', 'MW-EV-2026-000210', '99.0',  '432.0', 3100,   ['13.0', '4.1', '6.3', '2.6', '8.4', '3.1']),
  model('model-11', 'MW-EV-2026-000211', '89.5',  '393.7', 2800,   ['11.9', '3.8', '5.7', '2.4', '7.7', '2.9']),
  model('model-12', 'MW-EV-2026-000212', '100.0', '436.4', 3200,   ['13.4', '4.2', '6.4', '2.7', '8.6', '3.2']),
];

export interface PackModelVariant extends SeriesModelVariant {
  /** Kinds of paperwork the supplier pack lacks: none for a complete pack, else one or two. */
  missing: readonly [] | readonly [Omission] | readonly [Omission, Omission];
}

const packModel = (
  id: string,
  serial: string,
  ratedCapacityAh: string,
  massKg: string,
  cycleLife: number,
  shares: [string, string, string, string, string, string],
  missing: PackModelVariant['missing'],
): PackModelVariant => ({
  ...model(id, serial, ratedCapacityAh, massKg, cycleLife, shares),
  missing,
});

/**
 * Sixty models in the ranges of the twelve, each a complete supplier pack except every fifth,
 * which lacks one or two kinds of paperwork. Columns as in SERIES_MODELS, then what is missing.
 */
// biome-ignore format: one row per model reads as a table
export const PACK_MODELS: readonly PackModelVariant[] = [
  //         id          serial               Ah       kg      cycles    Co, Li, Ni post and pre                    missing
  packModel('model-01', 'MW-EV-2026-000301', '98.5',  '431.6', 3000,   ['13.2', '4.2', '6.3', '2.6', '8.2', '3.1'], []),
  packModel('model-02', 'MW-EV-2026-000302', '100.5', '439.4', 3200,   ['13.3', '4.3', '6.5', '2.7', '8.4', '3.1'], []),
  packModel('model-03', 'MW-EV-2026-000303', '101.0', '440.9', 3200,   ['13.3', '4.3', '6.3', '2.7', '8.7', '3.2'], []),
  packModel('model-04', 'MW-EV-2026-000304', '93.0',  '408.0', 3000,   ['12.5', '4.0', '6.0', '2.4', '8.0', '2.9'], []),
  packModel('model-05', 'MW-EV-2026-000305', '98.0',  '428.4', 3000,   ['12.9', '4.1', '6.2', '2.6', '8.4', '3.1'], ['bms-readout']),
  packModel('model-06', 'MW-EV-2026-000306', '96.0',  '419.9', 3000,   ['12.7', '4.1', '6.1', '2.5', '8.0', '3.0'], []),
  packModel('model-07', 'MW-EV-2026-000307', '89.5',  '392.4', 2900,   ['11.7', '3.8', '5.6', '2.4', '7.7', '2.8'], []),
  packModel('model-08', 'MW-EV-2026-000308', '94.5',  '414.1', 3100,   ['12.4', '3.9', '6.0', '2.5', '7.9', '3.0'], []),
  packModel('model-09', 'MW-EV-2026-000309', '94.0',  '412.1', 3000,   ['12.4', '4.0', '5.9', '2.5', '7.9', '3.0'], []),
  packModel('model-10', 'MW-EV-2026-000310', '100.5', '438.1', 3300,   ['13.2', '4.2', '6.4', '2.7', '8.4', '3.2'], ['manufacturer-address']),
  packModel('model-11', 'MW-EV-2026-000311', '95.0',  '414.7', 3000,   ['12.7', '4.1', '6.1', '2.5', '7.9', '3.0'], []),
  packModel('model-12', 'MW-EV-2026-000312', '99.5',  '436.1', 3200,   ['13.1', '4.2', '6.3', '2.6', '8.4', '3.1'], []),
  packModel('model-13', 'MW-EV-2026-000313', '102.5', '448.8', 3300,   ['13.6', '4.3', '6.5', '2.7', '8.7', '3.3'], []),
  packModel('model-14', 'MW-EV-2026-000314', '97.5',  '425.2', 3100,   ['12.8', '4.1', '6.3', '2.6', '8.2', '3.1'], []),
  packModel('model-15', 'MW-EV-2026-000315', '95.0',  '415.6', 3000,   ['12.7', '4.1', '6.0', '2.5', '8.0', '3.0'], ['end-user-documents']),
  packModel('model-16', 'MW-EV-2026-000316', '99.5',  '436.1', 3200,   ['13.1', '4.2', '6.3', '2.6', '8.3', '3.1'], []),
  packModel('model-17', 'MW-EV-2026-000317', '100.5', '439.0', 3100,   ['13.3', '4.3', '6.3', '2.6', '8.6', '3.2'], []),
  packModel('model-18', 'MW-EV-2026-000318', '103.0', '449.8', 3300,   ['13.6', '4.3', '6.5', '2.7', '8.7', '3.3'], []),
  packModel('model-19', 'MW-EV-2026-000319', '99.5',  '436.8', 3100,   ['13.3', '4.2', '6.3', '2.7', '8.4', '3.2'], []),
  packModel('model-20', 'MW-EV-2026-000320', '90.0',  '395.0', 2800,   ['11.8', '3.8', '5.8', '2.4', '7.6', '2.9'], ['material-declaration']),
  packModel('model-21', 'MW-EV-2026-000321', '91.5',  '398.6', 3000,   ['12.3', '3.9', '5.7', '2.5', '7.8', '2.9'], []),
  packModel('model-22', 'MW-EV-2026-000322', '93.0',  '406.3', 3000,   ['12.5', '3.9', '6.0', '2.5', '7.8', '3.0'], []),
  packModel('model-23', 'MW-EV-2026-000323', '89.0',  '389.1', 2900,   ['11.9', '3.7', '5.7', '2.4', '7.4', '2.8'], []),
  packModel('model-24', 'MW-EV-2026-000324', '89.0',  '389.3', 2900,   ['11.7', '3.8', '5.6', '2.4', '7.5', '2.8'], []),
  packModel('model-25', 'MW-EV-2026-000325', '88.5',  '385.5', 2900,   ['11.7', '3.7', '5.5', '2.3', '7.5', '2.8'], ['spare-part-sheets']),
  packModel('model-26', 'MW-EV-2026-000326', '87.0',  '381.3', 2700,   ['11.4', '3.7', '5.5', '2.3', '7.3', '2.8'], []),
  packModel('model-27', 'MW-EV-2026-000327', '103.0', '449.8', 3200,   ['13.5', '4.4', '6.5', '2.7', '8.7', '3.3'], []),
  packModel('model-28', 'MW-EV-2026-000328', '94.5',  '411.7', 2900,   ['12.6', '4.0', '6.0', '2.5', '7.9', '3.0'], []),
  packModel('model-29', 'MW-EV-2026-000329', '92.0',  '402.0', 2900,   ['12.0', '3.9', '5.9', '2.4', '7.8', '2.9'], []),
  packModel('model-30', 'MW-EV-2026-000330', '93.5',  '407.9', 3000,   ['12.4', '4.0', '5.9', '2.5', '7.9', '3.0'], ['bms-readout', 'manufacturer-address']),
  packModel('model-31', 'MW-EV-2026-000331', '90.0',  '393.9', 2800,   ['12.1', '3.8', '5.7', '2.4', '7.5', '2.9'], []),
  packModel('model-32', 'MW-EV-2026-000332', '95.5',  '418.2', 3100,   ['12.7', '4.1', '6.0', '2.5', '8.2', '3.1'], []),
  packModel('model-33', 'MW-EV-2026-000333', '100.0', '436.4', 3200,   ['13.4', '4.2', '6.3', '2.7', '8.6', '3.1'], []),
  packModel('model-34', 'MW-EV-2026-000334', '95.5',  '417.8', 3000,   ['12.6', '4.0', '6.0', '2.5', '8.1', '3.0'], []),
  packModel('model-35', 'MW-EV-2026-000335', '101.5', '443.5', 3200,   ['13.3', '4.3', '6.4', '2.7', '8.5', '3.3'], ['end-user-documents', 'spare-part-sheets']),
  packModel('model-36', 'MW-EV-2026-000336', '88.0',  '383.5', 2800,   ['11.7', '3.7', '5.7', '2.4', '7.5', '2.8'], []),
  packModel('model-37', 'MW-EV-2026-000337', '91.0',  '397.2', 2900,   ['12.2', '3.8', '5.8', '2.4', '7.8', '2.9'], []),
  packModel('model-38', 'MW-EV-2026-000338', '90.5',  '395.0', 2900,   ['12.1', '3.9', '5.8', '2.4', '7.7', '2.9'], []),
  packModel('model-39', 'MW-EV-2026-000339', '94.0',  '410.2', 2900,   ['12.5', '4.0', '5.9', '2.5', '8.0', '3.0'], []),
  packModel('model-40', 'MW-EV-2026-000340', '88.0',  '383.3', 2900,   ['11.8', '3.8', '5.7', '2.3', '7.4', '2.8'], ['material-declaration', 'bms-readout']),
  packModel('model-41', 'MW-EV-2026-000341', '94.5',  '412.6', 3000,   ['12.5', '4.0', '6.0', '2.5', '8.1', '3.0'], []),
  packModel('model-42', 'MW-EV-2026-000342', '89.0',  '388.9', 2900,   ['11.7', '3.7', '5.7', '2.3', '7.6', '2.8'], []),
  packModel('model-43', 'MW-EV-2026-000343', '103.0', '448.9', 3300,   ['13.6', '4.3', '6.5', '2.7', '8.6', '3.2'], []),
  packModel('model-44', 'MW-EV-2026-000344', '87.5',  '383.7', 2800,   ['11.6', '3.7', '5.6', '2.3', '7.3', '2.8'], []),
  packModel('model-45', 'MW-EV-2026-000345', '92.0',  '402.6', 2900,   ['12.0', '3.9', '5.8', '2.4', '7.7', '2.9'], ['manufacturer-address', 'end-user-documents']),
  packModel('model-46', 'MW-EV-2026-000346', '98.0',  '428.6', 3000,   ['13.0', '4.1', '6.3', '2.6', '8.4', '3.1'], []),
  packModel('model-47', 'MW-EV-2026-000347', '94.5',  '413.9', 3000,   ['12.5', '4.0', '6.0', '2.5', '8.0', '3.0'], []),
  packModel('model-48', 'MW-EV-2026-000348', '102.5', '448.2', 3200,   ['13.6', '4.3', '6.5', '2.7', '8.6', '3.2'], []),
  packModel('model-49', 'MW-EV-2026-000349', '96.5',  '423.2', 3100,   ['12.7', '4.1', '6.1', '2.6', '8.3', '3.1'], []),
  packModel('model-50', 'MW-EV-2026-000350', '101.5', '442.3', 3300,   ['13.4', '4.3', '6.4', '2.7', '8.7', '3.2'], ['spare-part-sheets', 'material-declaration']),
  packModel('model-51', 'MW-EV-2026-000351', '96.5',  '420.9', 3100,   ['12.8', '4.1', '6.0', '2.5', '8.1', '3.1'], []),
  packModel('model-52', 'MW-EV-2026-000352', '90.5',  '394.7', 2900,   ['12.1', '3.9', '5.8', '2.4', '7.6', '2.9'], []),
  packModel('model-53', 'MW-EV-2026-000353', '88.5',  '387.5', 2900,   ['11.6', '3.8', '5.6', '2.4', '7.5', '2.8'], []),
  packModel('model-54', 'MW-EV-2026-000354', '101.0', '440.9', 3300,   ['13.4', '4.3', '6.5', '2.6', '8.6', '3.3'], []),
  packModel('model-55', 'MW-EV-2026-000355', '99.5',  '434.4', 3100,   ['13.0', '4.2', '6.3', '2.7', '8.4', '3.2'], ['bms-readout', 'end-user-documents']),
  packModel('model-56', 'MW-EV-2026-000356', '90.5',  '395.0', 2900,   ['12.0', '3.8', '5.7', '2.4', '7.6', '2.9'], []),
  packModel('model-57', 'MW-EV-2026-000357', '102.5', '449.0', 3200,   ['13.4', '4.4', '6.5', '2.7', '8.7', '3.2'], []),
  packModel('model-58', 'MW-EV-2026-000358', '91.5',  '400.1', 3000,   ['12.3', '3.9', '5.8', '2.4', '7.7', '2.9'], []),
  packModel('model-59', 'MW-EV-2026-000359', '103.0', '449.8', 3300,   ['13.4', '4.4', '6.5', '2.7', '8.7', '3.3'], []),
  packModel('model-60', 'MW-EV-2026-000360', '97.5',  '425.8', 3100,   ['13.1', '4.1', '6.2', '2.6', '8.2', '3.1'], ['manufacturer-address', 'material-declaration']),
];

/** Every file under demo/series, keyed by its POSIX path relative to that folder. */
export async function generateSeries(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const add = (prefix: string, docs: Record<string, Uint8Array>) => {
    for (const [name, bytes] of Object.entries(docs)) out.set(`${prefix}/${name}`, bytes);
  };
  add('musterwerk', await musterwerkDocuments(MUSTERWERK));
  for (const m of SERIES_MODELS) add(`musterwerk-12/${m.id}`, await musterwerkDocuments(m));
  add('musterwerk-complete', await documentsOf(musterwerkCompleteContent(MUSTERWERK_COMPLETE)));
  for (const m of PACK_MODELS) {
    add(`musterwerk-60/${m.id}`, await documentsOf(supplierPackContent(m, m.missing)));
  }
  return out;
}

export function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? listFiles(full)
      : [relative(SERIES_DIR, full).split(sep).join('/')];
  });
}

/** `missing:`, `differs:` and `unexpected:` lines for each committed file that drifted. */
export function seriesDrift(want: Map<string, Uint8Array>): string[] {
  let have: string[] = [];
  try {
    have = listFiles(SERIES_DIR);
  } catch {
    // A missing directory shows up below as every expected file missing.
  }
  const stale = [...want].flatMap(([rel, bytes]) => {
    try {
      return readFileSync(join(SERIES_DIR, rel)).equals(bytes) ? [] : [`differs: ${rel}`];
    } catch {
      return [`missing: ${rel}`];
    }
  });
  const extra = have.filter((rel) => !want.has(rel)).map((rel) => `unexpected: ${rel}`);
  return [...stale, ...extra];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const want = await generateSeries();
  if (process.argv.includes('--check')) {
    const problems = seriesDrift(want);
    if (problems.length > 0) {
      console.error('demo/series is out of date; run `pnpm series`:');
      for (const problem of problems) console.error(`  ${problem}`);
      process.exit(1);
    }
    console.log(`demo/series is up to date (${want.size} files)`);
  } else {
    rmSync(SERIES_DIR, { recursive: true, force: true });
    for (const [rel, bytes] of want) {
      mkdirSync(dirname(join(SERIES_DIR, rel)), { recursive: true });
      writeFileSync(join(SERIES_DIR, rel), bytes);
    }
    console.log(`wrote ${want.size} files to ${SERIES_DIR}`);
  }
}
