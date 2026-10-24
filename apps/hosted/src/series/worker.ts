/**
 * Runs every model of one series off the main thread, so the server keeps answering
 * `tasks/get` while PDFs parse. Started by `runner.ts` with `workerData: WorkerStart`.
 */
import { parentPort, workerData } from 'node:worker_threads';
import {
  type Reader,
  type ReadingResult,
  readerFromEnv,
  recordedReader,
  replayReader,
} from '../reading/index.js';
import { runModel } from './pipeline.js';
import type { WorkerMessage, WorkerReading, WorkerStart } from './types.js';

if (parentPort === null) throw new Error('worker.ts must run as a worker thread');
const port = parentPort;
const post = (m: WorkerMessage, transfer: ArrayBuffer[] = []) => port.postMessage(m, transfer);

/** The configured reader, built once; a recorded reading per model is built per model. */
function readers(reading: WorkerReading): (model: number) => Reader | undefined {
  switch (reading.kind) {
    case 'off':
      return () => undefined;
    case 'jev': {
      // The key never leaves this thread; reader errors arrive with it scrubbed.
      const reader = readerFromEnv(process.env);
      return () => reader;
    }
    case 'replay': {
      const reader = replayReader(reading.cassette);
      return () => reader;
    }
    case 'recorded':
      return (model) => {
        const recorded = reading.readings[model];
        if (!recorded) throw new Error(`no recorded reading for model ${model + 1}`);
        return recordedReader(recorded);
      };
  }
}

const { models, category, asOf, reading } = workerData as WorkerStart;
try {
  const readerFor = readers(reading);
  for (const [i, model] of models.entries()) {
    const reader = readerFor(i);
    let kept: ReadingResult | undefined;
    const keeping: Reader | undefined = reader && {
      read: async (input) => (kept = await reader.read(input)),
    };
    const { outcome, files } = await runModel(
      model,
      {
        category,
        asOf,
        read: keeping !== undefined,
        onStep: (progress) =>
          post({
            type: 'progress',
            model: i + 1,
            of: models.length,
            modelId: model.modelId,
            progress,
          }),
      },
      keeping,
    );
    // Transferred rather than copied: this thread never reads the bytes again.
    const buffers = new Set(files.map((f) => f.bytes.buffer as ArrayBuffer));
    post({ type: 'model', outcome, files, ...(kept ? { reading: kept } : {}) }, [...buffers]);
  }
  post({ type: 'done' });
} catch (e) {
  post({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
}
