import { describe, expect, it } from 'vitest';
import {
  type InputRequests,
  type Job,
  type Question,
  type TaskId,
  TaskRegistry,
  type ToolResult,
  TooManyTasksError,
} from '../src/tasks.js';

function clock(startIso: string) {
  let now = Date.parse(startIso);
  return { now: () => new Date(now), advance: (ms: number) => (now += ms) };
}

const never = () => new Promise<never>(() => {});

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const REQUESTS: InputRequests = {
  a: { method: 'elicitation/create', params: { mode: 'form', message: 'A?' } },
  b: { method: 'elicitation/create', params: { mode: 'form', message: 'B?' } },
};

/** Asks about `a` and `b`; the resume echoes the responses it was handed. */
function asking(resumeJob?: (responses: Record<string, unknown>) => Job) {
  const handed: Record<string, unknown>[] = [];
  const question: Question = {
    inputRequests: REQUESTS,
    resume: (responses) => {
      handed.push(responses);
      return resumeJob?.(responses) ?? (async () => text(JSON.stringify(responses)));
    },
  };
  const job: Job = async () => question;
  return { job, handed };
}

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

describe('input_required', () => {
  it('waits for every key, then resumes and completes', async () => {
    const registry = new TaskRegistry();
    const { job, handed } = asking();
    const { taskId } = registry.start('run_series', job);
    await settled();
    expect(registry.get(taskId)).toMatchObject({
      status: 'input_required',
      inputRequests: REQUESTS,
    });

    registry.update(taskId, { a: { action: 'accept', content: { answer: 'apply' } } });
    await settled();
    expect(registry.get(taskId)).toMatchObject({
      status: 'input_required',
      inputRequests: REQUESTS,
    });
    expect(handed).toEqual([]);

    registry.update(taskId, { b: { action: 'decline' } });
    await settled();
    expect(handed).toEqual([
      { a: { action: 'accept', content: { answer: 'apply' } }, b: { action: 'decline' } },
    ]);
    const done = registry.get(taskId);
    expect(done?.status).toBe('completed');
    expect(done).not.toHaveProperty('inputRequests');
  });

  it('reports working while the resumed job runs', async () => {
    const registry = new TaskRegistry();
    const { job } = asking(() => never);
    const { taskId } = registry.start('run_series', job);
    await settled();
    registry.update(taskId, { a: {}, b: {} });
    await settled();
    const task = registry.get(taskId);
    expect(task?.status).toBe('working');
    expect(task).not.toHaveProperty('inputRequests');
  });

  it('keeps the first answer to a key and ignores keys it never asked', async () => {
    const registry = new TaskRegistry();
    const { job, handed } = asking();
    const { taskId } = registry.start('run_series', job);
    await settled();
    registry.update(taskId, { a: 'first', zzz: 'stray' });
    const before = registry.get(taskId);
    registry.update(taskId, { a: 'second', zzz: 'again' });
    expect(registry.get(taskId)).toEqual(before);
    registry.update(taskId, { b: 'only' });
    await settled();
    expect(handed).toEqual([{ a: 'first', b: 'only' }]);
  });

  it('changes nothing when the task is not waiting for input', async () => {
    const registry = new TaskRegistry();
    const working = registry.start('slow_echo', never);
    const finished = registry.start('slow_echo', async () => text('done'));
    await settled();
    const before = [registry.get(working.taskId), registry.get(finished.taskId)];
    registry.update(working.taskId, { a: 'x' });
    registry.update(finished.taskId, { a: 'x' });
    expect([registry.get(working.taskId), registry.get(finished.taskId)]).toEqual(before);
    expect(registry.update('ser_unknown', { a: 'x' })).toBeUndefined();
  });

  it('cancels a task that waits for input, and later answers change nothing', async () => {
    const registry = new TaskRegistry();
    const { job, handed } = asking();
    const { taskId } = registry.start('run_series', job);
    await settled();
    expect(registry.cancel(taskId)?.status).toBe('cancelled');
    registry.update(taskId, { a: 'x', b: 'y' });
    await settled();
    expect(handed).toEqual([]);
    expect(registry.get(taskId)?.status).toBe('cancelled');
  });

  it('drops an unanswered task once its ttl has passed', async () => {
    const c = clock('2026-10-24T10:00:00Z');
    const registry = new TaskRegistry({ now: c.now, ttlMs: 60_000 });
    const { job } = asking();
    const { taskId } = registry.start('run_series', job);
    await settled();
    c.advance(59_999);
    expect(registry.get(taskId)?.status).toBe('input_required');
    c.advance(1);
    expect(registry.get(taskId)).toBeUndefined();
  });

  it('frees its running slot while it waits; the resumed job takes one again', async () => {
    const registry = new TaskRegistry({ maxRunning: 1 });
    const { job } = asking(() => never);
    const { taskId } = registry.start('run_series', job);
    await settled();
    const other = registry.start('slow_echo', async () => text('quick'));
    await settled();
    expect(registry.get(other.taskId)?.status).toBe('completed');

    registry.update(taskId, { a: 'x', b: 'y' });
    await settled();
    expect(registry.get(taskId)?.status).toBe('working');
    expect(() => registry.start('slow_echo', never)).toThrow(TooManyTasksError);
  });

  it('fails the task when the resumed job throws', async () => {
    const registry = new TaskRegistry();
    const { job } = asking(() => async () => {
      throw new Error('worker gone');
    });
    const { taskId } = registry.start('run_series', job);
    await settled();
    registry.update(taskId, { a: 'x', b: 'y' });
    await settled();
    expect(registry.get(taskId)).toMatchObject({
      status: 'failed',
      error: { code: -32603, message: 'worker gone' },
    });
  });
});
