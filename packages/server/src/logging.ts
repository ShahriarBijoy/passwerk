/**
 * JSON-lines logger on stderr. stdout belongs to the stdio transport, so nothing else may
 * write there. Entry-point only: never imported by index.ts.
 */
import type { Logger, LogLevel } from './types.js';

export function stderrLogger(minimum: 'info' | 'debug' = 'info'): Logger {
  const rank: Record<LogLevel, number> = { debug: 0, info: 1, error: 2 };
  const floor = rank[minimum];
  return (level, message, data) => {
    if (rank[level] < floor) return;
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(data !== undefined ? { data } : {}),
    });
    process.stderr.write(`${line}\n`);
  };
}
