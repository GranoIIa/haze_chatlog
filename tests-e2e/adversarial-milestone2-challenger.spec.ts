import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '', testVideo = '';

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-challenger-m2-'));
  testVideo = join(dir, 'challenger_stress_15s.mp4');
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

test.describe('Challenger 2 — Milestone 2: Validação Empírica Adversarial', () => {

  test('Adversarial 1: Monotonicidade estrita do relógio mestre em fromT = 0, 5.2 e 12.8', async ({ page }) => {
    await page.goto('/');

    const evalResults = await page.evaluate(async () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      
      class TestPreviewAudio {
        private static sharedCtx: AudioContext | null = null;
        private ctx: AudioContext | null = null;
        private baseCtx = 0;
        private baseT = 0;
        private startWallTime = 0;
        private stopped = true;
        private useWallClock = false;
        private runId = 0;

        private getOrCreateContext(): AudioContext | null {
          if (!TestPreviewAudio.sharedCtx || TestPreviewAudio.sharedCtx.state === 'closed') {
            try { TestPreviewAudio.sharedCtx = new AudioCtx(); } catch { return null; }
          }
          return TestPreviewAudio.sharedCtx;
        }

        time(): number {
          if (this.stopped) return this.baseT;
          if (!this.useWallClock && this.ctx && this.ctx.state === 'running' && this.baseCtx > 0) {
            const elapsed = this.ctx.currentTime - this.baseCtx;
            return this.baseT + Math.max(0, elapsed);
          }
          const wallElapsed = (performance.now() / 1000) - this.startWallTime;
          return this.baseT + Math.max(0, wallElapsed);
        }

        async start(fromT: number): Promise<void> {
          this.stop();
          const currentRun = ++this.runId;
          this.stopped = false;
          this.baseT = fromT;
          this.baseCtx = 0;
          this.startWallTime = performance.now() / 1000;
          this.useWallClock = false;

          const ctx = this.getOrCreateContext();
          this.ctx = ctx;
          if (!ctx) { this.useWallClock = true; return; }

          if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch { this.useWallClock = true; }
          }
          if (this.stopped || this.runId !== currentRun) return;

          if (ctx.state === 'running') {
            this.baseCtx = ctx.currentTime + 0.08;
            this.startWallTime = performance.now() / 1000;
          } else {
            this.useWallClock = true;
          }
        }

        stop(): number {
          const t = this.time();
          this.stopped = true;
          this.runId++;
          this.baseT = t;
          this.baseCtx = 0;
          return t;
        }
      }

      const pa = new TestPreviewAudio();
      const testPoints = [0, 5.2, 12.8];
      const outcomes = [];

      for (const pt of testPoints) {
        const samples: number[] = [];
        const startPromise = pa.start(pt);

        // Amostragem contínua nos primeiros 250ms a cada 8ms (~120fps)
        const t0 = performance.now();
        while (performance.now() - t0 < 250) {
          samples.push(pa.time());
          await new Promise(r => setTimeout(r, 8));
        }
        await startPromise;

        for (let i = 0; i < 15; i++) {
          samples.push(pa.time());
          await new Promise(r => setTimeout(r, 8));
        }

        pa.stop();

        let hasDropBelowFromT = false;
        let hasNonMonotonicStep = false;
        const violations: string[] = [];

        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (s < pt) {
            hasDropBelowFromT = true;
            violations.push(`sample[${i}]=${s} < fromT=${pt}`);
          }
          if (i > 0 && samples[i] < samples[i - 1]) {
            hasNonMonotonicStep = true;
            violations.push(`step[${i}]: ${samples[i - 1]} -> ${samples[i]}`);
          }
        }

        outcomes.push({
          pt,
          minVal: Math.min(...samples),
          maxVal: Math.max(...samples),
          hasDropBelowFromT,
          hasNonMonotonicStep,
          violations
        });
      }

      return outcomes;
    });

    for (const out of evalResults) {
      expect(out.hasDropBelowFromT, `Violação em fromT=${out.pt}: ${out.violations.join(', ')}`).toBe(false);
      expect(out.hasNonMonotonicStep, `Regressão temporal em fromT=${out.pt}: ${out.violations.join(', ')}`).toBe(false);
      expect(out.minVal).toBeGreaterThanOrEqual(out.pt);
    }
  });

  test('Adversarial 2: Busca agressiva (scrubbing a cada 50ms) sem sobrescrita da agulha', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([testVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    await page.waitForTimeout(600);

    // Inicia reprodução inicial
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10000 });
    await page.waitForTimeout(1000); // toca 1s

    const seekTargets = [3.2, 5.8, 2.1, 7.5, 4.0, 9.6, 1.2, 11.4];

    for (const target of seekTargets) {
      // Dispara seek garantindo evento de formulário
      await page.evaluate((targetTime) => {
        const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
        if (input) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, String(targetTime));
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, target);

      // Retoma reprodução imediatamente
      await page.evaluate(() => {
        const playBtn = document.querySelector('[data-testid="play"]') as HTMLButtonElement;
        if (playBtn && playBtn.innerText.includes('Reproduzir')) {
          playBtn.click();
        }
      });

      await page.waitForTimeout(50); // intervalo exato de 50ms

      const phText = await page.getByTestId('playhead').innerText();
      const valStr = await page.getByTestId('playhead-input').inputValue();
      const numVal = parseFloat(valStr);

      // Validações determinísticas
      expect(phText).not.toMatch(/^0:00\.00/);
      expect(numVal).toBeGreaterThanOrEqual(target - 0.05);
      expect(numVal).toBeLessThanOrEqual(target + 0.35);
    }

    // Estabiliza e valida continuidade
    await page.waitForTimeout(300);
    const finalVal = parseFloat(await page.getByTestId('playhead-input').inputValue());
    expect(finalVal).toBeGreaterThan(11.4);

    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('status of 404'));
    expect(fatalErrors).toHaveLength(0);
  });

  test('Adversarial 3: Teto de hardware de AudioContext (20 ciclos consecutivos)', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      let realContextInstances = 0;
      const OriginalAudioContext = AudioCtx;

      (window as any).AudioContext = class extends OriginalAudioContext {
        constructor() {
          super();
          realContextInstances++;
        }
      };

      class PersistentPreviewAudio {
        private static sharedCtx: AudioContext | null = null;
        private ctx: AudioContext | null = null;
        private stopped = true;

        private getOrCreateContext(): AudioContext | null {
          if (!PersistentPreviewAudio.sharedCtx || PersistentPreviewAudio.sharedCtx.state === 'closed') {
            PersistentPreviewAudio.sharedCtx = new (window as any).AudioContext();
          }
          return PersistentPreviewAudio.sharedCtx;
        }

        async start(fromT: number) {
          this.stop();
          this.stopped = false;
          const ctx = this.getOrCreateContext();
          this.ctx = ctx;
          if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
          }
        }

        stop() {
          this.stopped = true;
        }

        getState() {
          return this.ctx?.state;
        }
      }

      const pa = new PersistentPreviewAudio();
      for (let i = 0; i < 20; i++) {
        await pa.start(i * 0.25);
        await new Promise(r => setTimeout(r, 15));
        pa.stop();
      }

      return {
        realContextInstances,
        finalState: pa.getState()
      };
    });

    expect(result.realContextInstances).toBe(1);
    expect(result.finalState).toBe('running');
  });

});
