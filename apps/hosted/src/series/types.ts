/**
 * The contract between the series task (main thread), its worker and the per-model pipeline.
 * Everything that crosses the worker boundary is structured-clone safe: no functions, no class
 * instances, bytes as Uint8Array.
 */
import type { BatteryCategory, Verdict } from '@passwerk/core';

export type { BatteryCategory, Verdict };

/** One supplier document as read from the series directory. */
export interface SeriesFile {
  name: string;
  bytes: Uint8Array;
}

/** One battery model of a series: a folder of supplier documents. */
export interface SeriesModel {
  modelId: string;
  files: SeriesFile[];
}

export type PipelineStep =
  | 'ingest'
  | 'extract'
  | 'suggest'
  | 'apply'
  | 'read'
  | 'validate'
  | 'emit';

export interface StepProgress {
  step: PipelineStep;
  /** Known from `extract` on. */
  facts?: number;
  /** Known from `apply` on: attributes the accepted proposals filled. */
  mapped?: number;
}

export interface ArtefactDigest {
  file: string;
  bytes: number;
  sha256: string;
}

/** What one model's run produced. Plain data; the verdict comes from the validators only. */
export interface ModelOutcome {
  modelId: string;
  verdict: Verdict;
  facts: number;
  proposals: number;
  accepted: number;
  mapped: number;
  conflicts: number;
  findings: { errors: number; warnings: number };
  /**
   * `mandatoryCompleteness` is gapReport's percent (0 to 100, one decimal). `missingRequired`
   * lists required attributes whose gap status is not `present` (missing, invalid or conflict).
   */
  gap: { mandatoryCompleteness: number; missingRequired: string[] };
  /** AAS JSON, AASX, HTML sheet, gap report. Hashed, not stored (ADR D-047). */
  artefacts: ArtefactDigest[];
  /** Present when the AI reading step ran (ADR D-048). */
  reading?: ReadingSummary;
}

/** One value the AI reading step chose but did not apply, for a person to confirm. */
export interface ReadingProposal {
  attributeId: string;
  path?: string;
  value: unknown;
  /** Needed to apply the value once confirmed: a decision without them would not validate. */
  unit?: string;
  recordedAt?: string;
  /** Document and location the value was copied from. */
  source: string;
  confidence: number;
  reason: string;
}

export interface ReadingSummary {
  /** Decisions applied automatically under the reading policy. */
  applied: number;
  /** Decisions held back for confirmation. */
  toConfirm: ReadingProposal[];
  /** Rule-based accepts the reader vetoed. */
  vetoed: number;
  inputTokens: number;
  requests: number;
}

export interface RunModelOptions {
  category: BatteryCategory;
  /** ISO date-time used as the draft's createdAt and as "now" for plausibility. */
  asOf: string;
  /** Called before each step starts and after extract/apply with counts. */
  onStep?: (p: StepProgress) => void;
  /** Run the AI reading step. Off unless the server has a reader configured (ADR D-048). */
  read?: boolean;
}

/** Messages the worker posts to the main thread. */
export type WorkerMessage =
  | { type: 'progress'; model: number; of: number; modelId: string; progress: StepProgress }
  | { type: 'model'; outcome: ModelOutcome }
  | { type: 'done' }
  | { type: 'failed'; message: string };

/** The one message the main thread sends to start the worker's run. */
export interface WorkerStart {
  models: SeriesModel[];
  category: BatteryCategory;
  asOf: string;
  /** Whether the worker runs the AI reading step; the worker reads its key from the env. */
  read: boolean;
}
