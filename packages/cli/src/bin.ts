#!/usr/bin/env node
/**
 * `passwerk`: the only file that reads the process. Streams, environment, clock and the
 * Node file system are injected into `run`, whose exit code becomes the process exit code.
 */
import { nodeFileSystem } from '@passwerk/server/node';
import { run } from './index.js';

const code = await run(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  fs: nodeFileSystem(),
  rootedFs: (root) => nodeFileSystem(root),
  env: process.env,
  clock: new Date().toISOString(),
});
process.exitCode = code;
