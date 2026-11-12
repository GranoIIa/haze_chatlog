import { test, expect, Page } from '@playwright/test';
import { openFresh, setBackground, readDownload, solidPng, file, settle, canvasSize } from './helpers';

/** HAZE-UX-002: detecção com revisão, miniaturas versionadas/cacheadas, fidelidade miniatura × preview × PNG. */

const painel = (page: Page) => page.getByTestId('simple-panel');
const thumbs = (page: Page) => page.locator('[data-testid^="visual-thumb-"]');
const stats = (page: Page) => page.evaluate(() => (window as any).__hazeThumbStats as { generations: number; cacheHits: number; lastMs: number; lastFailed: number });
const esperarMiniaturas = (page: Page) => expect(thumbs(page)).toHaveCount(8, { timeout: 20_000 });

/** Cor média (RGB) de uma imagem dada como data URL / blob URL / base64 PNG, calculada no navegador. */
const meanOf = (page: Page, src: { url?: string; b64?: string }) =>
  page.evaluate(async ({ url, b64 }) => {
    const blob = b64 ? new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'image/png' }) : await (await fetch(url!)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas'); c.width = 64; c.height = 36;
    const ctx = c.getContext('2d')!; ctx.drawImage(bmp, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let r = 0, g = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [r / n, g / n, b / n];
  }, src);

const previewMean = (page: Page) =>
  page.getByTestId('preview-canvas').evaluate((cv: HTMLCanvasElement) => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 36;
    const ctx = c.getContext('2d')!; ctx.drawImage(cv, 0, 0, 64, 36);
    const d = ctx.getImageData(0, 0, 64, 36).data;
    let r = 0, g = 0, b = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [r / n, g / n, b / n];
  });

