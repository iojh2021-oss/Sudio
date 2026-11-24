// شخصیت سه‌بعدی (اسکلت جعبه‌ای) با چرخهٔ راه‌رفتن/دویدن/ایستادن/حرف‌زدن
import { chain, trans, scale, rotX, rotY, rotZ } from './mat.js';
import { clamp, angDiff, hash32, h01 } from './util.js';
import { clampWalk } from './world.js';

export const PRESETS = {
  detective: { label: 'کارآگاه', coat: [.16, .16, .18], pants: [.1, .1, .12], skin: [.86, .8, .74], hair: [.06, .05, .05], hat: [.07, .07, .08], scarf: [.75, .05, .08], shoes: [.04, .04, .05], height: 1, dress: 0, hatKind: 'fedora', gender: 'male' },
  woman: { label: 'بانو', coat: [.55, .06, .09], pants: [.55, .06, .09], skin: [.9, .82, .76], hair: [.05, .04, .05], hat: [.08, .08, .09], scarf: [.9, .9, .88], shoes: [.04, .04, .05], height: .94, dress: 1, hatKind: 'none', gender: 'female', longHair: 1 },
  worker: { label: 'کارگر', coat: [.2, .27, .36], pants: [.12, .14, .2], skin: [.8, .66, .56], hair: [.1, .08, .06], hat: [.9, .75, .1], scarf: [.2, .27, .36], shoes: [.07, .06, .05], height: 1.04, dress: 0, hatKind: 'cap', gender: 'male' },
  child: { label: 'کودک', coat: [.9, .75, .15], pants: [.15, .2, .3], skin: [.9, .76, .68], hair: [.18, .1, .06], hat: [.9, .2, .2], scarf: [.9, .75, .15], shoes: [.1, .1, .1], height: .62, dress: 0, hatKind: 'cap', gender: 'child' },
  robot: { label: 'ربات', coat: [.45, .48, .52], pants: [.3, .32, .35], skin: [.6, .63, .68], hair: [.3, .3, .3], hat: [.3, .3, .3], scarf: [.9, .1, .1], shoes: [.15, .15, .17], height: 1.1, dress: 0, hatKind: 'antenna', gender: 'male', robot: 1 },
};
export const VOICE_BASE = { male: { f0: 118, vt: 1 }, female: { f0: 214, vt: .86 }, child: { f0: 290, vt: .78 } };

