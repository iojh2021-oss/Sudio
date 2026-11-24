// کاراکتر تصویری: آماده‌سازی تصویر آپلودی یا نقاشی (حذف پس‌زمینهٔ ساده، برش، کوچک‌کردن) → PNG با آلفا
// توابع پردازش روی آرایهٔ RGBA خالص‌اند و در Node هم آزمون می‌شوند.
export function keyBackground(d, w, h, tol = 46) {
  const at = (x, y) => (y * w + x) * 4;
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => at(x, y));
  if (corners.filter((i) => d[i + 3] < 24).length >= 3) return 0;                       // از قبل شفاف است
  let r = 0, g = 0, b = 0; for (const i of corners) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } r /= 4; g /= 4; b /= 4;
  const near = (i) => { const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b; return dr * dr + dg * dg + db * db < tol * tol; };
  const seen = new Uint8Array(w * h), st = []; const push = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const k = y * w + x; if (seen[k] || !near(k * 4)) return; seen[k] = 1; st.push(k); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  let n = 0; while (st.length) { const k = st.pop(), x = k % w, y = (k / w) | 0; d[k * 4 + 3] = 0; n++; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const k = y * w + x; if (seen[k]) continue; if (seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w]) d[k * 4 + 3] = Math.min(d[k * 4 + 3], 150); }   // لبهٔ نرم
  return n / (w * h);
}
export function alphaBox(d, w, h, thr = 12) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function finish(src, removeBg, max) {                                                   // src: Canvas
  const w = src.width, h = src.height, ctx = src.getContext('2d', { willReadFrequently: true }), im = ctx.getImageData(0, 0, w, h);
  const cleared = removeBg ? keyBackground(im.data, w, h) : 0; ctx.putImageData(im, 0, 0);
  const bb = alphaBox(im.data, w, h); if (!bb) throw new Error('تصویر خالی است یا همه‌اش پس‌زمینه تشخیص داده شد؛ «حذف پس‌زمینه» را خاموش کن');
  const k = Math.min(1, max / Math.max(bb.w, bb.h)), ow = Math.max(8, Math.round(bb.w * k)), oh = Math.max(8, Math.round(bb.h * k)), out = canvas(ow, oh);
  out.getContext('2d').drawImage(src, bb.x, bb.y, bb.w, bb.h, 0, 0, ow, oh);
  let data = out.toDataURL('image/png'); if (data.length > 700000) data = out.toDataURL('image/webp', .85);
  return { data, w: ow, h: oh, size: 1, mirror: 1, ver: Date.now() % 1e9, cleared };
}
export async function spriteFromFile(file, removeBg = true, max = 512) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1024 / Math.max(bmp.width, bmp.height)), c = canvas(Math.max(8, Math.round(bmp.width * k)), Math.max(8, Math.round(bmp.height * k)));
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return finish(c, removeBg, max);
}
export function spriteFromCanvas(c, max = 512) { return finish(c, false, max); }
