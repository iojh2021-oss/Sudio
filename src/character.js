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

const COLOR_KEYS = ['coat', 'pants', 'skin', 'hair', 'hat', 'scarf', 'shoes', 'eyes', 'accent'];
const EXTRA_COL = { eyes: [.05, .05, .06], accent: [.8, .65, .15] };
export const HAIRS = [['', 'پیش‌فرض نقش'], ['bald', 'بدون مو'], ['short', 'کوتاه'], ['bun', 'جمع‌شده (گیس)'], ['mohawk', 'موهاک'], ['afro', 'پرپشت']];
// سبک‌های حرکت؛ هر عدد ضریب است (۱ = حرکت اصلی). کاربر می‌تواند هر عدد را جداگانه تغییر دهد.
export const MOTION_BASE = { stride: 1, arms: 1, bounce: 1, lean: 0, sway: 0, cadence: 1 };
export const MOTION_STYLES = {
  normal: { label: 'عادی', p: {} },
  sneak: { label: 'دزدکی', p: { stride: .6, arms: .4, bounce: .4, lean: .3, cadence: .8 } },
  march: { label: 'رژه', p: { stride: 1.2, arms: 1.5, bounce: 1.2, cadence: 1.1 } },
  drunk: { label: 'مست', p: { stride: .8, arms: 1.3, bounce: .8, lean: .08, sway: .22, cadence: .8 } },
  bouncy: { label: 'پرانرژی', p: { stride: 1.1, arms: 1.2, bounce: 3, cadence: 1.25 } },
  robot: { label: 'رباتی', p: { stride: .8, arms: .3, bounce: 0, cadence: 1 } },
  catwalk: { label: 'کت‌واک', p: { stride: 1.1, arms: .7, bounce: .5, sway: .1, cadence: .9 } },
  tired: { label: 'خسته', p: { stride: .55, arms: .5, bounce: .3, lean: .22, cadence: .7 } },
};
export const MOTION_KEYS = Object.keys(MOTION_BASE);
function cleanMotion(m) {
  if (!m || typeof m !== 'object') return null; const o = {};
  if (typeof m.style === 'string' && m.style in MOTION_STYLES && m.style !== 'normal') o.style = m.style;
  const R = { stride: [0, 2], arms: [0, 2.5], bounce: [0, 4], lean: [-.3, .6], sway: [0, .5], cadence: [.4, 2] };
  for (const k of MOTION_KEYS) if (typeof m[k] === 'number' && isFinite(m[k])) o[k] = clamp(m[k], R[k][0], R[k][1]);
  return Object.keys(o).length ? o : null;
}
const NORMAL_MOTION = { ...MOTION_BASE };
export function motionOf(ch) { const m = ch.motion; if (!m) return NORMAL_MOTION; const st = (MOTION_STYLES[m.style] || MOTION_STYLES.normal).p; return { ...MOTION_BASE, ...st, ...m }; }
// شخصیت تصویری (آپلود): تصویر کوچک‌شدهٔ data: + ارتفاع به متر
function cleanSprite(s) {
  if (!s || typeof s !== 'object' || typeof s.src !== 'string' || !/^data:image\/(png|webp|jpeg);base64,/.test(s.src) || s.src.length > 2.5e6) return null;
  return { src: s.src, h: clamp(Number(s.h) || 1.8, .3, 5), faceLeft: !!s.faceLeft };
}
export const HATS = [['', 'پیش‌فرض نقش'], ['none', 'بدون کلاه'], ['fedora', 'کلاه شاپو'], ['cap', 'کلاه لبه‌دار'], ['antenna', 'آنتن']];
function cleanColors(c) { if (!c || typeof c !== 'object') return null; const o = {}; for (const k of COLOR_KEYS) { const v = c[k]; if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && isFinite(n))) o[k] = v.map((n) => clamp(n, 0, 1)); } return Object.keys(o).length ? o : null; }
function cleanLook(l) { const o = {}; if (l && typeof l === 'object') { if (['none', 'fedora', 'cap', 'antenna'].includes(l.hat)) o.hat = l.hat; if (l.dress === 0 || l.dress === 1) o.dress = l.dress; if (l.longHair === 0 || l.longHair === 1) o.longHair = l.longHair; if (typeof l.width === 'number') o.width = clamp(l.width, .7, 1.5);
    for (const [k, a, b] of [['headSize', .75, 1.5], ['legs', .8, 1.35], ['arms', .8, 1.35]]) if (typeof l[k] === 'number' && isFinite(l[k])) o[k] = clamp(l[k], a, b);
    if (['bald', 'short', 'bun', 'mohawk', 'afro'].includes(l.hairStyle)) o.hairStyle = l.hairStyle;
    for (const k of ['glasses', 'beard', 'backpack', 'cape', 'glow']) if (l[k] === 0 || l[k] === 1) o[k] = l[k]; } return o; }
