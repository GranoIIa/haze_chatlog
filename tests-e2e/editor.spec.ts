import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  openFresh, setBackground, addImageLayer, layerCount, canvasSize, canvasPixel,
  undo, redo, settle, readDownload, pngSize, openSection, sectionButtons, editorText
} from './helpers';

test.describe('Editor RP', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  test('abre com as 2 abas e o logo da Haze carregado', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Editor RP/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Video to GIF Lab/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Canvas Studio/ })).toHaveCount(0);

    const logo = page.getByRole('img', { name: 'Haze' }).first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  });

  test('a foto de fundo ajusta o canvas e desfazer/refazer troca de foto', async ({ page }) => {
    expect(await canvasSize(page)).toEqual({ w: 1280, h: 720 });

    await setBackground(page, 800, 400, [50, 80, 120], 'um.png');
    await settle(page, 800);
    await setBackground(page, 600, 600, [120, 80, 50], 'dois.png');
    await settle(page, 800);

    await undo(page);
    await expect.poll(() => canvasSize(page)).toEqual({ w: 800, h: 400 });
    await undo(page);
    await expect.poll(() => canvasSize(page)).toEqual({ w: 1280, h: 720 });
    await redo(page);
    await expect.poll(() => canvasSize(page)).toEqual({ w: 800, h: 400 });
    await redo(page);
    await expect.poll(() => canvasSize(page)).toEqual({ w: 600, h: 600 });
  });

  test('remover a foto de fundo e desfazer a devolve', async ({ page }) => {
    await setBackground(page, 700, 350, [10, 90, 10]);
    await settle(page, 800);
    await page.getByRole('button', { name: 'Remover foto de fundo' }).click();
    await expect.poll(() => canvasSize(page)).toEqual({ w: 1280, h: 720 });
    await settle(page, 800);
    await undo(page);
    await expect.poll(() => canvasSize(page)).toEqual({ w: 700, h: 350 });
  });

  test('camada de imagem: adicionar, mover, remover e desfazer tudo', async ({ page }) => {
    await openSection(page, 'camadas');
    await addImageLayer(page, 'selo.png', [255, 0, 0]);
    await settle(page, 800);

    const x = page.getByLabel('Posição X', { exact: true });
    await x.fill('80');
    await settle(page, 800);
    await expect(x).toHaveValue('80');

    await page.getByRole('button', { name: /^Remover selo/ }).click();
    await expect.poll(() => layerCount(page)).toBe(0);
    await settle(page, 800);

    await undo(page); // volta a camada removida
    await expect.poll(() => layerCount(page)).toBe(1);
    await undo(page); // desfaz o movimento
    await page.locator('ul[aria-label^="Lista de camadas"] li button[aria-pressed]').first().click();
    await expect(page.getByLabel('Posição X', { exact: true })).toHaveValue('50');
    await undo(page); // desfaz a adição
    await expect.poll(() => layerCount(page)).toBe(0);
    await redo(page);
    await expect.poll(() => layerCount(page)).toBe(1);
  });

  test('recarregar a página mantém foto, camadas e texto', async ({ page }) => {
    await setBackground(page, 640, 360, [30, 30, 90]);
    await addImageLayer(page, 'logo.png', [0, 255, 0]);
    await editorText(page).fill('Mike Johnson diz (normal): TEXTO E2E');
    await settle(page, 1500);

    await page.reload();
    await expect.poll(() => canvasSize(page)).toEqual({ w: 640, h: 360 });
    await expect.poll(() => layerCount(page)).toBe(1);
    await expect(editorText(page)).toHaveValue('Mike Johnson diz (normal): TEXTO E2E');

    // depois de restaurar, desfazer não pode apagar o que voltou
    await expect(page.getByRole('button', { name: /Desfazer/ })).toBeDisabled();
  });

  test('exportar PNG baixa uma imagem com o dobro do tamanho do canvas', async ({ page }) => {
    await setBackground(page, 640, 360, [200, 50, 50]);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Exportar 2×/ }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(pngSize(await readDownload(download))).toEqual({ w: 1280, h: 720 });
  });

  test('copiar imagem coloca um PNG na área de transferência', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setBackground(page, 400, 300, [10, 10, 200]);
    await page.getByRole('button', { name: /Copiar imagem/ }).click();
    await expect(page.getByRole('status')).toContainText('Imagem copiada');

    const types = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap(i => i.types);
    });
    expect(types).toContain('image/png');
  });

  test('atalhos: F alterna o modo foco e 1-4 trocam a ferramenta do mouse', async ({ page }) => {
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: /Mostrar controles/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: /Modo foco/ })).toBeVisible();

    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'Enquadrar foto' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('3');
    await expect(page.getByRole('button', { name: 'Mover camada' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('1');
    await expect(page.getByRole('button', { name: 'Texto chat' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('tom de voz e marcadores inserem no editor com o personagem ativo', async ({ page }) => {
    const ta = editorText(page);
    await ta.fill('');
    await page.getByRole('button', { name: 'Sussurro', exact: true }).click();
    await expect(ta).toHaveValue('Mike Johnson diz (sussurrando): ');
    await page.getByRole('button', { name: 'Sarah Miller' }).first().click(); // ativa a Sarah e insere a fala
    await page.getByRole('button', { name: 'Grito', exact: true }).click();
    await expect(ta).toHaveValue(/Sarah Miller diz \(gritando\): $/);
  });

  test('elementos de RP: preset e adesivo desenham no canvas e Delete remove o selecionado', async ({ page }) => {
    const shot = () => page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL().length);
    const base = await shot();
    await openSection(page, 'rp');
    await openSection(page, 'adesivos');

    await page.getByRole('button', { name: /Weazel News/ }).click();
    await expect.poll(shot).not.toBe(base);

    await page.getByRole('button', { name: /Tarja de Censura/ }).click();
    await expect(page.locator('section[data-section="inspetor"] > h3 > button')).toContainText('2 elementos');

    await page.getByRole('button', { name: 'Mover camada' }).click();
    await page.getByTestId('preview-canvas').focus();
    await page.keyboard.press('Delete');
    await expect(page.locator('section[data-section="inspetor"] > h3 > button')).toContainText('1 elemento');
  });

  test('arrastar no preview move o chat; luz muda a imagem', async ({ page }) => {
    const canvas = page.getByTestId('preview-canvas');
    const box = (await canvas.boundingBox())!;
    const before = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().length);

    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.12);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await settle(page, 700);
    expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL().length)).not.toBe(before);

    // iluminação: liga o preset e o canto próximo da luz muda de cor
    await openSection(page, 'iluminacao');
    const antes = await canvasPixel(page, 0.75, 0.25);
    await page.getByLabel('Ativar iluminação').check();
    await page.getByRole('button', { name: 'Cyber Purple' }).click();
    await expect.poll(() => canvasPixel(page, 0.75, 0.25)).not.toEqual(antes);
  });
});

