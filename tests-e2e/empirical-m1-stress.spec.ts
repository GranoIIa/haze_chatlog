import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
let sampleVideo = '';

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-empirical-m1-'));
  sampleVideo = join(dir, 'sample.mp4');
  ff([
    '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4',
    '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', sampleVideo
  ]);
});

test.describe('Milestone 1 Empirical Stress Tests (Challenger)', () => {
  test('Stress: 10 rapid tab switches do not leak or corrupt session state', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Import video and add to timeline
    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Add chat overlay
    await page.getByTestId('chat-text').fill('Stress Test Tab Switch');
    await page.getByTestId('chat-add').click();

    // Record initial playhead
    const initialPlayhead = await page.getByTestId('playhead').innerText();

    // Rapidly alternate tabs 10 times
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: /Editor RP/ }).click();
      await expect(page.getByTestId('video-studio')).toBeHidden();
      await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
      await expect(page.getByTestId('video-studio')).toBeHidden();
      await page.getByTestId('tab-video').click();
      await expect(page.getByTestId('video-studio')).toBeVisible();
    }

    // Assert that library, clip, and playhead remain 100% intact
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('clip-block')).toBeVisible();
    await expect(page.getByTestId('playhead')).toHaveText(initialPlayhead);
    await expect(page.getByTestId('project-save')).toBeEnabled();
  });

  test('Boundary: Hidden VideoStudioView ceases CPU / animation loops and audio completely', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Start playback
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });

    // Ensure playback has advanced
    await expect.poll(async () => {
      return await page.getByTestId('playhead').innerText();
    }, { timeout: 10_000 }).not.toMatch(/^0:00\.00/);

    // Switch to Editor RP tab
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();

    // While inactive, record playhead and wait 1500ms
    const playheadAtBlur = await page.getByTestId('playhead').innerText();
    await page.waitForTimeout(1500);
    const playheadAfterWait = await page.getByTestId('playhead').innerText();

    // Playhead MUST NOT advance while inactive in background
    expect(playheadAfterWait).toBe(playheadAtBlur);

    // Switch back to Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Audio status must be stopped and play button must be ready to play
    await expect(page.getByTestId('audio-status')).toContainText('parado');
    await expect(page.getByTestId('play')).toContainText('Reproduzir');
    expect(await page.getByTestId('playhead').innerText()).toBe(playheadAtBlur);
  });

  test('Media Disposal Safety: Media sources remain active during tab switches and are not disposed prematurely', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Cycle tabs
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Media sink is still valid and functional: we can start playback immediately without error
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });

    // Playhead advances normally proving media decoders were NOT disposed
    await expect.poll(async () => {
      return await page.getByTestId('playhead').innerText();
    }, { timeout: 10_000 }).not.toMatch(/^0:00\.00/);

    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('parado');
  });
});
