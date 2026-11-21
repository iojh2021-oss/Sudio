// محیط‌های طبیعی: جنگل، بیابان، برف، دشت، ساحل، کوهستان — بی‌پایان و قطعی مثل شهر (قطعه‌های ۴۸ متری)
import { rng, hash32, clamp } from './util.js';
import { makeChunk, CH, STRIDE, KIND, chunkZ0, chunkZ1 } from './world.js';

export const BIOMES = {
  city: { id: 'city', n: 0, label: 'شهر', walk: 10.5 },
  forest: { id: 'forest', n: 1, label: 'جنگل', walk: 3.6, g1: [.1, .2, .07], g2: [.17, .28, .09], path: [.3, .21, .12], fog: .95, fogC: [.55, .68, .55] },
  desert: { id: 'desert', n: 2, label: 'بیابان', walk: 12, g1: [.78, .6, .36], g2: [.88, .7, .43], path: [.72, .54, .32], fog: .55, fogC: [.95, .8, .6] },
  snow: { id: 'snow', n: 3, label: 'برفی', walk: 8, g1: [.86, .89, .94], g2: [.97, .98, 1], path: [.68, .73, .8], fog: 1.5, fogC: [.86, .9, .96] },
  meadow: { id: 'meadow', n: 4, label: 'دشت', walk: 9, g1: [.18, .38, .1], g2: [.32, .52, .15], path: [.45, .34, .2], fog: .8, fogC: [.72, .83, .92] },
  beach: { id: 'beach', n: 5, label: 'ساحل', walk: 12, g1: [.82, .72, .5], g2: [.92, .82, .62], path: [.72, .62, .44], fog: .7, fogC: [.82, .9, .94], water: 1 },
  mountain: { id: 'mountain', n: 6, label: 'کوهستان', walk: 7, g1: [.3, .3, .28], g2: [.43, .41, .37], path: [.5, .46, .4], fog: 1.1, fogC: [.7, .76, .85] },
};
export const BIOME_IDS = Object.keys(BIOMES);

const push = (a, x, y, z, sx, sy, sz, c, kind = KIND.SOLID, lit = 0) => a.push(x, y, z, sx, sy, sz, c[0], c[1], c[2], kind, lit, 0, 0, 0);
const vary = (c, v) => [c[0] * v, c[1] * v, c[2] * v];

