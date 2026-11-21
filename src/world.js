// مولد شهر بی‌پایان: قطعه‌های ۴۸ متری در امتداد خیابان (محور −Z)، کاملاً قطعی بر پایهٔ seed.
// هیچ‌چیز این‌جا به مرورگر وابسته نیست؛ خروجی آرایه‌های Float32 برای رسم نمونه‌ای (instanced) است.
import { rng, hash32, h01, clamp } from './util.js';

export const CH = 48;                 // طول هر قطعه (متر)
export const ROAD_HALF = 7;           // نیم‌پهنای آسفالت
export const WALK_HALF = 10.5;        // لبهٔ پیاده‌رو (جبههٔ ساختمان‌ها)
export const STRIDE = 14;             // px py pz sx sy sz r g b kind lit seed reserved1 reserved2
export const KIND = { FACADE: 0, SOLID: 1, EMISSIVE: 2 };

export const DISTRICTS = [
  { id: 'downtown', label: 'مرکز شهر', h: [38, 120], w: [10, 18], gap: .04, lit: .6, hue: [[.3, .33, .38], [.36, .37, .4], [.26, .3, .36]] },
  { id: 'old', label: 'محلهٔ قدیمی', h: [12, 36], w: [8, 14], gap: .08, lit: .5, hue: [[.42, .32, .26], [.36, .28, .25], [.46, .4, .33]] },
  { id: 'industrial', label: 'منطقهٔ صنعتی', h: [8, 24], w: [14, 26], gap: .22, lit: .16, hue: [[.32, .3, .27], [.26, .3, .32], [.38, .32, .24]] },
  { id: 'quiet', label: 'خیابان خلوت', h: [8, 20], w: [9, 15], gap: .3, lit: .34, hue: [[.38, .35, .32], [.32, .35, .37], [.4, .32, .32]] },
];
// وزن محله‌ها بر اساس ترجیح کاربر (district: 'auto' یا id)
export function districtOf(seed, k, pref = 'auto') {
  if (pref && pref !== 'auto') { const d = DISTRICTS.find((x) => x.id === pref); if (d) return d; }
  const b = Math.floor(k / 3), r = h01(hash32(seed ^ Math.imul(b + 91, 0x45d9f3b)));
  return DISTRICTS[r < .42 ? 0 : r < .62 ? 1 : r < .78 ? 2 : 3];
}
export const isIntersection = (k) => ((k % 4) + 4) % 4 === 0;
export const chunkIndex = (z) => Math.floor(-z / CH);          // z=−10 → 0 ، z=+5 → −1
export const chunkZ0 = (k) => -(k + 1) * CH;                    // دور
export const chunkZ1 = (k) => -k * CH;                          // نزدیک

function push(a, px, py, pz, sx, sy, sz, r, g, b, kind, lit, seed) { a.push(px, py, pz, sx, sy, sz, r, g, b, kind, lit, seed, 0, 0); }

