/**
 * Runs every model of one series off the main thread, so the server keeps answering
 * `tasks/get` while PDFs parse. Started by `runner.ts` with `workerData: WorkerStart`.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readerFromEnv } from '../reading/index.js';
import { runModel } from './pipeline.js';
import type { WorkerMessage, WorkerStart } from './types.js';

if (parentPort === null) throw new Error('worker.ts must run as a worker thread');
const port = parentPort;
const post = (m: WorkerMessage) => port.postMessage(m);

const { models, category, asOf, read } = workerData as WorkerStart;
try {
  // The key never leaves this thread; reader errors arrive with it scrubbed.
  const reader = read ? readerFromEnv(process.env) : undefined;
  for (const [i, model] of models.entries()) {
    const outcome = await runModel(
      model,
      {
        category,
        asOf,
        read,
        onStep: (progress) =>
          post({
            type: 'progress',
            model: i + 1,
            of: models.length,
            modelId: model.modelId,
            progress,
          }),
      },
      reader,
    );
    post({ type: 'model', outcome });
  }
  post({ type: 'done' });
} catch (e) {
  post({ type: 'failed', message: e instanceof Error ? e.message : String(e) });
}
