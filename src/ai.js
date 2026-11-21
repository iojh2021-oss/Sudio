// هوش مصنوعی متن‌به‌تصویر برای پس‌زمینهٔ صحنه. دو موتور:
//  janus: مدل Janus-Pro-1B داخل مرورگر (WebGPU، حدود ۲٫۴ گیگابایت دانلود، یک‌بار)
//  http : هر سرور/برنامهٔ سازگار با AUTOMATIC1111 (/sdapi/v1/txt2img) مثل Local Dream روی همان گوشی یا ComfyUI/Forge روی رایانه
import { BIOMES } from './biomes.js';

const BIO_EN = { city: 'a film noir city street with tall art deco skyscrapers, wet asphalt, street lamps', forest: 'a dense misty forest with tall pine and oak trees and a dirt trail', desert: 'a vast sandy desert with dunes, cacti and distant red mesas', snow: 'a snowy winter landscape with frosty pine trees and snow drifts', meadow: 'a green countryside meadow with wildflowers, wooden fence and a small farmhouse', beach: 'a tropical beach with palm trees, golden sand and turquoise sea', mountain: 'a rugged rocky mountain valley with snow-capped peaks' };
const TIME_EN = { night: 'at night, moonlit, dark blue sky', dusk: 'at sunset, golden hour, orange sky', dawn: 'at dawn, soft pink light', day: 'in bright daylight, blue sky with clouds' };

export function scenePrompt(env) {
  const b = BIO_EN[env.biome] || BIO_EN.city, t = TIME_EN[env.time] || '', w = [env.rain > .3 ? 'rainy' : '', env.fog > .5 ? 'thick fog' : env.fog > .25 ? 'light mist' : '', env.mood === 'noir' ? 'black and white noir' : ''].filter(Boolean).join(', ');
  return `wide panoramic cinematic view of ${b} ${t}${w ? ', ' + w : ''}, no people, highly detailed, atmospheric`;
}
export const BIOME_LABEL = (id) => (BIOMES[id] || BIOMES.city).label;

export async function detectWebGPU() {
  try { if (!navigator.gpu) return { ok: false, why: 'این مرورگر WebGPU ندارد (Chrome/Edge ۱۱۳+ روی اندروید ۱۲+ لازم است)' }; const a = await navigator.gpu.requestAdapter(); if (!a) return { ok: false, why: 'کارت گرافیک سازگار با WebGPU پیدا نشد' }; return { ok: true, f16: a.features.has('shader-f16') }; } catch (e) { return { ok: false, why: String(e.message || e) }; }
}

export class AIBackdrop {
  constructor() { this.engine = 'janus'; this.url = 'http://127.0.0.1:7860'; this.steps = 20; this.worker = null; this.ready = false; this.busy = false; this._id = 0; this._wait = new Map(); this.onProgress = null; }
  _w() {
    if (this.worker) return this.worker;
    const w = this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'progress') { const x = m.x || {}; if (x.status === 'progress' && this.onProgress) this.onProgress({ phase: 'download', p: (x.progress || 0) / 100, file: x.file }); return; }
      if (m.type === 'gen-progress') { this.onProgress && this.onProgress({ phase: 'gen', p: m.p }); return; }
      const rec = this._wait.get(m.id); if (!rec) return; this._wait.delete(m.id);
      if (m.type === 'error') rec.rej(new Error(m.message)); else rec.res(m);
    };
    w.onerror = (e) => { for (const r of this._wait.values()) r.rej(new Error('بارگذاری کارگر مدل ناموفق بود (اینترنت برای دانلود مدل لازم است): ' + (e.message || ''))); this._wait.clear(); this.worker = null; };
    return w;
  }
  _call(msg) { return new Promise((res, rej) => { const id = ++this._id; this._wait.set(id, { res, rej }); this._w().postMessage({ ...msg, id }); }); }
  async load() { if (this.engine !== 'janus' || this.ready) return; await this._call({ type: 'load' }); this.ready = true; }
  async generate(prompt) {
    if (this.busy) throw new Error('هنوز تصویر قبلی در حال ساخت است');
    this.busy = true;
    try {
      if (this.engine === 'janus') { await this.load(); const m = await this._call({ type: 'generate', prompt }); return m.blob; }
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 600000);
      try {
        this.onProgress && this.onProgress({ phase: 'gen', p: .05 });
        const r = await fetch(this.url.replace(/\/+$/, '') + '/sdapi/v1/txt2img', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ prompt, negative_prompt: 'people, text, watermark, logo, blurry, low quality', steps: this.steps, width: 512, height: 512, cfg_scale: 7, seed: -1 }) });
        if (!r.ok) throw new Error('پاسخ سرور ' + r.status);
        const j = await r.json(); const b64 = j && j.images && j.images[0]; if (!b64) throw new Error('سرور تصویری برنگرداند');
        const bin = atob(String(b64).replace(/^data:image\/\w+;base64,/, '')), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return new Blob([u], { type: 'image/png' });
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'زمان انتظار سرور تمام شد' : (/Failed to fetch|NetworkError/.test(e.message) ? 'اتصال به سرور ممکن نشد (آدرس، روشن‌بودن سرور و اجازهٔ CORS را بررسی کن)' : e.message)); } finally { clearTimeout(to); }
    } finally { this.busy = false; }
  }
}
