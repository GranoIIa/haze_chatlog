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
  dir = mkdtempSync(join(tmpdir(), 'haze-ui-rail-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 3);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
});

test.describe('Video Studio PR B - Trilho de Ferramentas e Painel Esquerdo', () => {
  test('trilho vertical exibe as 4 ferramentas funcionais e permite alternância', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-studio')).toBeVisible();

    // Ferramentas reais existem com botões acessíveis
    const tools = ['media', 'text', 'subtitles', 'templates'];
    for (const t of tools) {
      await expect(page.getByTestId(`tool-${t}`)).toBeVisible();
    }

    // Padrão inicial: Mídia está ativa
    await expect(page.getByTestId('tool-media')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('video-library')).toBeVisible();

    // Troca para Texto
    await page.getByTestId('tool-text').click();
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tool-media')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('chat-kind')).toBeVisible();

    // Troca para Legendas
    await page.getByTestId('tool-subtitles').click();
    await expect(page.getByTestId('tool-subtitles')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('srt-input')).toBeAttached();

    // Troca para Modelos
    await page.getByTestId('tool-templates').click();
    await expect(page.getByTestId('tool-templates')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('templates-panel')).toBeVisible();
  });

  test('botão Modelos da barra superior (templates-toggle) seleciona a ferramenta Modelos do painel esquerdo', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    // Começa em mídia
    await expect(page.getByTestId('tool-media')).toHaveAttribute('aria-pressed', 'true');

    // Clica no templates-toggle da barra superior
    await page.getByTestId('templates-toggle').click();

    // Verifica que ativou a ferramenta Modelos no trilho e no painel
    await expect(page.getByTestId('tool-templates')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('templates-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('templates-panel')).toBeVisible();
  });

  test('importar vídeos, trocar de ferramenta e voltar preserva a biblioteca e estado sem desmontar', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();

    // Importa 2 mídias
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

    // Adiciona clipe à timeline
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(1);

    // Alterna para Texto
    await abrirFerramenta(page, 'texto');
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    // video-file-input e video-library continuam montados no DOM (hidden)
    await expect(page.getByTestId('video-file-input')).toBeAttached();
    await expect(page.getByTestId('video-library')).toBeAttached();

    // Alterna para Legendas e Modelos
    await abrirFerramenta(page, 'legendas');
    await expect(page.getByTestId('tool-subtitles')).toHaveAttribute('aria-pressed', 'true');
    await abrirFerramenta(page, 'modelos');
    await expect(page.getByTestId('tool-templates')).toHaveAttribute('aria-pressed', 'true');

    // Retorna para Mídia
    await abrirFerramenta(page, 'midia');
    await expect(page.getByTestId('tool-media')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('video-library')).toBeVisible();
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

    // O clipe na timeline continua exatamente igual
    await expect(page.getByTestId('clip-block')).toHaveCount(1);
  });

  test('ferramenta ativa persiste no localStorage com fallback para Mídia em valor inválido', async ({ page }) => {
    // 1. Define valor inválido no localStorage e navega para a aba de vídeo
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('haze-video-tool-v1', 'ferramenta_invalida_xyz');
    });
    await page.getByTestId('tab-video').click();

    // Deve cair no fallback: Mídia
    await expect(page.getByTestId('tool-media')).toHaveAttribute('aria-pressed', 'true');

    // 2. Clica em Texto e recarrega
    await page.getByTestId('tool-text').click();
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await page.getByTestId('tab-video').click();

    // Deve lembrar que estava em Texto
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('chat-kind')).toBeVisible();
  });

  test('layout flex dinâmico: zero rolagem de página em 1440x900 e 1280x720 com timeline cheia', async ({ page }) => {
    // Teste no viewport 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-layer-1').click();
    await abrirFerramenta(page, 'texto');
    await page.getByTestId('chat-add').click();
    await abrirFerramenta(page, 'midia');

    const metrics900 = await page.evaluate(() => ({
      windowH: window.innerHeight,
      bodyScrollH: document.body.scrollHeight,
      hasPageScroll: document.body.scrollHeight > window.innerHeight
    }));
    expect(metrics900.hasPageScroll).toBe(false);

    // Teste no viewport 1280x720
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(200);
    const metrics720 = await page.evaluate(() => ({
      windowH: window.innerHeight,
      bodyScrollH: document.body.scrollHeight,
      hasPageScroll: document.body.scrollHeight > window.innerHeight
    }));
    expect(metrics720.hasPageScroll).toBe(false);
  });
});
