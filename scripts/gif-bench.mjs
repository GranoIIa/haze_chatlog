// Benchmark do GIF Lab em Chrome real (não é um teste: só mede e imprime JSON).
// Uso: BASE_URL=http://localhost:4179 node scripts/gif-bench.mjs [saida.json]
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4179';
const OUT = process.argv[2];
const SRC_W = Number(process.env.SRC_W || 1280), SRC_H = Number(process.env.SRC_H || 720), SRC_S = Number(process.env.SRC_S || 4);

const CONFIGS = JSON.parse(process.env.CONFIGS || JSON.stringify([
  { name: 'padrao 480w 12fps', size: null, fps: 12 },
  { name: '1280x720 12fps', size: [1280, 720], fps: 12 },
  { name: '1920x1080 12fps', size: [1920, 1080], fps: 12 },
  { name: '1080x1080 20fps', size: [1080, 1080], fps: 20 }
]));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  // instrumenta o Worker: quadros enviados x quadros já processados = fila
  window.__gif = { sent: 0, done: 0, prog: 0, maxQueue: 0, heapPeak: 0 };
  const RealWorker = window.Worker;
  window.Worker = class extends RealWorker {
    constructor(...a) {
      super(...a);
      // cada PROGRESS depois do primeiro (START) = 1 quadro já codificado
      this.addEventListener('message', e => {
        if (e.data && e.data.type === 'PROGRESS') { window.__gif.prog++; window.__gif.done = Math.max(0, window.__gif.prog - 1); }
      });
    }
    postMessage(msg, tr) {
      if (msg && msg.type === 'ADD_FRAME') { window.__gif.sent++; window.__gif.maxQueue = Math.max(window.__gif.maxQueue, window.__gif.sent - window.__gif.done); }
      return super.postMessage(msg, tr);
    }
  };
  setInterval(() => {
    const m = performance.memory; if (m) window.__gif.heapPeak = Math.max(window.__gif.heapPeak, m.usedJSHeapSize);
  }, 50);
});
await page.goto(BASE);
await page.evaluate(async () => { localStorage.clear(); });
await page.reload();
await page.getByRole('button', { name: /Video to GIF Lab/ }).click();

// vídeo de teste controlado (gerado no navegador)
const b64 = await page.evaluate(async ([w, h, secs]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm', videoBitsPerSecond: 8_000_000 });
  const parts = []; rec.ondataavailable = e => parts.push(e.data); rec.start();
  const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) {
    const t = (performance.now() - t0) / 1000;
    const g = x.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${(t * 60) % 360},60%,35%)`); g.addColorStop(1, `hsl(${(t * 60 + 120) % 360},60%,20%)`);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) { x.fillStyle = `hsl(${i * 30},70%,60%)`; x.fillRect((Math.sin(t * 2 + i) * 0.4 + 0.5) * (w - 120), (Math.cos(t * 1.5 + i * 0.7) * 0.4 + 0.5) * (h - 80), 120, 80); }
    x.fillStyle = '#fff'; x.font = `bold ${Math.round(h / 12)}px Arial`; x.fillText('HAZE BENCH ' + t.toFixed(1), 40, h / 2);
    await new Promise(r => setTimeout(r, 25));
  }
  rec.stop(); await new Promise(r => (rec.onstop = r));
  const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}, [SRC_W, SRC_H, SRC_S]);
await page.getByTestId('video-input').setInputFiles({ name: 'bench.webm', mimeType: 'video/webm', buffer: Buffer.from(b64, 'base64') });
await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
const videoInfo = await page.evaluate(() => { const v = document.querySelector('video'); return { w: v.videoWidth, h: v.videoHeight, dur: v.duration }; });

const results = [];
for (const cfg of CONFIGS) {
  if (cfg.size) {
    const p = page.getByTestId('gif-resolution');
    await p.getByLabel('Largura personalizada do GIF').fill(String(cfg.size[0]));
    await p.getByLabel('Altura personalizada do GIF').fill(String(cfg.size[1]));
    await p.getByRole('button', { name: 'Aplicar' }).click();
  }
  await page.locator('select').filter({ hasText: 'FPS' }).first().selectOption(String(cfg.fps));
  await page.evaluate((FPSV) => { Object.assign(window.__gif, { sent: 0, done: 0, prog: 0, maxQueue: 0, heapPeak: 0 }); window.__fps = FPSV; }, cfg.fps);
  const t0 = Date.now();
  await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
  await page.getByText('Concluído!').waitFor({ timeout: 300_000 });
  const ms = Date.now() - t0;
  const info = await page.evaluate(async () => {
    const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('blob:'));
    const buf = await (await fetch(img.src)).arrayBuffer();
    const dec = new ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready;
    const n = dec.tracks.selectedTrack.frameCount;
    const f0 = await dec.decode({ frameIndex: 0 });
    let durUs = 0; for (let i = 0; i < n; i++) durUs += (await dec.decode({ frameIndex: i })).image.duration || 0;
    // qualidade: compara o quadro do meio do GIF com o próprio vídeo desenhado no mesmo tamanho (só quando a proporção é a do vídeo)
    let psnr = null;
    const vid = document.querySelector('video');
    const mid = Math.floor(n / 2);
    const fm = await dec.decode({ frameIndex: mid });
    const W = fm.image.displayWidth, H = fm.image.displayHeight;
    if (Math.abs(W / H - vid.videoWidth / vid.videoHeight) < 0.01) {
      const total = n; const clip = total / (Number(window.__fps) || 12);
      vid.currentTime = (mid * clip) / total; await new Promise(r => vid.addEventListener('seeked', r, { once: true }));
      const a = document.createElement('canvas'); a.width = W; a.height = H; const ax = a.getContext('2d'); ax.drawImage(vid, 0, 0, W, H);
      const b = document.createElement('canvas'); b.width = W; b.height = H; const bx = b.getContext('2d'); bx.drawImage(fm.image, 0, 0);
      const da = ax.getImageData(0, 0, W, H).data, db = bx.getImageData(0, 0, W, H).data;
      let se = 0; for (let i = 0; i < da.length; i += 4) for (let k = 0; k < 3; k++) { const d = da[i + k] - db[i + k]; se += d * d; }
      const mse = se / (W * H * 3); psnr = +(10 * Math.log10(255 * 255 / Math.max(mse, 1e-9))).toFixed(2);
    }
    return { psnr, bytes: buf.byteLength, frames: n, w: f0.image.displayWidth, h: f0.image.displayHeight, durS: durUs / 1e6, sent: window.__gif.sent, maxQueue: window.__gif.maxQueue, heapPeakMB: +(window.__gif.heapPeak / 1048576).toFixed(1) };
  });
  results.push({ cfg: cfg.name, ms, ...info, mbFile: +(info.bytes / 1048576).toFixed(2), rawFrameMB: +((info.w * info.h * 4) / 1048576).toFixed(2) });
  console.log(JSON.stringify(results[results.length - 1]));
}
const report = { when: new Date().toISOString(), browser: browser.version(), video: videoInfo, results };
if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('BROWSER', report.browser, 'VIDEO', JSON.stringify(videoInfo));
await browser.close();