export function rgbToHex(c) { return '#' + c.map((n) => Math.round(clamp(n, 0, 1) * 255).toString(16).padStart(2, '0')).join(''); }
export function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h); if (!m) return [.5, .5, .5]; const n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
export function effectiveColor(ch, k) { return (ch.colors && ch.colors[k]) || (PRESETS[ch.preset] || PRESETS.detective)[k] || EXTRA_COL[k]; }
export { COLOR_KEYS };
let nextId = 1;
export function makeCharacter(o = {}) {
  const p = PRESETS[o.preset] || PRESETS.detective;
  return {
    id: o.id || 'c' + (nextId++), name: o.name || p.label, preset: o.preset in PRESETS ? o.preset : 'detective',
    x: o.x ?? 0, z: o.z ?? -6, heading: o.heading ?? Math.PI, speed: o.speed ?? 1.5, scale: o.scale ?? 1,
    voice: Object.assign({ gender: p.gender, pitch: VOICE_BASE[p.gender].f0, rate: 1 }, o.voice || {}),
    path: [], phase: 0, state: 'idle', talk: 0, mouth: 0, vx: 0, vz: 0, colors: cleanColors(o.colors), look: cleanLook(o.look), motion: cleanMotion(o.motion), sprite: cleanSprite(o.sprite), _gait: 0,
  };
}
// حرکت به نقطه: صف مسیر (waypoints)
export function walkTo(ch, x, z, run = false, append = false) { const c = clampWalk(x, z); if (!append) ch.path.length = 0; ch.path.push({ x: c.x, z: c.z, run }); }
export function stop(ch) { ch.path.length = 0; }

export function stepCharacter(ch, dt, input) {
  let vx = 0, vz = 0, speed = 0;
  if (input && (input.x || input.z)) {                       // جوی‌استیک/کیبورد (مستقیم)
    const l = Math.hypot(input.x, input.z) || 1; vx = input.x / l; vz = input.z / l; speed = ch.speed * (input.run ? 2.2 : 1) * Math.min(1, l); ch.path.length = 0;
  } else if (ch.path.length) {
    const t = ch.path[0], dx = t.x - ch.x, dz = t.z - ch.z, d = Math.hypot(dx, dz);
    if (d < .15) ch.path.shift(); else { vx = dx / d; vz = dz / d; speed = ch.speed * (t.run ? 2.2 : 1) * clamp(d / .8, .35, 1); }
  }
  if (speed > 0) {
    const nx = ch.x + vx * speed * dt, nz = ch.z + vz * speed * dt, c = clampWalk(nx, nz);
    ch.x = c.x; ch.z = c.z;
    const tgt = Math.atan2(vx, vz); ch.heading += angDiff(ch.heading, tgt) * clamp(dt * 9, 0, 1);
    ch.phase += dt * speed * 2.6 / Math.max(.6, ch.scale) * motionOf(ch).cadence; ch.state = speed > ch.speed * 1.6 ? 'run' : 'walk';
  } else { ch.state = 'idle'; ch.phase += dt * 1.1; }
  ch.vx = vx * speed; ch.vz = vz * speed;
  ch._gait += (((speed > 0 ? 1 : 0)) - ch._gait) * clamp(dt * 8, 0, 1);
  ch.talk += (((ch.mouth > 0.02) ? 1 : 0) - ch.talk) * clamp(dt * 10, 0, 1);
}

