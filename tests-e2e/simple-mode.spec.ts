import { test, expect, Page } from '@playwright/test';
import {
  openFresh, setBackground, canvasPixel, settle, readDownload, pngSize, openSection, editorText
} from './helpers';

test.describe('Modo Simples', () => {
  const abrir = (page: Page) => openFresh(page, 'simple');

  test('abre no Modo Simples: 4 passos visíveis e as seções avançadas escondidas', async ({ page }) => {
    await abrir(page);
    await expect(page.getByTestId('simple-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Sua foto/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Cole o chat/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Escolha um visual/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Salvar/ })).toBeVisible();
    await expect(page.getByTestId('advanced-sections')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Simples' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('o chat colado no passo 2 vira o mesmo texto do Modo Avançado', async ({ page }) => {
    await abrir(page);
    await page.getByTestId('simple-chat').fill('Mike Johnson diz (normal): colado do servidor');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Avançado' }).click();
    await expect(editorText(page)).toHaveValue('Mike Johnson diz (normal): colado do servidor');
    await expect(page.getByTestId('advanced-sections')).toBeVisible();
  });

  test('personagens, tons de voz e ações funcionam no passo 2 do Modo Simples', async ({ page }) => {
    await abrir(page);
    const painel = page.getByTestId('simple-panel');
    await painel.getByLabel('Nome do personagem').fill('Rick Santos');
    await painel.getByRole('button', { name: 'Add' }).click();
    await painel.getByRole('button', { name: 'Rick Santos', exact: true }).click();
    const chat = page.getByTestId('simple-chat');
    await expect(chat).toHaveValue(/Rick Santos/);
    await painel.getByRole('button', { name: 'Sussurro' }).click();
    await expect(chat).toHaveValue(/sussurrando/);
    await painel.getByRole('button', { name: '* /me' }).click();
    await expect(chat).toHaveValue(/\* Rick Santos/);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Avançado' }).click();
    await expect(editorText(page)).toHaveValue(/sussurrando/);
  });

  test('colar o chat do servidor cria os personagens sozinho; "Detectar" cobre texto digitado', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await abrir(page);
    const painel = page.getByTestId('simple-panel');
    const chat = page.getByTestId('simple-chat');
    const texto = '[21:04:11] Ana Beatriz diz: Boa noite.\nCarlos Mendes diz (baixo): Psiu.';
    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, texto);
    await chat.focus();
    await page.keyboard.press('Control+v');
    await expect(painel.getByTestId('detect-note')).toContainText('Ana Beatriz');
    await expect(painel.getByRole('button', { name: 'Ana Beatriz', exact: true })).toBeVisible();
    await expect(painel.getByRole('button', { name: 'Carlos Mendes', exact: true })).toBeVisible();
    await chat.fill(texto + '\nLia Souza diz: oi');
    await painel.getByRole('button', { name: 'Detectar personagens' }).click();
    await expect(painel.getByTestId('detect-note')).toContainText('Lia Souza');
    await painel.getByRole('button', { name: 'Detectar personagens' }).click();
    await expect(painel.getByTestId('detect-note')).toContainText('já estão');
  });

  test('um visual liga câmera/luz/retoque de uma vez; "Original" desfaz', async ({ page }) => {
    await abrir(page);
    await setBackground(page, 400, 200, [120, 120, 120]);
    const antes = await canvasPixel(page, 0.9, 0.9);
    const visual = page.getByRole('group', { name: 'Visual' });
    await visual.getByRole('button', { name: /Neon/ }).click();
    await expect(visual.getByRole('button', { name: /Neon/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(300);
    const depois = await canvasPixel(page, 0.25, 0.3);
    expect(depois.join(',')).not.toBe(antes.join(','));
    await page.getByRole('button', { name: 'Avançado' }).click();
    await openSection(page, 'iluminacao');
    await expect(page.locator('section[data-section="iluminacao"]')).toContainText('Cyber Purple');
    await page.getByRole('button', { name: 'Simples' }).click();
    await visual.getByRole('button', { name: /Original/ }).click();
    await page.waitForTimeout(300);
    expect((await canvasPixel(page, 0.9, 0.9)).join(',')).toBe(antes.join(','));
  });

  test('Bodycam e CCTV ativam o preset de câmera correspondente', async ({ page }) => {
    await abrir(page);
    await setBackground(page, 400, 200, [90, 90, 90]);
    const visual = page.getByRole('group', { name: 'Visual' });
    await visual.getByRole('button', { name: /Bodycam/ }).click();
    await page.getByRole('button', { name: 'Avançado' }).click();
    await openSection(page, 'camera');
    const camera = page.getByRole('group', { name: 'Preset de câmera' });
    await expect(camera.getByRole('button', { name: 'Bodycam' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Simples' }).click();
    await visual.getByRole('button', { name: /CCTV/ }).click();
    await page.getByRole('button', { name: 'Avançado' }).click();
    await expect(camera.getByRole('button', { name: 'CCTV' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('o modo escolhido persiste ao recarregar e desfazer reverte o visual', async ({ page }) => {
    await abrir(page);
    await page.getByRole('button', { name: 'Avançado' }).click();
    await settle(page);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Avançado' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Simples' }).click();
    await setBackground(page, 400, 200, [100, 100, 100]);
    const base = await canvasPixel(page, 0.9, 0.9);
    await page.waitForTimeout(900); // o histórico junta edições feitas em menos de 500 ms: separa a foto do visual
    await page.getByRole('group', { name: 'Visual' }).getByRole('button', { name: /Crime urbano/ }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Desfazer/ }).click();
    await page.waitForTimeout(300);
    expect((await canvasPixel(page, 0.9, 0.9)).join(',')).toBe(base.join(','));
  });

  test('baixar imagem e só o chat funcionam pelo painel simples', async ({ page }) => {
    await abrir(page);
    await setBackground(page, 300, 150, [20, 90, 200]);
    await page.getByTestId('simple-chat').fill('Mike Johnson diz (normal): oi');
    await page.waitForTimeout(400);
    const painel = page.getByTestId('simple-panel');
    const [d1] = await Promise.all([page.waitForEvent('download'), painel.getByRole('button', { name: /Baixar imagem/ }).click()]);
    expect(pngSize(await readDownload(d1))).toEqual({ w: 600, h: 300 });
    const [d2] = await Promise.all([page.waitForEvent('download'), painel.getByRole('button', { name: /Só o chat/ }).click()]);
    expect(d2.suggestedFilename()).toContain('haze-chat-transparente');
  });
});
