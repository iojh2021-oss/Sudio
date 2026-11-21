// آزمون خط لوله هوش مصنوعی با سرور ساختگی سازگار با AUTOMATIC1111 (مدل واقعی در محیط آزمون اجرا نمی‌شود)
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs');
const png = fs.readFileSync(__dirname + '/backdrop.png').toString('base64'); let hits = 0, last = null;
const srv = http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*'); r.setHeader('Access-Control-Allow-Methods', '*');
  if (q.method === 'OPTIONS') { r.end(); return; }
  let b = ''; q.on('data', (c) => b += c); q.on('end', () => { hits++; last = JSON.parse(b || '{}'); r.setHeader('Content-Type', 'application/json'); r.end(JSON.stringify({ images: [png] })); });
}).listen(8790);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), pg = await b.newPage({ viewport: { width: 430, height: 860 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await pg.goto(process.argv[2] || 'http://localhost:8780/index.html'); await pg.waitForFunction(() => window.Sudio, null, { timeout: 30000 });
  await pg.evaluate(() => document.querySelectorAll('button').forEach((x) => /شروع/.test(x.textContent) && x.click()));
  await pg.evaluate(() => { const D = window.Sudio.D; D.env.biome = 'forest'; D.env.time = 'day'; D.env.rain = 0; D.env.mood = 'color'; D.env.traffic = 0; D.hooks.onEnv && D.hooks.onEnv(D.env); });
  await pg.waitForTimeout(1200); const before = await pg.screenshot({ clip: { x: 0, y: 60, width: 430, height: 260 } });
  await pg.click('text=🤖 هوش مصنوعی'); await pg.selectOption('select >> nth=0', 'http'); await pg.waitForTimeout(200);
  await pg.fill('input[type=text] >> nth=0', 'http://127.0.0.1:8790'); await pg.press('input[type=text] >> nth=0', 'Tab');
  await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=پس‌زمینه اعمال شد', { timeout: 20000 });
  await pg.click('.handle'); await pg.waitForTimeout(4500);
  const after = await pg.screenshot({ clip: { x: 0, y: 60, width: 430, height: 260 }, path: '/tmp/ai-after.png' });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  ok(hits === 1 && /forest/.test(last.prompt) && last.steps >= 1, 'درخواست به سرور با پرامپت صحنه ارسال شد: ' + (last && last.prompt.slice(0, 70)));
  ok(Buffer.compare(before, after) !== 0, 'پس‌زمینه تصویر را تغییر داد');
  ok(!errs.length, 'بدون خطای کنسول ' + JSON.stringify(errs.slice(0, 3)));
  await b.close(); srv.close();
})();
