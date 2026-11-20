import { Renderer, QUALITY, TIMES } from './renderer.js';
import { CameraRig } from './camera.js';
import { Director } from './director.js';
import { PRESETS, hitCharacter, walkTo } from './character.js';
import { parsePrompt } from './prompt.js';
import { Voice } from './voice.js';
import { Recorder } from './recorder.js';
import { CSS } from './style.js';
import { DISTRICTS } from './world.js';
import { rayFromNdc, unprojectGround } from './mat.js';
import { clamp, fmtTime } from './util.js';
import * as store from './store.js';

const EXAMPLES = [
  'شب است و باران می‌بارد. یک مرد در خیابان مه‌آلود مرکز شهر راه می‌رود. مرد می‌گوید: «این شهر هیچ‌وقت نمی‌خوابد.» زن می‌گوید: «ولی همه‌چیز را می‌بیند.»',
  'غروب، یک بانو و یک کودک در محلهٔ قدیمی راه می‌روند. بانو می‌گوید: «زود برسیم خانه.» کودک می‌گوید: «باران می‌آید؟» دوربین هوایی، ۳۰ ثانیه',
  'A detective walks through the foggy industrial district at night. He says "Somebody left the lights on." camera street',
];
const h = (tag, props, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props || {})) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else e.setAttribute(k, v); } for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); return e; };

