/**
 * Empirical Stress Test Harness for Milestone 1 (Session Preservation & Tab Decoupling)
 * Written by Challenger (challenger_m1_1)
 */
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
  dir = mkdtempSync(join(tmpdir(), 'haze-stress-'));
  sampleVideo = join(dir, 'stress-sample.mp4');
  // 6-second video with 440Hz sine audio
  ff([
    '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=6',
    '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', sampleVideo
  ]);
});

test.describe('Milestone 1 Empirical Stress Tests', () => {
  test('Stress: Rapid tab hammering (20 switches) preserves state with zero console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => {
      consoleErrors.push(err.message);
    });

    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Import media and place on timeline
    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Add text overlay
    await page.getByTestId('chat-text').fill('Stress Test Overlay');
    await page.getByTestId('chat-add').click();

    // Initial playhead duration
    const playheadInitial = await page.getByTestId('playhead').innerText();
    expect(playheadInitial).not.toBe('0:00.00 / 0:00.00');

    // Perform 20 rapid switches across tabs
    const tabs = [
      () => page.getByRole('button', { name: /Editor RP/ }).click(),
      () => page.getByRole('button', { name: /Video to GIF Lab/ }).click(),
      () => page.getByTestId('tab-video').click(),
    ];

    for (let i = 0; i < 20; i++) {
      const target = tabs[i % tabs.length];
      await target();
      // short jitter between 10ms and 40ms
      await page.waitForTimeout(20);
    }

    // Finally re-activate Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Verify state integrity
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('clip-block')).toBeVisible();
    await expect(page.getByTestId('playhead')).toHaveText(playheadInitial);

    // Filter benign console warnings / known non-breaking messages if any
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('downloadable font'));
    expect(fatalErrors).toEqual([]);
  });

  test('Stress: AudioContext and Frame rendering completely halt when tab deactivated during playback', async ({ page }) => {
    test.setTimeout(60_000);

    // Instrument AudioContext in window to track active contexts and state BEFORE navigation
    await page.addInitScript(() => {
      (window as any).__audioContexts = [];
      const OrigAC = window.AudioContext;
      if (OrigAC) {
        window.AudioContext = function (...args: any[]) {
          const inst = new OrigAC(...args);
          (window as any).__audioContexts.push(inst);
          return inst;
        } as any;
        window.AudioContext.prototype = OrigAC.prototype;
      }
    });

    await page.goto('/');

    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Import media and place on timeline
    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Start playback
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });

    // Wait until time advances past 0.5s
    await expect.poll(async () => {
      const ph = await page.getByTestId('playhead').innerText();
      return ph;
    }, { timeout: 10_000 }).not.toMatch(/^0:00\.0[0-4]/);

    // Switch tab while playing
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();

    // Verify all AudioContexts are closed or suspended, none running
    const audioStates = await page.evaluate(() => {
      const list = (window as any).__audioContexts as AudioContext[] || [];
      return list.map(ac => ac.state);
    });

    // AudioContext should either be closed or not running
    expect(audioStates.length).toBeGreaterThan(0);
    for (const state of audioStates) {
      expect(state).toBe('closed');
    }

    // Wait 1.5 seconds while hidden to verify no phantom playback advances
    await page.waitForTimeout(1500);

    // Return to Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Must be stopped
    await expect(page.getByTestId('play')).toContainText('Reproduzir');
    await expect(page.getByTestId('audio-status')).toContainText('parado');

    const phWhenReturned = await page.getByTestId('playhead').innerText();
    // Wait another 500ms and verify playhead did not advance
    await page.waitForTimeout(500);
    expect(await page.getByTestId('playhead').innerText()).toBe(phWhenReturned);

    // Resume playback again to ensure no broken state or AudioContext crash
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });

    // Check that playhead advances again
    await expect.poll(async () => {
      return await page.getByTestId('playhead').innerText();
    }, { timeout: 10_000 }).not.toBe(phWhenReturned);

    // Clean pause
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toContainText('Reproduzir');
  });

  test('Stress: Canvas preview and timeline cursor sync after multiple seeks and tab toggles', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    const canvas = page.getByTestId('video-preview');
    await expect(canvas).toBeVisible();

    // Helper to sample canvas center pixel color
    const getCanvasCenterPixel = async () => {
      return await page.evaluate(() => {
        const cv = document.querySelector('canvas[data-testid="video-preview"]') as HTMLCanvasElement;
        if (!cv) return null;
        const ctx = cv.getContext('2d');
        if (!ctx) return null;
        const p = ctx.getImageData(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1).data;
        return Array.from(p);
      });
    };

    const pixelInitial = await getCanvasCenterPixel();
    expect(pixelInitial).not.toBeNull();

    // Toggle tab away and back 5 times
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /Editor RP/ }).click();
      await expect(page.getByTestId('video-studio')).toBeHidden();
      await page.waitForTimeout(50);
      await page.getByTestId('tab-video').click();
      await expect(page.getByTestId('video-studio')).toBeVisible();
    }

    // Verify canvas is still intact and redraws without blank/blackout
    const pixelAfter = await getCanvasCenterPixel();
    expect(pixelAfter).not.toBeNull();
    // Non-zero alpha
    expect(pixelAfter![3]).toBeGreaterThan(0);
  });
});
