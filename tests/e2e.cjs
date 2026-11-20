// آزمون سرتاسری با مرورگر واقعی (Chromium + WebGL نرم‌افزاری): node tests/e2e.cjs http://localhost:8780/
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8780/', shot = process.argv[3] || '/tmp/e2e';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
  const p = await b.newPage({ viewport: { width: 412, height: 860 }, hasTouch: true, isMobile: true }); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + 'index.html'); await p.waitForFunction(() => window.Sudio, null, { timeout: 15000 });
  ok(await p.$('.splash'), 'صفحهٔ شروع نمایش داده می‌شود');
  await p.click('.splash .btn.pri'); await p.waitForTimeout(3500);
  const s1 = await p.evaluate(() => ({ chars: Sudio.D.characters.length, ev: Sudio.D.script.length, playing: Sudio.D.playing, chunks: Sudio.renderer.stats.chunks, draws: Sudio.renderer.stats.draws, z: Sudio.D.characters[0].z }));
  ok(s1.chars >= 2 && s1.ev > 2, 'صحنهٔ اولیه از دستور متنی ساخته شد (' + s1.chars + ' شخصیت، ' + s1.ev + ' رویداد)');
  ok(s1.chunks >= 6 && s1.draws > 10, 'شهر سه‌بعدی ساخته و رسم شد (قطعه ' + s1.chunks + '، دراکال ' + s1.draws + ')');
  ok(s1.playing && s1.z < -5, 'نمایش پخش می‌شود و شخصیت راه رفته است (z=' + s1.z.toFixed(1) + ')');
  const dlg = await p.evaluate(() => Sudio.voice.active.size + (Sudio.D.fired.size));
  ok(dlg > 0, 'رویدادهای تایم‌لاین اجرا شد');
  await p.screenshot({ path: shot + '-play.png' });
  // لمس زمین ← راه رفتن
  await p.evaluate(() => Sudio.D.pause()); const before = await p.evaluate(() => { const c = Sudio.D.sel; return [c.x, c.z]; });
  await p.touchscreen.tap(206, 600); await p.waitForTimeout(2500);
  const after = await p.evaluate(() => { const c = Sudio.D.sel; return [c.x, c.z]; });
  ok(Math.hypot(after[0] - before[0], after[1] - before[1]) > .8, 'لمس روی زمین شخصیت انتخاب‌شده را حرکت داد');
  // تب‌ها
  for (const k of ['chars', 'scene', 'time', 'proj', 'prompt']) { await p.evaluate((k) => Sudio.setTab(k), k); await p.waitForTimeout(150); ok(await p.evaluate(() => document.querySelector('.pane').children.length > 0), 'تب ' + k + ' ساخته شد'); }
  // ساخت صحنه از دستور
  await p.evaluate(() => Sudio.setTab('prompt')); await p.fill('textarea', 'غروب، یک بانو در محلهٔ قدیمی راه می‌رود. بانو می‌گوید: «سلام». دوربین هوایی'); await p.click('.pane .btn.pri'); await p.waitForTimeout(800);
  const s2 = await p.evaluate(() => ({ time: Sudio.D.env.time, cam: Sudio.cam.mode, n: Sudio.D.characters.length, pre: Sudio.D.characters[0].preset }));
  ok(s2.time === 'dusk' && s2.cam === 'aerial' && s2.n === 1 && s2.pre === 'woman', 'دستور جدید صحنه را عوض کرد');
  // صدای زن/مرد
  const v = await p.evaluate(async () => { Sudio.voice.init(); const c = Sudio.D.characters[0]; const r = Sudio.voice.say(c, 'سلام دوست من'); await new Promise((r) => setTimeout(r, 400)); return { dur: r.dur, mouth: c.mouth, f0: Sudio.voice.params(c, 'x').f0, ctx: Sudio.voice.ctx && Sudio.voice.ctx.state }; });
  ok(v.dur > .5 && v.f0 > 180, 'صدای زن ساخته می‌شود (f0=' + v.f0 + ' Hz، ' + v.dur.toFixed(1) + ' ثانیه)');
  // ذخیره/بازیابی
  const j = await p.evaluate(() => { const o = JSON.stringify(Sudio.D.toJSON()); Sudio.D.fromJSON(JSON.parse(o)); return Sudio.D.characters.length; }); ok(j === 1, 'ذخیره و بازیابی پروژه');
  // کیفیت پایین هم پیوسته رسم می‌کند
  const f = await p.evaluate(() => new Promise((res) => { Sudio.renderer.setQuality('low'); Sudio.cam.mode = 'follow'; let n = 0; const t0 = performance.now(); const L = () => { n++; if (performance.now() - t0 > 2000) res(n / 2); else requestAnimationFrame(L); }; requestAnimationFrame(L); }));
  ok(f > 6, 'کیفیت پایین پیوسته رسم می‌کند (' + f.toFixed(0) + ' fps در شبیه‌ساز نرم‌افزاری)');
  await p.waitForTimeout(500); await p.screenshot({ path: shot + '-end.png' });
  ok(errs.length === 0, 'بدون خطای کنسول' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); if (fails.length) { console.log('\n' + fails.length + ' مورد ناموفق'); process.exit(1); } console.log('\nهمهٔ آزمون‌ها موفق');
})();
