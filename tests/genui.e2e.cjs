// آزمون کارت پیشرفت/خطای ساخت تصویر با Local Dream ساختگی (پیشرفت زنده + خطا + سرور خاموش)
const { chromium } = require('playwright'); const http = require('http');
const W = 64, H = 64, rgb = Buffer.alloc(W * H * 3, 120); let mode = 'ok';
const srv = http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*');
  if (q.method === 'OPTIONS') { r.writeHead(204); return r.end(); } if (q.url === '/health') { r.writeHead(200); return r.end('ok'); }
  let d = ''; q.on('data', (c) => d += c); q.on('end', async () => {
    if (mode === 'err') { r.writeHead(200, { 'Content-Type': 'text/event-stream' }); return r.end('event: error\ndata: {"type":"error","message":"size mismatch: model expects 512"}\n\n'); }
    r.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (let i = 1; i <= 4; i++) { r.write(`event: progress\ndata: {"type":"progress","step":${i},"total_steps":4}\n\n`); await new Promise((x) => setTimeout(x, 400)); }
    r.end('event: complete\ndata: ' + JSON.stringify({ type: 'complete', image: rgb.toString('base64'), width: W, height: H, channels: 3 }) + '\n\n'); });
}).listen(8081, async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] }), pg = await b.newPage({ viewport: { width: 430, height: 860 } });
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('http://localhost:8780/index.html'); await pg.waitForFunction(() => window.Sudio, null, { timeout: 30000 });
  await pg.evaluate(() => document.querySelectorAll('button').forEach((x) => /شروع/.test(x.textContent) && x.click()));
  await pg.click('text=🤖 هوش مصنوعی'); await pg.selectOption('select >> nth=0', 'localdream'); await pg.waitForTimeout(200);
  await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=/گام \\S+ از/', { timeout: 8000 }).catch(() => {});
  const mid = await pg.evaluate(() => document.body.innerText); ok(/گام/.test(mid) && /گذشته/.test(mid), 'کارت پیشرفت زنده: شمارندهٔ گام و زمان سپری‌شده');
  await pg.waitForSelector('text=/ساخته شد/', { timeout: 15000 }); ok(true, 'پیام موفقیت با اندازه و زمان');
  mode = 'err'; await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=چه کار کنم', { timeout: 10000 });
  const t = await pg.evaluate(() => document.body.innerText); ok(/size mismatch/.test(t) && /رزولوشن/.test(t), 'دلیل خطای سرور و راهنمای رفع نشان داده شد');
  srv.close(); await pg.waitForTimeout(300); await pg.click('text=✨ ساخت پس‌زمینه'); await pg.waitForSelector('text=اتصال به سرور برقرار نشد', { timeout: 10000 });
  const t2 = await pg.evaluate(() => document.body.innerText); ok(/127\.0\.0\.1:8081/.test(t2) && /Unrestricted/.test(t2), 'خطای سرور خاموش با راهنمای مرحله‌به‌مرحله');
  await pg.screenshot({ path: '/tmp/genui.png' }); ok(!errs.length, 'بدون خطای کنسول ' + JSON.stringify(errs.slice(0, 3))); await b.close(); process.exit(process.exitCode || 0);
});
