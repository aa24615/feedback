'use strict';
/**
 * 生成应用商店图标（1Panel logo.png / 宝塔 icon.png）。
 * 纯 Node 实现 PNG 编码，不依赖 sharp / PIL / ImageMagick，方便在任何机器上复现。
 * 图形与 web/public/favicon.svg 保持一致：紫色渐变圆角方块 + 白色对话气泡 + 三个点。
 *
 * 用法：node deploy/tools/make-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const VIEW = 48; // favicon.svg 的 viewBox 尺寸

// ---------- PNG 编码 ----------
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 图形：坐标以 48x48 viewBox 为准 ----------
function roundRectSDF(x, y, l, t, w, h, r) {
  const qx = Math.abs(x - (l + w / 2)) - (w / 2 - r);
  const qy = Math.abs(y - (t + h / 2)) - (h / 2 - r);
  const dx = Math.max(qx, 0), dy = Math.max(qy, 0);
  return Math.sqrt(dx * dx + dy * dy) + Math.min(Math.max(qx, qy), 0) - r;
}
function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && pos);
}
/** 返回 [r,g,b,a]，a=0 表示透明 */
function sample(x, y) {
  // 背景：紫色渐变圆角方块
  if (roundRectSDF(x, y, 2, 2, 44, 44, 12) <= 0) {
    const t = Math.min(1, Math.max(0, ((x - 8) * 32 + (y - 2) * 44) / (32 * 32 + 44 * 44)));
    const r = Math.round(0x63 + (0x4f - 0x63) * t);
    const g = Math.round(0x66 + (0x46 - 0x66) * t);
    const b = Math.round(0xf1 + (0xe5 - 0xf1) * t);
    // 白色气泡 + 尾巴
    const bubble = roundRectSDF(x, y, 13, 11.5, 22, 16.5, 5.5) <= 0 ||
      inTriangle(x, y, 19, 28, 29.5, 28, 17.5, 36.2);
    if (bubble) {
      // 气泡上的三个点
      for (const cx of [18.6, 24, 29.4]) {
        const dx = x - cx, dy = y - 19.8;
        if (dx * dx + dy * dy <= 1.9 * 1.9) return [0x4f, 0x46, 0xe5, 255];
      }
      return [255, 255, 255, 255];
    }
    return [r, g, b, 255];
  }
  return [0, 0, 0, 0];
}

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 4; // 4x4 超采样抗锯齿
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * VIEW;
          const y = ((py + (sy + 0.5) / SS) / size) * VIEW;
          const c = sample(x, y);
          pr += c[0] * c[3]; pg += c[1] * c[3]; pb += c[2] * c[3]; pa += c[3];
        }
      }
      const n = SS * SS;
      const a = Math.round(pa / n);
      const i = (py * size + px) * 4;
      out[i] = a ? Math.round(pr / pa) : 0;
      out[i + 1] = a ? Math.round(pg / pa) : 0;
      out[i + 2] = a ? Math.round(pb / pa) : 0;
      out[i + 3] = a;
    }
  }
  return encodePNG(size, size, out);
}

const targets = [
  [path.join(ROOT, 'deploy/1panel/apps/feedback/logo.png'), 256],
  [path.join(ROOT, 'deploy/1panel/logo.png'), 256],
  [path.join(ROOT, 'deploy/bt/feedback/icon.png'), 128],
];
for (const [file, size] of targets) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(size));
  console.log('生成', path.relative(ROOT, file), size + 'x' + size, fs.statSync(file).size + ' bytes');
}
