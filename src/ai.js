// هوش مصنوعی متن‌به‌تصویر برای پس‌زمینهٔ صحنه. دو موتور:
//  janus: مدل Janus-Pro-1B داخل مرورگر (WebGPU، حدود ۲٫۴ گیگابایت دانلود، یک‌بار)
//  http : هر سرور/برنامهٔ سازگار با AUTOMATIC1111 (/sdapi/v1/txt2img) مثل Local Dream روی همان گوشی یا ComfyUI/Forge روی رایانه
import { BIOMES } from './biomes.js';
import { scanStore, clearStore, opfsReadOk } from './dl.js';

const BIO_EN = { city: 'a film noir city street with tall art deco skyscrapers, wet asphalt, street lamps', forest: 'a dense misty forest with tall pine and oak trees and a dirt trail', desert: 'a vast sandy desert with dunes, cacti and distant red mesas', snow: 'a snowy winter landscape with frosty pine trees and snow drifts', meadow: 'a green countryside meadow with wildflowers, wooden fence and a small farmhouse', beach: 'a tropical beach with palm trees, golden sand and turquoise sea', mountain: 'a rugged rocky mountain valley with snow-capped peaks' };
const TIME_EN = { night: 'at night, moonlit, dark blue sky', dusk: 'at sunset, golden hour, orange sky', dawn: 'at dawn, soft pink light', day: 'in bright daylight, blue sky with clouds' };

export function scenePrompt(env) {
  const b = BIO_EN[env.biome] || BIO_EN.city, t = TIME_EN[env.time] || '', w = [env.rain > .3 ? 'rainy' : '', env.fog > .5 ? 'thick fog' : env.fog > .25 ? 'light mist' : '', env.mood === 'noir' ? 'black and white noir' : ''].filter(Boolean).join(', ');
  return `wide panoramic cinematic view of ${b} ${t}${w ? ', ' + w : ''}, no people, highly detailed, atmospheric`;
}
export const BIOME_LABEL = (id) => (BIOMES[id] || BIOMES.city).label;

export async function detectWebGPU() {
  try { if (!navigator.gpu) return { ok: false, why: 'این مرورگر WebGPU ندارد (Chrome/Edge ۱۱۳+ روی اندروید ۱۲+ لازم است)' }; const a = await navigator.gpu.requestAdapter(); if (!a) return { ok: false, why: 'کارت گرافیک سازگار با WebGPU پیدا نشد' }; const L = a.limits || {}; let info = {}; try { info = a.info || (a.requestAdapterInfo && await a.requestAdapterInfo()) || {}; } catch (e) {} return { ok: true, f16: a.features.has('shader-f16'), maxBuf: L.maxBufferSize || 0, maxStor: L.maxStorageBufferBindingSize || 0, gpu: [info.vendor, info.architecture, info.description].filter(Boolean).join(' '), mem: navigator.deviceMemory || 0 }; } catch (e) { return { ok: false, why: String(e.message || e) }; }
}

const LD = 'Local Dream';
export class GenError extends Error { constructor(title, reason, hints = [], tech = '') { super(title); this.title = title; this.reason = reason; this.hints = hints; this.tech = tech; } }
export function explainGenError(e, ctx = {}) {
  if (e instanceof GenError) return e; const m = String(e && e.message || e), tech = `${ctx.engine || ''} · ${ctx.url || ''} · size ${ctx.size || '-'} · steps ${ctx.steps || '-'} · ${m}`;
  if (/لغو/.test(m)) return new GenError('ساخت لغو شد', 'خودت ساخت را متوقف کردی.', [], tech);
  if (/Failed to fetch|NetworkError|Load failed|اتصال/.test(m)) return new GenError('اتصال به سرور برقرار نشد', 'برنامه نتوانست به آدرس سرور برسد.', ctx.engine === 'localdream' ? [`${LD} باید باز باشد و مدل در آن بارگذاری شده باشد (صفحهٔ Prompt را ببینی)`, 'آدرس باید دقیقاً http://127.0.0.1:8081 باشد', `${LD} را از لیست برنامه‌ها به کنار نکش؛ در تنظیمات باتری آن را «Unrestricted» کن`, 'اگر تازه APK را عوض کرده‌ای، از نسخهٔ v14 به بعد استفاده کن'] : ['سرور روشن باشد و آدرس درست باشد', 'برای رایانه: همان Wi-Fi و گزینهٔ --cors-allow-origins=*'], tech);
  if (/زمان انتظار|timeout|AbortError/i.test(m)) return new GenError('زمان انتظار تمام شد', 'سرور در مدت مجاز تصویری نفرستاد.', ['گام‌ها را کم کن (۸ تا ۱۰)', 'اندازهٔ تصویر را کوچک‌تر کن (۲۵۶)', 'گوشی را خنک نگه دار و برنامه‌های دیگر را ببند'], tech);
  if (/\b400\b|\b500\b|پاسخ سرور/.test(m)) return new GenError('سرور درخواست را رد کرد', 'پاسخ خطا از سرور رسید (' + m + ').', ctx.engine === 'localdream' ? ['اگر مدل NPU است، اندازهٔ تصویر باید با رزولوشن انتخابی در ' + LD + ' یکی باشد', 'در حالت CPU اندازه باید مضرب ۸ باشد (۲۵۶، ۳۸۴، ۵۱۲)', 'مدل را یک بار ببند و دوباره باز کن'] : ['پارامترها و نسخهٔ سرور را بررسی کن'], tech);
  if (/memory|alloc|OOM|رم/i.test(m)) return new GenError('حافظهٔ گوشی کافی نیست', 'سرور هنگام ساخت حافظه کم آورد.', ['اندازهٔ تصویر را کم کن (۲۵۶)', 'برنامه‌های پس‌زمینه را ببند', 'مدل کوچک‌تر یا حالت CPU انتخاب کن'], tech);
  return new GenError('ساخت تصویر ناموفق بود', m, ['یک بار «تست اتصال» بزن', 'گام و اندازه را کم کن و دوباره امتحان کن'], tech);
}
export const fmtBytes = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + ' MB' : Math.round(n / 1e3) + ' KB';
export const fmtEta = (s) => s == null || !isFinite(s) ? '—' : s < 60 ? Math.ceil(s) + ' ثانیه' : s < 3600 ? Math.ceil(s / 60) + ' دقیقه' : (s / 3600).toFixed(1) + ' ساعت';

