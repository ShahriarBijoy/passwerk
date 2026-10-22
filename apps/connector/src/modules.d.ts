/** Text modules: wrangler bundles `*.html` as a string (see `rules` in wrangler.jsonc). */
declare module '*.html' {
  const text: string;
  export default text;
}

/** pdf.js ships no declaration for its worker entry; only the module object is used. */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
