import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROMPT_NAMES } from '../src/prompts/index.ts';
import { TOOLS } from '../src/registry.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
const SKILL = join(ROOT, 'skills', 'passwerk');

describe('skills/passwerk', () => {
  const md = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');

  it('has the frontmatter Agent Skills need', () => {
    const fm = md.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
    expect(fm).toMatch(/^name: passwerk$/m);
    expect(fm).toMatch(/^description: .+/m);
  });

  it('names every tool in the registry, validates before it emits, and points at the references', () => {
    for (const t of TOOLS) expect(md, t.name).toContain(`\`${t.name}\``);
    expect(md.indexOf('validate_passport')).toBeLessThan(md.indexOf('`emit_passport`'));
    expect(md).toMatch(/not legal advice/i);
    for (const ref of ['workflow.md', 'resources.md', 'cli.md']) {
      expect(existsSync(join(SKILL, 'references', ref)), ref).toBe(true);
    }
    const resources = readFileSync(join(SKILL, 'references', 'resources.md'), 'utf8');
    for (const name of PROMPT_NAMES) expect(resources).toContain(name);
  });

  it('.mcp.json registers the built server', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, '.mcp.json'), 'utf8')) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(cfg.mcpServers['passwerk']?.command).toBe('node');
    expect(cfg.mcpServers['passwerk']?.args).toEqual(['packages/server/dist/bin.js']);
  });

  it('every install page exists and mentions the server binary', () => {
    for (const page of [
      'claude-code',
      'codex',
      'opencode',
      'cursor',
      'claude-desktop',
      'http',
      'inspector',
    ]) {
      const text = readFileSync(join(ROOT, 'docs', 'install', `${page}.md`), 'utf8');
      expect(text, page).toContain('packages/server/dist/bin.js');
    }
  });
});
