import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '', testVideo = '';

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-adversarial-'));
  testVideo = join(dir, 'stress_video_15s.mp4');
  const r = spawnSync('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=15',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    testVideo
  ]);
  if (r.error) throw new Error(`ffmpeg error: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
});

test.describe('Investigação de Concorrência: RAF vs React setT', () => {

  test('Rastrear exatamente o que acontece quando seek ocorre durante RAF ativo', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([testVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    await page.waitForTimeout(600);

    // Inicia reprodução
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10000 });

    // Aguarda reproduzir até cerca de 1.5s
    await page.waitForTimeout(1500);

    const seekTargets = [3.2, 5.8, 2.1, 7.5, 4.0, 9.6, 1.2, 11.4];
    const logEntries: any[] = [];

    for (let i = 0; i < seekTargets.length; i++) {
      const target = seekTargets[i];
      const beforeVal = await page.getByTestId('playhead-input').inputValue();

      await page.evaluate((targetTime) => {
        const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, String(targetTime));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, target);

      // Amostra a cada 10ms por 70ms
      const intermediateSamples: string[] = [];
      for (let s = 0; s < 7; s++) {
        await page.waitForTimeout(10);
        intermediateSamples.push(await page.getByTestId('playhead-input').inputValue());
      }

      logEntries.push({
        step: i,
        target,
        beforeVal,
        samples: intermediateSamples
      });
    }

    console.log('TRACE COMPLETO DO SEEK DURANTE RAF:', JSON.stringify(logEntries, null, 2));
  });

});
