import { describe, expect, it } from 'vitest';
import { type TaskId, TaskRegistry } from '../src/tasks.js';

function clock(startIso: string) {
  let now = Date.parse(startIso);
  return { now: () => new Date(now), advance: (ms: number) => (now += ms) };
}

const never = () => new Promise<never>(() => {});

describe('poll interval', () => {
  it('asks for polls every 2 s for the first 30 s, then every 5 s', () => {
    const c = clock('2026-10-24T10:00:00Z');
    const registry = new TaskRegistry({ now: c.now, newId: () => 'ser_test' as TaskId });
    const task = registry.start('run_series', never);
    expect(task.pollIntervalMs).toBe(2000);
    c.advance(29_999);
    expect(registry.get(task.taskId)?.pollIntervalMs).toBe(2000);
    c.advance(1);
    expect(registry.get(task.taskId)?.pollIntervalMs).toBe(5000);
  });

  it('keeps the status message on every poll while the task works', async () => {
    const c = clock('2026-10-24T10:00:00Z');
    const registry = new TaskRegistry({ now: c.now });
    let report: (m: string) => void = () => {};
    const task = registry.start('run_series', ({ progress }) => {
      report = progress;
      return never();
    });
    await Promise.resolve();
    report('Model 4 of 12 · 41 facts · 30 mapped');
    c.advance(40_000);
    expect(registry.get(task.taskId)).toMatchObject({
      statusMessage: 'Model 4 of 12 · 41 facts · 30 mapped',
      pollIntervalMs: 5000,
    });
    expect(registry.get(task.taskId)?.statusMessage).toBe('Model 4 of 12 · 41 facts · 30 mapped');
  });
});
