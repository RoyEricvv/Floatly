/**
 * Empaqueta dist/chrome en release/video-flotante-chrome-<versión>.zip con
 * manifest.json en la raíz (formato que exige Chrome Web Store). Sin dependencias:
 * escribe el ZIP con zlib para funcionar igual en macOS y Windows.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = join(ROOT, 'dist/chrome');
const IGNORED = new Set(['.DS_Store', 'Thumbs.db']);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function listFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => !IGNORED.has(name))
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? listFiles(path) : [path];
    });
}

export function createZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // Fecha fija (1980-01-01): ZIP reproducible.
  const DOS_DATE = (0 << 9) | (1 << 5) | 1;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, compressed);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const manifest = JSON.parse(readFileSync(join(SOURCE, 'manifest.json'), 'utf8'));
  const files = listFiles(SOURCE).map((path) => ({
    name: relative(SOURCE, path).split(sep).join('/'),
    data: readFileSync(path),
  }));
  if (!files.some((f) => f.name === 'manifest.json')) throw new Error('manifest.json debe estar en la raíz');
  const outDir = join(ROOT, 'release');
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `video-flotante-chrome-${manifest.version}.zip`);
  writeFileSync(out, createZip(files));
  console.log(`✔ ${relative(ROOT, out)} (${files.length} archivos)`);
}
