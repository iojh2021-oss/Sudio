// کارگردان: وضعیت پروژه، تایم‌لاین رویدادها (راه رفتن/گفتن/توقف) و پخش. بدون وابستگی به DOM → قابل آزمون در Node.
import { makeCharacter, walkTo, stop as stopWalk, stepCharacter, PRESETS } from './character.js';
import { clamp } from './util.js';
import { CH } from './world.js';

export const SAVE_VERSION = 2;
export class Director {
  constructor(hooks = {}) {
    this.hooks = hooks; this.seed = 20261120; this.env = { time: 'night', rain: .6, fog: .5, mood: 'noir', district: 'auto', traffic: 1, biome: 'city' };
    this.characters = []; this.script = []; this.duration = 30; this.selected = null; this.time = 0; this.playing = false; this.fired = new Set(); this.cameraMode = 'follow'; this.prompt = '';
  }
  get sel() { return this.characters.find((c) => c.id === this.selected) || this.characters[0] || null; }
  addCharacter(o = {}) { const c = makeCharacter({ x: ((this.characters.length % 4) - 1.5) * 1.8, z: -5 - this.characters.length * 1.6, ...o }); this.characters.push(c); this.selected = c.id; this.hooks.onChange && this.hooks.onChange(); return c; }
  removeCharacter(id) { this.characters = this.characters.filter((c) => c.id !== id); this.script = this.script.filter((e) => e.who !== id); if (this.selected === id) this.selected = this.characters[0] ? this.characters[0].id : null; this.hooks.onChange && this.hooks.onChange(); }
  // اعمال نتیجهٔ دستور متنی (جایگزین کامل صحنه)
  applyParsed(p) {
    Object.assign(this.env, p.env); this.characters = []; this.script = [];
    const map = {}; for (const c of p.characters) { const ch = this.addCharacter({ preset: c.preset, name: c.name, x: c.x, z: c.z }); map[c.key] = ch.id; }
    this.script = p.script.map((e) => ({ ...e, who: e.who ? map[e.who] : undefined })); this.cameraMode = p.camera; this.duration = p.duration; this.selected = this.characters[0] && this.characters[0].id;
    this.time = 0; this.fired.clear(); this.hooks.onChange && this.hooks.onChange();
  }
  addEvent(e) { this.script.push(e); this.script.sort((a, b) => a.t - b.t); this.duration = Math.max(this.duration, e.t + 3); this.hooks.onChange && this.hooks.onChange(); }
  play() { this.time = Math.min(this.time, this.duration); if (this.time >= this.duration - .05) this.rewind(); this.playing = true; this.hooks.onPlay && this.hooks.onPlay(true); }
  pause() { this.playing = false; this.hooks.onPlay && this.hooks.onPlay(false); }
  rewind() { this.time = 0; this.fired.clear(); for (const c of this.characters) { stopWalk(c); if (c._home) { c.x = c._home.x; c.z = c._home.z; c.heading = c._home.h; } } }
  snapshotHomes() { for (const c of this.characters) c._home = { x: c.x, z: c.z, h: c.heading }; }
  stopPlayback() { this.playing = false; this.rewind(); this.hooks.onPlay && this.hooks.onPlay(false); }
  _fire(e) {
    const ch = this.characters.find((c) => c.id === e.who);
    if (e.type === 'walk' && ch) { const tx = e.x != null ? e.x : ch.x + (e.dx || 0), tz = e.z != null ? e.z : ch.z + (e.dz || 0); walkTo(ch, tx, tz, !!e.run, !!e.append); }
    else if (e.type === 'stop' && ch) stopWalk(ch);
    else if (e.type === 'say' && ch) { this.hooks.onSay && this.hooks.onSay(ch, e.text, e); }
    else if (e.type === 'cam') { this.cameraMode = e.mode; this.hooks.onCamera && this.hooks.onCamera(e.mode); }
    else if (e.type === 'env') { Object.assign(this.env, e.env || {}); this.hooks.onEnv && this.hooks.onEnv(this.env); }
    else if (e.type === 'end') { this.pause(); this.hooks.onEnd && this.hooks.onEnd(); }
  }
  step(dt, input) {
    if (this.playing) {
      const t0 = this.time; this.time += dt;
      this.script.forEach((e, i) => { if (!this.fired.has(i) && e.t <= this.time && e.t >= t0 - 1e-6 - 99) { this.fired.add(i); this._fire(e); } });
      if (this.time >= this.duration + 1) { this.pause(); this.hooks.onEnd && this.hooks.onEnd(); }
    }
    for (const c of this.characters) stepCharacter(c, dt, c === this.sel ? input : null);
  }
  toJSON() {
    return { v: SAVE_VERSION, seed: this.seed, env: this.env, duration: this.duration, camera: this.cameraMode, prompt: this.prompt, selected: this.selected, script: this.script,
      characters: this.characters.map((c) => ({ id: c.id, name: c.name, preset: c.preset, x: +c.x.toFixed(3), z: +c.z.toFixed(3), heading: +c.heading.toFixed(3), speed: c.speed, scale: c.scale, voice: c.voice, colors: c.colors, look: c.look, motion: c.motion, sprite: c.sprite })) };
  }
  fromJSON(o) {
    if (!o || typeof o !== 'object') throw new Error('فایل پروژه نامعتبر است');
    if (o.v && o.v > SAVE_VERSION) throw new Error('این پروژه با نسخهٔ جدیدتری ساخته شده');
    this.seed = Number(o.seed) >>> 0 || this.seed; this.env = { ...this.env, ...(o.env || {}) }; this.duration = clamp(Number(o.duration) || 30, 3, 3600); this.cameraMode = o.camera || 'follow'; this.prompt = String(o.prompt || '');
    this.characters = (Array.isArray(o.characters) ? o.characters : []).slice(0, 12).map((c) => makeCharacter(c)); this.script = (Array.isArray(o.script) ? o.script : []).filter((e) => e && typeof e.t === 'number' && typeof e.type === 'string').slice(0, 500);
    this.selected = this.characters.some((c) => c.id === o.selected) ? o.selected : (this.characters[0] && this.characters[0].id); this.time = 0; this.fired.clear(); this.snapshotHomes(); this.hooks.onChange && this.hooks.onChange();
  }
}
export { PRESETS, CH };
