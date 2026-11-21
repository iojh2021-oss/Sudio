import { ensureFile } from '../src/dl.js';
self.onmessage = async (e) => {
  const r = await ensureFile(e.data.url, { report: (x) => self.postMessage({ t: 'p', ...x }), onNote: (text) => self.postMessage({ t: 'n', text }) });
  const buf = new Uint8Array(await r.file.arrayBuffer()); let h = 0; for (let i = 0; i < buf.length; i += 997) h = (h * 31 + buf[i]) >>> 0;
  self.postMessage({ t: 'done', len: buf.length, h });
};
