import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixel(x, y, size);
      const offset = row + 1 + x * 4;
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = a;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function iconPixel(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const distance = Math.hypot(dx, dy);
  const radius = size * 0.36;
  const thickness = size * 0.07;
  const gap = dx > radius * 0.15 && Math.abs(dy) < thickness * 1.35;
  const ring = distance <= radius && distance >= radius - thickness && !gap;
  const dot = Math.hypot(dx - radius * 0.72, dy + radius * 0.08) <= thickness * 0.72;
  if (ring || dot) return [226, 161, 90, 255];
  return [20, 19, 17, 255];
}

export async function writeIcon(file) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, png(512, iconPixel));
}
