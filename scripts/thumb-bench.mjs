// Benchmark das miniaturas dos Visuais em Chrome real (mede e imprime JSON; não é um teste).
// Uso: BASE_URL=http://localhost:4173 REPS=3 node scripts/thumb-bench.mjs [saida.json]
// Mede, por tamanho de foto: tempo até as 8 miniaturas aparecerem, maior tarefa longa (>50 ms) e maior intervalo entre
// quadros de animação (responsividade), e variação do heap JS após GC. As fotos são sintéticas (gradiente + ruído leve).
import { chromium } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const REPS = Number(process.env.REPS || 3);
const OUT = process.argv[2];
const SIZES = [[1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [1080, 1920]];

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
function photoPng(w, h) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((1 + w * 3) * h);
  let seed = 12345;
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 3);
    for (let x = 0; x < w; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const n = (seed >> 16) & 15;
      raw[o + 1 + x * 3] = Math.min(255, (x * 200) / w + n);
      raw[o + 2 + x * 3] = Math.min(255, (y * 200) / h + n);
      raw[o + 3 + x * 3] = 90 + n * 2;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const results = [];
for (const [w, h] of SIZES) {
  const png = photoPng(w, h);
  const reps = [];
  for (let r = 0; r < REPS; r++) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => localStorage.setItem('haze-ui-mode-v1', 'simple'));
    await page.goto(BASE);
    await page.getByTestId('preview-canvas').waitFor();
    await page.evaluate(() => {
      window.__m = { longMax: 0, longSum: 0, gapMax: 0, last: performance.now(), on: false };
      new PerformanceObserver(l => { for (const e of l.getEntries()) { if (!window.__m.on) continue; window.__m.longMax = Math.max(window.__m.longMax, e.duration); window.__m.longSum += e.duration; } }).observe({ entryTypes: ['longtask'] });
      const tick = (t) => { if (window.__m.on) window.__m.gapMax = Math.max(window.__m.gapMax, t - window.__m.last); window.__m.last = t; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.evaluate(() => window.gc && window.gc());
    const heap0 = await page.evaluate(() => performance.memory.usedJSHeapSize);
    await page.evaluate(() => { window.__m.on = true; window.__m.t0 = performance.now(); });
    await page.getByTestId('bg-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="visual-thumb-"]').length === 8, null, { timeout: 120000, polling: 20 });
    const m = await page.evaluate(() => ({ ready: performance.now() - window.__m.t0, longMax: window.__m.longMax, longSum: window.__m.longSum, gapMax: window.__m.gapMax, stats: window.__hazeThumbStats || null }));
    await page.evaluate(() => { window.__m.on = false; });
    await page.waitForTimeout(600);
    await page.evaluate(() => window.gc && window.gc());
    const heap1 = await page.evaluate(() => performance.memory.usedJSHeapSize);
    reps.push({ readyMs: Math.round(m.ready), genMs: m.stats ? m.stats.lastMs : null, longTaskMaxMs: Math.round(m.longMax), longTaskSumMs: Math.round(m.longSum), frameGapMaxMs: Math.round(m.gapMax), heapDeltaMB: +((heap1 - heap0) / 1048576).toFixed(1) });
    await page.close();
  }
  results.push({
    foto: `${w}x${h}`, reps: REPS,
    readyMs: median(reps.map(r => r.readyMs)), genMs: reps[0].genMs == null ? null : median(reps.map(r => r.genMs)),
    longTaskMaxMs: median(reps.map(r => r.longTaskMaxMs)), longTaskSumMs: median(reps.map(r => r.longTaskSumMs)),
    frameGapMaxMs: median(reps.map(r => r.frameGapMaxMs)), heapDeltaMB: median(reps.map(r => r.heapDeltaMB)), raw: reps
  });
  console.log(JSON.stringify(results[results.length - 1]));
}
const meta = { base: BASE, browser: browser.version(), data: new Date().toISOString().slice(0, 10), nota: 'fotos sintéticas (gradiente + ruído), mediana de REPS repetições' };
await browser.close();
const out = JSON.stringify({ meta, results }, null, 2);
if (OUT) writeFileSync(OUT, out);
