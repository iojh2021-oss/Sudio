// رندر WebGL2: آسمان/مه (شیدر)، ساختمان‌های سه‌بعدی نمونه‌ای، خیابان خیس با بازتاب آینه‌ای، درخشش چراغ‌ها، باران، شخصیت‌ها
import { persp, lookAt, mul, inv, ident, scale as mScale } from './mat.js';
import * as SH from './shaders.js';
import { makeAnyChunk, BIOMES } from './biomes.js';
import { movingCars, carBoxes, chunkIndex, STRIDE, CH } from './world.js';
import { characterParts } from './character.js';
import { clamp, lerp, smooth } from './util.js';

const PAL = {
  night: { zen: [.008, .016, .03], hor: [.17, .2, .23], glow: [.5, .48, .42], fogA: [.08, .1, .13], fogB: [.44, .43, .39], fog: .0105, amb: [.2, .23, .3], sun: [.16, .18, .24], lamp: 1, lit: 1.7, exp: .95, stars: 1 },
  dusk: { zen: [.04, .06, .12], hor: [.62, .4, .3], glow: [1, .6, .3], fogA: [.36, .26, .24], fogB: [.75, .5, .34], fog: .009, amb: [.22, .2, .24], sun: [.55, .36, .22], lamp: .75, lit: .65, exp: 1.0, stars: .2 },
  dawn: { zen: [.09, .13, .2], hor: [.7, .6, .55], glow: [1, .82, .62], fogA: [.45, .46, .48], fogB: [.8, .68, .58], fog: .0095, amb: [.28, .3, .34], sun: [.5, .4, .3], lamp: .3, lit: .25, exp: 1.0, stars: 0 },
  day: { zen: [.24, .4, .62], hor: [.74, .8, .84], glow: [1, .96, .86], fogA: [.6, .65, .68], fogB: [.85, .86, .84], fog: .0062, amb: [.5, .52, .56], sun: [.85, .8, .7], lamp: 0, lit: .04, exp: .95, stars: 0 },
};
export const TIMES = Object.keys(PAL);
export const QUALITY = {
  low: { scale: .7, view: 6, reflect: false, rain: 700, pts: true, fps: 30 },
  medium: { scale: 1, view: 9, reflect: true, rain: 1800, pts: true, fps: 45 },
  high: { scale: 1.2, view: 13, reflect: true, rain: 2400, pts: true, fps: 60 },
};