// جمع‌کنندهٔ پیشرفت دانلود چندفایلی (درصد کل، سرعت، زمان باقی‌مانده، وضعیت هر فایل)
export class DownloadTracker {
  constructor(expected = 2.4e9) { this.expected = expected; this.reset(); }
  reset() { this.files = new Map(); this.samples = []; this.speed = 0; this.t0 = 0; }
  seed(list) { for (const f of list || []) this.files.set(f.file, { name: f.file, loaded: f.loaded, total: f.total || f.loaded, done: !!f.done }); }
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
const CACHE = 'transformers-cache', MODEL_RE = /Janus-Pro-1B-ONNX/, NEED = ['prepare_inputs_embeds_', 'language_model', 'lm_head', 'gen_head', 'image_decode'];
export async function modelCacheInfo() {
  const o = { cached: false, partial: false, saved: 0, total: 0, list: [], resumable: opfsReadOk() };
  try { const sc = await scanStore(); o.list = sc.files; o.saved = sc.saved; o.total = sc.total; if (sc.files.length && NEED.every((n) => sc.files.some((f) => f.file.includes(n) && f.done))) o.cached = true; } catch {}
  try { if (!o.cached && self.caches) { const ks = (await (await caches.open(CACHE)).keys()).filter((r) => MODEL_RE.test(r.url)); if (NEED.every((n) => ks.some((r) => r.url.includes(n)))) o.cached = true; } } catch {}
  o.partial = !o.cached && o.saved > 0; return o;
}
export async function clearModelCache() { let n = 0; try { n = (await scanStore()).files.length; await clearStore(); const c = await caches.open(CACHE); for (const r of await c.keys()) if (MODEL_RE.test(r.url)) { await c.delete(r); n++; } } catch {} return n; }
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false; return { free: (e.quota || 0) - (e.usage || 0), quota: e.quota || 0, persisted }; } catch { return null; }
}

