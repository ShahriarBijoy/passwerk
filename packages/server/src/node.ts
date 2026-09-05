/**
 * `@passwerk/server/node`: the Node-only pieces, kept out of `index.ts` so `createServer`
 * stays runtime-neutral (spec section 7). The CLI's `bin.ts` imports the file system from here.
 */
export { nodeFileSystem } from './fs.js';
export { stderrLogger } from './logging.js';