function sh(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').slice(0, 3).join(' ')); return s; }
function prog(gl, vs, fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; }

// مکعب واحد با نرمال (۳۶ رأس)
function cubeData() {
  const f = [[[0, 0, 1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[0, 0, -1], [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], [[1, 0, 0], [1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], [[-1, 0, 0], [-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], [[0, 1, 0], [-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], [[0, -1, 0], [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]];
  const v = []; for (const q of f) { const n = q[0], c = q.slice(1); for (const i of [0, 1, 2, 0, 2, 3]) v.push(c[i][0] * .5, c[i][1] * .5, c[i][2] * .5, n[0], n[1], n[2]); } return new Float32Array(v);
}
function sphereData(seg = 12, rings = 8) {
  const v = [], P = (a, b) => { const y = Math.cos(b), r = Math.sin(b); return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let i = 0; i < seg; i++) for (let j = 0; j < rings; j++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, b0 = j / rings * Math.PI, b1 = (j + 1) / rings * Math.PI;
    const p = [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
    for (const k of [0, 2, 1, 0, 3, 2]) v.push(p[k][0] * .5, p[k][1] * .5, p[k][2] * .5, p[k][0], p[k][1], p[k][2]);
  } return new Float32Array(v);
}

export class Renderer {
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 در این دستگاه پشتیبانی نمی‌شود');
    this.gl = gl; this.canvas = canvas; this.q = { ...QUALITY.medium }; this.qName = 'medium'; this.scale = this.q.scale;
    this.chunks = new Map(); this.seed = 20261120; this.district = 'auto'; this.litMul = 1; this.t = 0; this.rainOn = 0; this.stats = { chunks: 0, draws: 0, gen: 0 };
    this.P = {
      box: prog(gl, SH.BOX_VS, SH.BOX_FS), ground: prog(gl, SH.GROUND_VS, SH.GROUND_FS), sky: prog(gl, SH.SKY_VS, SH.SKY_FS), pt: prog(gl, SH.PT_VS, SH.PT_FS),
      rain: prog(gl, SH.RAIN_VS, SH.RAIN_FS), post: prog(gl, SH.POST_VS, SH.POST_FS), chr: prog(gl, SH.CHAR_VS, SH.CHAR_FS),
    };
    // هندسه‌ها
    this.cube = this._vbo(cubeData()); this.sphere = this._vbo(sphereData()); this.sphereN = sphereData().length / 6;
    this.quad = this._vbo(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
    this.emptyVAO = gl.createVertexArray();
    this.carBuf = gl.createBuffer(); this.carVAO = this._boxVAO(this.carBuf);
    this.ptBuf = gl.createBuffer(); this.ptVAO = gl.createVertexArray(); gl.bindVertexArray(this.ptVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    for (const [loc, n, off] of [[0, 3, 0], [1, 3, 12], [2, 2, 24]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 32, off); } gl.bindVertexArray(null);
    this.ptData = new Float32Array(8 * 1600); this.rainN = 0; this._rainBuild(this.q.rain);
    this.groundVAO = gl.createVertexArray(); gl.bindVertexArray(this.groundVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0); gl.bindVertexArray(null);
    this.cubeVAO = gl.createVertexArray(); gl.bindVertexArray(this.cubeVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.cube); this._geoAttr(); gl.bindVertexArray(null);
    this.sphereVAO = gl.createVertexArray(); gl.bindVertexArray(this.sphereVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.sphere); this._geoAttr(); gl.bindVertexArray(null);
    this.vp = ident(); this.invVP = ident(); this.camPos = [0, 3, 0]; this.mirror = ident();
    this.env = { time: 'night', rain: .6, fog: .5, mood: 'noir' }; this.cur = null; this.genBudget = 2;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }); canvas.addEventListener('webglcontextrestored', () => { location.reload(); });
  }
  _vbo(data) { const gl = this.gl, b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return b; }
  _geoAttr() { const gl = this.gl; gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); }
  _boxVAO(buf) {
    const gl = this.gl, v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cube); this._geoAttr();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); const S = STRIDE * 4;
    for (const [loc, off] of [[2, 0], [3, 12], [4, 24], [5, 36]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, S, off); gl.vertexAttribDivisor(loc, 1); }
    gl.bindVertexArray(null); return v;
  }
  _rainBuild(n) {
    const gl = this.gl, d = new Float32Array(n * 8), R = (() => { let a = 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();
    for (let i = 0; i < n; i++) { const x = R(), y = R(), z = R(); for (let e = 0; e < 2; e++) d.set([x, y, z, e], i * 8 + e * 4); }
    if (!this.rainBuf) this.rainBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuf); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    if (!this.rainVAO) this.rainVAO = gl.createVertexArray(); gl.bindVertexArray(this.rainVAO); gl.bindBuffer(gl.ARRAY_BUFFER, this.rainBuf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0); gl.bindVertexArray(null); this.rainN = n;
  }
  setQuality(name) { const q = QUALITY[name]; if (!q) return; this.qName = name; this.q = { ...q }; this.scale = q.scale; this._rainBuild(q.rain); this.resize(); }
  setBackdrop(src) {                                  // تصویر هوش مصنوعی (ImageBitmap/Canvas/Image) به‌عنوان پس‌زمینهٔ دور؛ با محو‌شدن جایگزین می‌شود
    const gl = this.gl; if (!this.ai) { this.ai = { tex: [gl.createTexture(), gl.createTexture()], on: 0, t0: -9, yaw: 0 }; }
    const a = this.ai; a.tex.reverse();
    gl.bindTexture(gl.TEXTURE_2D, a.tex[1]); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!a.on) { gl.bindTexture(gl.TEXTURE_2D, a.tex[0]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    a.on = 1; a.t0 = this.t;
  }
  clearBackdrop() { if (this.ai) this.ai.on = 0; }
  setSeed(seed, district) { if (seed !== this.seed || district !== this.district) { this.seed = seed >>> 0; this.district = district || 'auto'; this.clearChunks(); } }
  setEnv(e) { const ob = this.env.biome; Object.assign(this.env, e); if ((this.env.biome || 'city') !== (ob || 'city')) this.clearChunks(); this.litMul = this.env.litMul ?? 1; }
  clearChunks() { const gl = this.gl; for (const c of this.chunks.values()) { gl.deleteBuffer(c.buf); gl.deleteVertexArray(c.vao); } this.chunks.clear(); }
  resize() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(2, Math.floor(c.clientWidth * dpr * this.scale)), h = Math.max(2, Math.floor(c.clientHeight * dpr * this.scale));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }
  // قطعات مورد نیاز اطراف دوربین؛ در هر فریم حداکثر genBudget قطعه ساخته می‌شود تا هیچ‌وقت وقفه نیفتد
  _stream(camZ, now) {
    const gl = this.gl, k0 = chunkIndex(camZ + 40), k1 = chunkIndex(camZ - this.q.view * CH), want = [];
    for (let k = k0; k <= k1 + 0; k++) want.push(k);
    want.sort((a, b) => Math.abs(a - chunkIndex(camZ - 40)) - Math.abs(b - chunkIndex(camZ - 40)));
    let made = 0;
    for (const k of want) {
      if (this.chunks.has(k)) continue; if (made >= this.genBudget) break;
      const d = makeAnyChunk(this.seed, k, { district: this.district, lit: this.litMul, biome: this.env.biome }); const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, d.boxes, gl.STATIC_DRAW);
      this.chunks.set(k, { d, buf, vao: this._boxVAO(buf), born: now }); made++; this.stats.gen++;
    }
    for (const [k, c] of this.chunks) if (k < k0 - 2 || k > k1 + 2) { gl.deleteBuffer(c.buf); gl.deleteVertexArray(c.vao); this.chunks.delete(k); }
    this.stats.chunks = this.chunks.size;
  }
  _palette() {
    const e = this.env, a = PAL[e.time] || PAL.night, w = clamp(e.rain ?? 0, 0, 1), f = clamp(e.fog ?? 0, 0, 1), dark = 1 - .22 * w;
    const m = (v, k = 1) => v.map((x) => x * k);
    const B = BIOMES[e.biome] || BIOMES.city, nat = B.id !== 'city', br = clamp((a.hor[0] + a.hor[1] + a.hor[2]) / 3 * 1.5, .15, 1), tint = (v) => nat ? v.map((x, i) => x * .55 + B.fogC[i] * br * .45) : v;
    return {
      zen: m(a.zen, dark), hor: m(a.hor, dark), glow: m(a.glow, 1 - .4 * w), fogA: tint(m(a.fogA, dark)), fogB: tint(m(a.fogB, 1 - .3 * w)), amb: a.amb, sun: m(a.sun, 1 - .6 * w),
      fogD: a.fog * (nat ? B.fog : 1) * (1 + f * 2.4 + w * .8), lamp: nat ? 0 : a.lamp, biome: B, lit: a.lit * this.litMul, exp: a.exp, stars: a.stars * (1 - w) * (1 - f * .7), cloud: .35 + .5 * Math.max(w, f), wet: w * .95 + (e.time === 'day' ? 0 : .05), rain: w,
      sat: e.mood === 'color' ? 1 : e.mood === 'red' ? .18 : .1,
    };
  }
  _common(P, pal) {
    const gl = this.gl, u = P.u, set3 = (n, v) => u[n] && gl.uniform3f(u[n], v[0], v[1], v[2]), set1 = (n, v) => u[n] && gl.uniform1f(u[n], v);
    set3('u_cam', this.camPos); set1('u_time', this.t); set1('u_fogD', pal.fogD); set1('u_exposure', pal.exp); set1('u_wet', pal.wet); set1('u_sat', pal.sat);
    set3('u_fogA', pal.fogA); set3('u_fogB', pal.fogB); set3('u_amb', pal.amb); set3('u_sun', pal.sun); set3('u_hor', pal.hor); set3('u_zen', pal.zen); set3('u_glow', pal.glow);
    set1('u_lamp', pal.lamp); set1('u_lit', pal.lit); set1('u_rain', pal.rain);
  }
  render(state) {
    if (this.lost) return; const gl = this.gl, { camera, characters, t } = state; this.t = t; this.resize();
    const W = this.canvas.width, H = this.canvas.height, pal = this._palette(), now = t;
    this.camPos = camera.pos.slice();
    const asp = W / H, fovEff = asp < .8 ? camera.fov * (1 + (.8 - asp) * .75) : camera.fov, proj = persp(Math.min(fovEff, 92) * Math.PI / 180, asp, .3, 900), view = lookAt(camera.pos, camera.target, [0, 1, 0]);
    this.vp = mul(proj, view); this.invVP = inv(this.vp); this._stream(camera.pos[2], now);
    gl.viewport(0, 0, W, H); gl.clearColor(pal.hor[0] * .5, pal.hor[1] * .5, pal.hor[2] * .5, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.stats.draws = 0;
    // آسمان
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    let P = this.P.sky; gl.useProgram(P.p); this._common(P, pal); gl.uniformMatrix4fv(P.u.u_invVP, false, this.invVP); gl.uniform1f(P.u.u_cloud, pal.cloud); gl.uniform1f(P.u.u_stars, pal.stars);
    { const a = this.ai, on = a && a.on ? 1 : 0; gl.uniform1f(P.u.u_aiOn, on); if (on) { gl.uniform1f(P.u.u_aiMix, clamp((t - a.t0) / 3, 0, 1)); gl.uniform1f(P.u.u_aiYaw, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a.tex[0]); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a.tex[1]); gl.uniform1i(P.u.u_ai0, 0); gl.uniform1i(P.u.u_ai1, 1); gl.activeTexture(gl.TEXTURE0); } }
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    // ماشین‌های متحرک + چراغ‌ها
    const zMin = camera.pos[2] - this.q.view * CH, zMax = camera.pos[2] + 40, cars = (pal.biome.id === 'city') ? movingCars(this.seed, t, zMin, zMax, this.env.traffic ?? 1) : [], cb = [];
    for (const c of cars) carBoxes(cb, c.x, c.z, c.head, c.hv);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.carBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cb), gl.DYNAMIC_DRAW); const carCount = cb.length / STRIDE;
    const pts = this._points(cars, pal);
    const mirrorPass = this.q.reflect && (pal.wet > .08 || pal.biome.water);
    if (mirrorPass) { gl.frontFace(gl.CW); this._scene(-1, pal, characters, carCount, now, pts, true); gl.frontFace(gl.CCW); }
    // زمین (نیمه‌شفاف تا بازتاب پیدا باشد)
    P = this.P.ground; gl.useProgram(P.p); this._common(P, pal); gl.uniformMatrix4fv(P.u.u_vp, false, this.vp); gl.uniform2f(P.u.u_ctr, camera.pos[0], camera.pos[2]);
    { const B = pal.biome, g = B.g1 || [0, 0, 0]; gl.uniform1f(P.u.u_biome, B.n); gl.uniform1f(P.u.u_water, B.water || 0); gl.uniform3f(P.u.u_g1, ...g); gl.uniform3f(P.u.u_g2, ...(B.g2 || g)); gl.uniform3f(P.u.u_gp, ...(B.path || g)); }
    if (mirrorPass) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); } else { gl.disable(gl.BLEND); gl.uniform1f(P.u.u_wet, pal.wet * .4); }
    gl.disable(gl.CULL_FACE); gl.bindVertexArray(this.groundVAO); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.enable(gl.CULL_FACE); gl.disable(gl.BLEND);
    this._scene(1, pal, characters, carCount, now, pts, false);
    // باران
    if (pal.rain > .05) {
      P = this.P.rain; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_vp, false, this.vp); gl.uniform3f(P.u.u_cam, ...camera.pos); gl.uniform1f(P.u.u_time, t); gl.uniform1f(P.u.u_len, .9 + pal.rain * .6);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.bindVertexArray(this.rainVAO); gl.drawArrays(gl.LINES, 0, Math.floor(this.rainN * 2 * Math.min(1, pal.rain * 1.3))); gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // وینیت + دانهٔ فیلم
    P = this.P.post; gl.useProgram(P.p); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1f(P.u.u_time, t); gl.uniform1f(P.u.u_grain, this.env.grain ?? .006); gl.uniform1f(P.u.u_vig, .7);
    gl.bindVertexArray(this.emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    this.stats.visibleBoxes = [...this.chunks.values()].reduce((a, c) => a + c.d.count, 0);
  }
  _points(cars, pal) {
    const n = this.ptData; let i = 0; const put = (x, y, z, r, g, b, s, fl) => { if (i + 8 > n.length) return; n.set([x, y, z, r, g, b, s, fl], i); i += 8; };
    const lampK = Math.max(pal.lamp, .12) * (this.env.time === 'day' ? .0 : 1);
    for (const c of this.chunks.values()) { const L = c.d.lights; for (let j = 0; j < c.d.nLights; j++) { const o = j * 8, neon = L[o + 7] === 1; put(L[o], L[o + 1], L[o + 2], L[o + 3] * (neon ? .8 : lampK), L[o + 4] * (neon ? .8 : lampK), L[o + 5] * (neon ? .8 : lampK), L[o + 6], neon ? 1 : 0); } }
    for (const c of cars) { const f = c.head === 0 ? -1 : 1; put(c.x - .7, 1.12, c.z + f * 1.95, 1, .93, .7, 13, 0); put(c.x + .7, 1.12, c.z + f * 1.95, 1, .93, .7, 13, 0); put(c.x - .55, 1, c.z - f * 2.3, .95, .07, .04, 5, 0); put(c.x + .55, 1, c.z - f * 2.3, .95, .07, .04, 5, 0); }
    return i / 8;
  }
  _scene(flip, pal, characters, carCount, now, nPts, mirror) {
    const gl = this.gl; let P = this.P.box; gl.useProgram(P.p); this._common(P, pal);
    const vp = flip < 0 ? this.vp : this.vp; gl.uniformMatrix4fv(P.u.u_vp, false, vp); gl.uniform1f(P.u.u_flip, flip);
    const dayLit = this.env.time === 'day' ? .0 : 1; void dayLit;
    for (const c of this.chunks.values()) {
      const rev = clamp((now - c.born) / 1.6, 0, 1); gl.uniform1f(P.u.u_reveal, smooth(rev) * 1.0 + (rev >= 1 ? 1 : 0));
      gl.bindVertexArray(c.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, c.d.count); this.stats.draws++;
    }
    gl.uniform1f(P.u.u_reveal, 1); if (carCount) { gl.bindVertexArray(this.carVAO); gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, carCount); this.stats.draws++; }
    // شخصیت‌ها
    P = this.P.chr; gl.useProgram(P.p); this._common(P, pal); gl.uniformMatrix4fv(P.u.u_vp, false, this.vp); gl.uniform1f(P.u.u_flip, flip);
    for (const ch of characters) {
      const parts = characterParts(ch, this.t);
      for (const p of parts) { gl.uniformMatrix4fv(P.u.u_model, false, p.m); gl.uniform3f(P.u.u_col, p.c[0], p.c[1], p.c[2]); gl.uniform1f(P.u.u_emis, p.e || 0);
        if (p.s) { gl.bindVertexArray(this.sphereVAO); gl.drawArrays(gl.TRIANGLES, 0, this.sphereN); } else { gl.bindVertexArray(this.cubeVAO); gl.drawArrays(gl.TRIANGLES, 0, 36); } this.stats.draws++; }
    }
    // درخشش چراغ‌ها (افزایشی)
    if (this.q.pts && nPts) {
      P = this.P.pt; gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.u_vp, false, this.vp); gl.uniform1f(P.u.u_flip, flip); gl.uniform1f(P.u.u_scale, this.canvas.height * .13); gl.uniform1f(P.u.u_time, this.t); gl.uniform3f(P.u.u_camP, ...this.camPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf); gl.bufferData(gl.ARRAY_BUFFER, this.ptData.subarray(0, nPts * 8), gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.bindVertexArray(this.ptVAO); gl.drawArrays(gl.POINTS, 0, nPts); gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    }
  }
  screenToGround(nx, ny) { return null; }
}
