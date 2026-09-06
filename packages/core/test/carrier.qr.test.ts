import { createHash } from 'node:crypto';
import { qrMatrix, renderQrPng, renderQrSvg } from '@passwerk/core';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const PAYLOAD = 'https://passport.musterwerk.example/battery/MW-EV-2026-000123';

function decodePng(bytes: Uint8Array): string | null {
  const png = PNG.sync.read(Buffer.from(bytes));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code?.data ?? null;
}

describe('qrMatrix', () => {
  it('is square, has the three finder patterns and is deterministic', () => {
    const m = qrMatrix(PAYLOAD);
    expect(m.size % 4).toBe(1);
    expect(m.modules).toHaveLength(m.size);
    for (const row of m.modules) expect(row).toHaveLength(m.size);
    // Finder pattern corners are dark.
    expect(m.modules[0]?.[0]).toBe(true);
    expect(m.modules[0]?.[m.size - 1]).toBe(true);
    expect(m.modules[m.size - 1]?.[0]).toBe(true);
    expect(qrMatrix(PAYLOAD)).toEqual(m);
  });
});

describe('renderQrSvg', () => {
  it('is a self-contained SVG with a white background and a black path', () => {
    const svg = renderQrSvg(qrMatrix(PAYLOAD));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
    expect(svg.endsWith('</svg>\n')).toBe(true);
    expect(svg).toMatchSnapshot();
  });
});

describe('renderQrPng', () => {
  it('is a PNG an independent decoder reads back', () => {
    const png = renderQrPng(qrMatrix(PAYLOAD));
    expect([...png.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(decodePng(png)).toBe(PAYLOAD);
  });
  it('round-trips a 300 character payload and a UTF-8 payload', () => {
    const long = `https://id.example.com/8004/${'X'.repeat(30)}?${'k=v&'.repeat(60)}`.slice(0, 300);
    expect(decodePng(renderQrPng(qrMatrix(long)))).toBe(long);
    const utf8 = 'https://id.example.com/21/Größe-1';
    expect(decodePng(renderQrPng(qrMatrix(utf8)))).toBe(utf8);
  });
  it('is byte-identical across runs (pinned hash)', () => {
    const a = renderQrPng(qrMatrix(PAYLOAD));
    const b = renderQrPng(qrMatrix(PAYLOAD));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(createHash('sha256').update(a).digest('hex')).toMatchSnapshot();
  });
});
