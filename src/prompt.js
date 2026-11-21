// «کارگردان متنیِ» آفلاین: توضیح فارسی/انگلیسی ← صحنه + شخصیت‌ها + دیالوگ + مسیر + دوربین.
// قاعده‌محور است (نه مدل زبانی)؛ هرچه می‌فهمد را در notes برمی‌گرداند تا کاربر ببیند چه برداشتی شده.
import { toLatinDigits, clamp } from './util.js';
import { speech } from './speech.js';
import { PRESETS } from './character.js';

const norm = (s) => toLatinDigits(String(s || '')).replace(/[‌‍]/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();
const has = (t, re) => re.test(t);
const WHO = [
  ['detective', /کارآگاه|کاراگاه|detective|(?<![\u0600-\u06ff])مرد(?![\u0600-\u06ff])|(?<![\u0600-\u06ff])آقا(?![\u0600-\u06ff])|(?<![\u0600-\u06ff])پسر(?![\u0600-\u06ff])|\bman\b|\bguy\b|\bboy\b|\bhe\b/],
  ['woman', /(?<![\u0600-\u06ff])زن(?![\u0600-\u06ff])|خانم|بانو|(?<![\u0600-\u06ff])دختر(?![\u0600-\u06ff])|\bwoman\b|\blady\b|\bgirl\b|\bfemale\b|\bshe\b/],
  ['worker', /کارگر|worker/], ['child', /کودک|بچه|child|kid/], ['robot', /ربات|robot|android/],
];
const WALK = /راه\s*(می\s*رود|می\s*رفت|برو|بره|رفتن)|قدم\s*(می\s*زند|بزن)|walks?|walking|strolls?/;
const RUN = /می\s*دود|بدو|فرار|run(s|ning)?|sprints?/;
const STOP = /می\s*ایستد|بایست|توقف|stops?|stands?/;
const SAY = /می\s*گوید|می\s*گفت|بگو|می\s*پرسد|فریاد|says?|asks?|whispers?|shouts?/;

export function parsePrompt(text) {
  const notes = [], raw = String(text || '').replace(/[‌‍]/g, ' '), t = norm(raw);
  const env = {};
  if (has(t, /باران|بارون|rain|storm|طوفان/)) { env.rain = has(t, /شدید|سیل|طوفان|heavy|storm/) ? .95 : .7; notes.push('باران ' + (env.rain > .9 ? 'شدید' : '')); } else if (has(t, /صاف|بدون باران|clear|dry/)) { env.rain = 0; notes.push('بدون باران'); }
  if (has(t, /مه|غبار|دود|fog|mist|haze|smog/)) { env.fog = has(t, /غلیظ|سنگین|dense|thick/) ? .95 : .65; notes.push('مه'); } else if (env.rain == null && has(t, /صاف|clear/)) env.fog = .15;
  if (has(t, /شب|night|midnight|نیمه\s*شب/)) { env.time = 'night'; notes.push('شب'); } else if (has(t, /غروب|عصر|dusk|sunset|evening/)) { env.time = 'dusk'; notes.push('غروب'); } else if (has(t, /سپیده|طلوع|صبح زود|dawn|sunrise/)) { env.time = 'dawn'; notes.push('سپیده‌دم'); } else if (has(t, /روز|ظهر|day|noon|morning|صبح/)) { env.time = 'day'; notes.push('روز'); }
  if (has(t, /نوآر|noir|سیاه\s*و\s*سفید|black and white/)) { env.mood = 'noir'; notes.push('سبک نوآر'); } else if (has(t, /رنگی|colorful|color/)) { env.mood = 'color'; notes.push('رنگی'); } else if (has(t, /قرمز|red/)) env.mood = 'red';
  if (has(t, /مرکز شهر|downtown|آسمان\s*خراش|skyscraper|برج/)) { env.district = 'downtown'; notes.push('مرکز شهر'); } else if (has(t, /قدیمی|old|کهنه|historic/)) { env.district = 'old'; notes.push('محلهٔ قدیمی'); } else if (has(t, /صنعتی|کارخانه|industrial|factory/)) { env.district = 'industrial'; notes.push('منطقهٔ صنعتی'); } else if (has(t, /خلوت|ساکت|quiet|empty|متروک/)) { env.district = 'quiet'; notes.push('خیابان خلوت'); }
  if (has(t, /شلوغ|ترافیک|busy|traffic/)) env.traffic = 1.6; else if (has(t, /خلوت|بدون ماشین|empty/)) env.traffic = .3;
  const BIO = [['forest', /جنگل|درختان|forest|woods|woodland|jungle/], ['desert', /بیابان|صحرا|کویر|desert|dune|sahara/], ['snow', /برف|زمستان|snow|winter|arctic|tundra|قطب/], ['beach', /ساحل|دریا|اقیانوس|beach|seaside|ocean|coast|shore/], ['mountain', /کوهستان|کوه|صخره|mountain|alps|cliff|canyon/], ['meadow', /دشت|مرغزار|چمنزار|مزرعه|روستا|تپه|meadow|field|farm|village|countryside|grassland|valley/]];
  const bio = BIO.find(([, re]) => has(t, re));
  if (bio) {
    env.biome = bio[0]; notes.push('محیط: ' + { forest: 'جنگل', desert: 'بیابان', snow: 'برفی', beach: 'ساحل', mountain: 'کوهستان', meadow: 'دشت' }[bio[0]]);
    if (env.time == null) env.time = 'day'; if (env.rain == null) env.rain = 0; if (env.fog == null) env.fog = .22; if (env.mood == null) env.mood = 'color'; env.traffic = 0;
  } else if (has(t, /شهر|خیابان|city|street|downtown|urban/) || env.district) env.biome = 'city'; else env.biome = 'city';

  let camera = 'follow';
  if (has(t, /هوایی|از بالا|aerial|drone|crane/)) camera = 'aerial'; else if (has(t, /روبه\s*رو|رو به رو|سینمایی|نمای پایین|low angle|street level|front/)) camera = 'street'; else if (has(t, /مداری|orbit/)) camera = 'orbit';
  notes.push('دوربین: ' + ({ follow: 'دنبال‌کننده', aerial: 'هوایی', street: 'خیابانی', orbit: 'مداری' }[camera]));
  const dm = t.match(/(\d{1,3})\s*(ثانیه|sec|seconds|s\b)/), duration = dm ? clamp(+dm[1], 5, 600) : 0;

  // جمله‌ها (دیالوگ‌های داخل نقل‌قول از تقسیم‌بندی حفظ می‌شوند)
  const quotes = []; const masked = raw.replace(/[«"“](.+?)[»"”]/g, (m, q) => { quotes.push(q.trim()); return ' ⟦' + (quotes.length - 1) + '⟧ '; });
  const sents = masked.replace(/(⟦\d+⟧)/g, '$1.').split(/[.!؟?\n]+/).map((s) => s.trim()).filter(Boolean);
  const chars = [], script = []; let cursor = .6, subject = null, lastSpeaker = null;
  const mk = (preset, name) => { const i = chars.length, x = [-1.6, 1.6, -4, 4, 0, 6][i % 6]; const c = { key: 'p' + i, preset, name: name || PRESETS[preset].label + (chars.filter((q) => q.preset === preset).length ? ' ' + (chars.filter((q) => q.preset === preset).length + 1) : ''), x, z: -5 - i * 2.2 }; chars.push(c); return c; };
  // شخصیت‌ها: «دو مرد»، «یک زن» …
  const counts = { 'یک': 1, 'دو': 2, 'سه': 3, 'two': 2, 'three': 3, 'one': 1, 'a': 1, 'an': 1 };
  for (const s of sents) {
    const n = norm(s);
    for (const [preset, re] of WHO) {
      const m = n.match(new RegExp('(?:(یک|دو|سه|one|two|three|a|an)\\s+)?(?:' + re.source + ')', 'g'));
      if (!m) continue;
      const have = chars.filter((c) => c.preset === preset).length, want = Math.max(1, ...m.map((x) => counts[x.split(' ')[0]] || 1));
      for (let i = have; i < want; i++) mk(preset);
    }
  }
  if (!chars.length) { mk('detective'); notes.push('شخصیتی ذکر نشد؛ یک کارآگاه اضافه شد'); }
  // نام‌گذاری: «به نام X» / «named X»
  for (const m of raw.matchAll(/(?:به نام|اسمش|named|called)\s+([^\s,.،؟!"«»]+)/gi)) { const c = chars.find((q) => /^(?:کارآگاه|بانو|کارگر|کودک|ربات|مرد|زن)/.test(q.name)); if (c) c.name = m[1]; }

  const pick = (n) => { for (const [preset, re] of WHO) if (re.test(n)) { const c = chars.find((q) => q.preset === preset); if (c) return c; } return null; };
  for (const s of sents) {
    const n = norm(s); const subj = pick(n.replace(/⟦\d+⟧/g, '')) || subject || chars[0]; subject = subj;
    const qs = [...s.matchAll(/⟦(\d+)⟧/g)].map((m) => quotes[+m[1]]);
    const noq = n.replace(/⟦\d+⟧/g, '');
    if (has(noq, RUN)) { const d = has(noq, /تا|to |until/) ? 70 : 45; script.push({ t: +cursor.toFixed(2), who: subj.key, type: 'walk', dz: -d, run: true }); cursor += Math.min(6, d / 3.3); notes.push(subj.name + ' می‌دود'); }
    else if (has(noq, WALK)) { const d = has(noq, /چهارراه|تا |intersection|until/) ? 60 : 35; script.push({ t: +cursor.toFixed(2), who: subj.key, type: 'walk', dz: -d, run: false }); cursor += Math.min(7, d / 1.5 * .35); notes.push(subj.name + ' راه می‌رود'); }
    else if (has(noq, STOP)) { script.push({ t: +cursor.toFixed(2), who: subj.key, type: 'stop' }); cursor += .4; }
    for (const q of qs) {
      let who = subj;
      if (chars.length > 1 && !pick(noq)) who = chars[(chars.indexOf(lastSpeaker || chars[chars.length - 1]) + 1) % chars.length];     // گفتگوی نوبتی
      const sp = who.preset === 'child' ? 1.05 : 1, d = speech.plan(q, sp).dur;
      script.push({ t: +cursor.toFixed(2), who: who.key, type: 'say', text: q }); cursor += d + .5; lastSpeaker = who; subject = who; notes.push('دیالوگ ' + who.name);
    }
  }
  if (duration && cursor < duration) script.push({ t: duration, type: 'end' });
  else script.push({ t: +(cursor + 1.5).toFixed(2), type: 'end' });
  return { env, characters: chars, script, camera, duration: duration || +(cursor + 1.5).toFixed(2), notes: [...new Set(notes)] };
}
