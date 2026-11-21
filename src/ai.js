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

export const fmtBytes = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + ' MB' : Math.round(n / 1e3) + ' KB';
export const fmtEta = (s) => s == null || !isFinite(s) ? '—' : s < 60 ? Math.ceil(s) + ' ثانیه' : s < 3600 ? Math.ceil(s / 60) + ' دقیقه' : (s / 3600).toFixed(1) + ' ساعت';

// جمع‌کنندهٔ پیشرفت دانلود چندفایلی (درصد کل، سرعت، زمان باقی‌مانده، وضعیت هر فایل)
export class DownloadTracker {
  constructor(expected = 2.4e9) { this.expected = expected; this.reset(); }
  reset() { this.files = new Map(); this.samples = []; this.speed = 0; this.t0 = 0; }
  update(x, now = performance.now()) {
    if (!x || !x.file) return; const f = this.files.get(x.file) || { name: x.file, loaded: 0, total: 0, done: false }; if (!this.t0) this.t0 = now;
    if (x.status === 'progress' || x.status === 'download') { f.loaded = x.loaded || f.loaded; f.total = x.total || f.total; } else if (x.status === 'done') { f.total = f.total || f.loaded; f.loaded = f.total; f.done = true; }
    this.files.set(x.file, f);
    const sum = [...this.files.values()].reduce((a, v) => a + v.loaded, 0); this.samples.push([now, sum]); while (this.samples.length > 2 && now - this.samples[0][0] > 6000) this.samples.shift();
    const a = this.samples[0], dt = (now - a[0]) / 1000; if (dt > .4) this.speed = Math.max(0, (sum - a[1]) / dt);
  }
  snap() {
    const fs = [...this.files.values()], loaded = fs.reduce((a, v) => a + v.loaded, 0), seen = fs.reduce((a, v) => a + Math.max(v.total, v.loaded), 0), total = Math.max(this.expected, seen);
    fs.sort((a, b) => (a.done - b.done) || (b.total - a.total));
    return { loaded, total, pct: total ? Math.min(1, loaded / total) : 0, speed: this.speed, eta: this.speed > 1e4 ? (total - loaded) / this.speed : null, files: fs, allDone: fs.length > 0 && fs.every((v) => v.done) };
  }
}
const CACHE = 'transformers-cache', MODEL_RE = /Janus-Pro-1B-ONNX/;
export async function modelCacheInfo() {
  try { if (!self.caches) return { cached: false }; const c = await caches.open(CACHE), ks = (await c.keys()).filter((r) => MODEL_RE.test(r.url));
    return { cached: ['language_model', 'gen_head', 'image_decode'].every((n) => ks.some((r) => r.url.includes(n))), files: ks.length }; } catch { return { cached: false }; }
}
export async function clearModelCache() { try { const c = await caches.open(CACHE); let n = 0; for (const r of await c.keys()) if (MODEL_RE.test(r.url)) { await c.delete(r); n++; } return n; } catch { return 0; } }
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false; return { free: (e.quota || 0) - (e.usage || 0), quota: e.quota || 0, persisted }; } catch { return null; }
}

export class AIBackdrop {
  constructor() { this.dl = new DownloadTracker(); this.engine = 'janus'; this.url = 'http://127.0.0.1:7860'; this.steps = 20; this.worker = null; this.ready = false; this.busy = false; this._id = 0; this._wait = new Map(); this.onProgress = null; }
  _w() {
    if (this.worker) return this.worker;
    const w = this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'info') { this.dl.expected = m.fp16 ? 2.4e9 : 4e9; return; }
      if (m.type === 'progress') { const x = m.x || {}; this.dl.update(x); this.onProgress && this.onProgress({ phase: 'download', snap: this.dl.snap(), p: this.dl.snap().pct }); return; }
      if (m.type === 'gen-progress') { this.onProgress && this.onProgress({ phase: 'gen', p: m.p }); return; }
      const rec = this._wait.get(m.id); if (!rec) return; this._wait.delete(m.id);
      if (m.type === 'error') rec.rej(new Error(m.message)); else rec.res(m);
    };
    w.onerror = (e) => { for (const r of this._wait.values()) r.rej(new Error('بارگذاری کارگر مدل ناموفق بود (اینترنت برای دانلود مدل لازم است): ' + (e.message || ''))); this._wait.clear(); this.worker = null; };
    return w;
  }
  _call(msg) { return new Promise((res, rej) => { const id = ++this._id; this._wait.set(id, { res, rej }); this._w().postMessage({ ...msg, id }); }); }
  async load() {
    if (this.engine !== 'janus' || this.ready) return;
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
    let lock = null; try { lock = navigator.wakeLock ? await navigator.wakeLock.request('screen') : null; } catch {}
    try { await this._call({ type: 'load' }); this.ready = true; } finally { try { lock && lock.release(); } catch {} }
  }
  cancel() { if (this.worker) { this.worker.terminate(); this.worker = null; } for (const r of this._wait.values()) r.rej(new Error('لغو شد')); this._wait.clear(); this.ready = false; this.busy = false; this.dl.reset(); }
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
