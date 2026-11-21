// دانلودکنندهٔ قابل‌ازسرگیری: فایل‌ها را تکه‌تکه در حافظهٔ خصوصی مرورگر (OPFS) می‌نویسد و با هدر Range از همان‌جا ادامه می‌دهد.
// بستن صفحه، قطع شدن اینترنت یا بستن برنامه پیشرفت را از بین نمی‌برد.
const DIR = 'sudio-ai', MAX_RETRY = 12;
export const opfsOk = () => { try { return !!(self.navigator && navigator.storage && navigator.storage.getDirectory) && typeof FileSystemFileHandle !== 'undefined' && 'createSyncAccessHandle' in FileSystemFileHandle.prototype; } catch { return false; } };
export const opfsReadOk = () => { try { return !!(self.navigator && navigator.storage && navigator.storage.getDirectory); } catch { return false; } };
export const fileKey = (url) => (/resolve\/[^/]+\/(.+)$/.exec(url) || [, url])[1];
const keyName = (url) => url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-180);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function dir() { const r = await navigator.storage.getDirectory(); return r.getDirectoryHandle(DIR, { create: true }); }
async function readMeta(d, n) { try { const fh = await d.getFileHandle(n + '.json'); return JSON.parse(await (await fh.getFile()).text()); } catch { return null; } }
async function writeMeta(d, n, obj) { const fh = await d.getFileHandle(n + '.json', { create: true }); const h = await openHandle(fh); try { h.truncate(0); h.write(new TextEncoder().encode(JSON.stringify(obj)), { at: 0 }); h.flush(); } finally { h.close(); } }
async function openHandle(fh) { for (let i = 0; ; i++) { try { return await fh.createSyncAccessHandle(); } catch (e) { if (i >= 10) throw e; await sleep(300); } } }

const inflight = new Map();
// ← {file: File, total} یا null اگر فایل روی سرور نیست (۴۰۴)
export function ensureFile(url, opts = {}) {
  if (inflight.has(url)) return inflight.get(url);
  const p = _ensure(url, opts).finally(() => inflight.delete(url)); inflight.set(url, p); return p;
}
async function _ensure(url, { report, onNote, fetchImpl = fetch } = {}) {
  const d = await dir(), name = keyName(url), bin = await d.getFileHandle(name + '.bin', { create: true });
  let meta = await readMeta(d, name), size = (await bin.getFile()).size;
  if (meta && meta.url === url && meta.done && meta.total === size) { report && report({ loaded: size, total: size }); return { file: await bin.getFile(), total: size }; }
  if (!meta || meta.url !== url) meta = { url, total: 0, done: false };
  let attempt = 0;
  for (;;) {
    let handle = null, before = 0;
    try {
      handle = await openHandle(bin); let offset = handle.getSize(); before = offset;
      if (meta.total && offset > meta.total) { handle.truncate(0); offset = 0; }
      const r = await fetchImpl(url, offset > 0 ? { headers: { Range: `bytes=${offset}-` } } : {});
      if (r.status === 404) { handle.close(); handle = null; return null; }
      if (r.status === 416 && meta.total && offset === meta.total) { handle.close(); handle = null; meta.done = true; await writeMeta(d, name, meta); return { file: await bin.getFile(), total: offset }; }
      if (r.status !== 200 && r.status !== 206) throw new Error('HTTP ' + r.status);
      let total;
      if (r.status === 206) { const m = /\/(\d+)\s*$/.exec(r.headers.get('content-range') || ''); total = m ? +m[1] : offset + (+r.headers.get('content-length') || 0); }
      else { handle.truncate(0); offset = 0; total = +r.headers.get('content-length') || 0; }
      if (meta.total !== total) { meta.total = total; meta.done = false; await writeMeta(d, name, meta); }
      report && report({ loaded: offset, total, resumed: before > 0 });
      const rd = r.body.getReader(); let since = 0, lastRep = 0;
      for (;;) {
        const { done, value } = await rd.read(); if (done) break;
        handle.write(value, { at: offset }); offset += value.length; since += value.length;
        if (since >= 4e6) { handle.flush(); since = 0; }
        const now = performance.now(); if (report && now - lastRep > 250) { lastRep = now; report({ loaded: offset, total }); }
      }
      handle.flush();
      if (total && offset < total) throw new Error('اتصال زودتر از موعد قطع شد');
      handle.close(); handle = null; meta.total = offset; meta.done = true; await writeMeta(d, name, meta);
      report && report({ loaded: offset, total: offset });
      return { file: await bin.getFile(), total: offset };
    } catch (e) {
      let grew = false; if (handle) { try { handle.flush(); grew = handle.getSize() > before; handle.close(); } catch {} }
      if (grew) attempt = 0; attempt++;
      if (attempt > MAX_RETRY) throw e;
      const wait = Math.min(1000 * 2 ** Math.min(attempt, 4), 15000); onNote && onNote(`اتصال قطع شد؛ تلاش دوباره (${attempt}) بعد از ${Math.round(wait / 1000)} ثانیه — از همان‌جا ادامه می‌دهد`);
      await sleep(wait); while (self.navigator && navigator.onLine === false) await sleep(2000);
    }
  }
}
// فهرست آنچه ذخیره شده (قابل‌خواندن از صفحهٔ اصلی)
export async function scanStore() {
  const out = { files: [], saved: 0, total: 0 };
  try {
    if (!opfsReadOk()) return out; const root = await navigator.storage.getDirectory(); let d; try { d = await root.getDirectoryHandle(DIR); } catch { return out; }
    for await (const [n, h] of d.entries()) { if (!n.endsWith('.json')) continue; const base = n.slice(0, -5), m = await readMeta(d, base); if (!m || !m.url) continue; let size = 0; try { size = (await (await d.getFileHandle(base + '.bin')).getFile()).size; } catch {}
      out.files.push({ file: fileKey(m.url), url: m.url, loaded: Math.min(size, m.total || size), total: m.total || 0, done: !!m.done && size === m.total }); }
    out.saved = out.files.reduce((a, f) => a + f.loaded, 0); out.total = out.files.reduce((a, f) => a + f.total, 0);
  } catch {}
  return out;
}
export async function clearStore() { try { const root = await navigator.storage.getDirectory(); await root.removeEntry(DIR, { recursive: true }); return true; } catch { return false; } }
