// Draws the app icon (a speech bubble) as PNG files in public/.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [11, 61, 145];
const FG = [255, 255, 255];
const DOT = [11, 61, 145];

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = s(x, y, ax, ay, bx, by);
  const d2 = s(x, y, bx, by, cx, cy);
  const d3 = s(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function color(u, v) {
  for (const dx of [0.36, 0.5, 0.64]) {
    if ((u - dx) ** 2 + (v - 0.44) ** 2 <= 0.045 ** 2) return DOT;
  }
  if (inRoundRect(u, v, 0.18, 0.24, 0.82, 0.64, 0.1)) return FG;
  if (inTriangle(u, v, [0.3, 0.6], [0.46, 0.6], [0.27, 0.8])) return FG;
  return BG;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = color((x + 0.5) / size, (y + 0.5) / size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, png(size));

writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="rgb(${BG})"/>
  <rect x="18" y="24" width="64" height="40" rx="10" fill="#fff"/>
  <path d="M30 60 L46 60 L27 80 Z" fill="#fff"/>
  <g fill="rgb(${DOT})"><circle cx="36" cy="44" r="4.5"/><circle cx="50" cy="44" r="4.5"/><circle cx="64" cy="44" r="4.5"/></g>
</svg>
`,
);
console.log('icons written');