test.describe('Painel do Editor RP: estrutura', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  test('as seções aparecem na ordem do fluxo de trabalho', async ({ page }) => {
    const ids = await sectionButtons(page).evaluateAll(
      (bs: Element[]) => bs.map(b => b.getAttribute('aria-controls')!.replace('sec-', ''))
    );
    expect(ids).toEqual([
      'fundo', 'resolucao', 'personagens', 'dialogos', 'camera', 'retoque',
      'rp', 'adesivos', 'tipografia', 'iluminacao', 'camadas', 'inspetor'
    ]);
    // padrão: só o essencial aberto
    for (const id of ['fundo', 'personagens', 'dialogos']) {
      await expect(page.locator(`section[data-section="${id}"] > h3 > button`)).toHaveAttribute('aria-expanded', 'true');
    }
    await expect(page.locator('section[data-section="iluminacao"] > h3 > button')).toHaveAttribute('aria-expanded', 'false');
  });

  test('expandir/recolher tudo e o estado das seções é lembrado ao recarregar', async ({ page }) => {
    await page.getByRole('button', { name: 'Expandir tudo' }).click();
    await expect(sectionButtons(page).and(page.locator('[aria-expanded="true"]'))).toHaveCount(12);
    await page.getByRole('button', { name: 'Recolher tudo' }).click();
    await expect(sectionButtons(page).and(page.locator('[aria-expanded="true"]'))).toHaveCount(0);

    await openSection(page, 'iluminacao');
    await page.reload();
    await expect(page.locator('section[data-section="iluminacao"] > h3 > button')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('section[data-section="fundo"] > h3 > button')).toHaveAttribute('aria-expanded', 'false');
  });

  test('"Mover foto na resolução" foi removido; a foto se move arrastando no preview', async ({ page }) => {
    await openSection(page, 'resolucao');
    await expect(page.getByText('Mover foto na resolução')).toHaveCount(0);
    await expect(page.getByLabel('Pan X (horizontal)')).toHaveCount(0);
    await expect(page.getByLabel('Zoom da foto')).toHaveCount(0);

    await setBackground(page, 800, 400, [90, 90, 160]);
    // numa resolução 1:1 a foto larga (Cover) tem folga na horizontal para ser movida
    await page.getByRole('button', { name: '1:1 Square' }).click();
    await page.getByRole('button', { name: 'Enquadrar foto' }).click();
    const canvas = page.getByTestId('preview-canvas');
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.56, { steps: 8 });
    await page.mouse.up();
    await settle(page, 700);

    const lerCena = async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: /Salvar projeto/ }).click()
      ]);
      const zip = await JSZip.loadAsync(await readDownload(download));
      return JSON.parse(await zip.file('manifest.json')!.async('string')).scene;
    };

    // o deslocamento foi guardado na cena (vai no arquivo de projeto)
    const cena = await lerCena();
    expect(cena.panX).toBeGreaterThan(5);
    expect(cena.panY).toBe(0); // sem folga na vertical: a foto não foge do quadro

    // e há como centralizar de novo sem sliders
    await page.getByTestId('framing-readout').getByRole('button', { name: 'Centralizar foto' }).click();
    await settle(page, 700);
    const centrada = await lerCena();
    expect(centrada.panX).toBe(0);
    expect(centrada.panY).toBe(0);
  });
});

