import {
  type BatteryCategory,
  extractFacts,
  type FactSet,
  ingest,
  type MappingProposal,
  suggestMappings,
} from '@passwerk/core';
import type { FileSummary } from './state.ts';

export interface IngestInput {
  name: string;
  // Pinned to the ArrayBuffer-backed variant: apps/web mixes DOM lib (default `ArrayBuffer`)
  // with @types/node (default `ArrayBufferLike`), and core's `InputFile.bytes` resolves to
  // `Uint8Array<ArrayBuffer>` under this project's tsconfig. `new Uint8Array(...)` always
  // allocates a fresh `ArrayBuffer`, so every real caller already satisfies this.
  bytes: Uint8Array<ArrayBuffer>;
  size: number;
}

export interface IngestOutcome {
  summaries: FileSummary[];
  facts: FactSet;
  proposals: MappingProposal[];
}

export async function ingestFiles(
  inputs: IngestInput[],
  options: { category: BatteryCategory; workerSrc?: string },
): Promise<IngestOutcome> {
  const bundle = await ingest(
    inputs.map(({ name, bytes }) => ({ name, bytes })),
    options.workerSrc !== undefined ? { pdf: { workerSrc: options.workerSrc } } : {},
  );
  const sizes = new Map(inputs.map((i) => [i.name, i.size]));
  const summaries: FileSummary[] = bundle.documents.map((d) => ({
    name: d.name,
    size: sizes.get(d.name) ?? 0,
    sha256: d.sha256,
    format: d.format,
    pages: d.pages.length,
    lang: d.lang,
    ...(d.error ? { error: d.error } : {}),
  }));
  const facts = extractFacts(bundle);
  const proposals = suggestMappings(facts, { category: options.category });
  return { summaries, facts, proposals };
}
