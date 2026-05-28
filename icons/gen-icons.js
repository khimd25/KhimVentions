/* Generates PNG app icons with no external deps.
   Draws a rounded-square gradient background + a bold checkmark.
   Run: node icons/gen-icons.js
*/
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- tiny drawing helpers on an RGBA buffer ----
function mk(w, h) { return { w, h, px: Buffer.alloc(w * h * 4) }; }
function setPx(img, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  const ia = a / 255, na = 1 - ia;
  img.px[i]   = r * ia + img.px[i] * na;
  img.px[i+1] = g * ia + img.px[i+1] * na;
  img.px[i+2] = b * ia + img.px[i+2] * na;
  img.px[i+3] = Math.min(255, a + img.px[i+3] * na);
}
function fillRoundRect(img, x0, y0, x1, y1, rad, colorFn) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    let inside = true;
    const corners = [[x0+rad,y0+rad],[x1-rad,y0+rad],[x0+rad,y1-rad],[x1-rad,y1-rad]];
    if (x < x0+rad && y < y0+rad) inside = Math.hypot(x-corners[0][0], y-corners[0][1]) <= rad;
    else if (x >= x1-rad && y < y0+rad) inside = Math.hypot(x-corners[1][0], y-corners[1][1]) <= rad;
    else if (x < x0+rad && y >= y1-rad) inside = Math.hypot(x-corners[2][0], y-corners[2][1]) <= rad;
    else if (x >= x1-rad && y >= y1-rad) inside = Math.hypot(x-corners[3][0], y-corners[3][1]) <= rad;
    if (inside) { const c = colorFn(x, y); setPx(img, x, y, c[0], c[1], c[2], 255); }
  }
}
function thickLine(img, ax, ay, bx, by, width, col) {
  const r = width / 2;
  const minx = Math.floor(Math.min(ax,bx)-r), maxx = Math.ceil(Math.max(ax,bx)+r);
  const miny = Math.floor(Math.min(ay,by)-r), maxy = Math.ceil(Math.max(ay,by)+r);
  const dx = bx-ax, dy = by-ay, len2 = dx*dx+dy*dy;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    let t = len2 ? ((x-ax)*dx + (y-ay)*dy)/len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax+t*dx, py = ay+t*dy;
    const d = Math.hypot(x-px, y-py);
    if (d <= r) { const a = d > r-1.5 ? 255*(r-d)/1.5 : 255; setPx(img, x, y, col[0], col[1], col[2], Math.max(0, Math.min(255, a))); }
  }
}

function drawIcon(size, maskable) {
  const img = mk(size, size);
  const bg = [15, 17, 21];
  // base
  for (let i = 0; i < size*size; i++) { img.px[i*4]=bg[0]; img.px[i*4+1]=bg[1]; img.px[i*4+2]=bg[2]; img.px[i*4+3]=255; }
  const pad = maskable ? Math.round(size * 0.16) : Math.round(size * 0.07);
  const rad = Math.round((size - pad*2) * 0.21);
  // gradient rounded square (accent -> accent2)
  const a1 = [124,156,255], a2 = [180,140,255];
  fillRoundRect(img, pad, pad, size-pad, size-pad, rad, (x,y) => {
    const t = ((x-pad)+(y-pad)) / ((size-pad*2)*2);
    return [Math.round(a1[0]+(a2[0]-a1[0])*t), Math.round(a1[1]+(a2[1]-a1[1])*t), Math.round(a1[2]+(a2[2]-a1[2])*t)];
  });
  // checkmark
  const s = size/512;
  const lw = 38*s;
  thickLine(img, 170*s, 262*s, 224*s, 316*s, lw, bg);
  thickLine(img, 224*s, 316*s, 344*s, 188*s, lw, bg);
  return encodePNG(size, size, img.px);
}

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'icon-192.png'), drawIcon(192, false));
fs.writeFileSync(path.join(dir, 'icon-512.png'), drawIcon(512, false));
fs.writeFileSync(path.join(dir, 'icon-maskable.png'), drawIcon(512, true));
fs.writeFileSync(path.join(dir, 'apple-touch-icon.png'), drawIcon(180, false));
console.log('icons written:', fs.readdirSync(dir).filter(f => f.endsWith('.png')).join(', '));
