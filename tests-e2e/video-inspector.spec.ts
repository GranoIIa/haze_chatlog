import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirFerramenta, abrirAbaInspetor } from './helpers';

let dir = '';
let fRed = '', fBlue = '';

const ARTIFACTS_DIR = 'C:\\Users\\Vinicius\\.gemini\\antigravity\\brain\\627418ca-96cf-4f90-8b23-f30348541dac';

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-insp-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
});

test.describe('Video Studio PR C - Inspetor Contextual com Abas Condicionais', () => {
  test('estado vazio exibe mensagem quando nenhum elemento estiver selecionado', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Sem seleção: inspetores específicos não aparecem
    await expect(page.getByTestId('inspector')).not.toBeVisible();
    await expect(page.getByTestId('layer-inspector')).not.toBeVisible();
    await expect(page.getByTestId('overlay-editor')).not.toBeVisible();

    // Mensagem curta de orientação visível
    await expect(page.getByText('Clique em um clipe da timeline.')).toBeVisible();
  });

  test('seleção de clipe exibe cabeçalho, abas Vídeo e Áudio com controles e ações inferiores', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);

    await page.getByTestId('add-clip-0').click();

    // Clica no bloco do clipe na timeline
    await page.getByTestId('clip-block').first().click();

    // Inspetor de clipe visível; camada e texto ocultos
    const insp = page.getByTestId('inspector');
    await expect(insp).toBeVisible();
    await expect(page.getByTestId('layer-inspector')).not.toBeVisible();
    await expect(page.getByTestId('overlay-editor')).not.toBeVisible();

    // Cabeçalho com nome, começa em e duração
    await expect(insp).toContainText('vermelho.mp4');
    await expect(insp).toContainText(/começa em 0:00/);
    await expect(insp).toContainText(/dura 0:04/);

    // Abas de clipe presentes
    await expect(page.getByTestId('inspector-tab-video')).toBeVisible();
    await expect(page.getByTestId('inspector-tab-audio')).toBeVisible();
    await expect(page.getByTestId('inspector-tab-layer')).not.toBeVisible();

    // Aba Vídeo é a padrão
    await expect(page.getByTestId('inspector-tab-video')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('trim-in')).toBeVisible();
    await expect(page.getByTestId('trim-out')).toBeVisible();
    await expect(page.getByTestId('speed')).toBeVisible();
    await expect(page.getByTestId('cam-preset')).toBeVisible();
    await expect(page.getByTestId('transition')).toBeVisible();
    await expect(page.getByTestId('clip-volume')).not.toBeVisible();

    // Ações inferiores visíveis
    await expect(page.getByTestId('split')).toBeVisible();
    await expect(page.getByTestId('mute')).toBeVisible();
    await expect(page.getByTestId('remove-clip')).toBeVisible();
    await expect(page.getByTestId('move-left')).toBeVisible();
    await expect(page.getByTestId('move-right')).toBeVisible();

    // Troca para aba Áudio
    await abrirAbaInspetor(page, 'audio');
    await expect(page.getByTestId('inspector-tab-audio')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('inspector-tab-video')).toHaveAttribute('aria-selected', 'false');

    // Controles de áudio visíveis
    await expect(page.getByTestId('clip-volume')).toBeVisible();
    await expect(page.getByTestId('fade-in')).toBeVisible();
    await expect(page.getByTestId('fade-out')).toBeVisible();
    await expect(page.getByTestId('trim-in')).not.toBeVisible();

    // Ações inferiores continuam visíveis na aba Áudio
    await expect(page.getByTestId('split')).toBeVisible();
    await expect(page.getByTestId('mute')).toBeVisible();
    await expect(page.getByTestId('remove-clip')).toBeVisible();
  });

  test('seleção de camada exibe layer-inspector com aba Camada e oculta inspetor de clipe', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-layer-1').click();

    // Seleciona a camada
    await page.getByTestId('layer-block').first().click();

    // Inspetor de camada visível com exclusividade mútua
    const layInsp = page.getByTestId('layer-inspector');
    await expect(layInsp).toBeVisible();
    await expect(page.getByTestId('inspector')).not.toBeVisible();
    await expect(page.getByTestId('overlay-editor')).not.toBeVisible();

    // Cabeçalho da camada
    await expect(layInsp).toContainText('azul.mp4');
    await expect(layInsp).toContainText(/começa em/);

    // Somente aba Camada visível
    await expect(page.getByTestId('inspector-tab-layer')).toBeVisible();
    await expect(page.getByTestId('inspector-tab-layer')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('inspector-tab-video')).not.toBeVisible();
    await expect(page.getByTestId('inspector-tab-audio')).not.toBeVisible();

    // Controles de camada
    await expect(page.getByTestId('layer-x')).toBeVisible();
    await expect(page.getByTestId('layer-y')).toBeVisible();
    await expect(page.getByTestId('layer-scale')).toBeVisible();
    await expect(page.getByTestId('layer-opacity')).toBeVisible();
    await expect(page.getByTestId('layer-volume')).toBeVisible();
    await expect(page.getByTestId('layer-remove')).toBeVisible();
  });

  test('seleção de sobreposição de texto exibe overlay-editor com exclusividade mútua', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();

    // Adiciona texto
    await abrirFerramenta(page, 'texto');
    await page.getByTestId('chat-text').fill('Texto de Teste');
    await page.getByTestId('chat-add').click();

    // Clica no texto na lista de overlays
    await page.getByTestId('overlay-select').first().click();

    // Editor de overlay visível; clipe e camada ocultos
    await expect(page.getByTestId('overlay-editor')).toBeVisible();
    await expect(page.getByTestId('inspector')).not.toBeVisible();
    await expect(page.getByTestId('layer-inspector')).not.toBeVisible();

    // Campos do editor de overlay
    await expect(page.getByTestId('ov-text')).toHaveValue('Texto de Teste');
    await expect(page.getByTestId('ov-start')).toBeVisible();
    await expect(page.getByTestId('ov-duration')).toBeVisible();
    await expect(page.getByTestId('ov-size')).toBeVisible();
  });

  test('capturas de tela do inspetor nos viewports 1440x900 e 1280x720', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900, name: '1440x900' },
      { width: 1280, height: 720, name: '1280x720' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.getByTestId('tab-video').click();
      await expect(page.getByTestId('video-studio')).toBeVisible();

      // 1. Captura Estado Vazio
      const emptyShot = join(dir, `inspector_empty_${vp.name}.png`);
      await page.screenshot({ path: emptyShot, fullPage: false });
      if (existsSync(ARTIFACTS_DIR)) {
        copyFileSync(emptyShot, join(ARTIFACTS_DIR, `inspector_empty_${vp.name}.png`));
      }

      // Prepara timeline com clipe e camada
      await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
      await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);
      await page.getByTestId('add-clip-0').click();
      await page.getByTestId('add-layer-1').click();

      // 2. Captura Clipe (Aba Vídeo)
      await page.getByTestId('clip-block').first().click();
      await expect(page.getByTestId('inspector')).toBeVisible();
      await expect(page.getByTestId('inspector-tab-video')).toHaveAttribute('aria-selected', 'true');
      const clipVideoShot = join(dir, `inspector_clip_video_${vp.name}.png`);
      await page.screenshot({ path: clipVideoShot, fullPage: false });
      if (existsSync(ARTIFACTS_DIR)) {
        copyFileSync(clipVideoShot, join(ARTIFACTS_DIR, `inspector_clip_video_${vp.name}.png`));
      }

      // 3. Captura Clipe (Aba Áudio)
      await abrirAbaInspetor(page, 'audio');
      await expect(page.getByTestId('inspector-tab-audio')).toHaveAttribute('aria-selected', 'true');
      const clipAudioShot = join(dir, `inspector_clip_audio_${vp.name}.png`);
      await page.screenshot({ path: clipAudioShot, fullPage: false });
      if (existsSync(ARTIFACTS_DIR)) {
        copyFileSync(clipAudioShot, join(ARTIFACTS_DIR, `inspector_clip_audio_${vp.name}.png`));
      }

      // 4. Captura Camada (Aba Camada)
      await page.getByTestId('layer-block').first().click();
      await expect(page.getByTestId('layer-inspector')).toBeVisible();
      await expect(page.getByTestId('inspector-tab-layer')).toHaveAttribute('aria-selected', 'true');
      const layerShot = join(dir, `inspector_layer_${vp.name}.png`);
      await page.screenshot({ path: layerShot, fullPage: false });
      if (existsSync(ARTIFACTS_DIR)) {
        copyFileSync(layerShot, join(ARTIFACTS_DIR, `inspector_layer_${vp.name}.png`));
      }
    }
  });
});