const perto = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test.describe('Detecção de personagens com revisão', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page, 'simple'); });

  test('inequívocos entram sozinhos; ambíguos vão para revisão e podem ser corrigidos, ignorados ou adicionados', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const texto = ['Ana Beatriz diz: Boa noite.', '[Rádio] Unidade 12 diz (rádio): Recebido.', 'desconhecido grita: Parado!', 'Sistema diz: reiniciando'].join('\n');
    await page.evaluate(async (t) => { await navigator.clipboard.writeText(t); }, texto);
    const chat = page.getByTestId('simple-chat');
    await chat.focus();
    await page.keyboard.press('Control+v');

    const p = painel(page);
    await expect(p.getByRole('button', { name: 'Ana Beatriz', exact: true })).toBeVisible();           // automático
    const revisao = p.getByTestId('detect-review');
    await expect(revisao).toBeVisible();                                                                  // ambíguos pedem confirmação
    await expect(revisao.getByRole('textbox')).toHaveCount(2);                                            // "Unidade 12" e "desconhecido"
    await expect(p.getByRole('button', { name: 'Sistema', exact: true })).toHaveCount(0);                 // sistema nunca vira personagem
    await expect(p.getByRole('button', { name: 'Unidade 12', exact: true })).toHaveCount(0);              // ainda não confirmado

    await revisao.getByLabel('Nome para “Unidade 12”').fill('Unidade Doze');                              // corrige o nome
    await revisao.getByRole('button', { name: 'Adicionar Unidade Doze' }).click();
    await expect(p.getByRole('button', { name: 'Unidade Doze', exact: true })).toBeVisible();

    await revisao.getByRole('button', { name: 'Ignorar desconhecido' }).click();                          // ignora
    await expect(revisao).toHaveCount(0);
    await expect(p.getByRole('button', { name: /^desconhecido$/i })).toHaveCount(0);

    // colar de novo não pergunta outra vez pelo que foi ignorado nem duplica o que já existe
    await chat.focus();
    await page.keyboard.press('Control+v');
    await expect(p.getByTestId('detect-note')).toContainText('já estão');
    await expect(p.getByTestId('detect-review')).toHaveCount(0);
  });

  test('"Desfazer detecção" remove só os personagens que a detecção criou', async ({ page }) => {
    const p = painel(page);
    await page.getByTestId('simple-chat').fill('Ana Beatriz diz: oi\nCarlos Mendes diz: e aí');
    await p.getByRole('button', { name: 'Detectar personagens' }).click();
    await expect(p.getByRole('button', { name: 'Carlos Mendes', exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Desfazer detecção' }).click();
    await expect(p.getByRole('button', { name: 'Carlos Mendes', exact: true })).toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Ana Beatriz', exact: true })).toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Mike Johnson', exact: true })).toBeVisible(); // os que já existiam ficam
    // e os removidos não voltam sozinhos na próxima detecção automática? (voltam só se o usuário pedir de novo)
    await expect(p.getByTestId('detect-note')).toContainText('removidos');
  });

  test('o formato do chat é opcional, persiste e restringe o que é reconhecido', async ({ page }) => {
    const p = painel(page);
    await p.getByText(/Formato do chat:/).click();
    await p.getByLabel('Formato do chat', { exact: true }).selectOption('gtaw-en');
    await page.getByTestId('simple-chat').fill('Ana Beatriz diz: oi\nJohn Doe says: hi');
    await p.getByRole('button', { name: 'Detectar personagens' }).click();
    await expect(p.getByRole('button', { name: 'John Doe', exact: true })).toBeVisible();
    await expect(p.getByRole('button', { name: 'Ana Beatriz', exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();
    await expect(page.getByText('Formato do chat: GTA World EN')).toBeVisible();
  });
});

test.describe('Miniaturas dos visuais', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page, 'simple'); });

  test('trocar a foto rapidamente nunca deixa miniaturas da foto anterior', async ({ page }) => {
    await page.getByTestId('bg-input').setInputFiles(file('a.png', solidPng(400, 225, [220, 30, 30])));
    await page.getByTestId('bg-input').setInputFiles(file('b.png', solidPng(400, 225, [30, 30, 220])));
    await expect.poll(async () => (await canvasSize(page)).w).toBe(400);
    await esperarMiniaturas(page);
    const url = await page.getByTestId('visual-thumb-original').getAttribute('src');
    const [r, , b] = await meanOf(page, { url: url! });
    expect(b).toBeGreaterThan(r + 100); // é da foto azul (a última), não da vermelha

    // trocar de novo: depois que a nova foto termina, todas as 8 são da nova foto
    await page.getByTestId('bg-input').setInputFiles(file('c.png', solidPng(400, 225, [30, 200, 30])));
    await expect.poll(async () => {
      const u = await page.getByTestId('visual-thumb-original').getAttribute('src').catch(() => null);
      if (!u) return 'sem';
      const [r2, g2] = await meanOf(page, { url: u });
      return g2 > r2 + 100 ? 'verde' : 'antiga';
    }, { timeout: 20_000 }).toBe('verde');
  });

  test('só o texto do chat mudar não regenera; alternar Simples ↔ Avançado reaproveita o cache', async ({ page }) => {
    await setBackground(page, 480, 270, [90, 120, 150]);
    await esperarMiniaturas(page);
    await expect.poll(async () => (await stats(page)).generations).toBe(1);

    await page.getByTestId('simple-chat').fill('Mike Johnson diz: digitando um texto novo');
    await page.waitForTimeout(600);
    expect((await stats(page)).generations).toBe(1);

    await page.getByRole('button', { name: 'Avançado' }).click();
    await page.getByRole('button', { name: 'Simples' }).click();
    await esperarMiniaturas(page);
    const s = await stats(page);
    expect(s.generations).toBe(1);
    expect(s.cacheHits).toBeGreaterThanOrEqual(1);
    expect(s.lastFailed).toBe(0);
  });

  test('sem foto não há miniaturas; remover a foto as retira; foto nova gera de novo', async ({ page }) => {
    await expect(thumbs(page)).toHaveCount(0);
    await setBackground(page, 480, 270, [90, 120, 150]);
    await esperarMiniaturas(page);
    await page.getByRole('button', { name: 'Avançado' }).click();
    await page.getByRole('button', { name: 'Remover foto de fundo' }).click();
    await page.getByRole('button', { name: 'Simples' }).click();
    await expect(thumbs(page)).toHaveCount(0);
    await setBackground(page, 640, 360, [150, 90, 90], 'outra.png');
    await esperarMiniaturas(page);
    expect((await stats(page)).generations).toBe(2);
  });

  test('a miniatura segue a proporção do quadro de saída (retrato)', async ({ page }) => {
    await setBackground(page, 360, 640, [90, 120, 150], 'retrato.png');
    await esperarMiniaturas(page);
    const { w, h } = await page.getByTestId('visual-thumb-crime').evaluate((i: HTMLImageElement) => ({ w: i.naturalWidth, h: i.naturalHeight }));
    expect(h).toBeGreaterThan(w); // retrato continua retrato (não vira 16:9)
  });

  test('o visual ativo é derivado do estado: aparece ao editar no Avançado e some se for personalizado', async ({ page }) => {
    await setBackground(page, 480, 270, [90, 120, 150]);
    const grupo = page.getByRole('group', { name: 'Visual' });
    await expect(grupo.getByRole('button', { name: /^Original/ })).toHaveAttribute('aria-pressed', 'true');
    await grupo.getByRole('button', { name: /Crime urbano/ }).click();
    await expect(grupo.getByRole('button', { name: /Crime urbano/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(painel(page).getByTestId('export-info')).toContainText('Crime urbano');
    await page.getByTestId('simple-chat').fill('');
    await expect(painel(page).getByTestId('simple-progress')).toContainText('Falta: o chat');
  });
});

test.describe('Fidelidade: miniatura × preview × PNG exportado', () => {
  for (const [visual, rotulo] of [['crime', /Crime urbano/], ['sunset', /Pôr do sol/], ['vintage', /Anos 90/]] as const) {
    test(`visual "${visual}": cor média da miniatura ≈ preview ≈ PNG`, async ({ page }) => {
      await openFresh(page, 'simple');
      await setBackground(page, 480, 270, [110, 140, 170]);
      await page.getByTestId('simple-chat').fill(''); // sem texto: compara só a foto tratada (o chat não faz parte do visual)
      await esperarMiniaturas(page);
      const thumbUrl = await page.getByTestId(`visual-thumb-${visual}`).getAttribute('src');
      await page.getByRole('group', { name: 'Visual' }).getByRole('button', { name: rotulo }).click();
      await settle(page, 500);

      const t = await meanOf(page, { url: thumbUrl! });
      const pv = await previewMean(page);
      const [download] = await Promise.all([page.waitForEvent('download'), painel(page).getByRole('button', { name: /Baixar imagem/ }).click()]);
      const png = (await readDownload(download)).toString('base64');
      const ex = await meanOf(page, { b64: png });

      // tolerâncias: miniatura é JPEG 70% reduzido (≤ 8 por canal); preview e PNG usam o mesmo desenho (≤ 4)
      expect(perto(t, pv, 8), `miniatura ${t.map(Math.round)} × preview ${pv.map(Math.round)}`).toBe(true);
      expect(perto(pv, ex, 4), `preview ${pv.map(Math.round)} × PNG ${ex.map(Math.round)}`).toBe(true);
      // e o visual de fato altera a imagem em relação ao original
      const orig = await meanOf(page, { url: await page.getByTestId('visual-thumb-original').getAttribute('src') ?? '' });
      expect(perto(t, orig, 3)).toBe(false);
    });
  }
});

test.describe('Modo Simples ↔ Avançado, desfazer e projeto .haze', () => {
  test('desfazer volta o visual e o visual ativo acompanha', async ({ page }) => {
    await openFresh(page, 'simple');
    await setBackground(page, 400, 200, [100, 100, 100]);
    await page.waitForTimeout(900);
    const grupo = page.getByRole('group', { name: 'Visual' });
    await grupo.getByRole('button', { name: /Neon/ }).click();
    await expect(grupo.getByRole('button', { name: /Neon/ })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Desfazer/ }).click();
    await expect(grupo.getByRole('button', { name: /^Original/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('reabrir um projeto restaura foto, miniaturas e o visual ativo', async ({ page }) => {
    await openFresh(page, 'simple');
    await setBackground(page, 640, 360, [60, 90, 140], 'cena.png');
    await esperarMiniaturas(page);
    await page.getByRole('group', { name: 'Visual' }).getByRole('button', { name: /Anos 90/ }).click();
    await page.getByTestId('simple-chat').fill('Ana Beatriz diz: salvo no projeto');
    await settle(page, 1000);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Salvar projeto/ }).click()]);
    const caminho = await download.path();

    await openFresh(page, 'simple');
    await expect(thumbs(page)).toHaveCount(0);
    page.once('dialog', d => d.accept());
    await page.getByTestId('project-input').setInputFiles(caminho);
    await expect(page.getByRole('status').filter({ hasText: 'Projeto aberto' })).toBeVisible();
    await esperarMiniaturas(page);
    await expect(page.getByRole('group', { name: 'Visual' }).getByRole('button', { name: /Anos 90/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('simple-chat')).toHaveValue('Ana Beatriz diz: salvo no projeto');
  });
});
