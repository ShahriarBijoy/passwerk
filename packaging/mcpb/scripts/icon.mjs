/**
 * The bundle icon: a battery mark on a dark ground, drawn from rectangles so it is
 * deterministic and needs no rasteriser. Run `node scripts/icon.mjs` to rewrite icon.png.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const SIZE = 512;
const GROUND = [0x10, 0x16, 0x1f, 0xff]; // near-black slate
const MARK = [0x4a, 0xde, 0x80, 0xff]; // green, "valid"

function fill(png, x0, y0, w, h, rgba) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * SIZE + x) << 2;
      png.data[i] = rgba[0];
      png.data[i + 1] = rgba[1];
      png.data[i + 2] = rgba[2];
      png.data[i + 3] = rgba[3];
    }
  }
}

export function iconPng() {
  const png = new PNG({ width: SIZE, height: SIZE });
  fill(png, 0, 0, SIZE, SIZE, GROUND);
  // battery body outline: 288 x 192, centred, 20 px stroke
  const bx = 104;
  const by = 160;
  const bw = 288;
  const bh = 192;
  const s = 20;
  fill(png, bx, by, bw, s, MARK); // top
  fill(png, bx, by + bh - s, bw, s, MARK); // bottom
  fill(png, bx, by, s, bh, MARK); // left
  fill(png, bx + bw - s, by, s, bh, MARK); // right
  // terminal
  fill(png, bx + bw, by + 64, 28, 64, MARK);
  // charge bars inside
  fill(png, bx + 44, by + 48, 56, 96, MARK);
  fill(png, bx + 120, by + 48, 56, 96, MARK);
  return PNG.sync.write(png, { deflateLevel: 9 });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../icon.png', import.meta.url));
  writeFileSync(out, iconPng());
  console.log(`wrote ${out}`);
}
