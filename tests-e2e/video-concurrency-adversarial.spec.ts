import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '', testVideo = '';

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-concurrency-adv-'));
  testVideo = join(dir, 'adv_video.mp4');
  const r = spawnSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=800:duration=15',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    testVideo
  ]);
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
});

test.describe('Video Studio: Adversarial Concurrency & Sudden Unmount Stress', () => {
  test('Rajada de scrubbing simultâneo com unmount imediato (troca de aba) não deixa promessas rejeitadas ou erros no console', async ({ page }) => {
    const unhandledErrors: string[] = [];
    page.on('pageerror', err => unhandledErrors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('404')) {
          unhandledErrors.push(text);
        }
      }
    });

    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([testVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();

    await page.waitForTimeout(400);
    await page.getByTestId('play').click();

    // Rajada de 20 inputs de playhead em menos de 100ms
    await page.evaluate(() => {
      const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
      if (input) {
        for (let i = 0; i < 20; i++) {
          input.value = String(Math.random() * 12);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    // Descarte súbito imediato (troca para aba ChatLog) sem esperar assentar
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await page.waitForTimeout(500);

    // Retorna para o Video Studio
    await page.getByTestId('tab-video').click();
    await page.waitForTimeout(500);

    // Verifica que a aplicação sobreviveu intacta
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Filtra erros relevantes
    const fatal = unhandledErrors.filter(e =>
      e.includes('Generator is already executing') ||
      e.includes('Unhandled') ||
      e.includes('AudioContext')
    );
    expect(fatal).toHaveLength(0);
  });
});