export function makeChunk(seed, k, opts = {}) {
  const dist = districtOf(seed, k, opts.district), R = rng(hash32(seed ^ Math.imul(k + 17, 0x27d4eb2d)));
  const boxes = [], lights = [], z0 = chunkZ0(k), z1 = chunkZ1(k), mid = (z0 + z1) / 2, inter = isIntersection(k);
  const litBase = clamp((dist.lit * (opts.lit == null ? 1 : opts.lit)), 0, 1);
  const landmark = ((k % 7) + 7) % 7 === 3;
  for (const side of [-1, 1]) {
    let z = z1 - 1 + R() * 2, slot = 0;
    while (z > z0 + 2) {
      if (inter && Math.abs(z - mid) < 8) { z = mid - 8; continue; }
      if (R() < dist.gap) { z -= 6 + R() * 10; continue; }
      let w = dist.w[0] + R() * (dist.w[1] - dist.w[0]);
      if (inter && z - w < mid + 8 && z > mid + 8) w = z - (mid + 8);            // قبل از چهارراه کوتاه می‌شود
      if (z - w < z0) w = z - z0; if (w < 5) { z -= w + 1; continue; }
      const dep = 10 + R() * 8, x0 = WALK_HALF + dep / 2, cz = z - w / 2;
      let hgt = dist.h[0] + R() * (dist.h[1] - dist.h[0]);
      const big = landmark && slot === 1 && side === (k % 2 ? 1 : -1);
      if (big) hgt = 150 + R() * 50;
      const base = dist.hue[Math.floor(R() * dist.hue.length)], v = .85 + R() * .35, lit = clamp(litBase * (.6 + R() * .8), 0, 1), sd = R() * 1000;
      // پایه + طبقات پلکانی (آرت‌دکو)
      const tiers = hgt > 90 ? 4 : hgt > 50 ? 3 : hgt > 28 ? 2 : 1;
      let tw = w, td = dep, cx = side * x0, y = 0, rem = hgt;
      for (let t = 0; t < tiers; t++) {
        const th = t === tiers - 1 ? rem : rem * (t === 0 ? .5 : .55);
        push(boxes, cx, y + th / 2, cz, td, th, tw, base[0] * v, base[1] * v, base[2] * v, KIND.FACADE, lit, sd + t * 7);
        y += th; rem -= th;
        const inset = Math.min(tw, td) * (.1 + R() * .06);
        tw -= inset * 1.6; td -= inset * 1.6; cx += -side * inset * .5;                 // عقب‌نشینی به سمت پشت ساختمان
        if (tw < 3 || td < 3) break;
      }
      if (hgt > 28) { push(boxes, cx, y + .8, cz, td * .5, 1.6, tw * .5, .08, .09, .1, KIND.SOLID, 0, 0); if (hgt > 70) push(boxes, cx, y + 6, cz, .35, 12, .35, .1, .1, .12, KIND.SOLID, 0, 0); }
      else push(boxes, cx, y + .4, cz, td, .8, tw, .09, .09, .1, KIND.SOLID, 0, 0);       // لبهٔ بام
      // تابلوی نئون روی نمای پایین
      if (R() < (dist.id === 'downtown' ? .45 : .3)) {
        const ny = 5 + R() * 5, red = R() < .62, c = red ? [1, .12, .1] : [1, .72, .25];
        push(boxes, side * (WALK_HALF - .25), ny, cz, .35, 1 + R() * 1.4, Math.min(w * .5, 3 + R() * 3), c[0], c[1], c[2], KIND.EMISSIVE, 1, 0);
        lights.push(side * (WALK_HALF - 1), ny, cz, c[0], c[1], c[2], 8, 1);
      }
      z -= w + 1.5 + R() * 4; slot++;
    }
  }
  // چراغ‌های خیابان
  for (let zz = z1 - 6; zz > z0; zz -= 16) for (const side of [-1, 1]) {
    if (inter && Math.abs(zz - mid) < 7) continue;
    const x = side * (ROAD_HALF + 1.3);
    push(boxes, x, 3.4, zz, .22, 6.8, .22, .06, .06, .07, KIND.SOLID, 0, 0);
    push(boxes, x - side * .8, 6.9, zz, 1.8, .18, .2, .06, .06, .07, KIND.SOLID, 0, 0);
    push(boxes, x - side * 1.5, 6.78, zz, .8, .22, .45, 1, .86, .55, KIND.EMISSIVE, 1, 0);
    lights.push(x - side * 1.5, 6.6, zz, 1, .82, .5, 17, 2);
  }
  // اشیای کنار پیاده‌رو: سطل، شیر آتش‌نشانی، مانع، نیمکت
  const nProps = 4 + Math.floor(R() * 6);
  for (let i = 0; i < nProps; i++) {
    const side = R() < .5 ? -1 : 1, zz = z0 + 3 + R() * (CH - 6); if (inter && Math.abs(zz - mid) < 8) continue;
    const x = side * (ROAD_HALF + 2 + R() * 1.6), t = Math.floor(R() * 4);
    if (t === 0) push(boxes, x, .55, zz, .7, 1.1, .7, .12, .14, .13, KIND.SOLID, 0, 0);                       // سطل
    else if (t === 1) { push(boxes, x, .45, zz, .35, .9, .35, .55, .08, .06, KIND.SOLID, 0, 0); push(boxes, x, .95, zz, .5, .12, .5, .5, .07, .05, KIND.SOLID, 0, 0); }
    else if (t === 2) push(boxes, x, .45, zz, .28, .9, .28, .9, .85, .2, KIND.SOLID, 0, 0);                    // مانع
    else { push(boxes, x, .45, zz, .6, .1, 2, .25, .17, .1, KIND.SOLID, 0, 0); push(boxes, x + side * .25, .85, zz, .08, .7, 2, .22, .15, .09, KIND.SOLID, 0, 0); }
  }
  // ماشین‌های پارک‌شده
  const nCars = Math.floor(R() * 3.4);
  for (let i = 0; i < nCars; i++) {
    const side = R() < .5 ? -1 : 1, zz = z0 + 5 + R() * (CH - 10); if (inter && Math.abs(zz - mid) < 9) continue;
    carBoxes(boxes, side * (ROAD_HALF - 1.4), zz, 0, h01(hash32(seed + k * 31 + i)));
  }
  return { k, z0, z1, boxes: new Float32Array(boxes), count: boxes.length / STRIDE, lights: new Float32Array(lights), nLights: lights.length / 8, district: dist.id, inter };
}

