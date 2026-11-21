// موتور Local Dream را با یک سرور ساختگی که همان API واقعی (SSE + RGB خام) را دارد آزمایش می‌کند
const http = require('http'), { chromium } = require('playwright');
const W = 64, H = 32; const rgb = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { rgb[i * 3] = 200; rgb[i * 3 + 1] = 30; rgb[i * 3 + 2] = 90; }
let body = null;
const srv = http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*');
  if (q.method === 'OPTIONS') { r.writeHead(204); return r.end(); }
  if (q.url === '/health') { r.writeHead(200); return r.end('ok'); }
  if (q.url === '/generate') { let d = ''; q.on('data', (c) => d += c); q.on('end', () => { body = JSON.parse(d); r.writeHead(200, { 'Content-Type': 'text/event-stream' });
    r.write('event: progress\ndata: {"type":"progress","step":1,"total_steps":2}\n\n'); r.end('event: complete\ndata: ' + JSON.stringify({ type: 'complete', image: rgb.toString('base64'), width: W, height: H, channels: 3 }) + '\n\n'); }); return; }
  r.writeHead(404); r.end();
}).listen(8081, async () => {
  const b = await chromium.launch(), p = await b.newPage(); let ok = 0, bad = 0; const t = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); c ? ok++ : bad++; };
  await p.goto('http://localhost:8780/tests/smoke.html').catch(() => {});
  const res = await p.evaluate(async () => { const { AIBackdrop } = await import('http://localhost:8780/src/ai.js'); const a = new AIBackdrop(); a.engine = 'localdream'; a.url = 'http://127.0.0.1:8081'; a.size = 512;
    const ping = await a.ping(); const blob = await a.generate('a forest'); const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); const px = x.getImageData(1, 1, 1, 1).data;
    a.url = 'http://127.0.0.1:9'; let err = ''; try { await a.ping(); } catch (e) { err = e.message; } return { ping, w: bmp.width, h: bmp.height, px: [...px], err }; });
  t('تست اتصال /health', res.ping === true); t('تصویر RGB خام به PNG تبدیل شد (' + res.w + 'x' + res.h + ')', res.w === W && res.h === H);
  t('رنگ پیکسل درست است', res.px[0] === 200 && res.px[1] === 30 && res.px[2] === 90); t('بدنهٔ درخواست: prompt/size/steps', body && body.prompt === 'a forest' && body.size === 512 && body.steps === 20);
  t('خطای اتصال پیام فارسی دارد', /اتصال/.test(res.err));
  await b.close(); srv.close(); console.log(bad ? 'ناموفق' : 'همهٔ آزمون‌ها موفق'); process.exit(bad ? 1 : 0);
});
