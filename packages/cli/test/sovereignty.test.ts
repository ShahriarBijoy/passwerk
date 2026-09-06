/**
 * Sovereignty proof for the CLI (ADR D-013): with every network API guarded, every command
 * runs end to end and no attempt may be recorded. `chat` runs with the scripted client, which
 * is the only way it runs in CI; the real client is the documented exception (ADR D-002).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { run } from '@passwerk/cli';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNetworkGuard } from '../../core/test/helpers/networkGuard.ts';
import { captureIo, musterwerkFiles, sampleFiles } from './harness.ts';

const guard = createNetworkGuard();
beforeAll(() => guard.install());
afterAll(() => guard.restore());

const endTurn = (): Anthropic.Message => ({
  id: 'msg',
  type: 'message',
  role: 'assistant',
  model: 'fake',
  content: [{ type: 'text', text: 'ok', citations: null }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  stop_details: null,
  container: null,
  usage: { input_tokens: 1, output_tokens: 1 } as Anthropic.Usage,
});

describe('sovereignty: the CLI makes no network attempt', { timeout: 60000 }, () => {
  it('the guards record and block a real attempt (self-check)', () => {
    expect(() => fetch('https://example.invalid')).toThrow(/sovereignty/);
    expect(guard.attempts.splice(0)).toEqual([{ api: 'fetch', target: 'https://example.invalid' }]);
  });

  it('every command', async () => {
    const files = { ...sampleFiles(), ...musterwerkFiles() };
    const runs: string[][] = [
      ['tools'],
      ['obligations', '--type', 'EV', '--role', 'manufacturer', '--placed-on-market', '2027-06-01'],
      ['audit', 'samples/ev-valid.json'],
      ['gaps', 'samples/lmt-valid.json'],
      ['emit', 'samples/industrial-valid.json', '--out', 'out'],
      ['extract', 'docs', '--category', 'EV'],
    ];
    for (const argv of runs) {
      const io = captureIo(files);
      const code = await run(argv, io);
      expect(code, `${argv.join(' ')}: ${io.err()}`).toBeLessThan(3);
    }
    const chat = captureIo(files, {
      env: { ANTHROPIC_API_KEY: 'sk-test' },
      anthropic: () => async () => endTurn(),
    });
    expect(await run(['chat', '-m', 'hi'], chat)).toBe(0);
    expect(guard.attempts).toEqual([]);
  });
});