export function boot() {
  const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
  document.documentElement.lang = 'fa'; document.title = 'Sudio — استودیوی شهر سینمایی';
  const canvas = h('canvas', { id: 'stage' }); document.body.append(canvas);
  let renderer;
  try { renderer = new Renderer(canvas); } catch (e) { document.body.append(h('div', { class: 'splash' }, h('h1', null, 'WebGL2 در دسترس نیست'), h('p', null, e.message + ' — مرورگر را به‌روز کنید یا شتاب سخت‌افزاری را روشن کنید.'))); throw e; }
  const settings = Object.assign({ quality: 'auto', engine: 'formant', hud: false }, store.loadSettings());
  const cam = new CameraRig(), voice = new Voice(), rec = new Recorder(canvas, voice); voice.engine = settings.engine;
  let subtitle = null, subUntil = 0, toastT = 0, tab = 'prompt', pending = null;
  const toast = (m, ms = 2600) => { const t = $toast; t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); };
  const $toast = h('div', { class: 'toast' }), $sub = h('div', { class: 'sub' }), $hud = h('div', { class: 'hud' }), $prog = h('div', { class: 'prog' }, h('i'));
  const D = new Director({
    onSay: (ch, text) => { voice.say(ch, text); subtitle = ch.name + ': ' + text; subUntil = performance.now() + (Math.max(1.5, (voice.active.get(ch.id)?.dur || 2)) + .4) * 1000; },
    onChange: () => { applyEnv(); cam.mode = D.cameraMode; schedule(); }, onEnv: () => applyEnv(), onCamera: (m) => { cam.mode = m; },
    onPlay: (p) => { $play.textContent = p ? '⏸' : '▶'; if (p) voice.init(); else voice.stopAll(); }, onEnd: () => { if (rec.recording) finishRecording(); else toast('پایان نمایش'); },
  });
  function applyEnv() { renderer.setSeed(D.seed, D.env.district); renderer.setEnv({ time: D.env.time, rain: D.env.rain, fog: D.env.fog, mood: D.env.mood, traffic: D.env.traffic }); }
  function schedule() { clearTimeout(pending); pending = setTimeout(() => { renderPane(); store.autosave(D.toJSON()); }, 120); }

  // ---------- پروژهٔ اولیه ----------
  const saved = store.autoload();
  try { if (saved && saved.characters && saved.characters.length) D.fromJSON(saved); else throw 0; } catch (e) { D.prompt = EXAMPLES[0]; D.applyParsed(parsePrompt(D.prompt)); }
  D.snapshotHomes(); cam.mode = D.cameraMode; applyEnv();
  if (settings.quality !== 'auto') renderer.setQuality(settings.quality); else renderer.setQuality('medium');

  // ---------- واسط کاربری ----------
  const $play = h('button', { class: 'btn go', onclick: () => { if (D.playing) D.pause(); else { D.snapshotHomes(); D.play(); } } }, '▶');
  const $rec = h('button', { class: 'btn', onclick: () => toggleRecord() }, '⏺ ضبط');
  const $cam = h('button', { class: 'btn', onclick: () => { const m = ['follow', 'street', 'aerial', 'orbit']; cam.mode = D.cameraMode = m[(m.indexOf(cam.mode) + 1) % m.length]; toast('دوربین: ' + camName(cam.mode)); schedule(); } }, '🎥');
  const camName = (m) => ({ follow: 'دنبال‌کننده', street: 'خیابانی', aerial: 'هوایی', orbit: 'مداری' }[m]);
  const $stop = h('button', { class: 'btn', onclick: () => D.stopPlayback() }, '⏹');
  const top = h('div', { class: 'top' }, h('div', { class: 't' }, 'Sudio', h('small', null, 'استودیوی شهر سینمایی')), $play, $stop, $cam, $rec);
  const $tabs = h('div', { class: 'tabs' }), $pane = h('div', { class: 'pane' }), $sheet = h('div', { class: 'sheet' });
  const TABS = [['prompt', '✍ دستور'], ['chars', '🧍 شخصیت‌ها'], ['scene', '🌧 صحنه'], ['time', '🎞 تایم‌لاین'], ['proj', '💾 پروژه']];
  const handle = h('div', { class: 'handle', onclick: (e) => { if (e.target === handle || e.target.className === 'grip') $sheet.classList.toggle('closed'); } }, h('span', { class: 'grip' }, '⌃'), $tabs);
  $sheet.append(handle, $pane); document.body.append(top, h('div', { class: 'bar' }, $sheet), $sub, $toast, $hud, $prog);
  const setTab = (t) => { tab = t; $sheet.classList.remove('closed'); renderPane(); };
  TABS.forEach(([k, l]) => $tabs.append(h('button', { class: 'tab', 'data-k': k, onclick: () => setTab(k) }, l)));

  const slider = (label, min, max, step, val, on, fmt = (v) => v) => { const o = h('span', null, fmt(val)), i = h('input', { type: 'range', min, max, step, value: val }); i.addEventListener('input', () => { o.textContent = fmt(+i.value); on(+i.value); }); return h('div', null, h('label', null, label + ' ', o), i); };
  const select = (opts, val, on) => { const s = h('select', null, opts.map(([v, l]) => h('option', { value: v, ...(v === val ? { selected: '' } : {}) }, l))); s.addEventListener('change', () => on(s.value)); return s; };
  const TIME_L = { night: 'شب', dusk: 'غروب', dawn: 'سپیده‌دم', day: 'روز' };

  function paneChars() {
    const c = D.sel, box = h('div');
    box.append(h('div', { class: 'chips' }, D.characters.map((x) => h('button', { class: 'chip' + (x.id === D.selected ? ' on' : ''), onclick: () => { D.selected = x.id; renderPane(); } }, x.name))));
    box.append(h('label', null, 'افزودن شخصیت'), h('div', { class: 'chips' }, Object.entries(PRESETS).map(([k, p]) => h('button', { class: 'chip', onclick: () => { D.addCharacter({ preset: k }); D.snapshotHomes(); } }, '＋ ' + p.label))));
    if (!c) return box;
    const nm = h('input', { type: 'text', value: c.name }); nm.addEventListener('change', () => { c.name = nm.value.slice(0, 24); schedule(); });
    const say = h('input', { type: 'text', placeholder: 'متنی بنویس تا این شخصیت بگوید…' });
    const doSay = () => { const t = say.value.trim(); if (!t) return; voice.init(); D.hooks.onSay(c, t.slice(0, 400)); if (D.playing === false) { /* گفتن آزاد */ } };
    box.append(h('label', null, 'نام'), nm,
      h('div', { class: 'row' }, h('div', null, h('label', null, 'نقش/ظاهر'), select(Object.entries(PRESETS).map(([k, p]) => [k, p.label]), c.preset, (v) => { c.preset = v; schedule(); })), h('div', null, h('label', null, 'صدا'), select([['male', 'مرد'], ['female', 'زن'], ['child', 'کودک']], c.voice.gender, (v) => { c.voice.gender = v; c.voice.pitch = { male: 118, female: 214, child: 290 }[v]; renderPane(); }))),
      slider('زیروبمی صدا', 70, 400, 2, c.voice.pitch, (v) => { c.voice.pitch = v; schedule(); }, (v) => v + ' Hz'), slider('سرعت گفتار', .6, 1.6, .05, c.voice.rate, (v) => { c.voice.rate = v; schedule(); }, (v) => v.toFixed(2) + '×'),
      slider('سرعت راه رفتن', .6, 3, .1, c.speed, (v) => { c.speed = v; schedule(); }, (v) => v.toFixed(1) + ' m/s'), slider('اندازه', .5, 1.6, .05, c.scale, (v) => { c.scale = v; schedule(); }, (v) => v.toFixed(2) + '×'),
      h('label', null, 'گفتن'), h('div', { class: 'row' }, say, h('button', { class: 'btn pri', onclick: doSay }, '🗣 بگو')),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: () => { D.addEvent({ t: +D.time.toFixed(1), who: c.id, type: 'say', text: say.value.trim() || 'سلام' }); toast('دیالوگ به تایم‌لاین اضافه شد'); } }, '＋ افزودن دیالوگ به تایم‌لاین'), h('button', { class: 'btn', onclick: () => { if (confirm('این شخصیت حذف شود؟')) D.removeCharacter(c.id); } }, '🗑 حذف')),
      h('p', { class: 'note' }, 'برای حرکت: روی خیابان لمس کن تا شخصیت انتخاب‌شده بروید، روی خود شخصیت بزن تا انتخاب شود، یا از جوی‌استیک/کلیدهای W A S D استفاده کن. با دو انگشت زوم و با کشیدن چرخش دوربین.'));
    return box;
  }
  function panePrompt() {
    const ta = h('textarea', { placeholder: 'صحنه را توصیف کن: شب، باران، مه، شخصیت‌ها، راه رفتن و دیالوگ داخل «گیومه»…' }); ta.value = D.prompt;
    const notes = h('div', { class: 'note' }, D.notes ? 'برداشت: ' + D.notes : 'پس از «ساخت صحنه» برداشت برنامه از متن این‌جا نوشته می‌شود.');
    const go = () => { D.prompt = ta.value; const p = parsePrompt(ta.value); D.applyParsed(p); D.snapshotHomes(); D.notes = p.notes.join(' • '); cam.fp = null; toast('صحنه ساخته شد — ▶ را بزن'); renderPane(); };
    return h('div', null, h('label', null, 'دستور متنی (فارسی یا انگلیسی)'), ta, h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn pri', onclick: go }, '✨ ساخت صحنه'), h('button', { class: 'btn', onclick: () => { ta.value = EXAMPLES[(EXAMPLES.indexOf(ta.value) + 1) % EXAMPLES.length]; } }, '🎲 نمونه')), notes,
      h('p', { class: 'note' }, 'این بخش یک تحلیل‌گر قاعده‌محور آفلاین است (نه مدل هوش مصنوعی): زمان روز، باران/مه، محله، شخصیت‌ها، راه رفتن/دویدن، دوربین، مدت و دیالوگ‌های داخل «» را می‌فهمد.'));
  }
  function paneScene() {
    return h('div', null,
      h('div', { class: 'row' }, h('div', null, h('label', null, 'زمان'), select(TIMES.map((k) => [k, TIME_L[k]]), D.env.time, (v) => { D.env.time = v; applyEnv(); schedule(); })), h('div', null, h('label', null, 'سبک رنگ'), select([['noir', 'نوآر'], ['red', 'نوآر + قرمز'], ['color', 'رنگی']], D.env.mood, (v) => { D.env.mood = v; applyEnv(); schedule(); }))),
      slider('باران', 0, 1, .05, D.env.rain, (v) => { D.env.rain = v; applyEnv(); schedule(); }, (v) => Math.round(v * 100) + '٪'), slider('مه', 0, 1, .05, D.env.fog, (v) => { D.env.fog = v; applyEnv(); schedule(); }, (v) => Math.round(v * 100) + '٪'),
      slider('ترافیک', 0, 2, .1, D.env.traffic ?? 1, (v) => { D.env.traffic = v; applyEnv(); schedule(); }, (v) => v.toFixed(1) + '×'),
      h('div', { class: 'row' }, h('div', null, h('label', null, 'محله'), select([['auto', 'خودکار'], ...DISTRICTS.map((d) => [d.id, d.label])], D.env.district || 'auto', (v) => { D.env.district = v; applyEnv(); schedule(); })), h('div', null, h('label', null, 'دانهٔ شهر (seed)'), (() => { const i = h('input', { type: 'number', value: D.seed }); i.addEventListener('change', () => { D.seed = (+i.value) >>> 0; applyEnv(); schedule(); }); return i; })())),
      h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { D.seed = (Math.random() * 1e9) >>> 0; applyEnv(); schedule(); renderPane(); toast('شهر تازه ساخته شد'); } }, '🎲 شهر تصادفی'),
      h('div', { class: 'row' }, h('div', null, h('label', null, 'کیفیت'), select([['auto', 'خودکار (روان)'], ['low', 'پایین'], ['medium', 'متوسط'], ['high', 'بالا']], settings.quality, (v) => { settings.quality = v; store.saveSettings(settings); renderer.setQuality(v === 'auto' ? 'medium' : v); })), h('div', null, h('label', null, 'دوربین'), select([['follow', 'دنبال‌کننده'], ['street', 'خیابانی'], ['aerial', 'هوایی'], ['orbit', 'مداری']], cam.mode, (v) => { cam.mode = D.cameraMode = v; schedule(); }))),
      slider('زاویهٔ دید', 35, 90, 1, cam.fov, (v) => { cam.fov = v; }, (v) => v + '°'),
      h('label', null, 'موتور صدا'), select([['formant', 'داخلی آفلاین (قابل ضبط)'], ['system', 'صدای سیستم (قابل ضبط نیست)']], settings.engine, (v) => { settings.engine = voice.engine = v; store.saveSettings(settings); }));
  }
  function paneTime() {
    const box = h('div', null, slider('مدت نمایش', 5, 300, 1, D.duration, (v) => { D.duration = v; schedule(); }, (v) => fmtTime(v)));
    box.append(h('div', { class: 'row', style: 'margin:8px 0' }, h('button', { class: 'btn', onclick: () => { const c = D.sel; if (!c) return; D.addEvent({ t: +D.time.toFixed(1), who: c.id, type: 'walk', x: c.x, z: c.z - 20, run: false }); } }, '＋ رفتن ۲۰ متر جلو'), h('button', { class: 'btn', onclick: () => { const c = D.sel; if (c) D.addEvent({ t: +D.time.toFixed(1), who: c.id, type: 'stop' }); } }, '＋ توقف')));
    if (!D.script.length) box.append(h('p', { class: 'note' }, 'هنوز رویدادی نیست. از تب «دستور» صحنه بساز یا از «شخصیت‌ها» دیالوگ اضافه کن.'));
    D.script.forEach((e, i) => { const c = D.characters.find((x) => x.id === e.who), T = { say: '🗣', walk: '🚶', stop: '✋', cam: '🎥', env: '🌧', end: '🏁' }[e.type] || '•';
      box.append(h('div', { class: 'ev' }, h('b', null, fmtTime(e.t) + '.' + Math.round((e.t % 1) * 10)), h('span', null, T + ' ' + (c ? c.name + ' ' : '') + (e.text || (e.type === 'walk' ? (e.run ? 'می‌دود' : 'راه می‌رود') : ''))), h('button', { class: 'btn sm', onclick: () => { D.time = e.t; } }, '↦'), h('button', { class: 'btn sm', onclick: () => { D.script.splice(i, 1); schedule(); } }, '✕'))); });
    return box;
  }
  function paneProj() {
    const file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    file.addEventListener('change', async () => { try { D.fromJSON(JSON.parse(await store.readFileText(file.files[0]))); toast('پروژه بارگذاری شد'); } catch (e) { toast('خطا: ' + e.message, 4000); } file.value = ''; });
    return h('div', null, h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => store.downloadJSON(D.toJSON(), 'sudio-project.json') }, '💾 ذخیره'), h('button', { class: 'btn', onclick: () => file.click() }, '📂 بازکردن'), file,
      h('button', { class: 'btn', onclick: () => { renderer.render(frameState()); canvas.toBlob((b) => b && store.downloadBlob(b, 'sudio-shot.png')); } }, '📷 عکس')),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn pri', onclick: toggleRecord }, rec.recording ? '⏹ پایان ضبط' : '⏺ ضبط ویدیوی کل نمایش'), h('button', { class: 'btn', onclick: () => { settings.hud = !settings.hud; store.saveSettings(settings); } }, '📊 آمار')),
      h('p', { class: 'note' }, rec.supported ? 'ضبط، تصویر و صدای گفتار را با هم می‌گیرد و پس از پایان نمایش ' + (rec.mime.includes('mp4') ? 'MP4' : 'WebM') + ' ذخیره می‌کند.' : 'این مرورگر ضبط ویدیو را پشتیبانی نمی‌کند؛ از «عکس» استفاده کن.'),
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn', onclick: () => { if (confirm('همهٔ پروژه پاک و صحنهٔ نمونه ساخته شود؟')) { D.prompt = EXAMPLES[0]; D.applyParsed(parsePrompt(D.prompt)); D.snapshotHomes(); } } }, '🆕 پروژهٔ تازه')));
  }
  function renderPane() { $tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.k === tab)); const f = { prompt: panePrompt, chars: paneChars, scene: paneScene, time: paneTime, proj: paneProj }[tab]; const y = $pane.scrollTop; $pane.replaceChildren(f()); $pane.scrollTop = y; }
  async function finishRecording() { const r = await rec.stop(); $rec.classList.remove('rec'); $rec.textContent = '⏺ ضبط'; if (r) { store.downloadBlob(r.blob, 'sudio-video.' + r.ext); toast('ویدیو ذخیره شد (' + (r.blob.size / 1e6).toFixed(1) + ' MB)', 4000); } renderPane(); }
  function toggleRecord() {
    if (rec.recording) { D.pause(); finishRecording(); return; }
    try { D.stopPlayback(); D.snapshotHomes(); cam.fp = null; rec.start(30); $rec.classList.add('rec'); $rec.textContent = '⏹ پایان'; D.play(); toast('ضبط شروع شد'); } catch (e) { toast(e.message, 4000); }
  }

  // ---------- ورودی لمسی/ماوس/کیبورد ----------
  const ptrs = new Map(); let drag = false, tapT = 0, pinch = 0;
  const ndc = (e) => { const r = canvas.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; };
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); drag = false; tapT = performance.now(); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) cam.zoom(pinch / d); pinch = d; drag = true; return; }
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) drag = true; if (drag) cam.orbit(dx, dy);
  });
  const endPtr = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (!p || drag || ptrs.size || performance.now() - tapT > 450) return; tap(e); };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.zoom(e.deltaY > 0 ? 1.1 : .9); }, { passive: false });
  function tap(e) {
    const [nx, ny] = ndc(e), r = rayFromNdc(renderer.invVP, nx, ny); let best = null, bd = 1e9;
    for (const c of D.characters) { const d = hitCharacter(c, r.o, r.d); if (d > 0 && d < bd) { bd = d; best = c; } }
    if (best) { D.selected = best.id; toast('انتخاب: ' + best.name); renderPane(); return; }
    const g = unprojectGround(renderer.invVP, nx, ny); const c = D.sel; if (g && c && Math.hypot(g.x - cam.pos[0], g.z - cam.pos[2]) < 140) { walkTo(c, g.x, g.z, run); voice.init(); }
  }
  // جوی‌استیک
  const input = { x: 0, z: 0, run: false }; let run = false;
  const knob = h('i'), joy = h('div', { class: 'joy' }, knob), runb = h('button', { class: 'runb', onclick: () => { run = !run; runb.classList.toggle('on', run); } }, 'دویدن'); document.body.append(joy, runb);
  const joyMove = (e) => { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } knob.style.transform = `translate(${dx * 30}px,${dy * 30}px)`; joyV = [dx, dy]; };
  let joyV = [0, 0], joyOn = false; joy.addEventListener('pointerdown', (e) => { joy.setPointerCapture(e.pointerId); joyOn = true; joyMove(e); voice.init(); }); joy.addEventListener('pointermove', (e) => joyOn && joyMove(e));
  const joyEnd = () => { joyOn = false; joyV = [0, 0]; knob.style.transform = ''; }; joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
  const keys = new Set();
  addEventListener('keydown', (e) => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; keys.add(e.code); if (e.code === 'Space') { e.preventDefault(); $play.click(); } });
  addEventListener('keyup', (e) => keys.delete(e.code));
  function readInput() {
    let fx = -joyV[1], rx = joyV[0];
    if (keys.has('KeyW') || keys.has('ArrowUp')) fx += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) fx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) rx += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) rx -= 1;
    const y = cam.yaw, fwd = [-Math.sin(y), -Math.cos(y)], rgt = [Math.cos(y), -Math.sin(y)];
    input.x = fwd[0] * fx + rgt[0] * rx; input.z = fwd[1] * fx + rgt[1] * rx; input.run = run || keys.has('ShiftLeft'); return input;
  }

  // ---------- حلقهٔ اصلی + کیفیت تطبیقی ----------
  let last = performance.now(), t = 0, ema = 16, lowFor = 0, highFor = 0;
  const frameState = () => ({ camera: cam.state(), characters: D.characters, t });
  function frame(now) {
    const dtr = (now - last) / 1000; last = now; const dt = clamp(dtr, 0, .1); t += dt; ema += ((dtr * 1000) - ema) * .08;
    try {
      D.step(dt, readInput()); voice.update(); cam.update(dt, D.sel, t);
      renderer.render(frameState());
    } catch (e) { console.error(e); toast('خطای رسم: ' + e.message, 5000); return; }
    if (settings.quality === 'auto') {
      const budget = 1000 / (renderer.q.fps || 45);
      if (ema > budget * 1.25) { lowFor += dt; highFor = 0; } else if (ema < budget * .75) { highFor += dt; lowFor = 0; } else { lowFor = highFor = 0; }
      if (lowFor > 1.2) { lowFor = 0; if (renderer.scale > .42) { renderer.scale = Math.max(.4, renderer.scale - .08); } else if (renderer.qName !== 'low') renderer.setQuality('low'); }
      if (highFor > 5) { highFor = 0; const max = QUALITY.high.scale; if (renderer.scale < max) renderer.scale = Math.min(max, renderer.scale + .06); }
    }
    $prog.firstChild.style.width = (D.duration ? clamp(D.time / D.duration, 0, 1) * 100 : 0) + '%';
    if (subtitle && performance.now() < subUntil) $sub.textContent = subtitle; else { $sub.textContent = ''; subtitle = null; }
    if (settings.hud) $hud.textContent = `fps ${(1000 / ema).toFixed(0)} | scale ${renderer.scale.toFixed(2)} | ${renderer.qName} | chunks ${renderer.stats.chunks} | draws ${renderer.stats.draws} | boxes ${renderer.stats.visibleBoxes}`; else $hud.textContent = '';
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); if (document.hidden) { D.pause(); voice.stopAll(); } });
  addEventListener('resize', () => renderer.resize());
  renderPane(); requestAnimationFrame(frame);
  // صفحهٔ خوش‌آمد (برای فعال‌شدن صدا نیاز به یک لمس است)
  const splash = h('div', { class: 'splash' }, h('h1', null, 'Sudio'), h('p', null, 'شهر سه‌بعدی بی‌پایان با مه و باران، شخصیت‌هایی که راه می‌روند و حرف می‌زنند. همه‌چیز آفلاین و روی گوشی ساخته می‌شود.'), h('button', { class: 'btn pri', onclick: () => { voice.init(); splash.remove(); $sheet.classList.add('closed'); D.snapshotHomes(); D.play(); } }, '▶ شروع نمایش'), h('button', { class: 'btn', onclick: () => splash.remove() }, 'ویرایش صحنه'));
  document.body.append(splash);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.Sudio = { D, renderer, cam, voice, rec, toast, tap, setTab };
}
