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

test.describe('Investigação Forense: Mecanismo de Seek e Scrubbing', () => {

  test('Diagnóstico: Como o seek se comporta durante playback com playhead-input.fill()', async ({ page }) => {
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

    // Deixa tocar por 1s
    await page.waitForTimeout(1000);
    const beforeSeek = await page.getByTestId('playhead-input').inputValue();
    console.log('Valor antes do seek:', beforeSeek);

    // Método A: page.getByTestId('playhead-input').fill('5.5')
    await page.getByTestId('playhead-input').fill('5.5');
    await page.waitForTimeout(100);
    const afterFill = await page.getByTestId('playhead-input').inputValue();
    const isPlayingAfterFill = await page.getByTestId('play').innerText();
    console.log('Valor após fill(5.5):', afterFill, 'Botão play diz:', isPlayingAfterFill);

    // Método B: Dispatch via nativeInputValueSetter
    await page.evaluate((targetTime) => {
      const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, String(targetTime));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 8.2);

    await page.waitForTimeout(100);
    const afterNative = await page.getByTestId('playhead-input').inputValue();
    console.log('Valor após nativeInputValueSetter(8.2):', afterNative);

    // Método C: O que dispatchEvent puro fez (o que video-concurrency.spec.ts fez)
    await page.evaluate((targetTime) => {
      const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
      if (input) {
        input.value = String(targetTime);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, 11.0);

    await page.waitForTimeout(100);
    const afterSimpleAssign = await page.getByTestId('playhead-input').inputValue();
    console.log('Valor após input.value = 11.0 simples:', afterSimpleAssign);
  });

});
