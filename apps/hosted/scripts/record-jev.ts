/**
 * Records the Jev answers the reading step needs for one demo series into
 * test/fixtures/jev/<series>.json, so the tests replay them with no key and no network.
 *
 *   pnpm --filter @passwerk/hosted exec tsx scripts/record-jev.ts musterwerk-complete
 *   pnpm --filter @passwerk/hosted exec tsx scripts/record-jev.ts musterwerk --dry
 *
 * `--dry` answers every question with "none" (Choice) or 0 (Noul) and prints the request
 * sizes; it needs no key. The key comes from TYPESAFE_API_KEY, or on Windows from the user
 * environment, and is never printed or written.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Ask,
  cassetteJson,
  createReader,
  JEV_MODEL,
  jevAsk,
  recordingAsk,
} from '../src/reading/index.js';
import { loadSeries } from '../src/series/load.js';
import { runModel } from '../src/series/pipeline.js';

const HERE = import.meta.dirname;
const ROOT = join(HERE, '..', '..', '..');
const OUT = join(HERE, '..', 'test', 'fixtures', 'jev');
/** Must match the tests' asOf: open targets, and so the questions, depend on it. */
const AS_OF = '2026-10-24T09:00:00Z';
const USD_PER_MILLION_INPUT_TOKENS = 0.042;

const [series, ...flags] = process.argv.slice(2);
if (!series) throw new Error('usage: record-jev.ts <series> [--dry]');
const dry = flags.includes('--dry');

function readKey(): string {
  const fromEnv = process.env['TYPESAFE_API_KEY']?.trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== 'win32') throw new Error('TYPESAFE_API_KEY is not set');
  const out = execFileSync(
    'powershell',
    ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('TYPESAFE_API_KEY','User')"],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  );
  const key = out.toString().trim();
  if (!key) throw new Error('TYPESAFE_API_KEY is not set in the environment or the user profile');
  return key;
}

const standIn: Ask = async (_stage, request) => ({
  model: request.model,
  inputTokens: 0,
  answers: Object.fromEntries(
    Object.entries(request.questions).map(([id, q]) => {
      if (q.type !== 'choice') return [id, { type: 'noul', noul: 0 }];
      const choice = 'none' in q.criteria ? 'none' : (Object.keys(q.criteria)[0] ?? 'none');
      return [id, { type: 'choice', choice, confidence: 1, probabilities: { [choice]: 1 } }];
    }),
  ),
});

let key = '';
try {
  if (!dry) key = readKey();
  const recording = recordingAsk(
    dry ? standIn : jevAsk({ apiKey: key, model: JEV_MODEL }),
    JEV_MODEL,
  );
  const [model, ...rest] = await loadSeries(join(ROOT, 'demo', 'series'), series);
  if (!model || rest.length > 0) throw new Error(`${series} is not a single-model series`);
  const started = performance.now();
  const outcome = await runModel(
    model,
    { category: 'EV', asOf: AS_OF, read: true },
    createReader(recording.ask),
  );
  const wallMs = Math.round(performance.now() - started);
  const reading = outcome.reading;
  if (!reading) throw new Error('the reading step did not run');
  for (const r of recording.latencies) {
    console.log(`${r.stage}: ${r.questions} questions, ${r.inputTokens} input tokens, ${r.ms} ms`);
  }
  console.log(
    `${series}: ${outcome.verdict}, mandatory ${outcome.gap.mandatoryCompleteness} %, conflicts ${outcome.conflicts}, applied ${reading.applied}, vetoed ${reading.vetoed}`,
  );
  console.log(`missing required: ${outcome.gap.missingRequired.join(', ') || 'none'}`);
  for (const p of reading.toConfirm) {
    console.log(`to confirm: ${p.attributeId}${p.path ? `.${p.path}` : ''}: ${p.reason}`);
  }
  const usd = (reading.inputTokens * USD_PER_MILLION_INPUT_TOKENS) / 1e6;
  console.log(
    `${reading.requests} requests, ${reading.inputTokens} input tokens (about $${usd.toFixed(4)} at $${USD_PER_MILLION_INPUT_TOKENS}/M), wall ${wallMs} ms including ingest`,
  );
  if (!dry) {
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, `${series}.json`);
    writeFileSync(file, cassetteJson(recording.cassette));
    console.log(`wrote ${file}`);
  }
} catch (e) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(key ? message.split(key).join('[redacted]') : message);
  process.exit(1);
}
