/**
 * Video Studio: o PREVIEW durante a reprodução precisa mostrar imagem em movimento junto com o áudio,
 * também com vídeo de GOP longo (gravação de jogo): regressão do "só sai áudio e a imagem congela".
 * Requer ffmpeg no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '', longGop = '';
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-play-'));
  longGop = join(dir, 'longgop.mp4');
  // 1280x720, 30 fps, 12 s, um único quadro-chave (-g 9999): pior caso para acesso aleatório
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=12', '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=12',
    '-c:v', 'libx264', '-preset', 'veryfast', '-g', '9999', '-bf', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', longGop], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
});

const sig = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid="video-preview"]') as HTMLCanvasElement;
  const x = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let h = 0; for (let i = 0; i < x.length; i += 97) h = (h * 31 + x[i]) | 0;
  return h;
});

test('preview mostra imagem em movimento desde o início da reprodução (GOP longo)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles([longGop]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
  await page.getByTestId('add-clip-0').click();
  // deixa o quadro parado desenhar antes de tocar
  await page.waitForTimeout(800);
  const still = await sig(page);
  await page.getByTestId('play').click();
  const seen = new Set<number>(); let firstChangeMs = -1; const t0 = Date.now();
  for (let i = 0; i < 24; i++) { // ~4 s de reprodução
    await page.waitForTimeout(170);
    const s = await sig(page); seen.add(s);
    if (firstChangeMs < 0 && s !== still) firstChangeMs = Date.now() - t0;
  }
  const head = await page.getByTestId('playhead').innerText();
  await page.getByTestId('play').click();
  // a imagem muda de verdade, e a primeira mudança vem logo (não só depois de segundos)
  expect(seen.size).toBeGreaterThan(8);
  expect(firstChangeMs).toBeGreaterThan(0);
  expect(firstChangeMs).toBeLessThan(1500);
  expect(head).not.toMatch(/^0:00\.00/);
});
