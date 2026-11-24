// دوربین و فیلتر عکس: پردازش کامل روی GPU (WebGL2) با همان وضوح تصویر اصلی (تا ۴۰۹۶ پیکسل) بدون افت کیفیت
// + ساخت شخصیت تصویری از عکس آپلودشده (حذف پس‌زمینهٔ یک‌رنگ)

export const FILTERS = [
  { id: 'none', n: 0, label: 'بدون فیلتر' },
  { id: 'negative', n: 1, label: 'نگاتیو سیاه‌وسفید' },
  { id: 'negcolor', n: 2, label: 'نگاتیو رنگی' },
  { id: 'xray', n: 3, label: 'اشعهٔ ایکس' },
  { id: 'noir', n: 4, label: 'نوآر' },
  { id: 'sepia', n: 5, label: 'سپیا' },
  { id: 'vivid', n: 6, label: 'پررنگ' },
  { id: 'cyber', n: 7, label: 'سایبرپانک' },
  { id: 'retro', n: 8, label: 'قدیمی' },
  { id: 'dream', n: 9, label: 'رؤیایی' },
  { id: 'cool', n: 10, label: 'سرد' },
  { id: 'warm', n: 11, label: 'گرم' },
  { id: 'thermal', n: 12, label: 'حرارتی' },
];