test.describe('Adesivos e marcadores: mover com o mouse', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  /** Posição (x, y) do elemento selecionado, lida do arquivo de projeto salvo. */
  const posicaoDosElementos = async (page: import('@playwright/test').Page) => {
    await settle(page, 700);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Salvar projeto/ }).click()
    ]);
    const zip = await JSZip.loadAsync(await readDownload(download));
    const m = JSON.parse(await zip.file('manifest.json')!.async('string'));
    return { layers: m.scene.canvasLayers as Array<{ x: number; y: number; width: number; height: number }>, chat: m.scene.chatPos as { x: number; y: number } };
  };

  test('com a ferramenta padrão, arrastar um adesivo o move (sem trocar de ferramenta)', async ({ page }) => {
    await openSection(page, 'adesivos');
    await page.getByRole('button', { name: /Tarja de Censura/ }).click();

    const antes = await posicaoDosElementos(page);
    expect(antes.layers).toHaveLength(1);

    const canvas = page.getByTestId('preview-canvas');
    const box = (await canvas.boundingBox())!;
    // o adesivo nasce no centro do canvas
    const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width * 0.15, cy + box.height * 0.2, { steps: 8 });
    await page.mouse.up();

    const depois = await posicaoDosElementos(page);
    expect(depois.layers[0].x).toBeGreaterThan(antes.layers[0].x + 50);
    expect(depois.layers[0].y).toBeGreaterThan(antes.layers[0].y + 50);
    // o chat não saiu do lugar
    expect(depois.chat).toEqual(antes.chat);
  });

  test('clicar fora do adesivo continua movendo o chat, e Alt move o chat por cima do adesivo', async ({ page }) => {
    await openSection(page, 'adesivos');
    await page.getByRole('button', { name: /Tarja de Censura/ }).click();
    const base = await posicaoDosElementos(page);

    const canvas = page.getByTestId('preview-canvas');
    const box = (await canvas.boundingBox())!;

    // fora do adesivo (canto superior): move o chat
    await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.25, { steps: 6 });
    await page.mouse.up();
    const aposChat = await posicaoDosElementos(page);
    expect(aposChat.chat.x).toBeGreaterThan(base.chat.x + 20);
    expect(aposChat.layers[0]).toEqual(base.layers[0]);

    // Alt por cima do adesivo: move o chat, não o adesivo
    await page.keyboard.down('Alt');
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up('Alt');
    const aposAlt = await posicaoDosElementos(page);
    expect(aposAlt.layers[0]).toEqual(base.layers[0]);
    expect(aposAlt.chat.x).not.toBe(aposChat.chat.x);
  });

  test('o adesivo selecionado ganha alças para redimensionar', async ({ page }) => {
    await openSection(page, 'adesivos');
    await page.getByRole('button', { name: /Tarja de Censura/ }).click();
    const antes = await posicaoDosElementos(page);
    const l = antes.layers[0];

    const canvas = page.getByTestId('preview-canvas');
    const box = (await canvas.boundingBox())!;
    const dims = await canvas.evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
    const sx = box.width / dims.w, sy = box.height / dims.h;
    // canto inferior direito do adesivo
    const hx = box.x + (l.x + l.width) * sx, hy = box.y + (l.y + l.height) * sy;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 60 * sx, hy + 30 * sy, { steps: 6 });
    await page.mouse.up();

    const depois = await posicaoDosElementos(page);
    expect(depois.layers[0].width).toBeGreaterThan(l.width + 30);
    expect(depois.layers[0].x).toBe(l.x); // a âncora do canto oposto não se move
  });
});