function pine(a, x, z, s, snowy, R) {
  const g = snowy ? [.62, .74, .68] : [.07 + R() * .05, .22 + R() * .1, .1 + R() * .05];
  push(a, x, 1.1 * s, z, .55 * s, 2.2 * s, .55 * s, [.2, .13, .08]);
  for (let t = 0; t < 4; t++) {
    const w = (4.4 - t * 1.0) * s; push(a, x, (2.4 + t * 1.5) * s, z, w, 1.9 * s, w, vary(g, 1 - t * .04));
    if (snowy) push(a, x, (3.3 + t * 1.5) * s, z, w * .8, .3 * s, w * .8, [.95, .97, 1]);
  }
}
function broadleaf(a, x, z, s, R) {
  const g = [.1 + R() * .08, .26 + R() * .14, .07 + R() * .05];
  push(a, x, 1.8 * s, z, .7 * s, 3.6 * s, .7 * s, [.24, .16, .1]);
  push(a, x, 4.8 * s, z, 4.4 * s, 3.2 * s, 4.4 * s, g); push(a, x + .4 * s, 7 * s, z - .3 * s, 3 * s, 2 * s, 3 * s, vary(g, 1.15));
}
function palm(a, x, z, s) {
  for (let i = 0; i < 6; i++) push(a, x + i * .08 * s, (.6 + i * 1.2) * s, z, (.5 - i * .03) * s, 1.25 * s, (.5 - i * .03) * s, i % 2 ? [.4, .28, .16] : [.33, .22, .12]);
  const gc = [.1, .38, .12], top = 7.4 * s; push(a, x + .5 * s, top, z, 5.4 * s, .18 * s, 1.1 * s, gc); push(a, x + .5 * s, top, z, 1.1 * s, .18 * s, 5.4 * s, gc);
  push(a, x + .5 * s, top - .5 * s, z, 3.6 * s, .16 * s, .9 * s, vary(gc, .8)); push(a, x + .5 * s, top - .5 * s, z, .9 * s, .16 * s, 3.6 * s, vary(gc, .8));
}
function cactus(a, x, z, s) {
  const c = [.12, .34, .15]; push(a, x, 1.6 * s, z, .75 * s, 3.2 * s, .75 * s, c);
  push(a, x + .8 * s, 2 * s, z, 1.2 * s, .5 * s, .5 * s, c); push(a, x + 1.25 * s, 2.7 * s, z, .5 * s, 1.4 * s, .5 * s, c);
  push(a, x - .7 * s, 1.5 * s, z, 1 * s, .45 * s, .45 * s, c); push(a, x - 1.05 * s, 2.1 * s, z, .45 * s, 1.1 * s, .45 * s, c);
}
function rock(a, x, z, s, col, R) { push(a, x, .45 * s, z, (1.6 + R()) * s, .9 * s, (1.3 + R()) * s, vary(col, .9 + R() * .2)); if (R() < .6) push(a, x + .2 * s, 1.05 * s, z, 1 * s, .6 * s, .9 * s, vary(col, 1.1)); }
function range(a, x, z, w, h, col, cap, R) {      // کوه/تپهٔ پلکانی دور
  push(a, x, h * .3, z, w, h * .6, w * .8, col); push(a, x + (R() - .5) * w * .2, h * .62, z, w * .62, h * .5, w * .5, vary(col, 1.05));
  push(a, x, h * .93, z, w * .3, h * .3, w * .28, cap ? [.95, .97, 1] : vary(col, 1.12));
}

