/** Kept literal so `index.ts` needs no `node:fs`; a test asserts it equals package.json. */
export const SERVER_NAME = 'passwerk' as const;
export const SERVER_VERSION = '0.1.1' as const;
export const TRANSPORTS = ['stdio', 'streamable-http'] as const;
