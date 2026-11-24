// شخصی‌سازی حرکت/تناسب، کاراکتر تصویری (آپلود + نقاشی)، ذخیره و بارگذاری، و حالت فقط‌پس‌زمینه با کاراکتر تصویری
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), pg = await b.newPage({ viewport: { width: 430, height: 900 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text())); const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('http://localhost:8780/index.html'); await pg.waitForFunction(() => window.Sudio, null, { timeout: 30000 });
  await pg.evaluate(() => document.querySelectorAll('button').forEach((x) => /شروع/.test(x.textContent) && x.click())); await pg.waitForTimeout(1500);
  await pg.click('text=🧍 شخصیت‌ها'); await pg.waitForSelector('text=🚶 مدل حرکت');
  const pose = () => pg.evaluate(() => { const C = window.Sudio.D.sel; return JSON.stringify(window.__parts ? 0 : [C.gait.style, C.gait.cad, C.shape.head]); });
  await pg.click('text=دزدکی'); const g = await pg.evaluate(() => { const c = window.Sudio.D.sel; return c.gait; }); ok(g.style === 'sneak' && g.crouch > .5, 'پیش‌تنظیم «دزدکی» اعمال شد');
  await pg.evaluate(() => { const c = window.Sudio.D.sel; c.shape.head = 1.5; c.gait.cad = 1.5; c.gait.style = 'custom'; window.Sudio.D.hooks.onChange && window.Sudio.D.hooks.onChange(); });
  const saved = await pg.evaluate(() => JSON.parse(JSON.stringify(window.Sudio.D.toJSON()))); ok(saved.characters[0].gait.cad === 1.5 && saved.characters[0].shape.head === 1.5, 'حرکت و تناسب در پروژه ذخیره می‌شود');
  // کاراکتر تصویری با آپلود
  const png = fs.readFileSync(__dirname + '/backdrop.png'); fs.writeFileSync('/tmp/up.png', png);
  await pg.setInputFiles('input[type=file] >> nth=0', '/tmp/up.png'); await pg.waitForFunction(() => window.Sudio.D.sel.sprite, null, { timeout: 8000 }).catch(() => {});
  const sp = await pg.evaluate(() => { const s = window.Sudio.D.sel.sprite; return s && { w: s.w, h: s.h, ok: /^data:image\//.test(s.data) }; }); ok(sp && sp.ok, 'آپلود تصویر → کاراکتر تصویری ساخته شد ' + JSON.stringify(sp));
  // نقاشی
  await pg.click('text=✏️ طراحی با انگشت'); await pg.waitForSelector('.padc'); const box = await pg.locator('.padc').boundingBox();
  await pg.mouse.move(box.x + box.width * .3, box.y + box.height * .2); await pg.mouse.down(); for (let i = 0; i <= 12; i++) await pg.mouse.move(box.x + box.width * (.3 + i * .03), box.y + box.height * (.2 + i * .05)); await pg.mouse.up();
  await pg.click('text=✓ ثبت کاراکتر'); await pg.waitForTimeout(500); const sp2 = await pg.evaluate(() => { const s = window.Sudio.D.sel.sprite; return s && s.w + 'x' + s.h; }); ok(!!sp2, 'نقاشی با انگشت → کاراکتر ثبت شد ' + sp2);
  // رسم و ذخیره
  await pg.waitForTimeout(800); const rt = await pg.evaluate(() => { const D = window.Sudio.D; const j = JSON.parse(JSON.stringify(D.toJSON())); D.fromJSON(j); return !!D.characters[0].sprite && D.characters[0].gait.cad === 1.5; }); ok(rt, 'ذخیره/بارگذاری پروژه شامل کاراکتر تصویری');
  await pg.evaluate(() => { const c = window.Sudio.D.sel; c.z = -8; c.x = 0; }); await pg.evaluate(() => window.Sudio.D.sel.path.push({ x: 0, z: -30, run: false })); await pg.waitForTimeout(1200);
  await pg.click('text=^').catch(() => {}); await pg.screenshot({ path: '/tmp/sprite_city.png' });
  const img = fs.readFileSync(__dirname + '/backdrop.png').toString('base64');
  await pg.evaluate(async (d) => { const r = await fetch('data:image/png;base64,' + d); window.Sudio.renderer.setBackdrop(await createImageBitmap(await r.blob())); window.Sudio.renderer.bg.only = true; }, img); await pg.waitForTimeout(3500); await pg.screenshot({ path: '/tmp/sprite_bg.png' });
  ok(!errs.length, 'بدون خطای کنسول ' + JSON.stringify(errs.slice(0, 4))); await b.close();
})();
