import { canonicalJson, sha256Hex } from '@passwerk/core';

export type StoreKind = 'bundle' | 'facts' | 'draft';

export const ID_PREFIX: Record<StoreKind, string> = {
  bundle: 'bnd_',
  facts: 'fct_',
  draft: 'drf_',
};

export interface StoreStats {
  entries: number;
  bytes: number;
  maxEntries: number;
  maxBytes: number;
}

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;

const utf8Length = (s: string): number => new TextEncoder().encode(s).length;

/** `prefix` + first 16 hex characters of sha256(canonical JSON). Same content, same id. */
export async function contentId(kind: StoreKind, value: unknown): Promise<string> {
  const hash = await sha256Hex(new TextEncoder().encode(canonicalJson(value)));
  return `${ID_PREFIX[kind]}${hash.slice(0, 16)}`;
}

/**
 * In-memory, per connection, bounded by entry count and by canonical-JSON bytes with
 * least-recently-used eviction (spec section 3.3). Values are stored as canonical JSON so
 * `get` never hands out a shared mutable object.
 */
export class SessionStore {
  private readonly entries = new Map<string, { json: string; bytes: number }>();
  private bytes = 0;
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(options: { maxEntries?: number; maxBytes?: number } = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async put(kind: StoreKind, value: unknown): Promise<string> {
    const json = canonicalJson(value);
    const bytes = utf8Length(json);
    if (bytes > this.maxBytes) {
      throw new Error(`value exceeds session store byte cap (${bytes} > ${this.maxBytes})`);
    }
    const hash = await sha256Hex(new TextEncoder().encode(json));
    const id = `${ID_PREFIX[kind]}${hash.slice(0, 16)}`;
    const key = `${kind}:${id}`;
    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.entries.set(key, existing);
      return id;
    }
    this.entries.set(key, { json, bytes });
    this.bytes += bytes;
    this.evict();
    return id;
  }

  get<T = unknown>(kind: StoreKind, id: string): T | undefined {
    const key = `${kind}:${id}`;
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return JSON.parse(entry.json) as T;
  }

  has(kind: StoreKind, id: string): boolean {
    return this.entries.has(`${kind}:${id}`);
  }

  stats(): StoreStats {
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
    };
  }

  private evict(): void {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      const entry = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (entry) this.bytes -= entry.bytes;
    }
  }
}
