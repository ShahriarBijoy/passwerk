/**
 * Upload slots held in memory: a client PUTs supplier documents to a capability URL, then
 * `run_series` takes the slot once. Bytes never touch the disk; the container is read-only.
 */
import { randomBytes } from 'node:crypto';
import { byCodePoint } from '@passwerk/core';
import type { SeriesFile } from './series/types.js';

export type UploadId = string & { readonly __brand: 'UploadId' };

const MiB = 1024 * 1024;

export interface UploadLimits {
  ttlMs: number;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  /** Bytes held across every slot, uploads in flight included. */
  maxStoreBytes: number;
  maxSlots: number;
}

export const UPLOAD_LIMITS: UploadLimits = {
  ttlMs: 15 * 60 * 1000,
  maxFiles: 20,
  maxFileBytes: 10 * MiB,
  maxTotalBytes: 40 * MiB,
  maxStoreBytes: 200 * MiB,
  maxSlots: 50,
};

export const ALLOWED_EXTENSIONS = ['.pdf', '.xlsx', '.docx', '.csv', '.txt'] as const;

const FILE_NAME = /^[A-Za-z0-9_\- ][A-Za-z0-9._\- ]{0,99}$/;

/** Letters, digits, dot, dash, underscore and space, 1 to 100 characters, no leading dot. */
export function isFileName(name: string): boolean {
  if (!FILE_NAME.test(name)) return false;
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext) && lower.length > ext.length);
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const UPLOAD_ID = /^upl_[a-z2-7]{32}$/;

/** `upl_` plus 32 base32 characters (160 random bits). */
export function randomUploadId(): UploadId {
  let id = 'upl_';
  for (const b of randomBytes(32)) id += BASE32[b & 31];
  return id as UploadId;
}

/** Why a PUT was refused. The HTTP edge maps each one to a status. */
export type PutRefusal =
  | 'not_found'
  | 'bad_name'
  | 'slot_full'
  | 'busy'
  | 'too_large'
  | 'store_full';

/** Why a slot cannot be taken. `not_found` covers unknown, expired and already used alike. */
export type TakeRefusal = 'not_found' | 'busy' | 'empty';

export interface Stored {
  name: string;
  bytes: number;
  files: number;
  totalBytes: number;
}

/** One file being received. Every method after the first refusal, commit or abort is a no-op. */
export interface UploadWriter {
  write(chunk: Uint8Array): PutRefusal | undefined;
  commit(): Stored | 'not_found';
  abort(): void;
}

interface Slot {
  expiresAt: number;
  files: Map<string, Uint8Array>;
  /** Committed bytes plus bytes of uploads in flight. */
  bytes: number;
  writing: Set<string>;
}

export interface UploadStoreOptions extends Partial<UploadLimits> {
  now?: () => Date;
  newId?: () => UploadId;
}

export class UploadStore {
  readonly limits: UploadLimits;
  private readonly slots = new Map<string, Slot>();
  private held = 0;
  private readonly now: () => number;
  private readonly newId: () => UploadId;

  constructor({ now, newId, ...limits }: UploadStoreOptions = {}) {
    this.limits = { ...UPLOAD_LIMITS, ...limits };
    this.now = now ? () => now().getTime() : () => Date.now();
    this.newId = newId ?? randomUploadId;
  }

  /** Bytes held across every slot, for tests and the store cap. */
  get heldBytes(): number {
    return this.held;
  }

  create(): { id: UploadId; expiresAt: string } | 'store_full' {
    this.purgeExpired();
    if (this.slots.size >= this.limits.maxSlots) return 'store_full';
    const id = this.newId();
    const expiresAt = this.now() + this.limits.ttlMs;
    this.slots.set(id, { expiresAt, files: new Map(), bytes: 0, writing: new Set() });
    return { id, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** Starts receiving one file. `declaredBytes` (Content-Length) is checked before any byte. */
  open(id: string, name: string, declaredBytes?: number): UploadWriter | PutRefusal {
    const slot = this.live(id);
    if (slot === undefined) return 'not_found';
    if (!isFileName(name)) return 'bad_name';
    if (slot.writing.has(name)) return 'busy';
    const names = new Set([...slot.files.keys(), ...slot.writing]);
    if (!names.has(name) && names.size >= this.limits.maxFiles) return 'slot_full';
    const early = declaredBytes === undefined ? undefined : this.refusalFor(slot, 0, declaredBytes);
    if (early !== undefined) return early;

    slot.writing.add(name);
    const chunks: Uint8Array[] = [];
    let size = 0;
    let open = true;
    const close = () => {
      open = false;
      slot.writing.delete(name);
    };
    const release = (bytes: number) => {
      if (this.slots.get(id) !== slot) return;
      slot.bytes -= bytes;
      this.held -= bytes;
    };

    return {
      write: (chunk) => {
        if (!open) return undefined;
        const refusal =
          this.live(id) === slot ? this.refusalFor(slot, size, chunk.byteLength) : 'not_found';
        if (refusal !== undefined) {
          release(size);
          close();
          chunks.length = 0;
          return refusal;
        }
        chunks.push(chunk);
        size += chunk.byteLength;
        slot.bytes += chunk.byteLength;
        this.held += chunk.byteLength;
        return undefined;
      },
      commit: () => {
        if (!open || this.live(id) !== slot) {
          close();
          return 'not_found';
        }
        close();
        const previous = slot.files.get(name);
        if (previous !== undefined) release(previous.byteLength);
        slot.files.set(name, new Uint8Array(Buffer.concat(chunks, size)));
        chunks.length = 0;
        return { name, bytes: size, files: slot.files.size, totalBytes: slot.bytes };
      },
      abort: () => {
        if (!open) return;
        release(size);
        close();
        chunks.length = 0;
      },
    };
  }

  /** What `take` would answer, without consuming anything. */
  check(id: string): TakeRefusal | undefined {
    const slot = this.live(id);
    if (slot === undefined) return 'not_found';
    if (slot.writing.size > 0) return 'busy';
    if (slot.files.size === 0) return 'empty';
    return undefined;
  }

  /** Removes the slot and hands over its files, sorted by name. A slot is taken once. */
  take(id: string): SeriesFile[] | TakeRefusal {
    const refusal = this.check(id);
    if (refusal !== undefined) return refusal;
    const slot = this.slots.get(id) as Slot;
    this.drop(id, slot);
    return [...slot.files]
      .sort(([a], [b]) => byCodePoint(a, b))
      .map(([name, bytes]) => ({ name, bytes }));
  }

  private refusalFor(slot: Slot, size: number, more: number): PutRefusal | undefined {
    if (size + more > this.limits.maxFileBytes) return 'too_large';
    if (slot.bytes + more > this.limits.maxTotalBytes) return 'too_large';
    if (this.held + more > this.limits.maxStoreBytes) return 'store_full';
    return undefined;
  }

  private live(id: string): Slot | undefined {
    if (!UPLOAD_ID.test(id)) return undefined;
    this.purgeExpired();
    return this.slots.get(id);
  }

  private drop(id: string, slot: Slot): void {
    this.held -= slot.bytes;
    this.slots.delete(id);
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [id, slot] of this.slots) if (slot.expiresAt <= now) this.drop(id, slot);
  }
}
