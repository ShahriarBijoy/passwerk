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

/** Every file under demo/series, keyed by its POSIX path relative to that folder. */
export async function generateSeries(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  const add = (prefix: string, docs: Record<string, Uint8Array>) => {
    for (const [name, bytes] of Object.entries(docs)) out.set(`${prefix}/${name}`, bytes);
  };
  add('musterwerk', await musterwerkDocuments(MUSTERWERK));
  for (const m of SERIES_MODELS) add(`musterwerk-12/${m.id}`, await musterwerkDocuments(m));
  add('musterwerk-complete', await documentsOf(musterwerkCompleteContent(MUSTERWERK_COMPLETE)));
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
