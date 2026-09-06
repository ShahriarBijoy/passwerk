import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVER_VERSION } from '../src/meta.ts';

const here = join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  mcpName: string;
  publishConfig: { access: string };
  repository: { url: string };
};
const manifest = JSON.parse(readFileSync(join(here, 'server.json'), 'utf8')) as {
  $schema: string;
  name: string;
  version: string;
  repository: { url: string; source: string };
  packages: {
    registryType: string;
    identifier: string;
    version: string;
    transport: { type: string };
  }[];
};

describe('MCP registry manifest (packages/server/server.json)', () => {
  it('agrees with package.json and the server version', () => {
    expect(manifest.$schema).toBe(
      'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    );
    expect(manifest.name).toBe('io.github.shahriarbijoy/passwerk');
    expect(pkg.mcpName).toBe(manifest.name);
    expect(manifest.version).toBe(pkg.version);
    expect(pkg.version).toBe(SERVER_VERSION);
    expect(manifest.packages).toHaveLength(1);
    expect(manifest.packages[0]).toMatchObject({
      registryType: 'npm',
      identifier: pkg.name,
      version: pkg.version,
      transport: { type: 'stdio' },
    });
    expect(manifest.repository.url).toBe('https://github.com/ShahriarBijoy/passwerk');
    expect(pkg.publishConfig.access).toBe('public');
  });
  it('the four published packages share one version', () => {
    for (const p of ['rules', 'core', 'cli']) {
      const other = JSON.parse(readFileSync(join(here, '..', p, 'package.json'), 'utf8')) as {
        version: string;
        publishConfig?: { access: string };
      };
      expect(other.version, p).toBe(pkg.version);
      expect(other.publishConfig?.access, p).toBe('public');
    }
  });
});
