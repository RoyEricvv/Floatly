/**
 * Genera los iconos PNG (sin dependencias) en public/icons/.
 * Diseño: pantalla con una ventana flotante en la esquina inferior derecha.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 96, 128, 256, 512];
const OUT = new URL('../public/icons/', import.meta.url);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Distancia con signo a un rectángulo redondeado (coordenadas normalizadas 0..1). */
function roundedRect(x: number, y: number, cx: number, cy: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(x - cx) - hw + r;
  const qy = Math.abs(y - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

type RGBA = [number, number, number, number];
const BLUE: RGBA = [47, 111, 237, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const CLEAR: RGBA = [0, 0, 0, 0];

function shade(x: number, y: number): RGBA {
  if (roundedRect(x, y, 0.5, 0.5, 0.47, 0.47, 0.2) > 0) return CLEAR;
  const screen = roundedRect(x, y, 0.5, 0.47, 0.32, 0.24, 0.06);
  const inner = roundedRect(x, y, 0.5, 0.47, 0.32 - 0.06, 0.24 - 0.06, 0.03);
  const mini = roundedRect(x, y, 0.66, 0.6, 0.17, 0.12, 0.04);
  const miniBorder = roundedRect(x, y, 0.66, 0.6, 0.17 + 0.045, 0.12 + 0.045, 0.06);
  if (mini <= 0) return WHITE;
  if (miniBorder <= 0) return BLUE;
  if (screen <= 0 && inner > 0) return WHITE;
  return BLUE;
}

function render(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
          const a = c[3] / 255;
          acc[0]! += c[0] * a;
          acc[1]! += c[1] * a;
          acc[2]! += c[2] * a;
          acc[3]! += a;
        }
      }
      const i = (py * size + px) * 4;
      const alpha = acc[3]! / (ss * ss);
      out[i] = alpha ? Math.round(acc[0]! / acc[3]!) : 0;
      out[i + 1] = alpha ? Math.round(acc[1]! / acc[3]!) : 0;
      out[i + 2] = alpha ? Math.round(acc[2]! / acc[3]!) : 0;
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon-${size}.png`, OUT), png(size, render(size)));
}
console.log(`Iconos generados: ${SIZES.join(', ')} px`);
