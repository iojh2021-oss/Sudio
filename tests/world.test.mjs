import assert from 'node:assert/strict';
import { makeChunk, movingCars, CH, STRIDE, clampWalk, districtOf } from '../src/world.js';
const a = makeChunk(777, 5), b = makeChunk(777, 5), c = makeChunk(778, 5);
assert.deepEqual(a.boxes, b.boxes, 'همان seed و k باید همان قطعه را بسازد');
assert.notDeepEqual(a.boxes, c.boxes, 'seed دیگر باید قطعهٔ دیگر بسازد');
assert.ok(a.count > 20 && a.boxes.length === a.count * STRIDE, 'قطعه باید ساختمان داشته باشد');
assert.ok(a.nLights > 0 && a.lights.length === a.nLights * 8);
for (let i = 0; i < a.count; i++) for (let j = 0; j < STRIDE; j++) assert.ok(Number.isFinite(a.boxes[i * STRIDE + j]), 'مقدار نامعتبر');
for (let k = -20; k < 60; k++) { const ch = makeChunk(12345, k); assert.ok(ch.count > 0, 'قطعهٔ ' + k + ' خالی است'); assert.ok(ch.z1 - ch.z0 === CH); }
const t0 = performance.now(); for (let k = 0; k < 200; k++) makeChunk(9, k); const per = (performance.now() - t0) / 200;
assert.ok(per < 6, 'ساخت یک قطعه باید سریع باشد (' + per.toFixed(2) + 'ms)');
const m1 = movingCars(5, 3.3, -300, 20), m2 = movingCars(5, 3.3, -300, 20); assert.deepEqual(m1, m2); assert.ok(m1.length > 3, 'ماشین متحرک باید باشد');
const w = clampWalk(50, -10); assert.ok(Math.abs(w.x) <= 10.5, 'مرز پیاده‌رو');
assert.equal(districtOf(1, 0, 'quiet').id, 'quiet');
console.log('world ok — chunk avg', per.toFixed(2), 'ms; boxes', a.count);
{
  const { makeAnyChunk, BIOME_IDS } = await import('../src/biomes.js');
  for (const b of BIOME_IDS) { const c = makeAnyChunk(777, 5, { biome: b }), d = makeAnyChunk(777, 5, { biome: b }); if (!c.count || c.boxes.length !== d.boxes.length || c.boxes.some((v, i) => v !== d.boxes[i])) throw new Error('biome chunk ' + b); if (c.boxes.some((v) => !isFinite(v))) throw new Error('NaN ' + b); }
  console.log('biome chunks ok');
}