export class AIBackdrop {
  constructor() { this.dl = new DownloadTracker(); this.engine = 'janus'; this.url = 'http://127.0.0.1:7860'; this.size = 512; this.opencl = false; this.steps = 20; this.worker = null; this.ready = false; this.busy = false; this._id = 0; this._wait = new Map(); this.onProgress = null; }
  _w() {
    if (this.worker) return this.worker;
    const w = this.worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === 'note') { this.onProgress && this.onProgress({ phase: 'note', text: m.text }); return; }
      if (m.type === 'info') { this.dl.expected = 2.4e9; return; }
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
  async download() { if (this.engine !== 'janus') return; await this._call({ type: 'download' }); }
  cancel() { if (this.worker) { this.worker.terminate(); this.worker = null; } for (const r of this._wait.values()) r.rej(new Error('لغو شد')); this._wait.clear(); this.ready = false; this.busy = false; this.dl.reset(); }
  async ping() {
    const base = this.url.replace(/\/+$/, ''), ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try { const r = await fetch(base + (this.engine === 'localdream' ? '/health' : '/sdapi/v1/options'), { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return true; }
    catch (e) { throw new Error(e.name === 'AbortError' ? 'پاسخی نیامد (۶ ثانیه)' : 'اتصال برقرار نشد (' + (e.message || e) + ')'); } finally { clearTimeout(t); }
  }
  // Local Dream: POST /generate → جریان SSE؛ رویداد complete تصویر RGB خام (base64) برمی‌گرداند
  estimateMs() { try { const v = +localStorage.getItem('sudio.ld.t.' + this.size + '.' + this.steps); if (v > 0) return v; } catch {} return Math.max(15000, this.steps * 12000 * Math.pow(this.size / 256, 2)); }
  cancelGen() { try { this._ctl && this._ctl.abort('cancel'); } catch {} }
  async _localDream(prompt) {
    const P = (stage, p, extra) => this.onProgress && this.onProgress(Object.assign({ phase: 'gen', stage, p }, extra || {})), base = this.url.replace(/\/+$/, ''), t0 = performance.now();
    const ctl = this._ctl = new AbortController(), to = setTimeout(() => ctl.abort('timeout'), 900000);
    try {
      P('connect', 0.02);
      try { const h = await fetch(base + '/health', { signal: ctl.signal }); if (!h.ok) throw new Error('HTTP ' + h.status); } catch (e) { if (ctl.signal.aborted) throw e; throw new Error('Failed to fetch (health)'); }
      P('send', 0.06); setTimeout(() => P('run', 0.1, { step: 0, total: this.steps }), 700);   // در APK پاسخ تا پایان ساخت نمی‌رسد؛ پس بعد از ارسال، مرحلهٔ «ساخت» است
      const r = await fetch(base + '/generate', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, signal: ctl.signal,
        body: JSON.stringify({ prompt, negative_prompt: 'people, text, watermark, logo, blurry, low quality', steps: this.steps, cfg: 7.5, size: this.size, scheduler: 'dpm', use_opencl: !!this.opencl, seed: Math.floor(Math.random() * 2e9) }) });
      if (!r.ok) { let b = ''; try { b = (await r.text()).slice(0, 200); } catch {} throw new Error('پاسخ سرور ' + r.status + (b ? ' ' + b : '')); }
      P('run', 0.1, { step: 0, total: this.steps });
      let img = null, w = 0, h = 0, err = null, buf = '';
      const feed = (chunk) => { buf += chunk; let k; while ((k = buf.search(/\r?\n\r?\n/)) >= 0) { const blk = buf.slice(0, k); buf = buf.slice(k).replace(/^\r?\n\r?\n/, ''); const d = blk.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join(''); if (!d) continue; let j; try { j = JSON.parse(d); } catch { continue; }
        if (j.type === 'progress') P('run', 0.1 + 0.8 * (j.step / Math.max(1, j.total_steps || this.steps)), { step: j.step, total: j.total_steps || this.steps, real: true }); else if (j.type === 'complete') { img = j.image; w = j.width; h = j.height; } else if (j.type === 'error') err = j.message; } };
      if (r.body && r.body.getReader) { const rd = r.body.getReader(), dec = new TextDecoder(); for (;;) { const { done, value } = await rd.read(); if (done) break; feed(dec.decode(value, { stream: true })); } feed('\n\n'); }
      else { const t = await r.text(); feed(t + '\n\n'); if (!img && !err) { try { const j = JSON.parse(t); if (j.message) err = j.message; } catch {} } }
      if (err) throw new Error('خطای ' + LD + ': ' + err); if (!img) throw new Error(LD + ' تصویری برنگرداند');
      P('decode', 0.94);
      const bin = atob(img), n = w * h, px = new Uint8ClampedArray(n * 4);
      if (bin.length < n * 3) throw new Error('اندازهٔ تصویر نامعتبر است'); for (let i = 0, j = 0, k = 0; i < n; i++) { px[j++] = bin.charCodeAt(k++); px[j++] = bin.charCodeAt(k++); px[j++] = bin.charCodeAt(k++); px[j++] = 255; }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(px, w, h), 0, 0);
      const blob = await new Promise((res, rej) => cv.toBlob((b) => b ? res(b) : rej(new Error('تبدیل تصویر ناموفق')), 'image/png'));
      try { localStorage.setItem('sudio.ld.t.' + this.size + '.' + this.steps, String(Math.round(performance.now() - t0))); } catch {}
      P('done', 1, { w, h, ms: Math.round(performance.now() - t0) }); return blob;
    } catch (e) { throw ctl.signal.aborted ? new Error(ctl.signal.reason === 'cancel' ? 'لغو شد' : 'زمان انتظار تمام شد') : e; } finally { clearTimeout(to); }
  }
  async generate(prompt) {
    if (this.busy) throw new Error('هنوز تصویر قبلی در حال ساخت است');
    this.busy = true;
    try { return await this._gen(prompt); } catch (e) { throw explainGenError(e, { engine: this.engine, url: this.url, size: this.size, steps: this.steps }); } finally { this.busy = false; }
  }
  async _gen(prompt) {
    {
      if (this.engine === 'janus') { await this.load(); const m = await this._call({ type: 'generate', prompt }); return m.blob; }
      if (this.engine === 'localdream') return await this._localDream(prompt);
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
    }
  }
}
