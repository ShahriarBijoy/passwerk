import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROMPT_NAMES, TOOLS } from '@passwerk/server';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build helper, deliberately untyped
import { buildManifest } from '../scripts/manifest.mjs';

const base = JSON.parse(
  readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'),
);
const serverPkg = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../packages/server/package.json', import.meta.url)),
    'utf8',
  ),
);

const built = buildManifest(base, {
  version: serverPkg.version,
  tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
  promptNames: PROMPT_NAMES,
});

describe('the committed manifest template', () => {
  it('declares manifest_version 0.4 and a node server', () => {
    expect(base.manifest_version).toBe('0.4');
    expect(base.server.type).toBe('node');
    expect(base.server.entry_point).toBe('server/index.js');
  });

  it('omits the derived fields so they cannot drift', () => {
    expect(base).not.toHaveProperty('version');
    expect(base).not.toHaveProperty('tools');
    expect(base).not.toHaveProperty('prompts');
  });

  it('runs the launcher from the extension directory', () => {
    expect(base.server.mcp_config.command).toBe('node');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal manifest template value
    expect(base.server.mcp_config.args).toEqual(['${__dirname}/server/index.js']);
  });

  it('roots the server at a required document directory', () => {
    expect(base.server.mcp_config.env).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal manifest template value
      PASSWERK_ROOT: '${user_config.documents_directory}',
    });
    expect(base.user_config.documents_directory).toMatchObject({
      type: 'directory',
      required: true,
      // biome-ignore lint/suspicious/noTemplateCurlyInString: literal manifest template value
      default: '${DOCUMENTS}',
      multiple: false,
    });
  });

  it('claims the three desktop platforms and the node floor', () => {
    expect(base.compatibility.platforms).toEqual(['darwin', 'win32', 'linux']);
    expect(base.compatibility.runtimes.node).toBe('>=22.13');
  });

  it('omits privacy_policies, because passwerk contacts no external service', () => {
    expect(base).not.toHaveProperty('privacy_policies');
  });
});

describe('buildManifest', () => {
  it('injects the server version', () => {
    expect(built.version).toBe(serverPkg.version);
  });

  it('declares every registry tool, in registry order, with its description', () => {
    expect(built.tools).toEqual(TOOLS.map((t) => ({ name: t.name, description: t.description })));
    expect(built.tools).toHaveLength(12);
    expect(built.tools_generated).toBe(false);
  });

  it('declares every prompt', () => {
    expect(built.prompts.map((p: { name: string }) => p.name)).toEqual([...PROMPT_NAMES]);
    expect(built.prompts_generated).toBe(false);
  });

  it('does not mutate the template', () => {
    const pristine = JSON.parse(
      readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'),
    );
    expect(base).toEqual(pristine);
  });

  it('has a real description for every prompt', () => {
    for (const p of built.prompts as { name: string; description: string }[]) {
      expect(p.description).not.toBe(p.name);
    }
  });
});
