// دوربین: دنبال‌کننده، خیابانی (روبه‌رو)، مداری (لمسی)، هوایی؛ همه نرم و بدون پرش
import { clamp, lerp, angDiff } from './util.js';
export class CameraRig {
  constructor() { this.mode = 'follow'; this.yaw = 0; this.pitch = .2; this.dist = 7.5; this.fov = 58; this.pos = [0, 3, 6]; this.target = [0, 1.4, 0]; this.fp = null; this.ft = null; this.shake = 0; this.cin = 0; }
  orbit(dx, dy) { this.yaw -= dx * .006; this.pitch = clamp(this.pitch + dy * .005, -.15, 1.35); }
  zoom(k) { this.dist = clamp(this.dist * k, 2.2, 60); }
  update(dt, ch, t) {
    const tx = ch ? ch.x : 0, tz = ch ? ch.z : 0, th = ch ? 1.45 * ch.scale : 1.4;
    let ep, et;
    if (this.mode === 'orbit') {
      const d = this.dist; ep = [tx + Math.sin(this.yaw) * Math.cos(this.pitch) * d, th + Math.sin(this.pitch) * d + .4, tz + Math.cos(this.yaw) * Math.cos(this.pitch) * d]; et = [tx, th, tz];
    } else if (this.mode === 'street') {                 // پایین، رو‌به‌رو، سینمایی (شخصیت به دوربین نزدیک می‌شود)
      ep = [tx * .5 + Math.sin(t * .15) * .8, .9 + Math.sin(t * .2) * .08, tz - 9 - this.dist * .25]; et = [tx, th, tz];
    } else if (this.mode === 'aerial') {
      const a = t * .06; ep = [tx + Math.sin(a) * 6, 22 + this.dist * .6, tz + 26 + Math.cos(a) * 3]; et = [tx, 4, tz - 14];
    } else {                                              // دنبال‌کننده: پشت سر شخصیت، کمی بالاتر
      const d = this.dist, yaw = this.yaw, p = this.pitch;
      ep = [tx + Math.sin(yaw) * Math.cos(p) * d, th + .8 + Math.sin(p) * d, tz + Math.cos(yaw) * Math.cos(p) * d]; et = [tx, th, tz - 3];
    }
    const k = 1 - Math.pow(.002, dt);                    // میرایی مستقل از نرخ فریم
    if (!this.fp) { this.fp = ep.slice(); this.ft = et.slice(); }
    for (let i = 0; i < 3; i++) { this.fp[i] = lerp(this.fp[i], ep[i], k); this.ft[i] = lerp(this.ft[i], et[i], k); }
    this.pos = this.fp.slice(); this.target = this.ft.slice();
    if (this.shake > 0) { this.pos[0] += Math.sin(t * 61) * this.shake * .05; this.pos[1] += Math.cos(t * 47) * this.shake * .05; this.shake = Math.max(0, this.shake - dt); }
    this.pos[1] = Math.max(.35, this.pos[1]);
  }
  state() { return { pos: this.pos, target: this.target, fov: this.fov }; }
  toJSON() { return { mode: this.mode, yaw: this.yaw, pitch: this.pitch, dist: this.dist, fov: this.fov }; }
  fromJSON(o) { if (!o) return; Object.assign(this, { mode: o.mode || 'follow', yaw: o.yaw ?? 0, pitch: o.pitch ?? .2, dist: o.dist ?? 7.5, fov: o.fov ?? 58 }); this.fp = null; }
}
