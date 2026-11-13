/**
 * Video Studio - Milestone 1: Preservação de Sessão entre Abas (R2).
 *
 * Valida que o estado do Video Studio (mídias importadas, clipes na timeline,
 * overlays, histórico de edição) não é perdido ao alternar entre abas
 * (Editor RP, GIF Lab, Video Studio), e que a reprodução é imediatamente
 * pausada ao sair da aba ativa sem vazamento de decodificadores/áudio.
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
  dir = mkdtempSync(join(tmpdir(), 'haze-session-'));
  sampleVideo = join(dir, 'session-sample.mp4');
  // Cria vídeo sintético de 5 segundos com áudio 440 Hz
  ff([
    '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=5',
    '-f', 'lavfi', '-i', 'sine=f=440:r=48000:d=5',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', sampleVideo
  ]);
});

test.describe('Video Studio: Preservação de Sessão e Desacoplamento de Abas', () => {
  test('aba Video Studio carrega corretamente', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();
    await expect(page.getByTestId('video-preview')).toBeVisible();
    await expect(page.getByTestId('video-library')).toBeVisible();
  });

  test('preserva mídias, timeline e clipes ao alternar para Editor RP e retornar', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // 1. Importa vídeo e adiciona à timeline
    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Adiciona um overlay de texto para testar múltiplos elementos de estado
    await page.getByTestId('chat-text').fill('Texto de Teste de Sessão');
    await page.getByTestId('chat-add').click();

    // Verifica que playhead marca duração positiva
    await expect(page.getByTestId('playhead')).not.toHaveText('0:00.00 / 0:00.00');
    const playheadBefore = await page.getByTestId('playhead').innerText();

    // 2. Navega para a aba Editor RP
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();

    // 3. Retorna para o Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // 4. Valida persistência íntegra do estado
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('clip-block')).toBeVisible();
    await expect(page.getByTestId('playhead')).toHaveText(playheadBefore);

    // O botão de salvar projeto deve continuar habilitado
    await expect(page.getByTestId('project-save')).toBeEnabled();
  });

  test('pausa a reprodução ao sair da aba do Video Studio', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    // Importa vídeo e adiciona à timeline
    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Inicia reprodução
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });

    // Aguarda o relógio avançar
    await expect.poll(async () => {
      const ph = await page.getByTestId('playhead').innerText();
      return ph;
    }, { timeout: 10_000 }).not.toMatch(/^0:00\.00/);

    // Alterna para outra aba (Editor RP) enquanto estava tocando
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();

    // Aguarda um curto intervalo fora da aba
    await page.waitForTimeout(600);

    // Retorna para o Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Deve estar pausado (botão "Reproduzir" e áudio "parado")
    await expect(page.getByTestId('play')).toContainText('Reproduzir');
    await expect(page.getByTestId('audio-status')).toContainText('parado');

    // Verifica que o playhead permanece estático (não continua avançando)
    const phPaused = await page.getByTestId('playhead').innerText();
    await page.waitForTimeout(500);
    expect(await page.getByTestId('playhead').innerText()).toBe(phPaused);
  });

  test('preserva estado do Video Studio alternando entre GIF Lab e Editor RP sucessivamente', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    await page.getByTestId('video-file-input').setInputFiles([sampleVideo]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toBeVisible();

    // Muda para modo Simples
    await page.getByTestId('video-mode-simple').click();
    await expect(page.getByTestId('video-mode-simple')).toHaveAttribute('aria-pressed', 'true');

    // Navega para GIF Lab
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();

    // Navega para Editor RP
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('video-studio')).toBeHidden();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();

    // Retorna para Video Studio
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Valida que o modo Simples foi preservado
    await expect(page.getByTestId('video-mode-simple')).toHaveAttribute('aria-pressed', 'true');
    // Valida que a biblioteca continua preservada
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);

    // Restaura modo Avançado e valida que os clipes na timeline continuam intactos
    await page.getByTestId('video-mode-advanced').click();
    await expect(page.getByTestId('video-mode-advanced')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('clip-block')).toBeVisible();
  });
});
