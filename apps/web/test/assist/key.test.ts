import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSIST_KEY_STORAGE_KEY,
  clearAssistKey,
  loadAssistKey,
  saveAssistKey,
} from '@/app/assist/key.ts';
import { STORAGE_KEY } from '@/app/persistence.ts';

const { db, fail } = vi.hoisted(() => ({
  db: new Map<string, unknown>(),
  fail: { on: false },
}));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (k: string) => {
    if (fail.on) throw new Error('storage unavailable');
    return db.get(k);
  }),
  set: vi.fn(async (k: string, v: unknown) => {
    if (fail.on) throw new Error('storage unavailable');
    db.set(k, v);
  }),
  del: vi.fn(async (k: string) => {
    if (fail.on) throw new Error('storage unavailable');
    db.delete(k);
  }),
}));

describe('the assist key store', () => {
  beforeEach(() => {
    db.clear();
    fail.on = false;
  });

  it('has nothing before the reviewer asks to remember one', async () => {
    expect(await loadAssistKey()).toBeUndefined();
  });

  it('round-trips a key', async () => {
    await saveAssistKey('sk-secret');
    expect(await loadAssistKey()).toBe('sk-secret');
  });

  it('keeps the key out of the workflow state record', async () => {
    // Exported drafts and the autosaved workflow both come from STORAGE_KEY. A key stored
    // there would ride along into a file the supplier sends to their OEM.
    await saveAssistKey('sk-secret');
    expect(ASSIST_KEY_STORAGE_KEY).not.toBe(STORAGE_KEY);
    expect(db.get(STORAGE_KEY)).toBeUndefined();
    expect(db.get(ASSIST_KEY_STORAGE_KEY)).toBe('sk-secret');
  });

  it('forgets the key on request', async () => {
    await saveAssistKey('sk-secret');
    await clearAssistKey();
    expect(await loadAssistKey()).toBeUndefined();
    expect(db.has(ASSIST_KEY_STORAGE_KEY)).toBe(false);
  });

  it('treats unavailable storage as no stored key rather than crashing the app', async () => {
    fail.on = true;
    await expect(loadAssistKey()).resolves.toBeUndefined();
    await expect(saveAssistKey('sk-secret')).resolves.toBeUndefined();
    await expect(clearAssistKey()).resolves.toBeUndefined();
  });

  it('ignores a stored value that is not a string', async () => {
    db.set(ASSIST_KEY_STORAGE_KEY, { nested: 'nope' });
    expect(await loadAssistKey()).toBeUndefined();
  });
});