test.describe('Tema: legibilidade dos botões principais', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  /** Contraste WCAG entre cor do texto e cor de fundo realmente aplicadas (rgb/rgba sólidos). */
  const contrasteReal = (el: import('@playwright/test').Locator) => el.evaluate((node: HTMLElement) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    // fundo translúcido (ex.: estado ativo em tinta) é composto sobre a cor do painel (#171A21)
    const solid = (c: string) => {
      const n = (c.match(/[\d.]+/g) || []).map(Number);
      const a = n.length > 3 ? n[3] : 1;
      const base = [23, 26, 33];
      return [0, 1, 2].map(i => Math.round(n[i] * a + base[i] * (1 - a)));
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const cs = getComputedStyle(node);
    const [a, b] = [lum(parse(cs.color)), lum(solid(cs.backgroundColor))].sort((x, y) => y - x);
    return { ratio: (a + 0.05) / (b + 0.05), color: cs.color, bg: cs.backgroundColor };
  });

  test('aba ativa, ferramenta ativa e botão Exportar têm texto legível (≥ 4,5:1)', async ({ page }) => {
    const alvos = {
      'aba Editor RP': page.getByRole('button', { name: /Editor RP/ }),
      'ferramenta ativa': page.getByRole('button', { name: 'Texto chat' }),
      'Exportar': page.getByRole('button', { name: /Exportar 2×/ }),
      'Lote ativo': page.getByRole('tab', { name: 'Foto individual' })
    };
    for (const [nome, el] of Object.entries(alvos)) {
      const r = await contrasteReal(el);
      expect(r.ratio, `${nome}: texto ${r.color} sobre ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('os botões de preenchimento sólido usam o verde escuro (não o claro)', async ({ page }) => {
    const bg = await page.getByRole('button', { name: /Exportar 2×/ }).evaluate((n: HTMLElement) => getComputedStyle(n).backgroundColor);
    expect(bg).toBe('rgb(16, 185, 129)'); // #10B981
  });
});

test.describe('Presets de RP: alinhamento', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  test('Weazel News: o selo "AO VIVO" aparece inteiro acima da tarja (mesmo com o chat na cena)', async ({ page }) => {
    await openSection(page, 'rp');
    await page.getByRole('button', { name: /Weazel News/ }).click();
    const r = await page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => {
      const w = c.width, h = c.height;
      const bannerH = Math.round(h * 0.18);
      const startY = h - bannerH - Math.round(h * 0.04);
      const badgeH = Math.round(bannerH * 0.28);
      const x0 = Math.round(w * 0.05), x1 = Math.round(w * 0.27);
      const d = c.getContext('2d')!.getImageData(x0, startY - badgeH, x1 - x0, badgeH).data;
      let branco = 0, vermelho = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) branco++;
        else if (d[i] > 180 && d[i + 1] < 70 && d[i + 2] < 70) vermelho++;
      }
      // as linhas do texto devem estar no meio do selo (não cortadas na borda inferior)
      const baixo = c.getContext('2d')!.getImageData(x0, startY - 2, x1 - x0, 2).data;
      let brancoNaBorda = 0;
      for (let i = 0; i < baixo.length; i += 4) if (baixo[i] > 235 && baixo[i + 1] > 235 && baixo[i + 2] > 235) brancoNaBorda++;
      return { branco, vermelho, brancoNaBorda, area: (x1 - x0) * badgeH };
    });
    expect(r.vermelho).toBeGreaterThan(r.area * 0.5);          // o selo vermelho está lá
    expect(r.branco).toBeGreaterThan(40);                      // e o texto branco "AO VIVO" também
    expect(r.brancoNaBorda).toBeLessThan(5);                   // sem texto cortado na borda da tarja
  });
});

test.describe('Adaptação da foto (Cover / Contain / Desfoque / Esticar)', () => {
  const preparar = async (page: import('@playwright/test').Page) => {
    await openFresh(page);
    await setBackground(page, 400, 200, [200, 60, 60]); // foto larga, vermelha
    await openSection(page, 'resolucao');
  };
  const quadrado = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '1:1 Square' }).click();
  const modo = (page: import('@playwright/test').Page, nome: string) =>
    page.getByTestId('fit-modes').getByRole('button', { name: nome, exact: true });
  const alphaCantos = (page: import('@playwright/test').Page) => page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => {
    const cx = c.getContext('2d')!;
    return [[1, 1], [c.width - 2, 1], [1, c.height - 2], [c.width - 2, c.height - 2]].map(([x, y]) => cx.getImageData(x, y, 1, 1).data[3]);
  });

  test('com a resolução "Original" os modos ficam desativados e explicam por quê', async ({ page }) => {
    await preparar(page);
    await expect(modo(page, 'Cover')).toBeDisabled();
    await expect(page.getByTestId('fit-modes')).toContainText('não há o que adaptar');
    await quadrado(page);
    await expect(modo(page, 'Cover')).toBeEnabled();
    await expect(modo(page, 'Contain + desfoque')).toBeEnabled();
  });

  test('cover preenche, contain faz faixas pretas e desfoque usa a própria foto', async ({ page }) => {
    await preparar(page);
    await quadrado(page);

    await modo(page, 'Cover').click();
    expect((await canvasPixel(page, 0.5, 0.02))[0]).toBeGreaterThan(150); // foto até a borda

    await modo(page, 'Contain').click();
    expect((await canvasPixel(page, 0.5, 0.02)).every(v => v < 8)).toBe(true); // faixa preta
    expect((await canvasPixel(page, 0.5, 0.5))[0]).toBeGreaterThan(150);

    await modo(page, 'Contain + desfoque').click();
    const faixa = await canvasPixel(page, 0.5, 0.02);
    expect(faixa[0]).toBeGreaterThan(60);        // avermelhada, não preta
    expect(faixa[0]).toBeGreaterThan(faixa[2] + 30);
    expect((await canvasPixel(page, 0.5, 0.5))[0]).toBeGreaterThan(150);
  });

  test('arrastar a foto nunca deixa buracos transparentes nem a faz fugir do quadro', async ({ page }) => {
    await preparar(page);
    await quadrado(page);
    await modo(page, 'Cover').click();
    await page.keyboard.press('2'); // ferramenta "Enquadrar foto"
    const cv = page.getByTestId('preview-canvas');
    const box = (await cv.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 600, box.y + box.height / 2 - 400, { steps: 8 });
    await page.mouse.up();
    expect(await alphaCantos(page)).toEqual([255, 255, 255, 255]);
    // volta ao centro pelo botão
    await page.getByTestId('framing-readout').getByRole('button', { name: 'Centralizar foto' }).click();
    await expect(page.getByTestId('framing-readout')).toContainText('100%');
  });

  test('zoom menor que 100% em Cover não deixa o fundo transparente', async ({ page }) => {
    await preparar(page);
    await quadrado(page);
    await modo(page, 'Cover').click();
    await page.keyboard.press('2');
    const box = (await page.getByTestId('preview-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 200);
    await expect(page.getByTestId('framing-readout')).not.toContainText('100%');
    expect(await alphaCantos(page)).toEqual([255, 255, 255, 255]);
  });

  test('trocar o modo volta o enquadramento ao padrão e o modo persiste ao recarregar', async ({ page }) => {
    await preparar(page);
    await quadrado(page);
    await modo(page, 'Contain + desfoque').click();
    await settle(page);
    await page.reload();
    await openSection(page, 'resolucao');
    await expect(modo(page, 'Contain + desfoque')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Exportar só o chat (PNG transparente)', () => {
  test('o PNG tem fundo transparente, o tamanho da cena em 2× e nenhum pixel da foto', async ({ page }) => {
    await openFresh(page);
    await setBackground(page, 600, 300, [220, 30, 30]); // foto vermelha
    await editorText(page).fill('Mike Johnson diz (normal): texto para o Photopea');
    await page.waitForTimeout(400);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Só o chat (PNG)' }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/^haze-chat-transparente-\d+\.png$/);
    const png = await readDownload(download);
    expect(pngSize(png)).toEqual({ w: 1200, h: 600 });
    const r = await page.evaluate(async (b64) => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d')!; x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0, opaque = 0, red = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) transparent++; else if (d[i + 3] > 200) opaque++;
        if (d[i + 3] > 200 && d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) red++;
      }
      return { transparent, opaque, red, total: d.length / 4, corner: d[3], bottom: d[d.length - 1] };
    }, png.toString('base64'));
    expect(r.corner).toBe(0);
    expect(r.bottom).toBe(0);
    expect(r.transparent).toBeGreaterThan(r.total * 0.5); // a maior parte é transparente
    expect(r.opaque).toBeGreaterThan(500);                // o texto está lá
    expect(r.red).toBe(0);                                // a foto não vai junto
  });
});
