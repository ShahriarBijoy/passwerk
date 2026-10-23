/**
 * Runs one series in one worker thread and turns its messages into task progress. The worker
 * is terminated outright on cancel: pipeline steps have no side effects, artefacts are hashed
 * and never written (ADR D-047).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { JobContext } from '../tasks.js';
import type { ModelOutcome, WorkerMessage, WorkerStart } from './types.js';

export interface WorkerEntry {
  url: URL;
  execArgv?: string[];
}

// Under Vitest this file is TypeScript whose `.js` import specifiers only tsx resolves. A worker
// ignores `--import tsx` in its execArgv (measured on Node 22.20), so a one-line bootstrap loads
// worker.ts through tsx's tsImport. The build runs dist/series/worker.js as plain JavaScript.
function typeScriptEntry(): WorkerEntry {
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
  const worker = new URL('./worker.ts', import.meta.url).href;
  const boot = `import { tsImport } from ${JSON.stringify(tsx)}; await tsImport(${JSON.stringify(worker)}, ${JSON.stringify(import.meta.url)});`;
  return { url: new URL(`data:text/javascript,${encodeURIComponent(boot)}`) };
}

const DEFAULT_ENTRY: WorkerEntry = import.meta.url.endsWith('.ts')
  ? typeScriptEntry()
  : { url: new URL('./worker.js', import.meta.url) };

const live = new Set<Worker>();

/** Worker threads that have not exited yet. */
export const liveWorkers = (): number => live.size;

export function statusLine(
  model: number,
  of: number,
  step: string,
  facts: number | undefined,
  mapped: number | undefined,
): string {
  const parts = [`Model ${model} of ${of}`];
  if (facts === undefined) parts.push(step);
  else parts.push(`${facts} facts`, ...(mapped === undefined ? [] : [`${mapped} mapped`]));
  return parts.join(' · ');
}

/** Resolves with one outcome per model, in order. */
export function runInWorker(
  start: WorkerStart,
  { signal, progress }: JobContext,
  entry: WorkerEntry = DEFAULT_ENTRY,
): Promise<ModelOutcome[]> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(entry.url, {
      workerData: start,
      ...(entry.execArgv === undefined ? {} : { execArgv: entry.execArgv }),
    });
    live.add(worker);
    const outcomes: ModelOutcome[] = [];
    let counts: { model: number; facts?: number; mapped?: number } = { model: 0 };
    let settled = false;

    const inFlight = () => start.models[outcomes.length]?.modelId ?? 'none';
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      void worker.terminate();
      if (error === undefined) resolve(outcomes);
      else reject(error);
    };
    const fail = (reason: string) => finish(new Error(`model ${inFlight()} failed: ${reason}`));
    const onAbort = () => finish(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });

    worker.on('message', (m: WorkerMessage) => {
      switch (m.type) {
        case 'progress': {
          if (m.model !== counts.model) counts = { model: m.model };
          const { step, facts, mapped } = m.progress;
          if (facts !== undefined) counts.facts = facts;
          if (mapped !== undefined) counts.mapped = mapped;
          progress(statusLine(m.model, m.of, step, counts.facts, counts.mapped));
          return;
        }
        case 'model':
          outcomes.push(m.outcome);
          return;
        case 'done':
          return finish();
        case 'failed':
          return fail(m.message);
      }
    });
    worker.on('error', (e) => fail(e.message));
    worker.on('exit', (code) => {
      live.delete(worker);
      fail(`worker exited with code ${code}`);
    });
  });
}
