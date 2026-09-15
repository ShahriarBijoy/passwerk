import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const at = (...p: string[]) => join(root, ...p);
const json = (...p: string[]) => JSON.parse(readFileSync(at(...p), 'utf8'));
const PLUGIN = 'plugins/passwerk';

function tree(dir: string, prefix = ''): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      return statSync(full).isDirectory() ? tree(full, rel) : [rel];
    })
    .sort();
}

const serverVersion = json('packages/server/package.json').version;

describe('the committed plugin', () => {
  it('is exactly what `pnpm sync:plugin` generates', () => {
    // Exits non-zero and names the drifted file when a source changed without a re-sync.
    execFileSync(process.execPath, [at('packaging/agent-plugin/scripts/sync.mjs'), '--check'], {
      stdio: 'pipe',
    });
  });

  it('carries a byte-identical copy of skills/passwerk', () => {
    const source = at('skills', 'passwerk');
    const copied = at(PLUGIN, 'skills', 'passwerk');
    expect(tree(copied)).toEqual(tree(source));
    for (const rel of tree(source)) {
      expect(readFileSync(join(copied, rel))).toEqual(readFileSync(join(source, rel)));
    }
  });

  it('runs the published server through npx', () => {
    expect(json(PLUGIN, '.mcp.json')).toEqual(json('packaging/codex-plugin/.mcp.json'));
  });
});

describe('the Claude Code manifest', () => {
  const manifest = json(PLUGIN, '.claude-plugin/plugin.json');

  it('is named passwerk at the server version', () => {
    expect(manifest.name).toBe('passwerk');
    expect(manifest.version).toBe(serverVersion);
  });

  it('relies on the default skills/ and .mcp.json discovery, so nothing loads twice', () => {
    expect(manifest).not.toHaveProperty('skills');
    expect(manifest).not.toHaveProperty('mcpServers');
  });
});

describe('the Codex manifest', () => {
  it('is the packaging/codex-plugin manifest with the server version injected', () => {
    const { name, ...rest } = json('packaging/codex-plugin/.codex-plugin/plugin.json');
    expect(json(PLUGIN, '.codex-plugin/plugin.json')).toEqual({
      name,
      version: serverVersion,
      ...rest,
    });
  });
});

describe('the marketplaces at the repository root', () => {
  it('lets Claude Code install passwerk@passwerk from the plugin directory', () => {
    const market = json('.claude-plugin/marketplace.json');
    expect(market.name).toBe('passwerk');
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({ name: 'passwerk', source: `./${PLUGIN}` });
    expect(existsSync(at(PLUGIN, '.claude-plugin/plugin.json'))).toBe(true);
  });

  it('lets Codex install passwerk@passwerk from the same directory', () => {
    const market = json('.agents/plugins/marketplace.json');
    expect(market.name).toBe('passwerk');
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({
      name: 'passwerk',
      source: { source: 'local', path: `./${PLUGIN}` },
      policy: { installation: 'AVAILABLE' },
    });
    expect(existsSync(at(PLUGIN, '.codex-plugin/plugin.json'))).toBe(true);
  });
});

describe('the agent install guide', () => {
  const guide = readFileSync(at('docs/install/agent.md'), 'utf8');

  it.each([
    'claude plugin marketplace add ShahriarBijoy/passwerk',
    'claude plugin install passwerk@passwerk',
    'codex plugin marketplace add ShahriarBijoy/passwerk',
    'codex plugin add passwerk@passwerk',
    'claude mcp add passwerk --scope user -- npx -y @passwerk/server',
    'codex mcp add passwerk -- npx -y @passwerk/server',
  ])('names the command `%s` the manifests make work', (command) => {
    expect(guide).toContain(command);
  });
});
