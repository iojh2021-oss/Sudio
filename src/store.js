// ذخیره/بارگذاری پروژه (فایل JSON) + ذخیرهٔ خودکار در مرورگر (در صورت دسترسی)
const KEY = 'sudio.project.v2', SKEY = 'sudio.settings.v1';
export const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
export const safeSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
export const autosave = (obj) => safeSet(KEY, JSON.stringify(obj));
export function autoload() { const s = safeGet(KEY); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
export const saveSettings = (o) => safeSet(SKEY, JSON.stringify(o));
export function loadSettings() { try { return JSON.parse(safeGet(SKEY) || '{}') || {}; } catch (e) { return {}; } }
export function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
export const downloadJSON = (obj, name) => downloadBlob(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }), name);
export const readFileText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('خواندن فایل ممکن نشد')); r.readAsText(file); });