const COLOR_KEYS = ['coat', 'pants', 'skin', 'hair', 'hat', 'scarf', 'shoes'];
export const HATS = [['', 'پیش‌فرض نقش'], ['none', 'بدون کلاه'], ['fedora', 'کلاه شاپو'], ['cap', 'کلاه لبه‌دار'], ['antenna', 'آنتن']];
function cleanColors(c) { if (!c || typeof c !== 'object') return null; const o = {}; for (const k of COLOR_KEYS) { const v = c[k]; if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && isFinite(n))) o[k] = v.map((n) => clamp(n, 0, 1)); } return Object.keys(o).length ? o : null; }
function cleanLook(l) { const o = {}; if (l && typeof l === 'object') { if (['none', 'fedora', 'cap', 'antenna'].includes(l.hat)) o.hat = l.hat; if (l.dress === 0 || l.dress === 1) o.dress = l.dress; if (l.longHair === 0 || l.longHair === 1) o.longHair = l.longHair; if (typeof l.width === 'number') o.width = clamp(l.width, .7, 1.5); } return o; }
export function rgbToHex(c) { return '#' + c.map((n) => Math.round(clamp(n, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
export function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return [.5, .5, .5]; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function effectiveColor(ch, k) { return (ch.colors && ch.colors[k]) || (PRESETS[ch.preset] || PRESETS.detective)[k]; }
export { COLOR_KEYS };
// سبک‌های حرکت: cad تندی گام، amp دامنهٔ گام، bob پرش بدن، lean تمایل، arm تاب دست، sway کج‌شدن بدن، crouch خمیدگی، stiff حرکت رباتی، run ضریب دویدن
export const GAIT_BASE = { cad: 1, amp: 1, bob: 1, lean: 1, arm: 1, sway: 0, crouch: 0, stiff: 0, run: 2.2 };
export const GAIT_STYLES = {
  normal: { label: 'عادی', ...GAIT_BASE },
  march: { label: 'رژه / نظامی', ...GAIT_BASE, cad: .9, amp: 1.2, bob: .6, lean: 0, arm: 1.5, stiff: .4 },
  sneak: { label: 'دزدکی', ...GAIT_BASE, cad: .7, amp: .55, bob: .35, lean: 1.4, arm: .5, crouch: .7 },
  drunk: { label: 'مست / لنگان', ...GAIT_BASE, cad: .75, amp: .8, bob: 1.4, lean: .6, arm: 1.2, sway: .16 },
  bouncy: { label: 'شاد / جهنده', ...GAIT_BASE, cad: 1.25, amp: .75, bob: 3, lean: .7, arm: 1.3 },
  model: { label: 'مدلینگ', ...GAIT_BASE, cad: 1.05, amp: .8, bob: .5, lean: 0, arm: .6, sway: .07 },
  robot: { label: 'ربات', ...GAIT_BASE, cad: 1.1, amp: 1, bob: .3, lean: 0, arm: 1, stiff: 1 },
  tired: { label: 'خسته', ...GAIT_BASE, cad: .6, amp: .5, bob: .7, lean: 2, arm: .4, crouch: .25 },
};
const GRANGE = { cad: [.4, 2], amp: [.2, 1.8], bob: [0, 4], lean: [0, 3], arm: [0, 2], sway: [0, .3], crouch: [0, 1], stiff: [0, 1], run: [1.4, 3.6] };
export function cleanGait(g) { const o = { style: 'normal', ...GAIT_BASE }; if (g && typeof g === 'object') { if (g.style in GAIT_STYLES || g.style === 'custom') o.style = g.style; for (const k in GRANGE) { const v = +g[k]; if (isFinite(v) && g[k] !== null && g[k] !== '') o[k] = clamp(v, GRANGE[k][0], GRANGE[k][1]); } } return o; }
export function gaitOf(ch) { return ch.gait || GAIT_STYLES.normal; }
export function applyGaitStyle(ch, name) { const st = GAIT_STYLES[name] || GAIT_STYLES.normal; ch.gait = cleanGait({ ...st, style: name, run: (ch.gait && ch.gait.run) || 2.2 }); }
const SRANGE = { head: [.6, 1.8], legs: [.7, 1.4], arms: [.6, 1.5], torso: [.7, 1.4] };
export function cleanShape(sh) { const o = { head: 1, legs: 1, arms: 1, torso: 1 }; if (sh && typeof sh === 'object') for (const k in SRANGE) { const v = +sh[k]; if (isFinite(v) && sh[k] !== null && sh[k] !== '') o[k] = clamp(v, SRANGE[k][0], SRANGE[k][1]); } return o; }
export function cleanSprite(sp) { if (!sp || typeof sp !== 'object' || typeof sp.data !== 'string' || !/^data:image\/(png|webp);base64,/.test(sp.data) || sp.data.length > 900000) return null; const w = clamp(+sp.w || 0, 8, 1024), h = clamp(+sp.h || 0, 8, 1024); return { data: sp.data, w, h, size: clamp(+sp.size || 1, .4, 2.5), mirror: sp.mirror === 0 ? 0 : 1, ver: (sp.ver | 0) || 1 }; }
let nextId = 1;
export function makeCharacter(o = {}) {
  const p = PRESETS[o.preset] || PRESETS.detective;
  return {
    id: o.id || 'c' + (nextId++), name: o.name || p.label, preset: o.preset in PRESETS ? o.preset : 'detective',
    x: o.x ?? 0, z: o.z ?? -6, heading: o.heading ?? Math.PI, speed: o.speed ?? 1.5, scale: o.scale ?? 1,
    voice: Object.assign({ gender: p.gender, pitch: VOICE_BASE[p.gender].f0, rate: 1 }, o.voice || {}),
    path: [], phase: 0, state: 'idle', talk: 0, mouth: 0, vx: 0, vz: 0, colors: cleanColors(o.colors), look: cleanLook(o.look), gait: cleanGait(o.gait), shape: cleanShape(o.shape), sprite: cleanSprite(o.sprite), _gait: 0,
  };
}
// حرکت به نقطه: صف مسیر (waypoints)
export function walkTo(ch, x, z, run = false, append = false) { const c = clampWalk(x, z); if (!append) ch.path.length = 0; ch.path.push({ x: c.x, z: c.z, run }); }
export function stop(ch) { ch.path.length = 0; }

export function stepCharacter(ch, dt, input) {
  let vx = 0, vz = 0, speed = 0;
  if (input && (input.x || input.z)) {                       // جوی‌استیک/کیبورد (مستقیم)
    const l = Math.hypot(input.x, input.z) || 1; vx = input.x / l; vz = input.z / l; speed = ch.speed * (input.run ? gaitOf(ch).run : 1) * Math.min(1, l); ch.path.length = 0;
  } else if (ch.path.length) {
    const t = ch.path[0], dx = t.x - ch.x, dz = t.z - ch.z, d = Math.hypot(dx, dz);
    if (d < .15) ch.path.shift(); else { vx = dx / d; vz = dz / d; speed = ch.speed * (t.run ? gaitOf(ch).run : 1) * clamp(d / .8, .35, 1); }
  }
  if (speed > 0) {
    const nx = ch.x + vx * speed * dt, nz = ch.z + vz * speed * dt, c = clampWalk(nx, nz);
    ch.x = c.x; ch.z = c.z;
    const tgt = Math.atan2(vx, vz); ch.heading += angDiff(ch.heading, tgt) * clamp(dt * 9, 0, 1);
    ch.phase += dt * speed * 2.6 / Math.max(.6, ch.scale) * gaitOf(ch).cad; ch.state = speed > ch.speed * Math.min(1.6, (gaitOf(ch).run + 1) / 2) ? 'run' : 'walk';
  } else { ch.state = 'idle'; ch.phase += dt * 1.1; }
  ch.vx = vx * speed; ch.vz = vz * speed;
  ch._gait += (((speed > 0 ? 1 : 0)) - ch._gait) * clamp(dt * 8, 0, 1);
  ch.talk += (((ch.mouth > 0.02) ? 1 : 0) - ch.talk) * clamp(dt * 10, 0, 1);
}

// قطعات رسم‌شدنی: {m: ماتریس مدل, c: رنگ, s: 0 مکعب / 1 کره, e: نورانی}
export function characterParts(ch, t) {
  const P0 = PRESETS[ch.preset] || PRESETS.detective, L = ch.look || {}, P = { ...P0, ...(L.hat !== undefined ? { hatKind: L.hat } : {}), ...(L.dress !== undefined ? { dress: L.dress } : {}), ...(L.longHair !== undefined ? { longHair: L.longHair } : {}), ...(ch.colors && ch.colors.skin ? { skin: ch.colors.skin } : {}) }, K = ch.colors || {}, col = (k) => K[k] || P[k], W = L.width || 1;
  const GT = gaitOf(ch), SH = ch.shape || { head: 1, legs: 1, arms: 1, torso: 1 }, LS = SH.legs, AS = SH.arms, HIP = .92 * LS, sf = (a) => GT.stiff ? Math.sin(a) * (1 - GT.stiff) + Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), .3) * GT.stiff : Math.sin(a);
  const parts = [], g = ch._gait, run = ch.state === 'run' ? 1.6 : 1, ph = ch.phase;
  const H = ch.scale * P.height, add = (m, c, s = 0, e = 0) => parts.push({ m, c, s, e });
  const root = chain(trans(ch.x, 0, ch.z), rotY(ch.heading), scale(H * W, H, H * W));
  const swing = sf(ph) * .75 * g * run * GT.amp, swing2 = sf(ph + Math.PI) * .75 * g * run * GT.amp;
  const bob = (Math.abs(Math.sin(ph)) * .045 * g * run * GT.bob) + Math.sin(ph * .9) * .006 * (1 - g) - GT.crouch * .13;
  const lean = (.06 * g * run + (ch.state === 'run' ? .12 : 0)) * GT.lean + GT.crouch * .25;
  const limb = (x, y, z, ang, ang2, len1, len2, w, c1, c2, kneeFwd = 1) => {
    const base = chain(root, trans(x, y + bob, z), rotX(ang));
    add(chain(base, trans(0, -len1 / 2, 0), scale(w, len1, w)), c1);
    const k = chain(base, trans(0, -len1, 0), rotX(ang2 * kneeFwd));
    add(chain(k, trans(0, -len2 / 2, 0), scale(w * .92, len2, w * .92)), c2);
    return k;
  };
  // پاها
  const dress = P.dress, legC = dress ? P.skin : P.pants;
  const kneeL = Math.max(0, -swing) * .9 * g + GT.crouch * .5, kneeR = Math.max(0, -swing2) * .9 * g + GT.crouch * .5;
  { const k = limb(-.11, HIP, 0, swing, kneeL, .46 * LS, .46 * LS, .15, legC, legC, 1); add(chain(k, trans(0, -.46 * LS - .04, .06), scale(.16, .09, .3)), col('shoes')); }
  { const k = limb(.11, HIP, 0, swing2, kneeR, .46 * LS, .46 * LS, .15, legC, legC, 1); add(chain(k, trans(0, -.46 * LS - .04, .06), scale(.16, .09, .3)), col('shoes')); }
  // تنه (پالتو/لباس)
  const torso = chain(root, trans(0, HIP + bob, 0), rotX(lean), rotZ(Math.sin(ph) * GT.sway * g), scale(SH.torso, 1, SH.torso));
  add(chain(torso, trans(0, .3, 0), scale(.42, .6, .26)), col('coat'));
  if (dress) add(chain(root, trans(0, HIP - .2 + bob, 0), scale(.52 * SH.torso, .42, .34 * SH.torso)), col('coat'));
  else add(chain(torso, trans(0, .02, 0), scale(.44, .14, .28)), col('pants'));
  if (P.longHair) add(chain(torso, trans(0, .46, -.17), scale(.34, .55, .1)), col('hair'));
  // بازوها
  const armC = col('coat'), asw = (-swing2 * .8 * GT.arm / GT.amp), asw2 = (-swing * .8 * GT.arm / GT.amp);
  { const sh = chain(torso, trans(-.29, .56, 0), rotX(asw)); add(chain(sh, trans(0, -.22 * AS, 0), scale(.1, .44 * AS, .11)), armC); add(chain(sh, trans(0, -.48 * AS, .02), scale(.09, .1, .1)), P.skin); }
  { const raise = ch.talk * (.5 + Math.sin(t * 6) * .12); const sh = chain(torso, trans(.29, .56, 0), rotX(asw2 - raise)); add(chain(sh, trans(0, -.22 * AS, 0), scale(.1, .44 * AS, .11)), armC); add(chain(sh, trans(0, -.48 * AS, .02), scale(.09, .1, .1)), P.skin); }
  // سر
  const nod = Math.sin(t * 7) * .05 * ch.talk + Math.sin(ph * 2) * .02 * g;
  const head = chain(torso, trans(0, .66, 0.01), rotX(-lean * .6 + nod), scale(SH.head / SH.torso, SH.head, SH.head / SH.torso));
  add(chain(head, trans(0, -.02, 0), scale(.14, .08, .14)), col('scarf'), 0);                 // شال/یقه
  add(chain(head, trans(0, .15, 0), scale(.3, .34, .3)), P.skin, 1);                           // کلهٔ کروی
  const eyeC = P.robot ? [1, .2, .1] : [.05, .05, .06];
  add(chain(head, trans(-.065, .17, .135), scale(.05, .035, .03)), eyeC, 0, P.robot ? 2.5 : 0);
  add(chain(head, trans(.065, .17, .135), scale(.05, .035, .03)), eyeC, 0, P.robot ? 2.5 : 0);
  const mo = clamp(ch.mouth, 0, 1); add(chain(head, trans(0, .075, .14), scale(.09, .015 + mo * .07, .03)), [.25, .03, .04]);
  if (!P.robot) add(chain(head, trans(0, .31, -.01), scale(.3, .14, .31)), col('hair'), 1);   // مو
  if (P.hatKind === 'fedora') { add(chain(head, trans(0, .33, 0), scale(.46, .035, .46)), col('hat')); add(chain(head, trans(0, .4, 0), scale(.28, .14, .28)), col('hat')); add(chain(head, trans(0, .35, 0), scale(.29, .03, .29)), col('scarf')); }
  else if (P.hatKind === 'cap') { add(chain(head, trans(0, .37, 0), scale(.31, .1, .31)), col('hat')); add(chain(head, trans(0, .33, .2), scale(.22, .02, .14)), col('hat')); }
  else if (P.hatKind === 'antenna') { add(chain(head, trans(0, .46, 0), scale(.03, .22, .03)), [.4, .4, .4]); add(chain(head, trans(0, .58, 0), scale(.07, .07, .07)), [1, .1, .1], 1, 2.2); }
  return parts;
}
export function hitCharacter(ch, rayO, rayD) {    // کپسول تقریبی برای انتخاب با لمس
  const cx = ch.x, cz = ch.z, r = .55 * ch.scale, top = 1.9 * ch.scale;
  for (let s = 0; s <= 6; s++) { const y = top * s / 6, ox = rayO[0] - cx, oy = rayO[1] - y, oz = rayO[2] - cz; const b = ox * rayD[0] + oy * rayD[1] + oz * rayD[2], c = ox * ox + oy * oy + oz * oz - r * r, d = b * b - c; if (d >= 0 && -b - Math.sqrt(d) > 0) return -b - Math.sqrt(d); }
  return -1;
}
