import assert from 'node:assert/strict';
import { parsePrompt } from '../src/prompt.js';
const a = parsePrompt('شب است و باران می‌بارد. یک مرد در خیابان مه‌آلود راه می‌رود. مرد می‌گوید: «سلام، کسی اینجاست؟» زن می‌گوید: «من اینجا هستم.»');
assert.equal(a.env.time, 'night'); assert.ok(a.env.rain > .5); assert.ok(a.env.fog > .5);
assert.deepEqual(a.characters.map((c) => c.preset).sort(), ['detective', 'woman']);
assert.ok(a.script.some((e) => e.type === 'walk')); assert.equal(a.script.filter((e) => e.type === 'say').length, 2);
const say = a.script.filter((e) => e.type === 'say'); assert.notEqual(say[0].who, say[1].who, 'دو گوینده متفاوت');
assert.ok(say[1].t > say[0].t, 'ترتیب زمانی دیالوگ‌ها');
const b = parsePrompt('A detective walks in the foggy night. He says "Hello there".'); assert.equal(b.env.time, 'night'); assert.equal(b.script.filter((e) => e.type === 'say')[0].text, 'Hello there');
const c = parsePrompt('دو مرد و یک ربات، غروب، دوربین هوایی، ۳۰ ثانیه'); assert.equal(c.characters.length, 3); assert.equal(c.camera, 'aerial'); assert.equal(c.env.time, 'dusk'); assert.equal(c.duration, 30);
const d = parsePrompt(''); assert.equal(d.characters.length, 1);
console.log('prompt ok —', a.notes.join(' | '));
{
  const cases = [['یک مرد در جنگل راه می‌رود', 'forest'], ['A man walks in the desert at night', 'desert'], ['غروب کنار دریا', 'beach'], ['برف می‌بارد روی کوه', 'snow'], ['در دشت و مزرعه', 'meadow'], ['او در شهر راه می‌رود', 'city']];
  for (const [t, b] of cases) { const p = parsePrompt(t); if (p.env.biome !== b) throw new Error('biome ' + t + ' → ' + p.env.biome); }
  const f = parsePrompt('یک مرد در جنگل راه می‌رود'); if (f.env.time !== 'day' || f.env.rain !== 0) throw new Error('nature defaults');
  console.log('biome prompt ok');
}
