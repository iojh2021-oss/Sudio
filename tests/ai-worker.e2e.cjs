// آزمون کارگر مدل با Transformers.js و سرور HF ساختگی: مرحلهٔ دانلود جدا، سپس بارگذاری یکی‌یکی
const { chromium } = require('playwright');
const STUB = `
export const env = {};
export class BaseStreamer {}
const names = ['prepare_inputs_embeds_quantized','language_model_q4','lm_head_q4','gen_head','gen_img_embeds','image_decode'];
export const AutoProcessor = { async from_pretrained() { const p = async () => ({}); p.num_image_tokens = 2; return p; } };
export const MultiModalityCausalLM = { async from_pretrained(id, o) {
  globalThis.__dtype = o.dtype; const sizes = [];
  for (const n of names) { const r = await env.customCache.match('https://huggingface.co/' + id + '/resolve/main/onnx/' + n + '.onnx'); if (!r) throw new Error('missing ' + n); const b = new Uint8Array(await r.arrayBuffer()); sizes.push(n + ':' + b.length); }
  return { async generate_images() { return [{ toBlob: async () => new Blob(['x']) }]; }, sizes }; } };
`;
(async () => {
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'] }), ctx = await b.newContext(), pg = await ctx.newPage();
  const hits = []; const errs = [];
  await ctx.route('https://cdn.jsdelivr.net/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: STUB }));
  await ctx.route('https://huggingface.co/**', (r) => {
    const u = new URL(r.request().url()), n = u.pathname.split('/').pop(), size = n.startsWith('language_model') ? 6e6 : 2e6, rg = /bytes=(\d+)-/.exec(r.request().headers().range || ''), st = rg ? +rg[1] : 0; hits.push(n + '@' + st);
    const body = Buffer.alloc(size - st, 7); const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'Content-Range,Content-Length', 'accept-ranges': 'bytes' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (rg) return r.fulfill({ status: 206, headers: { ...h, 'content-range': `bytes ${st}-${size - 1}/${size}` }, body }); r.fulfill({ status: 200, headers: h, body });
  });
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto('http://localhost:8780/tests/dl-test.html');
  const out = await pg.evaluate(async () => {
    const { AIBackdrop, modelCacheInfo } = await import('/src/ai.js'); const ai = new AIBackdrop(), ev = []; ai.onProgress = (e) => ev.push(e.phase);
    let gpu = null; try { gpu = !!(await navigator.gpu.requestAdapter()); } catch {}
    try { await ai.download(); } catch (e) { return { err: 'download: ' + e.message, gpu }; }
    const info = await modelCacheInfo(); let loadErr = null; try { await ai.load(); } catch (e) { loadErr = e.message; }
    return { gpu, info: { cached: info.cached, files: info.list.map((f) => f.file + (f.done ? '✓' : '·')) }, loadErr, phases: [...new Set(ev)] };
  });
  console.log(JSON.stringify(out));
  if (!out.gpu) { console.log('SKIP (no WebGPU adapter in sandbox)'); } else {
    ok(!out.err && out.info.cached, 'مرحلهٔ دانلود همهٔ ۶ فایل را جدا کامل کرد'); ok(out.info.files.length === 6 && out.info.files.every((f) => f.endsWith('✓')), 'همه ✓'); ok(!out.loadErr, 'بارگذاری یکی‌یکی از OPFS موفق بود ' + (out.loadErr || ''));
  }
  ok(!errs.length, 'بدون خطای صفحه'); await b.close();
})();
