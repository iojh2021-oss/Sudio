import { Renderer, QUALITY, TIMES } from './renderer.js';
import { CameraRig } from './camera.js';
import { Director } from './director.js';
import { BIOMES, BIOME_IDS } from './biomes.js';
import { explainGenError, AIBackdrop, scenePrompt, detectWebGPU, modelCacheInfo, clearModelCache, storageInfo, fmtBytes, fmtEta } from './ai.js';
import { walkState } from './world.js';
import { PRESETS, hitCharacter, walkTo, rgbToHex, hexToRgb, effectiveColor, HATS } from './character.js';
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
  'روز است. یک مرد در جنگل انبوه و مه‌آلود راه می‌رود. مرد می‌گوید: «این درخت‌ها از من بزرگ‌ترند.» دوربین دنبال‌کننده',
  'غروب در ساحل. یک بانو و یک کودک کنار دریا قدم می‌زنند. کودک می‌گوید: «موج‌ها را ببین!»',
  'A man walks across the desert at sunset. He says "Water. I need water."',
  'سپیده‌دم در کوهستان برفی؛ یک کارگر راه می‌رود و می‌گوید: «هوا سرد است.»',
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
  function applyEnv() {
    const B = BIOMES[D.env.biome] || BIOMES.city; walkState.half = B.walk; walkState.city = B.id === 'city';
    for (const c of D.characters) { c.x = Math.max(-B.walk + .4, Math.min(B.walk - .4, c.x)); c.path.forEach((p) => { p.x = Math.max(-B.walk + .4, Math.min(B.walk - .4, p.x)); }); }
    renderer.setSeed(D.seed, D.env.district); renderer.setEnv({ time: D.env.time, rain: D.env.rain, fog: D.env.fog, mood: D.env.mood, traffic: D.env.traffic, biome: D.env.biome || 'city' });
  }
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
  const TABS = [['prompt', '✍ دستور'], ['chars', '🧍 شخصیت‌ها'], ['scene', '🌧 صحنه'], ['ai', '🤖 هوش مصنوعی'], ['time', '🎞 تایم‌لاین'], ['proj', '💾 پروژه']];
  const handle = h('div', { class: 'handle', onclick: (e) => { if (e.target === handle || e.target.className === 'grip') $sheet.classList.toggle('closed'); } }, h('span', { class: 'grip' }, '⌃'), $tabs);
  $sheet.append(handle, $pane); document.body.append(top, h('div', { class: 'bar' }, $sheet), $sub, $toast, $hud, $prog);
  const setTab = (t) => { tab = t; $sheet.classList.remove('closed'); renderPane(); };
  TABS.forEach(([k, l]) => $tabs.append(h('button', { class: 'tab', 'data-k': k, onclick: () => setTab(k) }, l)));

  const slider = (label, min, max, step, val, on, fmt = (v) => v) => { const o = h('span', null, fmt(val)), i = h('input', { type: 'range', min, max, step, value: val }); i.addEventListener('input', () => { o.textContent = fmt(+i.value); on(+i.value); }); return h('div', null, h('label', null, label + ' ', o), i); };
  const select = (opts, val, on) => { const s = h('select', null, opts.map(([v, l]) => h('option', { value: v, ...(v === val ? { selected: '' } : {}) }, l))); s.addEventListener('change', () => on(s.value)); return s; };
  const TIME_L = { night: 'شب', dusk: 'غروب', dawn: 'سپیده‌دم', day: 'روز' };

  // ——— هوش مصنوعی متن‌به‌تصویر برای پس‌زمینه ———
  const ai = new AIBackdrop(); let aiTxt = '', aiAuto = false, aiLastZ = null, aiStatus = 'آماده', aiThumb = null, aiBlob = null, aiGpu = null, aiPhase = 'idle', aiNote = '', aiCache = null, aiStore = null, aiSnap = null, aiErr = '', dlEls = null;
  const $pill = h('button', { class: 'dlpill', style: 'display:none', onclick: () => setTab('ai') });
  document.body.append($pill);
  const ltr = (x) => '\u2066' + x + '\u2069';
  const setAiStatus = (t) => { aiStatus = t; if (dlEls && dlEls.st) dlEls.st.textContent = t; };
  function paintDl() {
    const sn = aiSnap || ai.dl.snap(), pct = Math.round(sn.pct * 100);
    if ($pill) { const on = (aiPhase === 'downloading' || aiPhase === 'loading') && tab !== 'ai'; $pill.style.display = on ? '' : 'none'; $pill.textContent = aiPhase === 'loading' ? '⚙ آماده‌سازی مدل…' : '⬇ دانلود مدل هوش مصنوعی ' + ltr(pct + '٪'); }
    if (!dlEls || !dlEls.fill) return; const E = dlEls;
    const part = aiPhase === 'idle' && aiCache && aiCache.partial ? Math.min(99, Math.round(aiCache.saved / Math.max(ai.dl.expected, aiCache.total) * 100)) : 0; E.fill.style.width = (aiPhase === 'ready' || aiCache?.cached && aiPhase === 'idle' ? 100 : part || pct) + '%';
    E.chip.textContent = { idle: aiCache?.cached ? '✓ روی دستگاه ذخیره است' : aiCache?.partial ? '⏸ نیمه‌کاره (ذخیره شده)' : '⬜ هنوز دانلود نشده', downloading: '⬇ در حال دانلود', loading: '⚙ آماده‌سازی روی کارت گرافیک…', ready: '✓ مدل آماده است', error: '⚠ خطا' }[aiPhase];
    E.chip.className = 'chip2 ' + aiPhase;
    E.nums.textContent = aiPhase === 'downloading' || aiPhase === 'loading' ? `${ltr(fmtBytes(sn.loaded))} از ${ltr(fmtBytes(sn.total))} · ${ltr(pct + '٪')}` : aiCache?.cached || aiPhase === 'ready' ? 'مدل کامل در حافظهٔ مرورگر است؛ دفعهٔ بعد دانلود نمی‌شود' : aiCache?.partial ? `${ltr(fmtBytes(aiCache.saved))} از قبل ذخیره شده؛ «ادامه» از همان‌جا شروع می‌کند` : `حجم تقریبی: ${ltr(fmtBytes(ai.dl.expected))}`;
    E.speed.textContent = aiPhase === 'downloading' ? `سرعت ${ltr(sn.speed ? fmtBytes(sn.speed) + '/s' : '…')} · باقی‌مانده ${fmtEta(sn.eta)}` : '';
    E.files.replaceChildren(...sn.files.slice(0, 6).map((f) => { const p = f.total ? Math.round(f.loaded / f.total * 100) : 0; return h('div', { class: 'frow' }, h('span', null, f.name.split('/').pop()), h('i', null, h('b', { style: `width:${f.done ? 100 : p}%` })), h('em', null, f.done ? '✓' : p + '٪')); }));
    E.err.textContent = aiErr; E.note.textContent = aiPhase === 'downloading' ? aiNote : '';
  }
  function aiProgress(e) { if (e.phase === 'note') { aiNote = e.text; paintDl(); return; } if (e.phase === 'download') { aiSnap = e.snap; aiPhase = e.snap.allDone || e.snap.pct > .995 ? 'loading' : 'downloading'; paintDl(); } else if (e.phase === 'gen') { if (e.stage) gen.stage = e.stage; gen.p = Math.max(gen.p, e.p || 0); if (e.step != null) { gen.step = e.step; gen.total = e.total || gen.total; } if (e.real) gen.real = true; gen.note = e.note || (e.stage === 'run' ? '' : gen.note); paintGen(); } else setAiStatus('ساخت تصویر… ' + Math.round(e.p * 100) + '٪'); }
  const FLAG = 'sudio.ai.stage', flag = (v) => { try { v ? localStorage.setItem(FLAG, v) : localStorage.removeItem(FLAG); } catch {} }, getFlag = () => { try { return localStorage.getItem(FLAG); } catch { return null; } };
  let aiCrash = getFlag();                                   // اگر مقدار دارد یعنی بار قبل برنامه در همین مرحله بسته شده است
  let aiForce = false, aiPing = '';
  const isWeak = () => !!(aiGpu && (!aiGpu.ok || (!aiGpu.f16 && ((aiGpu.mem && aiGpu.mem <= 4) || (aiGpu.maxBuf && aiGpu.maxBuf < 1.5e9)))));
  async function aiLoad() {
    if (isWeak() && !aiForce && !ai.ready) { toast('این گوشی برای مدل داخل مرورگر ضعیف است؛ موتور «سرور» را انتخاب کن', 5000); return; }
    if (ai.ready || aiPhase === 'downloading' || aiPhase === 'loading') return; aiErr = ''; aiNote = ''; aiCrash = null; aiPhase = 'downloading'; ai.dl.reset(); try { const inf = await modelCacheInfo(); ai.dl.seed(inf.list); } catch {} aiSnap = ai.dl.snap(); ai.onProgress = aiProgress; paintDl();
    try {
      if (!(aiCache && aiCache.cached)) { flag('download'); await ai.download(); aiCache = await modelCacheInfo(); }
      flag('load'); aiPhase = 'loading'; aiNote = 'مرحلهٔ ۲: ساخت مدل در حافظه (فایل‌ها یکی‌یکی)…'; paintDl();
      await ai.load(); flag(null); aiPhase = 'ready'; aiCache = await modelCacheInfo(); aiStore = await storageInfo(); setAiStatus('مدل آماده است ✓'); toast('مدل هوش مصنوعی آماده شد');
    } catch (e) { flag(null); aiPhase = 'error'; aiErr = e.message === 'لغو شد' ? '' : 'خطا: ' + e.message + ' — «ادامه از همان‌جا» فایل‌های کامل‌شده را دوباره دانلود نمی‌کند.'; if (e.message === 'لغو شد') aiPhase = 'idle'; }
    paintDl(); if (tab === 'ai') renderPane();
  }
  // ---- کارت پیشرفت ساخت تصویر ----
  const STAGES = [['connect', 'اتصال'], ['send', 'ارسال'], ['run', 'ساخت'], ['decode', 'تصویر']];
  let gen = { on: false, stage: '', p: 0, step: 0, total: 0, t0: 0, est: 0, real: false, err: null, ok: null }, genEls = null, genTimer = 0;
  const secs = (ms) => Math.round(ms / 1000) + ' ثانیه';
  function paintGen() {
    if (!genEls) return; const E = genEls, g = gen, el = g.on ? performance.now() - g.t0 : 0;
    let p = g.p; if (g.on && g.stage === 'run' && !g.real) p = Math.max(p, Math.min(.9, .1 + .8 * el / Math.max(1000, g.est)));
    E.card.style.display = g.on || g.err || g.ok ? '' : 'none';
    E.fill.style.width = Math.round((g.on ? p : g.ok ? 1 : 0) * 100) + '%'; E.bar.className = 'dlbar' + (g.on && g.stage === 'run' ? ' busy' : '');
    const idx = g.ok ? 4 : STAGES.findIndex((x) => x[0] === g.stage);
    E.chips.replaceChildren(...STAGES.map((x, k) => h('span', { class: 'chip2 ' + (g.err && k === idx ? 'bad' : k < idx ? 'okc' : k === idx && g.on ? 'loading' : '') }, (k < idx ? '✓ ' : '') + x[1])));
    if (g.on) { const left = g.stage === 'run' ? Math.max(0, g.est - el) / 1000 : null;
      E.line.textContent = (g.stage === 'run' ? (g.real ? `گام ${ltr(g.step + ' از ' + g.total)}` : ai.engine === 'online' ? 'سرور در حال ساخت تصویر است…' : 'در حال ساخت تصویر روی گوشی…') : g.stage === 'connect' ? (g.note || 'در حال اتصال به سرور…') : g.stage === 'send' ? (g.note || 'ارسال درخواست…') : 'تبدیل و اعمال تصویر…') + ` · ${secs(el)} گذشته` + (left != null ? ` · ${left > 0 ? 'حدود ' + fmtEta(left) + ' مانده (تخمین)' : 'بیشتر از تخمین طول کشیده؛ ادامه دارد'}` : '');
      E.sub.textContent = g.stage === 'run' ? 'گوشی در حال اجراست؛ Local Dream و Sudio را نبند. در حالت CPU ممکن است چند دقیقه طول بکشد.' : ''; }
    else if (g.ok) { E.line.textContent = `✓ تصویر ${ltr(g.ok.w + '×' + g.ok.h)} در ${secs(g.ok.ms)} ساخته شد`; E.sub.textContent = ''; }
    else if (g.err) { E.line.textContent = '✗ ' + g.err.title; E.sub.textContent = ''; } else { E.line.textContent = ''; E.sub.textContent = ''; }
    E.cancel.style.display = g.on ? '' : 'none';
    E.err.replaceChildren(); if (g.err && !g.on) { E.err.append(h('div', { class: 'dl-err' }, g.err.reason || ''), ...(g.err.hints && g.err.hints.length ? [h('div', { class: 'dl-n' }, 'چه کار کنم؟'), h('ul', { class: 'hints' }, ...g.err.hints.map((x) => h('li', null, x)))] : []), h('div', { class: 'dl-n', style: 'direction:ltr;text-align:left;opacity:.6;word-break:break-all' }, g.err.tech || ''), h('button', { class: 'btn sm', onclick: aiGenerate }, '↻ تلاش دوباره')); }
  }
  function genTick() { clearInterval(genTimer); genTimer = setInterval(() => { if (!gen.on) { clearInterval(genTimer); return; } paintGen(); }, 300); }
  async function aiGenerate() {
    if (ai.busy) { toast('در حال ساخت تصویر…'); return; }
    const prompt = aiTxt.trim() || scenePrompt(D.env); ai.onProgress = aiProgress;
    if (ai.engine === 'janus' && !ai.ready) { await aiLoad(); if (!ai.ready) return; }
    gen = { on: true, stage: 'connect', p: .02, step: 0, total: ai.steps, t0: performance.now(), est: ai.engine === 'localdream' ? ai.estimateMs() : ai.engine === 'online' ? 20000 : ai.steps * 4000, real: false, err: null, ok: null }; genTick(); paintGen(); setAiStatus('شروع ساخت تصویر…');
    try {
      const blob = await ai.generate(prompt), bmp = await createImageBitmap(blob); renderer.setBackdrop(bmp);
      if (aiThumb) URL.revokeObjectURL(aiThumb); aiThumb = URL.createObjectURL(blob); aiBlob = blob; gen.on = false; gen.ok = { w: bmp.width, h: bmp.height, ms: Math.round(performance.now() - gen.t0) }; setAiStatus('پس‌زمینه اعمال شد ✓'); toast('پس‌زمینهٔ هوش مصنوعی اعمال شد');
    } catch (e) { const x = explainGenError(e, { engine: ai.engine, url: ai.url, size: ai.size, steps: ai.steps }); gen.on = false; gen.err = x; if (x.message === 'ساخت لغو شد') gen.err = null; setAiStatus(x.title); if (gen.err) toast(x.title, 4000); }
    paintGen(); if (tab === 'ai') renderPane();
  }
  function aiTick() { if (!aiAuto || ai.busy || !D.sel || !(ai.engine !== 'janus' || ai.ready)) return; if (aiLastZ == null) aiLastZ = D.sel.z; if (Math.abs(D.sel.z - aiLastZ) > 60) { aiLastZ = D.sel.z; aiGenerate(); } }
  function paneAI() {
    if (aiGpu == null) detectWebGPU().then((g) => { aiGpu = g; if (isWeak() && !ai.ready && !aiForce) { ai.engine = 'online'; } if (tab === 'ai') renderPane(); });
    if (aiCache == null) { aiCache = { cached: false }; modelCacheInfo().then((c) => { aiCache = c; if (c.partial) { ai.dl.expected = Math.max(ai.dl.expected, c.total); } storageInfo().then((x) => { aiStore = x; paintDl(); }); if (tab === 'ai') renderPane(); }); }
    const box = h('div'); dlEls = null;
    const ta = h('textarea', { placeholder: scenePrompt(D.env), style: 'min-height:70px;direction:ltr' }); ta.value = aiTxt; ta.addEventListener('input', () => { aiTxt = ta.value; });
    const st = h('div', { class: 'note' }, aiStatus);
    box.append(h('p', { class: 'note' }, 'مدل هوش مصنوعی واقعی و متن‌باز؛ تصویر ساخته‌شده به‌صورت پس‌زمینهٔ دور (افق) پشت دنیای سه‌بعدی گذاشته می‌شود و با راه رفتن می‌تواند تازه شود.'),
      h('label', null, 'موتور'), select([['janus', 'داخل مرورگر: Janus-Pro-1B (WebGPU)'], ['online', 'آنلاین رایگان (Pollinations) — بدون استفاده از قدرت گوشی'], ['localdream', 'Local Dream (برنامهٔ اندروید، همین گوشی)'], ['http', 'سرور سازگار با AUTOMATIC1111 (رایانه: Forge/ComfyUI)']], ai.engine, (v) => { ai.engine = v; if (v === 'localdream' && /:7860/.test(ai.url)) ai.url = 'http://127.0.0.1:8081'; if (v === 'http' && /:8081/.test(ai.url)) ai.url = 'http://127.0.0.1:7860'; renderPane(); }));
    if (ai.engine === 'janus') {
      const E = dlEls = { chip: h('span', { class: 'chip2' }), fill: h('b'), nums: h('div', { class: 'dl-n' }), speed: h('div', { class: 'dl-n' }), files: h('div', { class: 'files' }), err: h('div', { class: 'dl-err' }), note: h('div', { class: 'dl-n' }), st };
      const low = aiStore && aiStore.free && aiStore.free < ai.dl.expected * 1.15 && !aiCache?.cached;
      box.append(h('div', { class: 'dlcard' }, h('div', { class: 'dl-top' }, E.chip, h('small', null, aiGpu == null ? 'بررسی WebGPU…' : aiGpu.ok ? 'WebGPU ✓' : 'WebGPU ✗')),
        h('div', { class: 'dlbar' + (aiPhase === 'loading' ? ' busy' : '') }, E.fill), E.nums, E.speed, E.note, E.files, E.err,
        (navigator.deviceMemory && navigator.deviceMemory <= 3 && !aiCache?.cached) ? h('div', { class: 'dl-err' }, '⚠ رم این گوشی کم است (≈' + navigator.deviceMemory + ' گیگابایت)؛ ممکن است برنامه هنگام بارگذاری مدل بسته شود. موتور «سرور» مطمئن‌تر است.') : '',
        low ? h('div', { class: 'dl-err' }, `⚠ فضای خالی مرورگر (${fmtBytes(aiStore.free)}) برای مدل کم است؛ جا باز کن.`) : '',
        aiGpu && aiGpu.ok ? h('div', { class: 'dl-n', style: 'direction:ltr;text-align:left' }, `shader-f16: ${aiGpu.f16 ? 'YES' : 'NO'} · maxBuffer: ${fmtBytes(aiGpu.maxBuf)} · RAM≈${aiGpu.mem || '?'}GB · ${aiGpu.gpu || 'gpu?'}`) : '',
        aiGpu && !aiGpu.ok ? h('div', { class: 'dl-err' }, '✗ ' + aiGpu.why) : '',
        isWeak() ? h('div', { class: 'dl-err' }, '⚠ این گوشی (بدون shader-f16، رم ≈' + (aiGpu.mem || '?') + ' گیگ) برای Janus-Pro کافی نیست و برنامه هنگام بارگذاری بسته می‌شود. «بارگذاری» غیرفعال شد؛ از موتور «سرور» استفاده کن.') : '',
        isWeak() && !aiForce ? h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => { ai.engine = 'online'; renderPane(); } }, '➜ رفتن به موتور آنلاین'), h('button', { class: 'btn sm', onclick: () => { if (confirm('احتمال بسته‌شدن برنامه زیاد است. ادامه؟')) { aiForce = true; renderPane(); } } }, 'تلاش به‌هرحال')) : '',
        aiCrash ? h('div', { class: 'dl-err' }, aiCrash === 'download' ? '⚠ بار قبل برنامه وسط «دانلود» بسته شد. دانلود از همان‌جا ادامه دارد؛ اگر دوباره بسته شد، موتور «سرور» را انتخاب کن.' : '⚠ بار قبل برنامه وسط «ساخت مدل در حافظه» بسته شد (فایل‌ها کامل دانلود شده‌اند). یعنی رم گوشی برای این مدل کافی نیست؛ موتور «سرور» (مثلاً Local Dream) مطمئن‌تر است.') : '',
        h('div', { class: 'row', style: 'margin-top:8px' },
          aiPhase === 'downloading' || aiPhase === 'loading' ? h('button', { class: 'btn', onclick: () => { ai.cancel(); aiPhase = 'idle'; aiSnap = null; paintDl(); renderPane(); } }, '⏹ لغو')
            : h('button', { class: 'btn pri', onclick: aiLoad }, aiPhase === 'error' ? '↻ ادامه از همان‌جا' : aiCache?.cached || aiPhase === 'ready' ? '⚡ بارگذاری در حافظه' : aiCache?.partial ? '▶ ادامه دانلود' : '⬇ شروع دانلود'),
          aiCache?.cached || aiCache?.partial || aiPhase === 'ready' ? h('button', { class: 'btn', onclick: async () => { if (!confirm('مدل (و دانلود نیمه‌کاره) از حافظهٔ دستگاه پاک شود؟')) return; ai.cancel(); const n = await clearModelCache(); aiCache = { cached: false }; aiPhase = 'idle'; aiSnap = null; toast(n + ' فایل پاک شد'); renderPane(); } }, '🗑 پاک‌کردن مدل') : ''),
        h('p', { class: 'note' }, 'بار اول حدود ۲٫۴ گیگابایت است. هر بخش دانلودشده همان لحظه در حافظهٔ خصوصی مرورگر ذخیره می‌شود؛ اگر صفحه بسته شد یا اینترنت قطع شد، دفعهٔ بعد «ادامه دانلود» دقیقاً از همان‌جا ادامه می‌دهد (نه از اول). بهتر است روی Wi-Fi باشی.')));
      paintDl();
    } else if (ai.engine === 'online') {
      box.append(h('p', { class: 'note' }, 'تصویر روی سرور اینترنتی (Pollinations) ساخته می‌شود و گوشی فقط متن را می‌فرستد و تصویر را می‌گیرد؛ نیازی به مدل یا برنامهٔ دیگر نیست. محدودیت رایگان: هر ۴۵ ثانیه یک تصویر، با لوگوی کوچک. متن شما به سرور بیرونی ارسال می‌شود و نتیجه عمومی کش می‌شود؛ متن شخصی ننویس. اگر سایت در کشور شما فیلتر است، VPN لازم است.')); dlEls = { st };
    } else { const u = h('input', { type: 'text', value: ai.url, style: 'direction:ltr' }); u.addEventListener('change', () => { ai.url = u.value.trim(); });
      const pg = h('div', { class: 'note' }, aiPing);
      box.append(h('label', null, 'آدرس سرور'), u, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { pg.textContent = 'در حال تست…'; try { await ai.ping(); aiPing = '✓ سرور پاسخ داد'; } catch (e) { aiPing = '✗ ' + e.message; } pg.textContent = aiPing; } }, '🔌 تست اتصال'), pg), slider('تعداد گام', 1, 50, 1, ai.steps, (v) => { ai.steps = v; }, (v) => v), ...(ai.engine === 'localdream' ? [slider('اندازهٔ تصویر', 256, 768, 64, ai.size, (v) => { ai.size = v; }, (v) => v), (() => { const c = h('input', { type: 'checkbox' }); c.checked = ai.opencl; c.addEventListener('change', () => { ai.opencl = c.checked; }); return h('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:6px' }, c, 'شتاب با GPU (OpenCL) — بار اول برای هر اندازه کند است ولی بعدش سریع‌تر'); })()] : []), h('p', { class: 'note' }, 'مرورگر باید اجازهٔ دسترسی (CORS) داشته باشد. برای برنامهٔ محلی روی همین گوشی معمولاً آدرس http://127.0.0.1:پورت است.'),
        ai.engine === 'localdream' ? h('p', { class: 'note' }, 'راهنما: ۱) برنامهٔ متن‌باز Local Dream (xororz) را نصب کن. ۲) در آن یک مدل (مثلاً SD1.5) را باز کن و بگذار کامل بارگذاری شود؛ سرور فقط بعد از انتخاب مدل روشن می‌شود و برنامه باید باز بماند. ۳) به Sudio برگرد و «تست اتصال» بزن. اگر مدل NPU است، اندازهٔ تصویر باید با رزولوشن انتخابی در Local Dream یکی باشد؛ در حالت CPU فقط مضرب ۸ لازم است.') : h('p', { class: 'note' }, 'برای رایانه: AUTOMATIC1111 با --api --cors-allow-origins=* یا Forge؛ آدرس IP رایانه در همان Wi-Fi.')); dlEls = { st }; }
    genEls = { card: h('div', { class: 'dlcard', style: 'display:none;margin-top:8px' }), chips: h('div', { class: 'row', style: 'gap:4px' }), bar: null, fill: h('b'), line: h('div', { class: 'dl-n' }), sub: h('div', { class: 'dl-n', style: 'opacity:.7' }), err: h('div'), cancel: h('button', { class: 'btn sm', onclick: () => { ai.engine === 'localdream' || ai.engine === 'online' ? ai.cancelGen() : ai.cancel(); } }, '⏹ لغو ساخت') };
    genEls.bar = h('div', { class: 'dlbar', style: 'margin-top:6px' }, genEls.fill); genEls.card.append(genEls.chips, genEls.bar, genEls.line, genEls.sub, genEls.cancel, genEls.err); setTimeout(paintGen, 0);
    box.append(h('label', null, 'توصیف تصویر (انگلیسی؛ خالی = از روی صحنه ساخته می‌شود)'), ta,
      h('div', { class: 'row', style: 'margin-top:8px' }, h('button', { class: 'btn pri', onclick: aiGenerate }, '✨ ساخت پس‌زمینه'), h('button', { class: 'btn', onclick: () => { renderer.clearBackdrop(); setAiStatus('پس‌زمینه حذف شد'); } }, '🧹 حذف پس‌زمینه')), genEls.card, st);
    const chk = h('input', { type: 'checkbox' }); chk.checked = aiAuto; chk.addEventListener('change', () => { aiAuto = chk.checked; aiLastZ = null; });
    box.append(h('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px' }, chk, 'ساخت خودکار هر ۶۰ متر راه رفتن'));
    if (aiThumb) box.append(h('img', { src: aiThumb, style: 'width:100%;max-width:260px;border-radius:10px;margin-top:8px' }), h('button', { class: 'btn sm', onclick: () => aiBlob && store.downloadBlob(aiBlob, 'sudio-ai-backdrop.png') }, '💾 ذخیرهٔ تصویر'));
    return box;
  }
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
      h('label', null, 'شخصی‌سازی ظاهر'),
      h('div', { class: 'row3' }, [['coat', 'لباس'], ['pants', 'شلوار'], ['skin', 'پوست'], ['hair', 'مو'], ['hat', 'کلاه'], ['scarf', 'شال'], ['shoes', 'کفش']].map(([k, l]) => { const i = h('input', { type: 'color', value: rgbToHex(effectiveColor(c, k)) }); i.addEventListener('input', () => { c.colors = { ...(c.colors || {}), [k]: hexToRgb(i.value) }; schedule(); }); return h('div', { class: 'cc' }, h('span', null, l), i); })),
      h('div', { class: 'row' }, h('div', null, h('label', null, 'کلاه'), select(HATS, (c.look && c.look.hat) || '', (v) => { c.look = { ...(c.look || {}) }; if (v) c.look.hat = v; else delete c.look.hat; schedule(); })), h('div', null, h('label', null, 'مدل'), select([['', 'پیش‌فرض نقش'], ['dress', 'لباس بلند + مو بلند'], ['plain', 'کت و شلوار + مو کوتاه']], c.look && c.look.dress === 1 ? 'dress' : c.look && c.look.dress === 0 ? 'plain' : '', (v) => { c.look = { ...(c.look || {}) }; if (v === 'dress') { c.look.dress = 1; c.look.longHair = 1; } else if (v === 'plain') { c.look.dress = 0; c.look.longHair = 0; } else { delete c.look.dress; delete c.look.longHair; } schedule(); }))),
      slider('عرض بدن', .7, 1.5, .05, (c.look && c.look.width) || 1, (v) => { c.look = { ...(c.look || {}), width: v }; schedule(); }, (v) => v.toFixed(2) + '×'),
      h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { c.colors = null; c.look = {}; renderPane(); schedule(); } }, '↺ ظاهر نقش'),
        h('button', { class: 'btn sm', onclick: () => { const r = () => [Math.random(), Math.random(), Math.random()].map((n) => .08 + n * .8); c.colors = { coat: r(), pants: r(), hair: r(), hat: r(), scarf: r(), shoes: [.05, .05, .06] }; renderPane(); schedule(); } }, '🎲 ظاهر تصادفی'),
        h('button', { class: 'btn sm', onclick: () => { const n = D.addCharacter({ preset: c.preset, name: c.name + ' ۲', colors: c.colors && JSON.parse(JSON.stringify(c.colors)), look: { ...(c.look || {}) }, voice: { ...c.voice }, scale: c.scale, speed: c.speed }); D.snapshotHomes(); toast('کپی ساخته شد'); renderPane(); } }, '⧉ کپی')),
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
      h('label', null, 'محیط (پس‌زمینهٔ ساخته‌شده هنگام راه رفتن)'), select(BIOME_IDS.map((k) => [k, BIOMES[k].label]), D.env.biome || 'city', (v) => { D.env.biome = v; if (v !== 'city') { D.env.traffic = 0; if (D.env.time === 'night' && D.env.rain > .3) { D.env.rain = 0; } } else D.env.traffic = 1; applyEnv(); schedule(); renderPane(); }),
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
  function renderPane() { $tabs.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.k === tab)); const f = { prompt: panePrompt, ai: paneAI, chars: paneChars, scene: paneScene, time: paneTime, proj: paneProj }[tab]; const y = $pane.scrollTop; $pane.replaceChildren(f()); $pane.scrollTop = y; paintDl(); }
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
      D.step(dt, readInput()); aiTick(); voice.update(); cam.update(dt, D.sel, t);
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
  window.Sudio = { ai, D, renderer, cam, voice, rec, toast, tap, setTab, aiFeed: (x) => { aiPhase = 'downloading'; ai.dl.update(x); aiSnap = ai.dl.snap(); paintDl(); } };
}
