// Re-exported for `views/shell/index.ts` and any other `views` import; the definition itself
// lives in `lib/instrument-context.ts` so `components/ui` can read it without importing `views`
// (fix wave item 18).
export { InstrumentContext } from '../../lib/instrument-context.ts';
