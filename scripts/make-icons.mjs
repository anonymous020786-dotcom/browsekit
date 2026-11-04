// Draws the Browsekit icon (a white lightning bolt on a blue-to-indigo rounded square) at every size
// browsers and stores need, as anti-aliased PNGs. No image libraries: a tiny rasteriser and PNG encoder.
// Usage: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SAMPLES = 4; // 4×4 sub-pixel samples per pixel for smooth edges.
const FROM = [79, 140, 255]; // #4f8cff
const TO = [109, 74, 255]; // #6d4aff
const BOLT = [[0.58, 0.12], [0.27, 0.55], [0.47, 0.55], [0.4, 0.88], [0.74, 0.43], [0.54, 0.43], [0.64, 0.12]];

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let background = 0;
      let bolt = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedSquare(x, y, 0.22)) continue;
          background++;
          if (insidePolygon(x, y, BOLT)) bolt++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const t = (px + py) / (2 * size);
      const white = background ? bolt / background : 0;
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const gradient = FROM[channel] + (TO[channel] - FROM[channel]) * t;
        pixels[offset + channel] = Math.round(gradient + (255 - gradient) * white);
      }
      pixels[offset + 3] = Math.round((background / total) * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // Bits per channel.
  header[9] = 6; // RGBA.
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), rgba.subarray(y * size * 4, (y + 1) * size * 4));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../extension/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const file = new URL(`icon-${size}.png`, outDir);
  writeFileSync(file, png(size, render(size)));
  console.log(`icon-${size}.png`);
}
