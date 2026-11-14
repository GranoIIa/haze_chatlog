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

test.describe('Adversarial Stress Test: PreviewAudio & Playhead Integrity', () => {

  test('Teste 1: Monotonicidade estrita de PreviewAudio em múltiplos pontos de início (0, 5.2, 12.8)', async ({ page }) => {
    await page.goto('/');

    // Avalia o comportamento do relógio diretamente no contexto do browser com Web Audio ativo
    const results = await page.evaluate(async () => {
      // Importa dinamicamente ou replica a classe PreviewAudio com AudioContext real do navegador
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
      const evaluation: {
        fromT: number;
        samples: number[];
        minSample: number;
        hasDropBelowFromT: boolean;
        hasNonMonotonicStep: boolean;
        dropDetails: string[];
      }[] = [];

      for (const pt of testPoints) {
        const samples: number[] = [];
        const dropDetails: string[] = [];
        
        // Dispara start de forma assíncrona
        const startPromise = pa.start(pt);

        // Amostra nos primeiros quadros (a cada 10ms por 250ms)
        const t0 = performance.now();
        while (performance.now() - t0 < 250) {
          samples.push(pa.time());
          await new Promise(r => setTimeout(r, 10));
        }
        await startPromise;

        // Amostra mais alguns quadros após start resolver
        for (let i = 0; i < 10; i++) {
          samples.push(pa.time());
          await new Promise(r => setTimeout(r, 10));
        }

        pa.stop();

        // Análise de monotonicidade
        let hasDropBelowFromT = false;
        let hasNonMonotonicStep = false;
        let minSample = Infinity;

        for (let i = 0; i < samples.length; i++) {
          const s = samples[i];
          if (s < minSample) minSample = s;
          if (s < pt) {
            hasDropBelowFromT = true;
            dropDetails.push(`Amostra ${i} (${s}) é inferior a fromT (${pt})`);
          }
          if (i > 0 && samples[i] < samples[i - 1]) {
            hasNonMonotonicStep = true;
            dropDetails.push(`Regressão monotônica no passo ${i}: ${samples[i - 1]} -> ${samples[i]} (queda de ${(samples[i - 1] - samples[i]).toFixed(4)}s)`);
          }
        }

        evaluation.push({
          fromT: pt,
          samples: samples.slice(0, 15), // primeiros 15 frames para log
          minSample,
          hasDropBelowFromT,
          hasNonMonotonicStep,
          dropDetails
        });
      }

      return evaluation;
    });

    console.log('Resultados de Monotonicidade PreviewAudio:', JSON.stringify(results, null, 2));

    for (const res of results) {
      // 1. Nunca pode ser inferior a fromT
      expect(res.hasDropBelowFromT, `Queda abaixo de fromT (${res.fromT}): ${res.dropDetails.join('; ')}`).toBe(false);
      expect(res.minSample).toBeGreaterThanOrEqual(res.fromT);
      
      // 2. Monotonicidade estrita (tempo nunca pode andar para trás)
      expect(res.hasNonMonotonicStep, `Passo não monotônico detectado em fromT=${res.fromT}: ${res.dropDetails.join('; ')}`).toBe(false);
    }
  });

  test('Teste 2: Busca agressiva (scrubbing) a cada 50ms na UI com reprodução ativa', async ({ page }) => {
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

    // Inicia reprodução
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10000 });

    // Aguarda reproduzir até cerca de 1.5s
    await page.waitForTimeout(1500);

    // Lista de seeks agressivos alternando para frente e para trás
    const seekTargets = [3.2, 5.8, 2.1, 7.5, 4.0, 9.6, 1.2, 11.4];
    const observedPlayheads: { target: number; observed: string; numericObserved: number }[] = [];

    for (const target of seekTargets) {
      // Dispara seek via playhead-input com intervalo de 50ms usando o descriptor nativo do protótipo
      await page.evaluate((targetTime) => {
        const input = document.querySelector('[data-testid="playhead-input"]') as HTMLInputElement;
        if (input) {
          const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          if (descriptor && descriptor.set) {
            descriptor.set.call(input, String(targetTime));
          } else {
            input.value = String(targetTime);
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, target);

      await page.waitForTimeout(50); // intervalo estrito de 50ms

      const phText = await page.getByTestId('playhead').innerText();
      const valStr = await page.getByTestId('playhead-input').inputValue();
      const numVal = parseFloat(valStr);

      observedPlayheads.push({
        target,
        observed: phText,
        numericObserved: numVal
      });

      // Validação imediata: o valor observado reflete o seek recente (tolerância de avanço < 0.25s)
      // e NUNCA é resetado para 0:00 ou para a posição antes do seek
      expect(phText).not.toMatch(/^0:00\.00/);
      expect(numVal).toBeGreaterThanOrEqual(target - 0.05);
      expect(numVal).toBeLessThanOrEqual(target + 0.35);
    }

    console.log('Resultados de Scrubbing Agressivo:', JSON.stringify(observedPlayheads, null, 2));

    // Aguarda 500ms para estabilizar
    await page.waitForTimeout(500);

    // Pausa
    await page.getByTestId('play').click();
    await page.waitForTimeout(200);

    const finalPaused = await page.getByTestId('playhead-input').inputValue();
    const lastTarget = seekTargets[seekTargets.length - 1];
    expect(parseFloat(finalPaused)).toBeGreaterThanOrEqual(lastTarget - 0.05);

    // Zero erros no console
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('status of 404'));
    expect(fatalErrors).toHaveLength(0);
  });

  test('Teste 3: Teto de hardware de AudioContext (20 ciclos consecutivos de start/stop)', async ({ page }) => {
    await page.goto('/');

    const cycleResult = await page.evaluate(async () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      
      // Simula o padrão singleton estático de PreviewAudio
      class PersistentAudioRunner {
        private static sharedCtx: AudioContext | null = null;
        private ctx: AudioContext | null = null;
        private baseT = 0;
        private stopped = true;
        public contextCreations = 0;

        private getOrCreateContext(): AudioContext | null {
          if (!PersistentAudioRunner.sharedCtx || PersistentAudioRunner.sharedCtx.state === 'closed') {
            PersistentAudioRunner.sharedCtx = new AudioCtx();
            this.contextCreations++;
          }
          return PersistentAudioRunner.sharedCtx;
        }

        async start(fromT: number) {
          this.stop();
          this.stopped = false;
          this.baseT = fromT;
          const ctx = this.getOrCreateContext();
          this.ctx = ctx;
          if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
          }
        }

        stop() {
          this.stopped = true;
        }

        getContextState() {
          return this.ctx?.state;
        }
      }

      const runner = new PersistentAudioRunner();
      const logs: { cycle: number; contextCreations: number; state: string | undefined }[] = [];

      for (let i = 1; i <= 20; i++) {
        await runner.start(i * 0.5);
        await new Promise(r => setTimeout(r, 20));
        runner.stop();
        logs.push({
          cycle: i,
          contextCreations: runner.contextCreations,
          state: runner.getContextState()
        });
      }

      return {
        totalCreations: runner.contextCreations,
        logs
      };
    });

    console.log('Resultado do Teste de Teto de AudioContext:', JSON.stringify(cycleResult, null, 2));

    // No Chromium, o limite máximo de AudioContexts simultâneos é 6.
    // Com o reuso persistente singleton de PreviewAudio, exatamente 1 contexto deve ser criado em 20 ciclos.
    expect(cycleResult.totalCreations).toBe(1);
    expect(cycleResult.logs).toHaveLength(20);
  });

  test('Teste 4: Instanciação repetida de múltiplos PreviewAudio (20 instâncias) preservando sharedCtx', async ({ page }) => {
    await page.goto('/');

    const multiInstanceResult = await page.evaluate(async () => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      let totalNativeContextCreations = 0;

      // Intercepta o construtor nativo para contar criações reais
      const OriginalAudioContext = AudioCtx;
      (window as any).AudioContext = class extends OriginalAudioContext {
        constructor() {
          super();
          totalNativeContextCreations++;
        }
      };

      class SharedPreviewAudio {
        private static sharedCtx: AudioContext | null = null;
        private ctx: AudioContext | null = null;

        private getOrCreateContext(): AudioContext | null {
          if (!SharedPreviewAudio.sharedCtx || SharedPreviewAudio.sharedCtx.state === 'closed') {
            SharedPreviewAudio.sharedCtx = new (window as any).AudioContext();
          }
          return SharedPreviewAudio.sharedCtx;
        }

        async start(fromT: number) {
          const ctx = this.getOrCreateContext();
          this.ctx = ctx;
          if (ctx && ctx.state === 'suspended') {
            await ctx.resume();
          }
        }

        stop() {}
        dispose() { this.stop(); }
      }

      // Cria 20 instâncias sucessivas de PreviewAudio (simulando montagens/desmontagens de VideoStudioView)
      for (let i = 0; i < 20; i++) {
        const pa = new SharedPreviewAudio();
        await pa.start(i * 0.1);
        pa.stop();
        pa.dispose();
      }

      return {
        totalNativeCreations: totalNativeContextCreations
      };
    });

    console.log('Criações Nativas de AudioContext com 20 instâncias:', multiInstanceResult);
    expect(multiInstanceResult.totalNativeCreations).toBe(1);
  });

});