export function makeNatureChunk(seed, k, biome, opts = {}) {
  const B = BIOMES[biome] || BIOMES.forest, R = rng(hash32(seed ^ Math.imul(k + 5, 0x1b873593) ^ B.n * 7919));
  const a = [], lights = [], z0 = chunkZ0(k), z1 = chunkZ1(k), id = B.id, min = B.walk + 1.2;
  const rz = () => z0 + R() * CH, side = () => (R() < .5 ? -1 : 1);
  const xs = (span) => min + 3.6 + Math.pow(R(), 1.5) * span;                       // نزدیک‌تر پرتراکم‌تر
  const seaX = 22;                                                           // ساحل: دریا از x>۲۲
  // پس‌زمینهٔ دور (کوه/تپه/مِسا)
  for (let i = 0; i < 3; i++) {
    const sx = (id === 'beach') ? -1 : side(), x = sx * (70 + R() * 90), z = rz();
    if (id === 'forest') range(a, x, z, 40 + R() * 40, 18 + R() * 25, [.06, .17, .1], false, R);
    else if (id === 'desert') range(a, x, z, 30 + R() * 30, 14 + R() * 26, [.62, .36, .2], false, R);
    else if (id === 'snow') range(a, x, z, 50 + R() * 40, 30 + R() * 40, [.78, .82, .9], true, R);
    else if (id === 'meadow') range(a, x, z, 60 + R() * 50, 8 + R() * 16, [.2, .38, .16], false, R);
    else if (id === 'beach') range(a, x, z, 50 + R() * 40, 10 + R() * 14, [.2, .36, .2], false, R);
    else range(a, x, z, 40 + R() * 30, 50 + R() * 60, [.36, .34, .34], true, R);
  }
  if (id === 'mountain') for (let i = 0; i < 4; i++) { const sx = side(), x = sx * (min + 6 + R() * 20); range(a, x, rz(), 14 + R() * 14, 14 + R() * 30, [.38, .36, .34], R() < .5, R); }
  if (id === 'forest') {
    for (let i = 0; i < 34; i++) { const x = side() * xs(50), z = rz(); if (R() < .65) pine(a, x, z, .8 + R() * .8, false, R); else broadleaf(a, x, z, .8 + R() * .7, R); }
    for (let i = 0; i < 14; i++) rock(a, side() * xs(30), rz(), .5 + R() * .8, [.3, .3, .28], R);
    for (let i = 0; i < 24; i++) { const x = side() * (min - 1 + R() * 20), z = rz(); push(a, x, .35, z, .7 + R() * .5, .7, .7 + R() * .5, [.08, .22 + R() * .1, .08]); }          // بوته
    if (k % 4 === 1) { const x = side() * (B.walk + 4.5), z = rz(); push(a, x, .15, z, 1.4, .3, 1.4, [.12, .1, .08]); push(a, x, .45, z, .6, .55, .6, [1, .55, .15], KIND.EMISSIVE, 1); lights.push(x, 1, z, 1, .55, .22, 13, 1); }   // آتش
  } else if (id === 'desert') {
    for (let i = 0; i < 9; i++) { const x = side() * (min + 10 + R() * 60), z = rz(), w = 14 + R() * 24, d = 12 + R() * 18, hh = 1.5 + R() * 3, c = vary([.78, .6, .37], .9 + R() * .15); push(a, x, hh * .3, z, w, hh * .6, d, c); push(a, x, hh * .75, z, w * .62, hh * .8, d * .62, vary(c, 1.04)); push(a, x, hh * 1.2, z, w * .26, hh * .6, d * .26, vary(c, 1.08)); }   // تپهٔ شنی پلکانی
    for (let i = 0; i < 10; i++) cactus(a, side() * (min + 1 + R() * 40), rz(), .7 + R() * .8);
    for (let i = 0; i < 12; i++) rock(a, side() * xs(50), rz(), .5 + R() * 1.2, [.55, .36, .25], R);
    for (let i = 0; i < 4; i++) { const x = side() * (min + 2 + R() * 14), z = rz(); push(a, x, .25, z, .8, .5, .8, [.35, .28, .14]); }
  } else if (id === 'snow') {
    for (let i = 0; i < 26; i++) pine(a, side() * xs(45), rz(), .8 + R() * .9, true, R);
    for (let i = 0; i < 12; i++) { const x = side() * (min - 1 + R() * 40), z = rz(); push(a, x, .3 + R() * .3, z, 2 + R() * 4, .6 + R() * .5, 2 + R() * 3, [.97, .98, 1]); }   // تپه‌های برف
    for (let i = 0; i < 8; i++) rock(a, side() * xs(40), rz(), .6 + R(), [.42, .44, .48], R);
    if (k % 3 === 0) { const x = side() * (B.walk + 2), z = rz(); push(a, x, .5, z, .9, 1, .9, [1, 1, 1]); push(a, x, 1.3, z, .7, .7, .7, [1, 1, 1]); push(a, x, 1.9, z, .5, .5, .5, [1, 1, 1]); push(a, x, 2.3, z, .55, .25, .55, [.08, .08, .1]); push(a, x, 1.3, z + .36, .1, .1, .1, [.9, .35, .1]); }   // آدم‌برفی
  } else if (id === 'meadow') {
    for (let i = 0; i < 12; i++) broadleaf(a, side() * (min + 5 + Math.pow(R(), 1.3) * 55), rz(), .8 + R() * .7, R);
    for (let i = 0; i < 70; i++) { const x = side() * (1.2 + R() * 40), z = rz(), c = [[1, .9, .2], [.95, .3, .4], [.95, .95, .98], [.6, .4, .9]][Math.floor(R() * 4)]; push(a, x, .22, z, .16, .26, .16, c); push(a, x, .08, z, .05, .3, .05, [.1, .3, .08]); }
    for (let i = 0; i < 40; i++) { const x = side() * (.8 + R() * 30), z = rz(); push(a, x, .28, z, .08, .56, .08, [.15, .38 + R() * .15, .08]); }
    for (let zz = z1 - 1.5; zz > z0; zz -= 3) for (const s of [-1, 1]) { push(a, s * (B.walk + .4), .55, zz, .14, 1.1, .14, [.35, .24, .14]); push(a, s * (B.walk + .4), .8, zz - 1.5, .08, .1, 3, [.4, .28, .16]); }   // نرده
    if (k % 5 === 2) { const s = side(), x = s * (min + 12), z = z0 + CH / 2; push(a, x, 2, z, 7, 4, 6, [.78, .7, .56]); push(a, x, 4.7, z, 8, 1.4, 7, [.48, .15, .12]); push(a, x, 5.7, z, 5, 1.2, 5, [.52, .17, .13]); push(a, x - s * 3.52, 1.4, z, .1, .9, 1.2, [1, .8, .4], KIND.EMISSIVE, 1); push(a, x - s * 3.52, 2.6, z + 1.8, .1, .9, 1, [1, .8, .4], KIND.EMISSIVE, 1); lights.push(x - s * 4, 2, z, 1, .8, .45, 7, 1); }
  } else if (id === 'beach') {
    for (let i = 0; i < 10; i++) palm(a, -(min + R() * 40), rz(), .8 + R() * .5);
    for (let i = 0; i < 3; i++) palm(a, 17 + R() * 4, rz(), .7 + R() * .4);
    for (let i = 0; i < 10; i++) rock(a, -(min + R() * 30), rz(), .5 + R() * .9, [.45, .42, .38], R);
    for (let i = 0; i < 2; i++) { const x = 8 + R() * 6, z = rz(), c = [[.9, .15, .15], [.95, .85, .2], [.2, .5, .9]][Math.floor(R() * 3)]; push(a, x, 1.2, z, .1, 2.4, .1, [.8, .8, .8]); push(a, x, 2.5, z, 2.8, .22, 2.8, c); push(a, x + 1.1, .12, z + 1.4, .9, .12, 2, vary(c, .9)); }
    for (let i = 0; i < 1; i++) { const x = seaX + 14 + R() * 20, z = rz(); push(a, x, .5, z, 1.8, 1, 5.5, [.3, .2, .12]); push(a, x, 3, z, .12, 4.4, .12, [.25, .17, .1]); push(a, x, 3.4, z + .3, .08, 3, 2.4, [.95, .95, .9]); }
    for (let i = 0; i < 8; i++) { const x = -(2 + R() * 20), z = rz(); push(a, x, .08, z, .45, .16, .3, [.95, .7 + R() * .2, .65]); }
  } else if (id === 'mountain') {
    for (let i = 0; i < 18; i++) pine(a, side() * xs(40), rz(), .6 + R() * .7, R() < .3, R);
    for (let i = 0; i < 24; i++) rock(a, side() * (min - .6 + R() * 35), rz(), .7 + R() * 1.6, [.38, .37, .35], R);
    if (k % 4 === 2) { const x = side() * (B.walk + 2.5), z = rz(); push(a, x, .1, z, 1.4, .2, 1.4, [.1, .09, .08]); push(a, x, .4, z, .6, .5, .6, [1, .55, .15], KIND.EMISSIVE, 1); lights.push(x, 1, z, 1, .55, .22, 13, 1); }
  }
  return { k, z0, z1, boxes: new Float32Array(a), count: a.length / STRIDE, lights: new Float32Array(lights), nLights: lights.length / 8, district: id, inter: false };
}
export function makeAnyChunk(seed, k, opts = {}) {
  const b = opts.biome || 'city';
  return b === 'city' || !BIOMES[b] ? makeChunk(seed, k, opts) : makeNatureChunk(seed, k, b, opts);
}
