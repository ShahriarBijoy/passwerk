import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PROMPT_NAMES } from '../src/prompts/index.ts';
import { TOOLS } from '../src/registry.ts';
import { connect } from './harness.ts';

let session: Awaited<ReturnType<typeof connect>>;
beforeAll(async () => {
  session = await connect();
});
afterAll(() => session.close());

const text = async (name: string, args: Record<string, string>) => {
  const r = await session.client.getPrompt({ name, arguments: args });
  const first = r.messages[0];
  expect(first?.role).toBe('user');
  return (first?.content as { text: string }).text;
};

describe('prompts', () => {
  it('lists the three prompts', async () => {
    const { prompts } = await session.client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([...PROMPT_NAMES].sort());
  });

  it('the interview names the tools in workflow order and carries the honesty rules', async () => {
    const de = await text('build-passport-interview', { lang: 'de', category: 'EV' });
    expect(de).toContain('(EV)');
    expect(de).toContain('Rechtsberatung');
    const order = [
      'check_obligations',
      'ingest_documents',
      'extract_facts',
      'suggest_mappings',
      'apply_mappings',
      'validate_passport',
      'gap_report',
      'emit_passport',
    ];
    const positions = order.map((t) => de.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const en = await text('build-passport-interview', {});
    expect(en).toContain('legal advice');
    expect(en).not.toContain('(EV)');
  });

  it('audit and data request name the tools they rely on', async () => {
    const audit = await text('audit-supplier-submission', { lang: 'en' });
    for (const t of ['validate_passport', 'gap_report', 'explain_attribute'])
      expect(audit).toContain(t);
    const request = await text('draft-data-request', { lang: 'de' });
    expect(request).toContain('gap_report');
    expect(request).toContain('byDataOwner');
  });

  it('every tool a prompt mentions exists in the registry', async () => {
    const names = new Set(TOOLS.map((t) => t.name));
    for (const name of PROMPT_NAMES) {
      const t = await text(name, { lang: 'en' });
      for (const m of t.match(/\b[a-z]+_[a-z_]+\b/g) ?? []) {
        if (['not_required', 'valid_with_warnings', 'insufficient_input'].includes(m)) continue;
        expect(names, `${name}: ${m}`).toContain(m);
      }
    }
  });
});
