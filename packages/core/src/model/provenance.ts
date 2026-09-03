import { z } from 'zod';

/** Where a value came from: file plus optional page (PDF) or cell (spreadsheet). */
export const Provenance = z.object({
  file: z.string().min(1),
  page: z.number().int().positive().optional(),
  cell: z.string().min(1).optional(),
  note: z.string().optional(),
});
export type Provenance = z.infer<typeof Provenance>;
