/**
 * pdf.js reads PDFs on the main thread when no worker is available, but it still loads its
 * worker code with a dynamic `import()` that Workers cannot resolve at runtime
 * ("No such module pdf.worker.mjs"). pdf.js first looks for `globalThis.pdfjsWorker`, so the
 * connector bundles the worker module and registers it there. Core stays unchanged: Node
 * resolves the dynamic import, and the browser passes a `workerSrc` (ADR D-046).
 */
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
