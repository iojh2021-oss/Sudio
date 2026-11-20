import assert from 'node:assert/strict';
import { Director } from '../src/director.js';
import { parsePrompt } from '../src/prompt.js';
const said = []; const d = new Director({ onSay: (ch, t) => said.push([ch.name, t]) });
d.applyParsed(parsePrompt('شب است. یک مرد راه می‌رود. مرد می‌گوید: «سلام». زن می‌گوید: «درود».')); d.snapshotHomes();
const z0 = d.characters[0].z; d.play();
for (let i = 0; i < 60 * 12; i++) d.step(1 / 60);
assert.ok(d.characters[0].z < z0 - 5, 'شخصیت باید در طول تایم‌لاین راه رفته باشد');
assert.equal(said.length, 2, 'دو دیالوگ باید اجرا شود'); assert.equal(said[0][1], 'سلام');
d.stopPlayback(); assert.ok(Math.abs(d.characters[0].z - z0) < 1e-6, 'بازگشت به جای اولیه');
const j = JSON.parse(JSON.stringify(d.toJSON())); const e = new Director(); e.fromJSON(j);
assert.equal(e.characters.length, d.characters.length); assert.equal(e.script.length, d.script.length);
assert.throws(() => e.fromJSON({ v: 99 }), /جدیدتر/); assert.throws(() => e.fromJSON(null));
const f = new Director(); f.fromJSON({ v: 2, characters: [{ preset: 'نامعتبر' }], script: [{ t: 'x' }, { t: 1, type: 'stop' }] }); assert.equal(f.characters.length, 1); assert.equal(f.script.length, 1);
console.log('director ok');
{
  const { Director } = await import('../src/director.js');
  const d = new Director(); const c = d.addCharacter({ preset: 'woman', colors: { coat: [0, 1, .5], bad: 3 }, look: { hat: 'cap', width: 9 } });
  const d2 = new Director(); d2.fromJSON(JSON.parse(JSON.stringify(d.toJSON())));
  const c2 = d2.characters[0]; if (!c2.colors || c2.colors.coat[1] !== 1 || c2.look.hat !== 'cap' || c2.look.width !== 1.5) throw new Error('custom look not preserved');
  console.log('custom look ok');
}
