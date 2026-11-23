// موتور آنلاین: سرور ساختگی با همان قرارداد Pollinations (GET /prompt/{متن}، CORS باز، JPEG/PNG)
const http = require('http'), fs = require('fs'), { chromium } = require('playwright'); const png = fs.readFileSync(__dirname + '/backdrop.png'); let last = '', mode = 'ok';
const srv = http.createServer((q, r) => { r.setHeader('Access-Control-Allow-Origin', '*'); if (!q.url.startsWith('/prompt/')) { r.writeHead(404); return r.end(); }
  last = decodeURIComponent(q.url.slice(8).split('?')[0]); if (mode === 'limit') { r.writeHead(402, { 'Content-Type': 'application/json' }); return r.end('{"code":"FREE_LIMIT"}'); }
  setTimeout(() => { r.writeHead(200, { 'Content-Type': 'image/png' }); r.end(png); }, 500); }).listen(8791, async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), pg = await b.newPage({ viewport: { width: 430, height: 860 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('http://localhost:8780/index.html'); await pg.waitForFunction(() => window.Sudio, null, { timeout: 30000 });
  await pg.evaluate(() => document.querySelectorAll('button').forEach((x) => /شروع/.test(x.textContent) && x.click()));
  await pg.click('text=🤖 هوش مصنوعی'); await pg.selectOption('select >> nth=0', 'online');
  await pg.evaluate(() => { const a = window.Sudio.ai; a.onlineBase = 'http://127.0.0.1:8791/prompt/'; a.onlineGap = 0; });
  const has = await pg.evaluate(() => !!window.Sudio.ai); if (!has) { ok(false, 'Sudio.ai در دسترس آزمون نیست'); process.exit(1); }
  await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=/ساخته شد/', { timeout: 15000 }); ok(/film noir|forest|city/.test(last), 'متن صحنه به سرور رفت: ' + last.slice(0, 60)); ok(true, 'تصویر آنلاین گرفته و نمایش داده شد');
  mode = 'limit'; await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=تصویر از سرور نرسید', { timeout: 15000 }); const t = await pg.evaluate(() => document.body.innerText); ok(/۴۵ ثانیه/.test(t) && /VPN/.test(t), 'خطای محدودیت/فیلتر با راهنما');
  ok(!errs.length, 'بدون خطای کنسول ' + JSON.stringify(errs.slice(0, 3))); await b.close(); srv.close(); process.exit(process.exitCode || 0); });
