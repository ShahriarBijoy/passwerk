/**
 * QR code for the data carrier: matrix from qrcode-generator (pure JS), SVG and PNG rendered
 * in-house so the bytes are identical on every platform. PNG: 8-bit greyscale, filter 0,
 * zlib via fflate. Browser-safe, no wall clock.
 */
import { zlibSync } from 'fflate';
import qrcode from 'qrcode-generator';
import { CarrierInputError } from './error.js';

export interface QrMatrix {
  size: number;
  modules: boolean[][];
}

export interface QrRenderOptions {
  /** Pixels per module. */
  moduleSize?: number;
  /** Quiet zone in modules on every side (the standard asks for 4). */
  margin?: number;
}

export function qrMatrix(payload: string): QrMatrix {
  // Byte mode over UTF-8 bytes (the library's default is Latin-1). Swapped in for the call and
  // restored after, rather than mutated at module load, so this stays a local effect.
  const previousStringToBytes = qrcode.stringToBytes;
  qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));
  try {
    const qr = qrcode(0, 'M');
    qr.addData(payload, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const modules: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
      modules.push(row);
    }
    return { size, modules };
  } catch (error) {
    if (String(error).startsWith('code length overflow.')) {
      throw new CarrierInputError({
        de: 'Die Kennung ist zu lang für einen QR-Code. Verwenden Sie eine kürzere URI.',
        en: 'The identifier is too long for a QR code. Use a shorter URI.',
      });
    }
    throw error;
  } finally {
    qrcode.stringToBytes = previousStringToBytes;
  }
}

export function renderQrSvg(m: QrMatrix, opts: QrRenderOptions = {}): string {
  const moduleSize = opts.moduleSize ?? 4;
  const margin = opts.margin ?? 4;
  const total = m.size + 2 * margin;
  const px = total * moduleSize;
  const d: string[] = [];
  for (let r = 0; r < m.size; r++) {
    const row = m.modules[r] ?? [];
    let c = 0;
    while (c < m.size) {
      if (!row[c]) {
        c++;
        continue;
      }
      let len = 0;
      while (c + len < m.size && row[c + len]) len++;
      d.push(`M${c + margin} ${r + margin}h${len}v1h-${len}z`);
      c += len;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d.join('')}" fill="#000"/></svg>\n`
  );
}

// --- PNG encoder -------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 4 + body.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function renderQrPng(m: QrMatrix, opts: QrRenderOptions = {}): Uint8Array {
  const moduleSize = opts.moduleSize ?? 8;
  const margin = opts.margin ?? 4;
  const size = (m.size + 2 * margin) * moduleSize;
  const stride = size + 1; // filter byte + one byte per pixel
  const raw = new Uint8Array(stride * size).fill(0xff);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type None
    const r = Math.floor(y / moduleSize) - margin;
    if (r < 0 || r >= m.size) continue;
    const row = m.modules[r] ?? [];
    for (let x = 0; x < size; x++) {
      const c = Math.floor(x / moduleSize) - margin;
      if (c >= 0 && c < m.size && row[c]) raw[y * stride + 1 + x] = 0;
    }
  }
  const ihdr = concat([u32(size), u32(size), new Uint8Array([8, 0, 0, 0, 0])]);
  return concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}
