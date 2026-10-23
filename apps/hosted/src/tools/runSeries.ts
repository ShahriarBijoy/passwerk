import { BatteryCategory } from '@passwerk/core';
import { z } from 'zod';
import { DEMO_SERIES, loadSeries } from '../series/load.js';
import { runInWorker } from '../series/runner.js';
import type { ModelOutcome } from '../series/types.js';
import type { TaskTool } from '../server.js';
import type { ToolResult } from '../tasks.js';

const Input = z.object({
  series: z.enum(DEMO_SERIES),
  category: BatteryCategory,
});

const VERDICTS = ['valid', 'valid_with_warnings', 'invalid'] as const;

export function seriesSummary(models: ModelOutcome[]): string {
  const count = (v: string) => models.filter((m) => m.verdict === v).length;
  const head = `${models.length} models: ${VERDICTS.map((v) => `${count(v)} ${v}`).join(', ')}`;
  const lines = models.map(
    (m) =>
      `${m.modelId}: ${m.verdict}, ${m.facts} facts, ${m.mapped} mapped, ${m.conflicts} conflicts, mandatory ${m.gap.mandatoryCompleteness} %`,
  );
  return [head, ...lines].join('\n');
}

export const runSeries: TaskTool<typeof Input> = {
  name: 'run_series',
  description:
    'Run a whole demo battery series as one MCP task: every model goes through ingest, extract, ' +
    'suggest, apply, validate and emit. The result holds per model the verdict from the ' +
    'validators, fact, mapping and conflict counts, mandatory completeness, missing mandatory ' +
    'attributes and the SHA-256 of each emitted artefact (AAS JSON, AASX, HTML sheet, gap report).',
  inputSchema: Input,
  job:
    ({ series, category }, { seriesDir, clock }) =>
    async (ctx): Promise<ToolResult> => {
      const asOf = clock().toISOString();
      const models = await loadSeries(seriesDir, series);
      const outcomes = await runInWorker({ models, category, asOf }, ctx);
      return {
        content: [{ type: 'text', text: seriesSummary(outcomes) }],
        structuredContent: { series, category, asOf, models: outcomes },
      };
    },
};