const CAR_COLORS = [[.05, .05, .06], [.11, .12, .13], [.35, .05, .05], [.08, .12, .2], [.2, .2, .18]];
export function carBoxes(out, x, z, head, hv) {
  // ماشین کلاسیک دههٔ ۱۹۳۰: کاپوت بلند، گلگیر برجسته، رینگ کروم، چراغ گرد
  const c = CAR_COLORS[Math.floor(hv * CAR_COLORS.length) % CAR_COLORS.length], F = head === 0 ? -1 : 1;
  const B = (l, y, w, h, len, r, g, b, kind = KIND.SOLID, lit = 0, ox = 0) => push(out, x + ox, y, z + F * l, w, h, len, r, g, b, kind, lit, 0);
  const d = [c[0] * .55, c[1] * .55, c[2] * .55], ch = [.62, .62, .58];
  B(-.1, .6, 1.55, .5, 4.3, c[0], c[1], c[2]);                  // شاسی/بدنه
  B(1.25, 1.02, 1.0, .45, 1.7, c[0], c[1], c[2]);               // کاپوت باریک و بلند
  B(-.7, 1.38, 1.5, .72, 1.9, c[0], c[1], c[2]);                // کابین
  B(-.68, 1.42, 1.54, .42, 1.6, .05, .07, .09);                 // شیشه‌ها
  B(-.7, 1.8, 1.42, .08, 1.7, d[0], d[1], d[2]);                // سقف
  B(-1.85, 1.02, 1.4, .62, .75, c[0], c[1], c[2]);              // صندوق عقب
  for (const sx of [-1, 1]) {
    B(1.5, .78, .38, .2, 1.3, c[0], c[1], c[2], KIND.SOLID, 0, sx * .86);   // گلگیر جلو
    B(-1.3, .78, .38, .2, 1.4, c[0], c[1], c[2], KIND.SOLID, 0, sx * .86);  // گلگیر عقب
    B(.1, .42, .26, .06, 1.2, .03, .03, .04, KIND.SOLID, 0, sx * .93);      // رکاب
    for (const l of [1.5, -1.35]) {
      B(l, .36, .26, .72, .72, .02, .02, .025, KIND.SOLID, 0, sx * .9);     // لاستیک
      B(l, .36, .06, .4, .4, ch[0], ch[1], ch[2], KIND.EMISSIVE, .35, sx * 1.04); // رینگ کروم
      B(l, .36, .09, .14, .14, .9, .9, .85, KIND.EMISSIVE, .5, sx * 1.07);  // کلاهک
    }
    B(1.78, 1.12, .34, .34, .24, 1, .93, .7, KIND.EMISSIVE, 1, sx * .7);    // چراغ جلوی گرد
    B(-2.25, 1.0, .16, .16, .08, .95, .07, .04, KIND.EMISSIVE, 1, sx * .55);// چراغ عقب
  }
  B(2.08, .82, .5, .48, .07, ch[0], ch[1], ch[2], KIND.EMISSIVE, .25);      // جلوپنجره کروم
  B(2.25, .48, 1.75, .09, .12, ch[0], ch[1], ch[2], KIND.EMISSIVE, .3);     // سپر جلو
  B(-2.28, .48, 1.6, .09, .12, ch[0], ch[1], ch[2], KIND.EMISSIVE, .3);     // سپر عقب
}
// ماشین‌های متحرک: موقعیت تابع زمان است (قطعی؛ بدون وضعیت) → بی‌پایان
export function movingCars(seed, t, zMin, zMax, density = 1) {
  const out = [], S = 38;
  for (const lane of [-4.6, -2.3, 2.3, 4.6]) {
    const dir = lane < 0 ? -1 : 1, sp = (lane < 0 ? 7.5 : 6.5) * dir;     // lane<0 به سمت −Z
    const i0 = Math.floor((zMin - 60 - sp * t) / S), i1 = Math.ceil((zMax + 60 - sp * t) / S);
    for (let i = i0; i <= i1; i++) {
      const hs = hash32(seed ^ Math.imul(i * 7 + (lane * 10 | 0), 0x9e3779b1)); if ((hs & 255) / 255 > .55 * density) continue;
      const z = i * S + sp * t + ((hs >>> 8) & 255) / 255 * 10; if (z < zMin - 8 || z > zMax + 8) continue;
      out.push({ x: lane, z, head: dir < 0 ? 0 : Math.PI, hv: ((hs >>> 16) & 255) / 255 });
    }
  }
  return out;
}
// آیا نقطه روی مسیر قابل‌عبور است؟ (خیابان + پیاده‌رو)؛ در چهارراه می‌شود به خیابان فرعی رفت
export const walkState = { half: WALK_HALF, city: true };
export function clampWalk(x, z, margin = .4) {
  const k = chunkIndex(z), mid = chunkZ0(k) + CH / 2;
  const free = walkState.city && isIntersection(k) && Math.abs(z - mid) < 7;
  return { x: free ? clamp(x, -30, 30) : clamp(x, -(walkState.half - margin), walkState.half - margin), z };
}
