/**
 * Video Studio, F0: medições com fontes pesadas. NÃO é gate de aprovação: imprime números (linhas F0:)
 * e só falha se a exportação não terminar. Requer ffmpeg no PATH. Rode com: F0=1 npx playwright test video-f0
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.skip(!process.env.F0, 'medição pesada: defina F0=1 para rodar');

let dir = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
const src = (name: string, size: string, secs: number) => {
  const out = join(dir, name);
  ff(['-f', 'lavfi', '-i', `testsrc2=s=${size}:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=300:r=48000:d=${secs}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '32', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  return out;
};
test.beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'haze-f0-')); });

const heap = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : -1);

async function exportOnce(page: import('@playwright/test').Page, size: string, fps: number, timeoutMs: number) {
  await page.getByTestId('export-size').selectOption({ label: size });
  await page.getByTestId('export-fps').selectOption(String(fps));
  await page.getByTestId('export').click();
  await expect(page.getByTestId('export-info')).toBeVisible({ timeout: timeoutMs });
  return {
    info: await page.getByTestId('export-info').innerText(),
    timing: await page.getByTestId('export-timing').innerText(),
  };
}

test.describe('Video Studio F0: medições', () => {
  test('4K: 20 s de 3840x2160 exportados em 1080p30', async ({ page }) => {
    test.setTimeout(600_000);
    const f = src('4k.mp4', '3840x2160', 20);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    const t0 = Date.now();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1, { timeout: 60_000 });
    const importS = (Date.now() - t0) / 1000;
    await page.getByTestId('add-clip-0').click();
    const t1 = Date.now();
    const r = await exportOnce(page, '1920×1080', 30, 500_000);
    const wall = (Date.now() - t1) / 1000;
    console.log(`F0: 4K->1080p30 20 s | importar ${importS.toFixed(1)} s | exportar ${wall.toFixed(1)} s (${(20 / wall).toFixed(2)}x) | ${r.timing} | heap ${await heap(page)} MB`);
  });

  test('longo: 10 min de 1080p exportados em 720p30 (mix de áudio inteiro em memória)', async ({ page }) => {
    test.setTimeout(1_500_000);
    const f = src('10min.mp4', '1920x1080', 600);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1, { timeout: 60_000 });
    await page.getByTestId('add-clip-0').click();
    const t1 = Date.now();
    let peak = 0;
    const poll = setInterval(() => { void heap(page).then(h => { if (h > peak) peak = h; }).catch(() => {}); }, 3000);
    try {
      const r = await exportOnce(page, '1280×720', 30, 1_400_000);
      const wall = (Date.now() - t1) / 1000;
      console.log(`F0: 10 min 1080p->720p30 | exportar ${wall.toFixed(1)} s (${(600 / wall).toFixed(2)}x) | ${r.timing} | ${r.info} | pico heap JS amostrado ${peak} MB`);
    } finally { clearInterval(poll); }
  });

  test('memória: 5 exportações seguidas do mesmo projeto', async ({ page }) => {
    test.setTimeout(600_000);
    const f = src('mem.mp4', '1280x720', 10);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    const hs: number[] = [await heap(page)];
    for (let i = 0; i < 5; i++) {
      await exportOnce(page, '1280×720', 30, 120_000);
      hs.push(await heap(page));
    }
    console.log(`F0: memória heap JS (MB) após 0..5 exportações: ${hs.join(', ')}`);
  });

  test('responsividade: maior tarefa longa e pior intervalo entre quadros da página durante a exportação (1080p30, 20 s)', async ({ page }) => {
    test.setTimeout(300_000);
    const f = src('resp.mp4', '1920x1080', 20);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await page.evaluate(() => {
      const w = window as any; w.__long = []; w.__gaps = []; let last = performance.now();
      new PerformanceObserver(l => l.getEntries().forEach(e => w.__long.push(e.duration))).observe({ entryTypes: ['longtask'] });
      const tick = (n: number) => { w.__gaps.push(n - last); last = n; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await exportOnce(page, '1920×1080', 30, 250_000);
    const r = await page.evaluate(() => {
      const w = window as any; const g: number[] = w.__gaps.slice(5);
      g.sort((a, b) => a - b);
      return { maxLong: Math.round(Math.max(0, ...w.__long)), nLong: w.__long.length, p95: Math.round(g[Math.floor(g.length * 0.95)] ?? 0), maxGap: Math.round(g[g.length - 1] ?? 0), frames: g.length };
    });
    console.log(`F0: responsividade durante export 1080p | maior tarefa longa ${r.maxLong} ms (${r.nLong} tarefas >50 ms) | intervalo entre quadros da UI p95 ${r.p95} ms, máx ${r.maxGap} ms (${r.frames} quadros)`);
  });

  test('F2: custo do preset de câmera (CCTV = P&B + realce + vinheta + granulado) em 1080p30, 20 s', async ({ page }) => {
    test.setTimeout(300_000);
    const f = src('cam.mp4', '1920x1080', 20);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    const t0 = Date.now(); const base = await exportOnce(page, '1920×1080', 30, 200_000); const sBase = (Date.now() - t0) / 1000;
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('cam-preset').selectOption('cctv');
    const t1 = Date.now(); const cam = await exportOnce(page, '1920×1080', 30, 200_000); const sCam = (Date.now() - t1) / 1000;
    console.log(`F0: preset CCTV 1080p30 20 s | sem preset ${sBase.toFixed(1)} s (${base.timing}) | com preset ${sCam.toFixed(1)} s (${cam.timing})`);
  });

  test('F3: custo da transição (2 decodificadores) em 1080p30: 2 x 20 s, 2 s de fusão', async ({ page }) => {
    test.setTimeout(300_000);
    const f = src('trans.mp4', '1920x1080', 20);
    await page.goto('/'); await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click(); await page.getByTestId('add-clip-0').click();
    const t0 = Date.now(); const base = await exportOnce(page, '1920×1080', 30, 200_000); const sBase = (Date.now() - t0) / 1000;
    await page.getByTestId('clip-block').nth(1).click();
    await page.getByTestId('transition').fill('2'); await page.getByTestId('transition').blur();
    const t1 = Date.now(); const tr = await exportOnce(page, '1920×1080', 30, 200_000); const sTr = (Date.now() - t1) / 1000;
    console.log(`F0: transição 1080p30 | corte seco 40 s de vídeo: ${sBase.toFixed(1)} s (${base.timing}) | com fusão 38 s de vídeo: ${sTr.toFixed(1)} s (${tr.timing})`);
  });
});