const VS = `#version 300 es
out vec2 v_uv; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); v_uv=p; gl_Position=vec4(p*2.-1.,0.,1.); }`;
const FS = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 o;
uniform sampler2D u_img; uniform vec2 u_px; uniform int u_f; uniform float u_amt, u_clar, u_bri, u_con, u_mirror;
vec3 S(vec2 uv){ return texture(u_img,uv).rgb; }
float L(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }
float hsh(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
void main(){
  vec2 uv=v_uv; if(u_mirror>.5) uv.x=1.-uv.x;
  vec3 c=S(uv);
  vec3 b=(S(uv+vec2(u_px.x,0.))+S(uv-vec2(u_px.x,0.))+S(uv+vec2(0.,u_px.y))+S(uv-vec2(0.,u_px.y)))*.125
        +(S(uv+u_px)+S(uv-u_px)+S(uv+vec2(u_px.x,-u_px.y))+S(uv+vec2(-u_px.x,u_px.y)))*.0625+c*.25;
  c=clamp(c+(c-b)*u_clar*2.5,0.,1.);
  float l=L(c); vec3 f=c;
  if(u_f==1){ float g=smoothstep(0.,1.,1.-l); f=vec3((g-.5)*1.18+.5); }
  else if(u_f==2){ f=1.-c; }
  else if(u_f==3){ float g=1.-l, e=abs(l-L(b))*7.; f=vec3(.5,.82,1.)*g*1.15+e*vec3(.6,.9,1.); }
  else if(u_f==4){ float g=(l-.5)*1.4+.5; f=vec3(g); }
  else if(u_f==5){ f=vec3(dot(c,vec3(.393,.769,.189)),dot(c,vec3(.349,.686,.168)),dot(c,vec3(.272,.534,.131))); }
  else if(u_f==6){ f=mix(vec3(l),c,1.7); f=(f-.5)*1.12+.5; }
  else if(u_f==7){ f=vec3(c.r*1.1,c.g*.82,c.b*1.2); f+=vec3(.9,.1,.7)*smoothstep(.55,1.,l)*.28+vec3(0.,.5,.65)*smoothstep(.45,0.,l)*.28; f=mix(vec3(L(f)),f,1.35); }
  else if(u_f==8){ f=c*vec3(1.05,.95,.8)+.04; f=f*.85+.08; f*=1.-smoothstep(.35,.85,length(uv-.5))*.45; f+=(hsh(uv*vec2(1731.,1313.))-.5)*.05; }
  else if(u_f==9){ vec3 a=vec3(0.); for(int i=0;i<8;i++){ float t=float(i)*.785398; a+=S(uv+vec2(cos(t),sin(t))*u_px*5.)+S(uv+vec2(cos(t),sin(t))*u_px*11.); } a/=16.; f=c+a*.55; f*=vec3(1.04,.99,1.08); f=mix(f,vec3(L(f)),-.15); }
  else if(u_f==10){ f=c*vec3(.9,1.,1.15); }
  else if(u_f==11){ f=c*vec3(1.12,1.,.88); }
  else if(u_f==12){ f=vec3(smoothstep(.3,.7,l),smoothstep(.55,.95,l)*.9+smoothstep(.1,.3,l)*.2,smoothstep(0.,.3,l)*(1.-smoothstep(.3,.6,l))*.9+smoothstep(.85,1.,l)); }
  f=mix(c,f,u_amt);
  f=(f-.5)*u_con+.5+u_bri;
  o=vec4(clamp(f,0.,1.),1.);
}`;

function sh(gl, t, s) { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(x)); return x; }

export class PhotoLab {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 در دسترس نیست');
    this.gl = gl; this.canvas = canvas; this.w = 0; this.h = 0; this.live = false; this.stream = null; this.video = null; this.raf = 0; this.src = null; this.facing = 'user';
    this.p = { filter: 'none', amt: 1, clar: .25, bri: 0, con: 1, mirror: 0 };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    this.prog = p; this.u = {}; for (const n of ['u_img', 'u_px', 'u_f', 'u_amt', 'u_clar', 'u_bri', 'u_con', 'u_mirror']) this.u[n] = gl.getUniformLocation(p, n);
    this.vao = gl.createVertexArray(); this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.maxTex = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048);
    canvas.width = 320; canvas.height = 200; gl.viewport(0, 0, 320, 200); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }
  get hasSource() { return !!this.src || this.live; }
  _upload(src, w, h) {
    const gl = this.gl; gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.w = w; this.h = h;
  }
  // عکس ثابت (ImageBitmap/Canvas/Image)؛ فقط اگر از حد بافت بزرگ‌تر بود کوچک می‌شود
  setSource(src) {
    let w = src.width || src.naturalWidth, h = src.height || src.naturalHeight; if (!w || !h) throw new Error('تصویر نامعتبر');
    const k = Math.min(1, this.maxTex / Math.max(w, h));
    if (k < 1) { const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); src = c; w = c.width; h = c.height; }
    this.src = src; this._upload(src, w, h); this.render();
  }
  render() {
    const gl = this.gl, p = this.p; if (!this.w) return;
    const f = FILTERS.find((x) => x.id === p.filter) || FILTERS[0];
    gl.viewport(0, 0, this.w, this.h); gl.useProgram(this.prog); gl.bindVertexArray(this.vao); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.u_img, 0); gl.uniform2f(this.u.u_px, 1 / this.w, 1 / this.h); gl.uniform1i(this.u.u_f, f.n); gl.uniform1f(this.u.u_amt, p.amt); gl.uniform1f(this.u.u_clar, p.clar); gl.uniform1f(this.u.u_bri, p.bri); gl.uniform1f(this.u.u_con, p.con); gl.uniform1f(this.u.u_mirror, p.mirror ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  async startCamera(facing = this.facing) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('NOCAM');
    this.stopCamera(); this.facing = facing;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const v = document.createElement('video'); v.playsInline = true; v.muted = true; v.srcObject = stream; await v.play();
    this.stream = stream; this.video = v; this.live = true; this.src = null; this.p.mirror = facing === 'user' ? 1 : 0;
    const loop = () => { if (!this.live) return; if (v.readyState >= 2 && v.videoWidth) { this._upload(v, v.videoWidth, v.videoHeight); this.render(); } this.raf = requestAnimationFrame(loop); };
    loop();
  }
  stopCamera() {
    this.live = false; cancelAnimationFrame(this.raf); if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.video = null;
  }
  // گرفتن عکس از تصویر زندهٔ دوربین؛ عکس منجمد می‌شود تا بتوان فیلتر را عوض کرد
  async capture() {
    if (!this.live || !this.video) return false; const v = this.video, bmp = await createImageBitmap(v); this.stopCamera(); this.p.mirror = this.facing === 'user' ? 1 : 0; this.setSource(bmp); return true;
  }
  toBlob(type = 'image/png', q = .95) { this.render(); return new Promise((res) => this.canvas.toBlob(res, type, q)); }
  getBitmap() { this.render(); return createImageBitmap(this.canvas); }
}

// ---------- ساخت شخصیت تصویری از عکس ----------
// عکس را تا ۳۸۴ پیکسل کوچک می‌کند؛ اگر شفافیت ندارد و tol>0 باشد، پس‌زمینهٔ هم‌رنگ لبه‌ها (flood-fill از حاشیه) شفاف می‌شود
export function makeSprite(bmp, tol = 0, maxSide = 384) {
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height)), w = Math.max(2, Math.round(bmp.width * k)), h = Math.max(2, Math.round(bmp.height * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, w, h);
  const im = cx.getImageData(0, 0, w, h), d = im.data; let opaque = true; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { opaque = false; break; }
  if (opaque && tol > 0) {
    const cs = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].map(([x, y]) => { const o = (y * w + x) * 4; return [d[o], d[o + 1], d[o + 2]]; });
    const bg = [0, 1, 2].map((c) => cs.reduce((a, v) => a + v[c], 0) / 4), T = tol * 255, seen = new Uint8Array(w * h), st = [];
    const near = (o) => Math.max(Math.abs(d[o] - bg[0]), Math.abs(d[o + 1] - bg[1]), Math.abs(d[o + 2] - bg[2])) <= T;
    const push = (x, y) => { const i = y * w + x; if (!seen[i] && near(i * 4)) { seen[i] = 1; st.push(i); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); } for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (st.length) { const i = st.pop(), x = i % w, y = (i / w) | 0; if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1); }
    for (let i = 0; i < seen.length; i++) if (seen[i]) d[i * 4 + 3] = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!seen[i] && (seen[i - 1] || seen[i + 1] || seen[i - w] || seen[i + w])) d[i * 4 + 3] = 150; }   // لبهٔ نرم
    cx.putImageData(im, 0, 0);
  }
  let src = cv.toDataURL('image/png');
  if (src.length > 2.2e6 && maxSide > 200) return makeSprite(bmp, tol, 220);
  return { src, opaque };
}
