import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { abrirFerramenta } from './helpers';

let dir = '';
let fRed = '', fBlue = '';

const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-layout-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'red.mp4'); mk(fRed, 'red', 440, 3);
  fBlue = join(dir, 'blue.mp4'); mk(fBlue, 'blue', 880, 3);
});

async function popularTimeline(page: Page) {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await expect(page.getByTestId('video-studio')).toBeVisible();

  // 1. Importa 2 mídias
  await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

  // 2. Adiciona 2 clipes na Trilha 1 (Vídeo)
  await page.getByTestId('add-clip-0').click();
  await page.getByTestId('add-clip-1').click();
  await expect(page.getByTestId('clip-block')).toHaveCount(2);

  // 3. Adiciona 1 sobreposição na Trilha 2 (Sobreposição)
  await page.getByTestId('add-layer-0').click();
  await expect(page.getByTestId('layer-block')).toHaveCount(1);

  // 4. Adiciona 1 texto na Trilha 3 (Chat)
  await abrirFerramenta(page, 'texto');
  await page.getByTestId('chat-text').fill('Texto de Teste de Layout');
  await page.getByTestId('chat-add').click();
  await expect(page.getByTestId('chat-block')).toHaveCount(1);
}

const VIEWPORTS = [
  { width: 1366, height: 768, label: '1366x768' },
  { width: 1440, height: 900, label: '1440x900' },
  { width: 1920, height: 1080, label: '1920x1080' },
];

test.describe('Video Studio - Verificação de Layout e Responsividade Sem Rolagem', () => {
  for (const vp of VIEWPORTS) {
    test(`layout em ${vp.label}: Avançado e Simples cabem na tela sem rolagem de página`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await popularTimeline(page);

      // --- MODO AVANÇADO ---
      await expect(page.getByTestId('export-open')).toBeVisible();

      // Todas as 3 trilhas visíveis
      await expect(page.getByTestId('clip-block')).toHaveCount(2);
      await expect(page.getByTestId('layer-block')).toHaveCount(1);
      await expect(page.getByTestId('chat-block')).toHaveCount(1);

      // Sem rolagem de página
      const advDims = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(advDims.scrollHeight).toBeLessThanOrEqual(advDims.innerHeight);
      expect(advDims.scrollWidth).toBeLessThanOrEqual(advDims.innerWidth);

      // As 3 colunas estão dentro dos limites horizontais da tela
      const previewBox = await page.getByTestId('video-preview').boundingBox();
      expect(previewBox).not.toBeNull();
      if (previewBox) {
        expect(previewBox.x).toBeGreaterThanOrEqual(0);
        expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(vp.width);
      }

      // Captura de tela Avançado
      await page.screenshot({ path: `layout_advanced_${vp.label}.png` });

      // --- MODO SIMPLES ---
      await page.getByTestId('video-mode-simple').click();
      await expect(page.getByTestId('guided-flow')).toBeVisible();

      // Timeline NÃO pode estar visível no modo simples
      await expect(page.getByTestId('timeline')).not.toBeVisible();
      await expect(page.getByTestId('export-open')).toBeVisible();

      // Sem rolagem de página no modo simples
      const simpleDims = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(simpleDims.scrollHeight).toBeLessThanOrEqual(simpleDims.innerHeight);
      expect(simpleDims.scrollWidth).toBeLessThanOrEqual(simpleDims.innerWidth);

      // Captura de tela Simples
      await page.screenshot({ path: `layout_simple_${vp.label}.png` });
    });
  }

  test('painel de exportação acessível: role dialog, foco inicial, escape fecha e devolve foco', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await popularTimeline(page);

    // Clica em Exportar para abrir o diálogo
    const exportOpenBtn = page.getByTestId('export-open');
    await exportOpenBtn.click();

    // Diálogo aberto com role="dialog" e aria-label="Exportar vídeo" (SEM aria-modal)
    const dialog = page.getByRole('dialog', { name: 'Exportar vídeo' });
    await expect(dialog).toBeVisible();
    expect(await dialog.getAttribute('aria-modal')).toBeNull();

    // Foco inicial colocado no primeiro controle interativo (export-preset)
    await expect(page.getByTestId('export-preset')).toBeFocused();

    // Pressionar Escape fecha o diálogo
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();

    // Ao fechar, o foco retorna para o botão export-open
    await expect(exportOpenBtn).toBeFocused();
  });
});
