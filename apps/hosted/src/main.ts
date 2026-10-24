#!/usr/bin/env node
import { startHosted } from './http.js';

const log = (line: string) => process.stderr.write(`${new Date().toISOString()} ${line}\n`);

const token = process.env['PASSWERK_AUTH_TOKEN'] ?? '';
const host = process.env['HOST'] ?? '127.0.0.1';
const port = Number(process.env['PORT'] ?? 8080);
const seriesDir = process.env['PASSWERK_SERIES_DIR'];

try {
  const hosted = await startHosted({ host, port, token, log, ...(seriesDir ? { seriesDir } : {}) });
  log(`passwerk-hosted listening on ${hosted.url}`);
  const stop = () => {
    log('shutting down');
    hosted.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} catch (e) {
  log(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
