/**
 * Video Studio (POC): arrasto na timeline e medição de desempenho de exportação.
 * Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
let fileA = '', fileB = '', big = '', f441 = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-video-x-'));
  const mk = (out: string, color: string, hz: number, secs: number, size = '640x360') =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fileA = join(dir, 'a.mp4'); mk(fileA, 'red', 440, 4);
  fileB = join(dir, 'b.mp4'); mk(fileB, 'blue', 880, 3);
  f441 = join(dir, 'c-44k.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=green:s=640x360:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:r=44100:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-shortest', f441]);
  // fonte pesada: 1080p com ruído (difícil de decodificar/comprimir), 30 s
  big = join(dir, 'grande-1080p.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=30', '-f', 'lavfi', '-i', 'sine=f=300:r=48000:d=30',
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', big]);
});

test.describe('Video Studio (POC): arrasto e desempenho', () => {
  test('arrastar um clipe na timeline reorganiza a trilha', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fileA, fileB]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();
    const blocks = page.getByTestId('clip-block');
    await expect(blocks).toHaveCount(2);
    const idsBefore = await blocks.evaluateAll(els => els.map(e => e.getAttribute('data-clip-id')));
    const first = await blocks.nth(0).boundingBox();
    const second = await blocks.nth(1).boundingBox();
    expect(first && second).toBeTruthy();
    // arrasta o primeiro clipe para depois do segundo
    const sx = first!.x + first!.width / 2, sy = first!.y + first!.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 40, sy, { steps: 5 });
    await page.mouse.move(second!.x + second!.width + 60, sy, { steps: 15 });
    await page.mouse.up();
    await expect.poll(async () => (await blocks.evaluateAll(els => els.map(e => e.getAttribute('data-clip-id'))))[0]).toBe(idsBefore[1]);
    await expect(page.getByTestId('playhead')).toContainText('/ 0:07.00'); // duração preservada
  });

  test('fonte de áudio em 44,1 kHz é reamostrada para 48 kHz sem mudar o tom nem a duração', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([f441]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('export-size').selectOption({ label: '854×480' });
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 100_000 });
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('export-download').click();
    const out = join(dir, 'saida-44k.mp4');
    await (await dl).saveAs(out);
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 26 });
    const a = new Int16Array(new Uint8Array(r.stdout).buffer);
    let z = 0; const s0 = 48000, e0 = 96000; // 1 s do meio
    for (let i = s0 + 1; i < e0; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) z++;
    expect(Math.abs(z / 2 - 440)).toBeLessThan(15);
    expect(a.length / 48000).toBeGreaterThan(2.9); expect(a.length / 48000).toBeLessThan(3.2);
  });

  test('desempenho: 3 clipes de 1080p (30 s cada) exportados a 1080p/30', async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([big]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    for (let i = 0; i < 2; i++) await page.getByTestId('add-clip-0').click(); // 60 s
    await page.getByTestId('export-size').selectOption({ label: '1920×1080' });
    await page.getByTestId('export').click();
    const t0 = Date.now();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 280_000 });
    const wall = (Date.now() - t0) / 1000;
    const info = await page.getByTestId('export-result').getByTestId('export-info').innerText();
    const timing = await page.getByTestId('export-timing').innerText();
    const heap = await page.evaluate(() => (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : -1);
    console.log(`PERF 60 s de 1080p -> ${info} | parede ${wall.toFixed(1)} s | razão ${(60 / wall).toFixed(2)}x tempo real | ${timing} | heap JS ${heap} MB`);
    expect(wall).toBeLessThan(280);
  });
});
