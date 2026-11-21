// کارگر وب: مدل متن‌به‌تصویر Janus-Pro-1B (deepseek-ai, مجوز MIT) با Transformers.js روی WebGPU
// برگرفته از نمونهٔ رسمی huggingface/transformers.js-examples/janus-pro-webgpu
import { AutoProcessor, MultiModalityCausalLM, BaseStreamer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.2';
import { ensureFile, opfsOk, fileKey, pruneStore } from './dl.js';

const MODEL = 'onnx-community/Janus-Pro-1B-ONNX';
let fp16 = false, processor = null, model = null, loading = null;
const post = (m) => self.postMessage(m);
// ذخیرهٔ قابل‌ازسرگیری: هر فایل مدل از طریق dl.js (OPFS + Range) می‌آید؛ اگر OPFS نبود رفتار پیش‌فرض Transformers.js می‌ماند
let gate = Promise.resolve();
if (opfsOk()) {
  const legacy = async (url) => { try { if (!self.caches) return undefined; return await (await caches.open('transformers-cache')).match(url); } catch { return undefined; } };
  env.useBrowserCache = false; env.useCustomCache = true;
  env.customCache = {
    async match(key) {
      if (!/^https:\/\/huggingface\.co\//.test(key)) return undefined;
      const old = await legacy(key); if (old) return old;
      const file = fileKey(key);
      const r = await ensureFile(key, { report: (x) => post({ type: 'progress', x: { status: 'progress', name: MODEL, file, loaded: x.loaded, total: x.total, progress: x.total ? x.loaded / x.total * 100 : 0, resumed: !!x.resumed } }), onNote: (text) => post({ type: 'note', text }) });
      if (!r) return undefined;
      if (r.total < 50e6) return new Response(r.file.stream(), { status: 200, headers: { 'Content-Length': String(r.total) } });
      // فایل‌های بزرگ یکی‌یکی وارد حافظه می‌شوند (هم‌زمان چند گیگابایت = بسته شدن برنامه)
      const prev = gate; let rel; gate = new Promise((x) => { rel = x; }); await prev;
      const rd = r.file.stream().getReader(); let freed = false; const free = () => { if (!freed) { freed = true; setTimeout(rel, 3000); } };
      return new Response(new ReadableStream({ async pull(c) { try { const { done, value } = await rd.read(); if (done) { c.close(); free(); } else c.enqueue(value); } catch (e) { free(); c.error(e); } }, cancel() { free(); } }), { status: 200, headers: { 'Content-Length': String(r.total) } });
    },
    async put() {},
  };
}

async function check() {
  if (!self.navigator.gpu) throw new Error('WebGPU در این مرورگر فعال نیست');
  const ad = await self.navigator.gpu.requestAdapter(); if (!ad) throw new Error('کارت گرافیک سازگار با WebGPU پیدا نشد');
  fp16 = ad.features.has('shader-f16'); post({ type: 'info', fp16 });
}
const SUF = { fp32: '', fp16: '_fp16', q8: '_quantized', int8: '_int8', uint8: '_uint8', q4: '_q4', q4f16: '_q4f16', bnb4: '_bnb4' };
// بدون fp16 دیگر نسخهٔ fp32 (prepare_inputs_embeds ≈ ۲٫۱ گیگابایت) نمی‌گیریم؛ int8 روی WASM استاندارد و نصف حجم q4 است
const pickDtype = () => fp16 ? { prepare_inputs_embeds: 'q4', language_model: 'q4f16', lm_head: 'fp16', gen_head: 'fp16', gen_img_embeds: 'fp16', image_decode: 'fp32' }
  : { prepare_inputs_embeds: 'q8', language_model: 'q4', lm_head: 'q4', gen_head: 'fp32', gen_img_embeds: 'fp32', image_decode: 'fp32' };
const files = (dtype) => Object.entries(dtype).map(([c, t]) => `onnx/${c}${SUF[t]}.onnx`);
async function prune(dtype) {
  const keep = new Set(files(dtype).flatMap((f) => [f, f + '_data']));
  if (opfsOk()) { const n = await pruneStore((f) => keep.has(f)); if (n) post({ type: 'note', text: `${n} فایل سنگین و غیرضروری پاک شد` }); }
}
// مرحلهٔ ۱: فقط دانلود (استریم مستقیم در حافظهٔ خصوصی، تقریباً بدون مصرف رم) — یکی‌یکی از کوچک به بزرگ
async function download() {
  await check(); const dtype = pickDtype(); await prune(dtype);
  const sizeRank = (f) => ({ gen_img_embeds: 1, gen_head: 2, lm_head: 3, image_decode: 4, prepare_inputs_embeds: 5, language_model: 6 })[f.split('/')[1].replace(/(_fp16|_quantized|_q4f16|_q4|_int8)?\.onnx$/, '')] || 9;
  for (const f of files(dtype).sort((a, b) => sizeRank(a) - sizeRank(b))) {
    const url = `https://huggingface.co/${MODEL}/resolve/main/${f}`;
    await ensureFile(url, { report: (x) => post({ type: 'progress', x: { status: 'progress', name: MODEL, file: f, loaded: x.loaded, total: x.total, progress: x.total ? x.loaded / x.total * 100 : 0, resumed: !!x.resumed } }), onNote: (text) => post({ type: 'note', text }) });
    post({ type: 'progress', x: { status: 'done', name: MODEL, file: f } });
  }
}
async function load() {
  if (model) return;
  if (!loading) loading = (async () => {
    await check();
    const progress_callback = (x) => post({ type: 'progress', x });
    processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback });
    const dtype = pickDtype();
    await prune(dtype);
    model = await MultiModalityCausalLM.from_pretrained(MODEL, {
      dtype,
      device: { prepare_inputs_embeds: 'wasm', language_model: 'webgpu', lm_head: 'webgpu', gen_head: 'webgpu', gen_img_embeds: 'webgpu', image_decode: 'webgpu' },
      progress_callback,
    });
  })();
  await loading;
}
class Prog extends BaseStreamer {
  constructor(total, cb) { super(); this.total = total; this.cb = cb; this.n = null; }
  put() { if (this.n === null) { this.n = 0; return; } this.cb(++this.n / this.total); }
  end() {}
}
async function generate(prompt, id) {
  await load();
  const inputs = await processor([{ role: '<|User|>', content: prompt }], { chat_template: 'text_to_image' });
  const n = processor.num_image_tokens;
  const out = await model.generate_images({ ...inputs, min_new_tokens: n, max_new_tokens: n, do_sample: true, streamer: new Prog(n, (p) => post({ type: 'gen-progress', id, p })) });
  return await out[0].toBlob();
}
self.addEventListener('message', async (e) => {
  const { type, id, prompt } = e.data || {};
  try {
    if (type === 'download') { if (!opfsOk()) throw new Error('این مرورگر ذخیرهٔ خصوصی (OPFS) برای دانلود قابل‌ازسرگیری ندارد'); await download(); post({ type: 'ready', id }); }
    else if (type === 'load') { await load(); post({ type: 'ready', id }); }
    else if (type === 'generate') { const blob = await generate(String(prompt || '').slice(0, 600), id); post({ type: 'done', id, blob }); }
  } catch (err) { post({ type: 'error', id, message: String((err && err.message) || err) }); }
});
