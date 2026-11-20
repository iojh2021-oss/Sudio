// صدا: موتور فرمانتیِ آفلاین (مرد/زن/کودک) از طریق WebAudio — قابل ضبط در ویدیو؛ گزینهٔ صدای سیستم هم هست.
import { speech } from './speech.js';
import { VOICE_BASE } from './character.js';
import { clamp } from './util.js';

export class Voice {
  constructor() { this.ctx = null; this.master = null; this.dest = null; this.active = new Map(); this.engine = 'formant'; this.volume = .9; }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
    this.dest = this.ctx.createMediaStreamDestination(); comp.connect(this.dest); return true;
  }
  params(ch, text) {
    const g = ch.voice.gender || 'male', b = VOICE_BASE[g] || VOICE_BASE.male;
    return { t: text, sp: clamp(ch.voice.rate || 1, .6, 1.6), f0: clamp(ch.voice.pitch || b.f0, 70, 400), vt: b.vt, em: ch.voice.em || 'neutral' };
  }
  // گفتن: زمان‌بندی و شکل دهان از همان برنامهٔ گفتار می‌آید
  say(ch, text) {
    const p = this.params(ch, text), plan = speech.plan(text, p.sp);
    const rec = { plan, start: 0, dur: plan.dur, ch };
    this.stop(ch);
    if (this.engine === 'system' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(text); u.rate = p.sp; u.pitch = clamp(p.f0 / 160, .5, 2); u.lang = /[A-Za-z]/.test(text) ? 'en-US' : 'fa-IR';
      const vs = speechSynthesis.getVoices(), want = ch.voice.gender === 'female' ? /female|woman|zira|samantha|fa/i : /male|david|mark|fa/i, v = vs.find((x) => x.lang.startsWith(u.lang.slice(0, 2)) && want.test(x.name)) || vs.find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
      if (v) u.voice = v; speechSynthesis.speak(u); rec.start = performance.now() / 1000; rec.sys = true;
    } else if (this.init()) {
      const src = this.ctx.createBufferSource(); src.buffer = speech.buffer(this.ctx, p); src.connect(this.master); src.start(); rec.start = this.ctx.currentTime; rec.src = src;
    } else rec.start = performance.now() / 1000;
    this.active.set(ch.id, rec); return rec;
  }
  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }
  stop(ch) { const r = this.active.get(ch.id); if (r) { try { r.src && r.src.stop(); } catch (e) { /* قبلاً تمام شده */ } this.active.delete(ch.id); } ch.mouth = 0; }
  stopAll() { for (const r of [...this.active.values()]) this.stop(r.ch); if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  // هر فریم: دهان شخصیت‌های در حال گفتن
  update() {
    const t = this.sys ? performance.now() / 1000 : null;
    for (const [id, r] of [...this.active]) {
      const tl = (r.sys ? performance.now() / 1000 : this.now()) - r.start;
      if (tl > r.dur + .2) { this.active.delete(id); r.ch.mouth = 0; continue; }
      r.ch.mouth = r.sys ? (.45 + .4 * Math.abs(Math.sin(tl * 11))) : speech.mouthAt(r.plan.syl, tl).open;
    } void t;
  }
  speaking(ch) { return this.active.has(ch.id); }
}
