import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirFerramenta } from './helpers';

let dir = '';
let fRed = '', fBlue = '';

const ARTIFACTS_DIR = 'C:\\Users\\Vinicius\\.gemini\\antigravity\\brain\\627418ca-96cf-4f90-8b23-f30348541dac';

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-tl-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 4);
});

test.describe('Video Studio PR D - Timeline, Barra de Ferramentas, Cabeçalhos e Atalhos', () => {
  test('cabeçalhos de trilha fixos e barra de ferramentas visíveis na timeline', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-layer-1').click();

    // Adiciona texto
    await abrirFerramenta(page, 'texto');
    await page.getByTestId('chat-text').fill('Legenda de Teste');
    await page.getByTestId('chat-add').click();

    // Valida barra de ferramentas acima da régua
    await expect(page.getByTestId('tl-tool-select')).toBeVisible();
    await expect(page.getByTestId('tl-tool-select')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tl-tool-split')).toBeVisible();
    await expect(page.getByTestId('tl-tool-delete')).toBeVisible();
    await expect(page.getByTestId('tl-tool-snap')).toBeVisible();
    await expect(page.getByTestId('zoom')).toBeVisible();
    await expect(page.getByTestId('zoom-fit')).toBeVisible();

    // Valida cabeçalhos fixos de trilhas
    await expect(page.getByTestId('track-v1')).toBeVisible();
    await expect(page.getByTestId('track-v1')).toHaveText('V1 Vídeo');
    await expect(page.getByTestId('track-v2')).toBeVisible();
    await expect(page.getByTestId('track-v2')).toHaveText('V2 Sobrepor');
    await expect(page.getByTestId('track-t')).toBeVisible();
    await expect(page.getByTestId('track-t')).toHaveText('T Texto/Chat');

    // Valida alternância do ímã magnético (snap)
    const snapBtn = page.getByTestId('tl-tool-snap');
    await expect(snapBtn).toHaveAttribute('aria-pressed', 'true');
    await snapBtn.click();
    await expect(snapBtn).toHaveAttribute('aria-pressed', 'false');
    await snapBtn.click();
    await expect(snapBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('atalho de teclado Espaço toca e pausa quando não estiver em campo de entrada', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();

    const playBtn = page.getByTestId('play');
    await expect(playBtn).toHaveText(/Reproduzir/);

    // Clica no corpo fora de inputs e pressiona Espaço
    await page.locator('body').click();
    await page.keyboard.press('Space');
    await expect(playBtn).toHaveText(/Pausar/);

    // Pressiona Espaço novamente para pausar
    await page.keyboard.press('Space');
    await expect(playBtn).toHaveText(/Reproduzir/);
  });

  test('atalho de teclado Espaço NÃO toca nem pausa ao digitar dentro de campo de entrada', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();

    const playBtn = page.getByTestId('play');
    await expect(playBtn).toHaveText(/Reproduzir/);

    // Foca no input de texto
    await abrirFerramenta(page, 'texto');
    const input = page.getByTestId('chat-text');
    await input.click();
    await input.fill('palavra');
    await page.keyboard.press('Space');
    await input.type('outra');

    // Continua pausado (não tocou ao pressionar Espaço dentro do input)
    await expect(playBtn).toHaveText(/Reproduzir/);
    await expect(input).toHaveValue('palavra outra');
  });

  test('atalho C divide o clipe no cursor e Delete remove o clipe selecionado', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await abrirFerramenta(page, 'midia');
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(1);

    // Posiciona cursor em 1s
    await page.getByTestId('playhead-input').fill('1.0');
    await page.getByTestId('playhead-input').blur();

    // Pressiona C no corpo para dividir
    await page.locator('body').click();
    await page.keyboard.press('c');
    await expect(page.getByTestId('clip-block')).toHaveCount(2);

    // Seleciona o primeiro clipe e aperta Delete
    await page.getByTestId('clip-block').first().click();
    await expect(page.getByTestId('inspector')).toBeVisible();

    await page.keyboard.press('Delete');
    await expect(page.getByTestId('clip-block')).toHaveCount(1);
  });

  test('capturas da timeline em 1440x900 e 1280x720 com blocos coloridos e anel de seleção', async ({ page }) => {
    const viewports = [
      { width: 1440, height: 900, name: '1440x900' },
      { width: 1280, height: 720, name: '1280x720' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.getByTestId('tab-video').click();
      await abrirFerramenta(page, 'midia');

      // Prepara timeline com clipe, camada e texto
      await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
      await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

      await page.getByTestId('add-clip-0').click();
      await page.getByTestId('add-layer-1').click();

      await abrirFerramenta(page, 'texto');
      await page.getByTestId('chat-text').fill('Diálogo de Cena');
      await page.getByTestId('chat-add').click();

      // Seleciona clipe para demonstrar anel verde
      await page.getByTestId('clip-block').first().click();
      await expect(page.getByTestId('inspector')).toBeVisible();

      const shotPath = join(dir, `timeline_${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      if (existsSync(ARTIFACTS_DIR)) {
        copyFileSync(shotPath, join(ARTIFACTS_DIR, `timeline_${vp.name}.png`));
      }
    }
  });
});
