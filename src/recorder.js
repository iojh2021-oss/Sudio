// ضبط ویدیو (تصویر + صدای گفتار) با MediaRecorder؛ خروجی mp4 یا webm بسته به پشتیبانی دستگاه
export function pickMime() {
  const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  if (typeof MediaRecorder === 'undefined') return null; return c.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}
export class Recorder {
  constructor(canvas, voice) { this.canvas = canvas; this.voice = voice; this.rec = null; this.chunks = []; this.mime = pickMime(); }
  get supported() { return !!this.mime && !!this.canvas.captureStream; }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
  start(fps = 30) {
    if (!this.supported) throw new Error('ضبط ویدیو در این مرورگر پشتیبانی نمی‌شود');
    this.voice.init(); const vs = this.canvas.captureStream(fps), tracks = [...vs.getVideoTracks()];
    if (this.voice.dest) tracks.push(...this.voice.dest.stream.getAudioTracks());
    this.chunks = []; this.rec = new MediaRecorder(new MediaStream(tracks), { mimeType: this.mime, videoBitsPerSecond: 6e6 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); }; this.rec.start(500); this.t0 = performance.now();
  }
  stop() {
    return new Promise((res) => { if (!this.rec) return res(null); const r = this.rec; r.onstop = () => { this.rec = null; res({ blob: new Blob(this.chunks, { type: this.mime.split(';')[0] }), ext: this.mime.includes('mp4') ? 'mp4' : 'webm' }); }; try { r.stop(); } catch (e) { res(null); } });
  }
  get seconds() { return this.recording ? (performance.now() - this.t0) / 1000 : 0; }
}
