// حالت «فقط پس‌زمینهٔ هوش مصنوعی»: شهر خاموش، تصویر تمام‌صفحه، شخصیت جلوی آن؛ با خاموش‌کردن همه‌چیز برمی‌گردد
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), pg = await b.newPage({ viewport: { width: 430, height: 860 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text())); const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('http://localhost:8780/index.html'); await pg.waitForFunction(() => window.Sudio, null, { timeout: 30000 });
  await pg.evaluate(() => document.querySelectorAll('button').forEach((x) => /شروع/.test(x.textContent) && x.click()));
  await pg.waitForTimeout(2500);
  const img = fs.readFileSync(__dirname + '/backdrop.png').toString('base64');
  await pg.evaluate(async (d) => { const r = await fetch('data:image/png;base64,' + d); const bmp = await createImageBitmap(await r.blob()); window.Sudio.renderer.setBackdrop(bmp); }, img);
  await pg.waitForTimeout(3600); const normal = await pg.screenshot();
  const st1 = await pg.evaluate(() => window.Sudio.renderer.stats.visibleBoxes); ok(st1 > 0, 'حالت عادی: شهر رسم می‌شود (' + st1 + ' جعبه)');
  await pg.click('text=🤖 هوش مصنوعی'); await pg.click('text=فقط تصویر هوش مصنوعی'); await pg.waitForTimeout(1200);
  const st2 = await pg.evaluate(() => window.Sudio.renderer.stats.visibleBoxes); ok(st2 === 0, 'حالت فقط‌پس‌زمینه: شهر رسم نمی‌شود'); fs.writeFileSync('/tmp/bg_on.png', await pg.screenshot());
  // حرکت شخصیت → پارالاکس تغییر کند
  const before = await pg.screenshot({ clip: { x: 0, y: 100, width: 430, height: 250 } });
  await pg.evaluate(() => { const D = window.Sudio.D, c = D.sel; c.z -= 25; c.x += 6; }); await pg.waitForTimeout(700); const after = await pg.screenshot({ clip: { x: 0, y: 100, width: 430, height: 250 } });
  ok(Buffer.compare(before, after) !== 0, 'با جابه‌جایی شخصیت، تصویر پس‌زمینه جابه‌جا می‌شود');
  await pg.click('text=فقط تصویر هوش مصنوعی'); await pg.waitForTimeout(800); const st3 = await pg.evaluate(() => window.Sudio.renderer.stats.visibleBoxes); ok(st3 > 0, 'با خاموش‌کردن تیک، شهر برمی‌گردد');
  ok(!errs.length, 'بدون خطای کنسول ' + JSON.stringify(errs.slice(0, 3))); await b.close();
})();
