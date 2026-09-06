import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILL_TEXT } from '../src/chat/skill.ts';
import { ROOT } from './harness.ts';

describe('chat system prompt', () => {
  it('is the current skills/passwerk/SKILL.md body (run `pnpm --filter @passwerk/cli sync-skill`)', () => {
    const md = readFileSync(join(ROOT, 'skills', 'passwerk', 'SKILL.md'), 'utf8');
    const body = md.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    expect(SKILL_TEXT.trim()).toBe(body);
  });
});
