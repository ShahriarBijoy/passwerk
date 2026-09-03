import type { PassportDraftInput } from '../model/passport.js';
import evMissing from './ev-missing-material-identifier.json' with { type: 'json' };
import evValid from './ev-valid.json' with { type: 'json' };
import industrialBadDecimal from './industrial-bad-decimal.json' with { type: 'json' };
import industrialValid from './industrial-valid.json' with { type: 'json' };
import lmtValid from './lmt-valid.json' with { type: 'json' };
import lmtWrongDate from './lmt-wrong-date-format.json' with { type: 'json' };

export const VALID_SAMPLE_NAMES = ['ev-valid', 'lmt-valid', 'industrial-valid'] as const;
export const BROKEN_SAMPLE_NAMES = [
  'ev-missing-material-identifier',
  'lmt-wrong-date-format',
  'industrial-bad-decimal',
] as const;
export type SampleName = (typeof VALID_SAMPLE_NAMES)[number];
export type BrokenSampleName = (typeof BROKEN_SAMPLE_NAMES)[number];

/** Golden drafts. All values are fictional; see the `$comment` in each file. */
export const samples: Record<SampleName, PassportDraftInput> = {
  'ev-valid': evValid as unknown as PassportDraftInput,
  'lmt-valid': lmtValid as unknown as PassportDraftInput,
  'industrial-valid': industrialValid as unknown as PassportDraftInput,
};

export interface BrokenSample {
  draft: PassportDraftInput;
  /** Rule ids that validate() must report, as a set. */
  expectedFindings: string[];
}

export const brokenSamples: Record<BrokenSampleName, BrokenSample> = {
  'ev-missing-material-identifier': {
    draft: evMissing as unknown as PassportDraftInput,
    // L1 rejects the composite; the fail-honest emit then lacks the template element.
    expectedFindings: ['PW-L1-VALUE', 'PW-L3-MISSING'],
  },
  'lmt-wrong-date-format': {
    draft: lmtWrongDate as unknown as PassportDraftInput,
    expectedFindings: ['PW-L1-VALUE'],
  },
  'industrial-bad-decimal': {
    draft: industrialBadDecimal as unknown as PassportDraftInput,
    expectedFindings: ['PW-L1-VALUE'],
  },
};

export function getSample(name: SampleName | BrokenSampleName): PassportDraftInput {
  return name in samples
    ? samples[name as SampleName]
    : brokenSamples[name as BrokenSampleName].draft;
}
