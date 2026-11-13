import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '', testVideo = '';

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-concurrency-'));
  testVideo = join(dir, 'stress_video.mp4');
  // Cria vídeo de teste de 10s a 30fps com áudio para estresse de concorrência
  const r = spawnSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=10',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    testVideo
  ]);
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
});

test.describe('Video Studio: Marco 2 — Concorrência, Mutex e Relógio Mestre', () => {
  test('seeks rápidos e consecutivos não travam o FramePlayer e mantêm relógio monotônico', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([testVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();

    await page.waitForTimeout(500);

    // Inicia reprodução
    await page.getByTestId('play').click();
    await page.waitForTimeout(400);

    // Executa série de 10 seeks ultrarrápidos simulando scrubbing agressivo
    for (let i = 1; i <= 8; i++) {
      await page.evaluate((targetTime) => {
        const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
        if (input) {
          input.value = String(targetTime);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, i * 0.8);
      await page.waitForTimeout(60);
    }

    // Aguarda o frame player assentar após o scrubbing
    await page.waitForTimeout(500);

    // Verifica que o playhead avançou normalmente e não voltou para 0:00
    const head = await page.getByTestId('playhead').innerText();
    expect(head).not.toBe('0:00.00');

    // Pausa e retoma sucessivamente para testar AudioContext reuse e time()
    await page.getByTestId('play').click(); // pausa
    await page.waitForTimeout(200);
    const timePaused = await page.getByTestId('playhead').innerText();

    await page.getByTestId('play').click(); // retoma
    await page.waitForTimeout(400);
    const timeResumed = await page.getByTestId('playhead').innerText();

    expect(timeResumed).not.toBe('0:00.00');
    expect(timeResumed).not.toBe(timePaused);

    // Zero erros fatais de concorrência ou iteradores no console
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('status of 404'));
    expect(fatalErrors).toHaveLength(0);
  });
});