// قطعات رسم‌شدنی: {m: ماتریس مدل, c: رنگ, s: 0 مکعب / 1 کره, e: نورانی}
export function characterParts(ch, t) {
  const P0 = PRESETS[ch.preset] || PRESETS.detective, L = ch.look || {}, P = { ...P0, ...(L.hat !== undefined ? { hatKind: L.hat } : {}), ...(L.dress !== undefined ? { dress: L.dress } : {}), ...(L.longHair !== undefined ? { longHair: L.longHair } : {}), ...(ch.colors && ch.colors.skin ? { skin: ch.colors.skin } : {}) }, K = ch.colors || {}, col = (k) => K[k] || P[k], W = L.width || 1;
  const parts = [], g = ch._gait, run = ch.state === 'run' ? 1.6 : 1, ph = ch.phase, MO = motionOf(ch), lg = L.legs || 1, am = L.arms || 1, hy = .92 * lg, acc = effectiveColor(ch, 'accent');
  const H = ch.scale * P.height, add = (m, c, s = 0, e = 0) => parts.push({ m, c, s, e });
  const root = chain(trans(ch.x, 0, ch.z), rotY(ch.heading), rotZ(Math.sin(ph) * MO.sway * g), scale(H * W, H, H * W));
  const swing = Math.sin(ph) * .75 * g * run * MO.stride, swing2 = Math.sin(ph + Math.PI) * .75 * g * run * MO.stride;
  const bob = (Math.abs(Math.sin(ph)) * .045 * g * run * MO.bounce) + Math.sin(ph * .9) * .006 * (1 - g);
  const lean = .06 * g * run + (ch.state === 'run' ? .12 : 0) + MO.lean * g;
  const limb = (x, y, z, ang, ang2, len1, len2, w, c1, c2, kneeFwd = 1) => {
    const base = chain(root, trans(x, y + bob, z), rotX(ang));
    add(chain(base, trans(0, -len1 / 2, 0), scale(w, len1, w)), c1);
    const k = chain(base, trans(0, -len1, 0), rotX(ang2 * kneeFwd));
    add(chain(k, trans(0, -len2 / 2, 0), scale(w * .92, len2, w * .92)), c2);
    return k;
  };
  // پاها
  const dress = P.dress, legC = dress ? P.skin : P.pants;
  const kneeL = Math.max(0, -swing) * .9 * g, kneeR = Math.max(0, -swing2) * .9 * g;
  { const k = limb(-.11, hy, 0, swing, kneeL, .46 * lg, .46 * lg, .15, legC, legC, 1); add(chain(k, trans(0, -(.46 * lg + .04), .06), scale(.16, .09, .3)), col('shoes')); }
  { const k = limb(.11, hy, 0, swing2, kneeR, .46 * lg, .46 * lg, .15, legC, legC, 1); add(chain(k, trans(0, -(.46 * lg + .04), .06), scale(.16, .09, .3)), col('shoes')); }
  // تنه (پالتو/لباس)
  const torso = chain(root, trans(0, hy + bob, 0), rotX(lean));
  add(chain(torso, trans(0, .3, 0), scale(.42, .6, .26)), col('coat'));
  if (dress) add(chain(root, trans(0, .72 + (hy - .92) + bob, 0), scale(.52, .42, .34)), col('coat'));
  else add(chain(torso, trans(0, .02, 0), scale(.44, .14, .28)), col('pants'));
  if (P.longHair) add(chain(torso, trans(0, .46, -.17), scale(.34, .55, .1)), col('hair'));
  // بازوها
  const armC = col('coat'), asw = (-swing2 * .8 * MO.arms / Math.max(.3, MO.stride)), asw2 = (-swing * .8 * MO.arms / Math.max(.3, MO.stride));
  { const sh = chain(torso, trans(-.29, .56, 0), rotX(asw)); add(chain(sh, trans(0, -.22 * am, 0), scale(.1, .44 * am, .11)), armC); add(chain(sh, trans(0, -.48 * am, .02), scale(.09, .1, .1)), P.skin); }
  { const raise = ch.talk * (.5 + Math.sin(t * 6) * .12); const sh = chain(torso, trans(.29, .56, 0), rotX(asw2 - raise)); add(chain(sh, trans(0, -.22 * am, 0), scale(.1, .44 * am, .11)), armC); add(chain(sh, trans(0, -.48 * am, .02), scale(.09, .1, .1)), P.skin); }
  // سر
  const nod = Math.sin(t * 7) * .05 * ch.talk + Math.sin(ph * 2) * .02 * g;
  const hsz = L.headSize || 1, head = chain(torso, trans(0, .66, 0.01), rotX(-lean * .6 + nod), scale(hsz, hsz, hsz));
  add(chain(head, trans(0, -.02, 0), scale(.14, .08, .14)), col('scarf'), 0);                 // شال/یقه
  add(chain(head, trans(0, .15, 0), scale(.3, .34, .3)), P.skin, 1);                           // کلهٔ کروی
  const glow = P.robot || L.glow === 1, eyeC = K.eyes || (P.robot ? [1, .2, .1] : [.05, .05, .06]);
  add(chain(head, trans(-.065, .17, .135), scale(.05, .035, .03)), eyeC, 0, glow ? 2.5 : 0);
  add(chain(head, trans(.065, .17, .135), scale(.05, .035, .03)), eyeC, 0, glow ? 2.5 : 0);
  const mo = clamp(ch.mouth, 0, 1); add(chain(head, trans(0, .075, .14), scale(.09, .015 + mo * .07, .03)), [.25, .03, .04]);
  const HS = L.hairStyle;                                                                       // مو
  if (!P.robot && HS !== 'bald') {
    if (HS === 'afro') add(chain(head, trans(0, .2, -.02), scale(.44, .42, .44)), col('hair'), 1); else add(chain(head, trans(0, .31, -.01), scale(.3, .14, .31)), col('hair'), 1);
    if (HS === 'bun') add(chain(head, trans(0, .4, -.12), scale(.14, .14, .14)), col('hair'), 1);
    if (HS === 'mohawk') add(chain(head, trans(0, .42, -.02), scale(.05, .15, .3)), col('hair'));
  }
  if (P.hatKind === 'fedora') { add(chain(head, trans(0, .33, 0), scale(.46, .035, .46)), col('hat')); add(chain(head, trans(0, .4, 0), scale(.28, .14, .28)), col('hat')); add(chain(head, trans(0, .35, 0), scale(.29, .03, .29)), col('scarf')); }
  else if (P.hatKind === 'cap') { add(chain(head, trans(0, .37, 0), scale(.31, .1, .31)), col('hat')); add(chain(head, trans(0, .33, .2), scale(.22, .02, .14)), col('hat')); }
  else if (P.hatKind === 'antenna') { add(chain(head, trans(0, .46, 0), scale(.03, .22, .03)), [.4, .4, .4]); add(chain(head, trans(0, .58, 0), scale(.07, .07, .07)), [1, .1, .1], 1, 2.2); }
  if (L.glasses) { add(chain(head, trans(-.065, .17, .152), scale(.085, .06, .02)), acc); add(chain(head, trans(.065, .17, .152), scale(.085, .06, .02)), acc); add(chain(head, trans(0, .175, .152), scale(.04, .015, .02)), acc); }
  if (L.beard) add(chain(head, trans(0, .035, .095), scale(.2, .1, .13)), col('hair'), 1);
  if (L.backpack) add(chain(torso, trans(0, .3, -.2), scale(.3, .42, .14)), acc);
  if (L.cape) add(chain(torso, trans(0, .55, -.15), rotX(.12 + g * .25 * run + Math.sin(ph) * .06 * g), trans(0, -.43, 0), scale(.46, .86, .04)), acc);
  return parts;
}
export function hitCharacter(ch, rayO, rayD) {    // کپسول تقریبی برای انتخاب با لمس
  const cx = ch.x, cz = ch.z, r = .55 * ch.scale, top = 1.9 * ch.scale;
  for (let s = 0; s <= 6; s++) { const y = top * s / 6, ox = rayO[0] - cx, oy = rayO[1] - y, oz = rayO[2] - cz; const b = ox * rayD[0] + oy * rayD[1] + oz * rayD[2], c = ox * ox + oy * oy + oz * oz - r * r, d = b * b - c; if (d >= 0 && -b - Math.sqrt(d) > 0) return -b - Math.sqrt(d); }
  return -1;
}
