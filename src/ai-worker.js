// کارگر وب: مدل متن‌به‌تصویر Janus-Pro-1B (deepseek-ai, مجوز MIT) با Transformers.js روی WebGPU
// برگرفته از نمونهٔ رسمی huggingface/transformers.js-examples/janus-pro-webgpu
import { AutoProcessor, MultiModalityCausalLM, BaseStreamer, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.2';
import { ensureFile, opfsOk, fileKey } from './dl.js';

const MODEL = 'onnx-community/Janus-Pro-1B-ONNX';
let fp16 = false, processor = null, model = null, loading = null;
const post = (m) => self.postMessage(m);
// ذخیرهٔ قابل‌ازسرگیری: هر فایل مدل از طریق dl.js (OPFS + Range) می‌آید؛ اگر OPFS نبود رفتار پیش‌فرض Transformers.js می‌ماند
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
      return new Response(r.file.stream(), { status: 200, headers: { 'Content-Length': String(r.total) } });
    },
    async put() {},
  };
}

async function check() {
  if (!self.navigator.gpu) throw new Error('WebGPU در این مرورگر فعال نیست');
  const ad = await self.navigator.gpu.requestAdapter(); if (!ad) throw new Error('کارت گرافیک سازگار با WebGPU پیدا نشد');
  fp16 = ad.features.has('shader-f16'); post({ type: 'info', fp16 });
}
async function load() {
  if (model) return;
  if (!loading) loading = (async () => {
    await check();
    const progress_callback = (x) => post({ type: 'progress', x });
    processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback });
    model = await MultiModalityCausalLM.from_pretrained(MODEL, {
      dtype: fp16 ? { prepare_inputs_embeds: 'q4', language_model: 'q4f16', lm_head: 'fp16', gen_head: 'fp16', gen_img_embeds: 'fp16', image_decode: 'fp32' }
        : { prepare_inputs_embeds: 'fp32', language_model: 'q4', lm_head: 'fp32', gen_head: 'fp32', gen_img_embeds: 'fp32', image_decode: 'fp32' },
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
    if (type === 'load') { await load(); post({ type: 'ready', id }); }
    else if (type === 'generate') { const blob = await generate(String(prompt || '').slice(0, 600), id); post({ type: 'done', id, blob }); }
  } catch (err) { post({ type: 'error', id, message: String((err && err.message) || err) }); }
});
