// ترافیک سبک برای حالت «فقط تصویر AI»: عابر پیاده و دوچرخه‌سوار (ماشین‌ها از movingCars می‌آیند)
import { makeCharacter, characterParts } from './character.js';
import { chain, trans, scale, rotY } from './mat.js';
const PEDS = [['worker', -6.2, 1.2, 0], ['woman', 6.0, -1.1, 7], ['detective', -8.4, -1.4, 13], ['child', 7.6, 1.0, 21], ['woman', -5.2, -1.0, 29], ['worker', 8.8, 1.3, 37]];
const BIKES = [[-3.6, 4.2, 5], [3.6, -4.6, 31]];
const SPAN = 90;
let peds = null;
const wrap = (v, c) => ((v - c + SPAN / 2) % SPAN + SPAN) % SPAN - SPAN / 2 + c;
export function extraParts(t, cx, cz, ox, avoid, k = 1) {
  if (!peds) peds = PEDS.map(([p]) => makeCharacter({ preset: p }));
  const out = [], free = (x, z) => !avoid.some((a) => Math.abs(a.x - x) < 1.3 && Math.abs(a.z - z) < 1.6);
  PEDS.forEach(([p, dx, sp, off], i) => {
    const c = peds[i], z = wrap(off * 3 + sp * 1.25 * t * k, cz); c.x = ox + dx; c.z = z; c.heading = sp > 0 ? 0 : Math.PI; c.phase = t * 2.9 * Math.abs(sp) + i * 1.7; c._gait = 1; c.state = 'walk'; c.mouth = 0; c.vx = 0; c.vz = sp;
    if (free(c.x, z)) out.push(...characterParts(c, t));
  });
  const metal = [.08, .08, .1], tire = [.02, .02, .025];
  BIKES.forEach(([dx, sp, off], i) => {
    const z = wrap(off * 3 + sp * t * k, cz), x = ox + dx, h = sp > 0 ? 0 : Math.PI; if (!free(x, z)) return;
    const base = chain(trans(x, 0, z), rotY(h)), add = (m, c, s = 0) => out.push({ m: chain(base, m), c, s, e: 0 });
    const spin = t * sp * 2.5;
    for (const wz of [-.55, .55]) add(chain(trans(0, .34, wz), scale(.06, .68, .68)), tire, 0);
    add(chain(trans(0, .62, 0), scale(.05, .05, 1.0)), metal);
    add(chain(trans(0, .78, .22), scale(.05, .3, .05)), metal);
    add(chain(trans(0, .98, .52), scale(.36, .04, .04)), metal);
    const r = peds[(i + 2) % peds.length]; const old = [r.x, r.z, r.heading, r.scale]; r.x = x; r.z = z; r.heading = h; r.phase = spin; r._gait = .7; r.state = 'walk';
    for (const pt of characterParts(r, t)) out.push({ ...pt, m: chain(trans(0, .42, 0), pt.m) });
    [r.x, r.z, r.heading, r.scale] = old;
  });
  return out;
}
