/**
 * Download links held in memory: a finished run's zip waits under a capability URL until one
 * GET has sent it, or for 15 minutes. The mirror image of `uploads.ts`; nothing touches a disk.
 */
import { randomBytes } from 'node:crypto';

export type DownloadId = string & { readonly __brand: 'DownloadId' };

const MiB = 1024 * 1024;

export interface DownloadLimits {
  ttlMs: number;
  maxZipBytes: number;
  /** Bytes held across every download. */
  maxStoreBytes: number;
}

export const DOWNLOAD_LIMITS: DownloadLimits = {
  ttlMs: 15 * 60 * 1000,
  maxZipBytes: 64 * MiB,
  maxStoreBytes: 256 * MiB,
};

/** Safe inside a quoted `Content-Disposition` filename and as one URL path segment. */
const ZIP_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.zip$/;

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
const DOWNLOAD_ID = /^dl_[a-z2-7]{32}$/;

/** `dl_` plus 32 base32 characters (160 random bits). */
export function randomDownloadId(): DownloadId {
  let id = 'dl_';
  for (const b of randomBytes(32)) id += BASE32[b & 31];
  return id as DownloadId;
}

export type CreateRefusal = 'too_large' | 'store_full';

/** One GET's hold on a zip. The first `commit` or `abort` ends it; later calls are no-ops. */
export interface Transfer {
  bytes: Uint8Array;
  /** The response went out whole: the link is used up. */
  commit(): void;
  /** The response did not go out whole: the link stays until it expires. */
  abort(): void;
}

interface Entry {
  name: string;
  bytes: Uint8Array;
  expiresAt: number;
  sending: boolean;
}

export interface DownloadStoreOptions extends Partial<DownloadLimits> {
  now?: () => Date;
  newId?: () => DownloadId;
}

export class DownloadStore {
  readonly limits: DownloadLimits;
  private readonly entries = new Map<string, Entry>();
  private held = 0;
  private readonly now: () => number;
  private readonly newId: () => DownloadId;

  constructor({ now, newId, ...limits }: DownloadStoreOptions = {}) {
    this.limits = { ...DOWNLOAD_LIMITS, ...limits };
    this.now = now ? () => now().getTime() : () => Date.now();
    this.newId = newId ?? randomDownloadId;
  }

  /** Bytes held across every download, for tests and the store cap. */
  get heldBytes(): number {
    this.purgeExpired();
    return this.held;
  }

  create(name: string, bytes: Uint8Array): { id: DownloadId; expiresAt: string } | CreateRefusal {
    if (!ZIP_NAME.test(name)) throw new Error(`not a safe zip name: ${JSON.stringify(name)}`);
    this.purgeExpired();
    if (bytes.byteLength > this.limits.maxZipBytes) return 'too_large';
    if (this.held + bytes.byteLength > this.limits.maxStoreBytes) return 'store_full';
    const id = this.newId();
    const expiresAt = this.now() + this.limits.ttlMs;
    this.entries.set(id, { name, bytes, expiresAt, sending: false });
    this.held += bytes.byteLength;
    return { id, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Lends the zip to one transfer. Unknown, expired, used, busy and misnamed all answer
   * `undefined`, so the HTTP edge cannot tell them apart either.
   */
  open(id: string, name: string): Transfer | undefined {
    if (!DOWNLOAD_ID.test(id)) return undefined;
    this.purgeExpired();
    const entry = this.entries.get(id);
    if (entry === undefined || entry.name !== name || entry.sending) return undefined;
    entry.sending = true;
    let open = true;
    return {
      bytes: entry.bytes,
      commit: () => {
        if (!open) return;
        open = false;
        if (this.entries.get(id) === entry) this.drop(id, entry);
      },
      abort: () => {
        if (!open) return;
        open = false;
        entry.sending = false;
      },
    };
  }

  private drop(id: string, entry: Entry): void {
    this.held -= entry.bytes.byteLength;
    this.entries.delete(id);
  }

  private purgeExpired(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expiresAt <= now) this.drop(id, entry);
  }
}
