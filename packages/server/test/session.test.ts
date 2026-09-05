import { describe, expect, it } from 'vitest';
import { contentId, SessionStore } from '../src/session.ts';

describe('SessionStore', () => {
  it('ids are content-addressed, prefixed and independent of key order', async () => {
    const s = new SessionStore();
    const a = await s.put('draft', { x: 1, y: [1, 2] });
    const b = await s.put('draft', { y: [1, 2], x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^drf_[0-9a-f]{16}$/);
    expect(a).toBe(await contentId('draft', { x: 1, y: [1, 2] }));
    expect(s.stats().entries).toBe(1);
    expect(await s.put('bundle', { documents: [] })).toMatch(/^bnd_/);
    expect(await s.put('facts', { facts: [] })).toMatch(/^fct_/);
  });

  it('get returns a copy, and the kind is part of the key', async () => {
    const s = new SessionStore();
    const id = await s.put('facts', { facts: [] });
    const got = s.get<{ facts: unknown[] }>('facts', id);
    got?.facts.push(1);
    expect(s.get('facts', id)).toEqual({ facts: [] });
    expect(s.get('facts', 'fct_0000000000000000')).toBeUndefined();
    expect(s.get('draft', id)).toBeUndefined();
    expect(s.has('facts', id)).toBe(true);
  });

  it('evicts least recently used by entry count', async () => {
    const s = new SessionStore({ maxEntries: 2 });
    const a = await s.put('draft', { a: 1 });
    const b = await s.put('draft', { b: 2 });
    s.get('draft', a);
    const c = await s.put('draft', { c: 3 });
    expect(s.has('draft', a)).toBe(true);
    expect(s.has('draft', b)).toBe(false);
    expect(s.has('draft', c)).toBe(true);
    expect(s.stats().entries).toBe(2);
  });

  it('evicts by bytes and refuses a value larger than the cap', async () => {
    const s = new SessionStore({ maxBytes: 40 });
    await s.put('draft', { k: 'x'.repeat(20) });
    await s.put('draft', { k: 'y'.repeat(20) });
    expect(s.stats().entries).toBe(1);
    expect(s.stats().bytes).toBeLessThanOrEqual(40);
    await expect(s.put('draft', { k: 'z'.repeat(100) })).rejects.toThrow(/byte cap/);
  });
});
