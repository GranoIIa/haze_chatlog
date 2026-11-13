import { test, expect } from '@playwright/test';

test.describe('Editor RP: Ferramenta de Censura Visual & Anonimização (HAZE-CENSOR-001)', () => {

  test('Ativa ferramenta de censura, aplica tarja sólida no canvas e testa desfazer/refazer', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    const canvas = page.getByTestId('preview-canvas');
    await expect(canvas).toBeVisible();

    // 1. Ativa a ferramenta de censura pelo botão na toolbar
    const censorBtn = page.getByRole('button', { name: /Censurar Imagem/i });
    await expect(censorBtn).toBeVisible();
    await censorBtn.click();

    // Verifica que o painel contextual da ferramenta de censura apareceu
    await expect(page.getByRole('button', { name: '🛡️ Tarja Preta' })).toBeVisible();
    await expect(page.getByText('Topo (Composição Final)')).toBeVisible();

    // 2. Simula desenho de uma região com mouse/pointer no canvas
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + 100;
    const startY = box.y + 100;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 40, { steps: 5 });
    await page.mouse.up();

    // 3. Verifica que a região foi registrada (o contador exibe "1 região")
    const censorCount = page.getByTestId('censor-count');
    await expect(censorCount).toBeVisible();
    await expect(censorCount).toHaveText('1 região');

    // 4. Testa botão "Desfazer"
    const undoBtn = page.getByTestId('censor-undo-btn');
    await expect(undoBtn).toBeVisible();
    await undoBtn.click();

    // 5. Verifica que a região foi desfeita (o contador exibe "0 regiões")
    await expect(censorCount).toHaveText('0 regiões');

    // 6. Desenha outra região com formato retângulo
    const rectShapeBtn = page.getByRole('button', { name: /Retângulo/i });
    await rectShapeBtn.click();

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 120, startY + 60, { steps: 5 });
    await page.mouse.up();

    await expect(censorCount).toHaveText('1 região');

    // 7. Testa atalho de teclado Ctrl+Z para desfazer
    await page.keyboard.press('Control+z');
    await expect(censorCount).toHaveText('0 regiões');

    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('status of 404'));
    expect(fatalErrors).toHaveLength(0);
  });

});
