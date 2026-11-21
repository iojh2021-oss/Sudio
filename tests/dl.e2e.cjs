// آزمون دانلود قابل‌ازسرگیری: قطع ناگهانی کارگر، قطع اتصال وسط راه، و استفادهٔ دوباره از فایل کامل
const { chromium } = require('playwright'); const http = require('http'); const crypto = require('crypto');
const SIZE = 24e6, data = crypto.randomBytes(SIZE); let hash = 0; for (let i = 0; i < SIZE; i += 997) hash = (hash * 31 + data[i]) >>> 0;
const log = []; let dropOnce = false;
const srv = http.createServer((q, r) => {
  r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Access-Control-Allow-Headers', '*'); r.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length'); r.setHeader('Accept-Ranges', 'bytes');
  if (q.method === 'OPTIONS') { r.end(); return; }
  const m = /bytes=(\d+)-/.exec(q.headers.range || ''), start = m ? +m[1] : 0; log.push({ start, url: q.url });
  if (m) { r.statusCode = 206; r.setHeader('Content-Range', `bytes ${start}-${SIZE - 1}/${SIZE}`); }
  r.setHeader('Content-Length', SIZE - start); let off = start, dropAt = (dropOnce && q.url.includes('drop')) ? start + 9e6 : Infinity;
  const tick = () => { if (r.destroyed) return; if (off >= dropAt) { dropOnce = false; q.socket.destroy(); return; } const end = Math.min(off + 262144, SIZE); r.write(data.subarray(off, end)); off = end; if (off >= SIZE) r.end(); else setTimeout(tick, 25); };
  tick();
}).listen(8791);
(async () => {
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const b = await chromium.launch(), pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8780/tests/dl-test.html');
  const run = (url, killAtMB) => pg.evaluate(({ url, killAtMB }) => new Promise((res) => {
    const w = new Worker('/tests/dl-worker.js', { type: 'module' }); let last = 0, notes = [], resumed = false;
    w.onmessage = (e) => { const m = e.data; if (m.t === 'p') { last = m.loaded; if (m.resumed) resumed = true; if (killAtMB && m.loaded > killAtMB * 1e6) { w.terminate(); res({ killed: true, last }); } } else if (m.t === 'n') notes.push(m.text); else if (m.t === 'done') { w.terminate(); res({ ...m, notes, resumed }); } };
    w.onerror = (e) => res({ error: e.message }); w.postMessage({ url });
  }), { url, killAtMB });
  const U = 'http://127.0.0.1:8791/resolve/main/onnx/test_a.bin';
  let r = await run(U, 9); ok(r.killed, `کارگر وسط دانلود کشته شد (در ${(r.last / 1e6).toFixed(1)}MB)`);
  log.length = 0; r = await run(U, 0); ok(r.len === SIZE && r.h === hash, 'بعد از شروع دوباره فایل کامل و سالم است'); ok(log.length >= 1 && log[0].start >= 4e6, `دانلود از بایت ${log[0] && log[0].start} ادامه یافت (نه از صفر)`); ok(r.resumed, 'گزارش «ادامه‌یافته» ارسال شد');
  log.length = 0; r = await run(U, 0); ok(r.len === SIZE && r.h === hash && log.length === 0, 'فایل کامل بدون درخواست شبکه از حافظه خوانده شد');
  dropOnce = true; log.length = 0; r = await run('http://127.0.0.1:8791/resolve/main/onnx/drop_b.bin', 0);
  ok(r.len === SIZE && r.h === hash, 'قطع اتصال وسط راه: خودکار ادامه داد و فایل سالم است'); ok(log.length === 2 && log[1].start >= 4e6, 'دومین درخواست با Range از ' + (log[1] && log[1].start)); ok(r.notes.length >= 1, 'پیام تلاش دوباره نمایش داده شد');
  ok(!errs.length, 'بدون خطا ' + JSON.stringify(errs));
  await b.close(); srv.close();
})();
