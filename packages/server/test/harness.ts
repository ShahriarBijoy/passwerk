import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type ServerOptions } from '../src/server.ts';
import { type FileSystemAdapter, PathOutsideRootError, type ToolContext } from '../src/types.ts';

export const TEST_CLOCK = '2026-09-05T12:00:00Z';

export async function connect(options: ServerOptions = {}): Promise<{
  client: Client;
  ctx: ToolContext;
  close(): Promise<void>;
}> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const { server, ctx } = createServer({ clock: TEST_CLOCK, ...options });
  const client = new Client({ name: 'passwerk-test', version: '0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    ctx,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export async function call<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ structured: T; text: string; isError: boolean }> {
  const r = await client.callTool({ name, arguments: args });
  const content = r.content as { type: string; text?: string }[];
  const text = content.find((c) => c.type === 'text')?.text ?? '';
  return { structured: r.structuredContent as T, text, isError: r.isError === true };
}

const normalise = (p: string): string => {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join('/')}`;
};

/** POSIX-style in-memory file system rooted at `root` (default `/work`). */
export function memoryFileSystem(
  files: Record<string, Uint8Array>,
  root = '/work',
): FileSystemAdapter & { written: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>(
    Object.entries(files).map(([k, v]) => [normalise(k), v]),
  );
  const written = new Map<string, Uint8Array>();
  const resolve = (p: string): string => {
    const abs = p.startsWith('/') ? normalise(p) : normalise(`${root}/${p}`);
    if (abs !== root && !abs.startsWith(`${root}/`)) throw new PathOutsideRootError(p, root);
    return abs;
  };
  return {
    written,
    resolve,
    join: (...parts) => normalise(parts.join('/')),
    basename: (p) => p.split('/').filter(Boolean).at(-1) ?? p,
    async readFile(p) {
      const bytes = store.get(resolve(p));
      if (!bytes) throw new Error(`ENOENT: ${p}`);
      return bytes;
    },
    async writeFile(p, bytes) {
      const abs = resolve(p);
      store.set(abs, bytes);
      written.set(abs, bytes);
    },
    async stat(p) {
      const abs = resolve(p);
      if (store.has(abs)) return { kind: 'file' };
      for (const key of store.keys()) if (key.startsWith(`${abs}/`)) return { kind: 'directory' };
      return { kind: 'missing' };
    },
    async readDir(p) {
      const abs = resolve(p);
      const names = new Set<string>();
      for (const key of store.keys()) {
        if (key.startsWith(`${abs}/`)) names.add(key.slice(abs.length + 1).split('/')[0] ?? '');
      }
      return [...names].filter(Boolean).sort();
    },
  };
}
