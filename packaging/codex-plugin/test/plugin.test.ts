import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const read = (p: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'));

const plugin = read('../.codex-plugin/plugin.json');
const mcp = read('../.mcp.json');
const marketplace = read('../marketplace.json');

const PLUGIN_NAME = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;
const MARKETPLACE_NAME = /^[A-Za-z0-9_-]+$/;

describe('the Codex plugin manifest', () => {
  it('is named passwerk and matches the plugin name rule', () => {
    expect(plugin.name).toBe('passwerk');
    expect(plugin.name).toMatch(PLUGIN_NAME);
  });

  it('omits version, which the build injects', () => {
    expect(plugin).not.toHaveProperty('version');
  });

  it('declares the skills directory and the MCP server file', () => {
    expect(plugin.skills).toBe('./skills/');
    expect(plugin.mcpServers).toBe('./.mcp.json');
  });

  it('omits hooks, which Codex validation rejects', () => {
    expect(plugin).not.toHaveProperty('hooks');
  });

  it('omits apps, because no .app.json is shipped', () => {
    expect(plugin).not.toHaveProperty('apps');
  });

  it('carries the interface block Codex renders', () => {
    expect(plugin.interface).toMatchObject({
      displayName: 'passwerk',
      developerName: 'Shahriar Bijoy',
      category: 'Productivity',
    });
    expect(typeof plugin.interface.shortDescription).toBe('string');
    expect(typeof plugin.interface.defaultPrompt).toBe('string');
  });
});

describe('the plugin MCP server', () => {
  it('runs the published server through npx', () => {
    expect(mcp.mcpServers.passwerk).toEqual({
      command: 'npx',
      args: ['-y', '@passwerk/server'],
    });
  });
});

describe('the marketplace template', () => {
  it('matches the marketplace name rule and names the plugin', () => {
    expect(marketplace.name).toMatch(MARKETPLACE_NAME);
    expect(marketplace.interface.displayName).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
  });

  it('carries the three fields every entry requires', () => {
    const entry = marketplace.plugins[0];
    expect(entry.name).toBe('passwerk');
    expect(entry.source).toEqual({ source: 'local', path: './plugins/passwerk' });
    expect(entry.policy.installation).toBe('AVAILABLE');
    expect(entry.policy.authentication).toBe('ON_INSTALL');
    expect(entry.category).toBe('Productivity');
  });
});

const root = fileURLToPath(new URL('../../..', import.meta.url));

function tree(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      return statSync(full).isDirectory() ? tree(full, rel) : [rel];
    })
    .sort();
}

describe('the assembled plugin', () => {
  // Runs once for this describe block, so every test below depends on a build this test run
  // actually performed rather than on whatever `out/` a preceding test (or a stale local build)
  // happened to leave behind. Under `-t` filtering, or if a sibling test throws before running
  // the build, a bare `read()` of `out/` would otherwise silently assert against stale output.
  beforeAll(() => {
    execFileSync(process.execPath, [join(root, 'packaging/codex-plugin/scripts/build.mjs')], {
      stdio: 'pipe',
    });
  });

  it('carries a byte-identical copy of skills/passwerk', () => {
    const source = join(root, 'skills', 'passwerk');
    const copied = join(root, 'out', 'codex-plugin', 'skills', 'passwerk');
    expect(tree(copied)).toEqual(tree(source));
    for (const rel of tree(source)) {
      expect(readFileSync(join(copied, rel))).toEqual(readFileSync(join(source, rel)));
    }
  });

  it('injects the server version into the assembled manifest', () => {
    const built = read('../../../out/codex-plugin/.codex-plugin/plugin.json');
    const serverPkg = read('../../../packages/server/package.json');
    expect(built.version).toBe(serverPkg.version);
    expect(Object.keys(built)[0]).toBe('name');
    expect(Object.keys(built)[1]).toBe('version');
  });
});
