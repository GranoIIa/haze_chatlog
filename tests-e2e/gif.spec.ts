import { test, expect, Page } from '@playwright/test';
import { openFresh, editorText } from './helpers';

/** Grava um vídeo curto (WebM) dentro do próprio navegador e devolve os bytes. */
async function gravarVideo(page: Page, ms = 1800, ruido = false): Promise<Buffer> {
  const b64 = await page.evaluate(async ([dur, noisy]) => {
    const c = document.createElement('canvas'); c.width = 480; c.height = 270;
    const x = c.getContext('2d')!;
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: 'video/webm' });
    const parts: Blob[] = [];
    rec.ondataavailable = e => parts.push(e.data);
    rec.start();
    const t0 = performance.now();
    while (performance.now() - t0 < dur) {
      const t = (performance.now() - t0) / dur;
      x.fillStyle = `hsl(${200 + t * 120},50%,30%)`; x.fillRect(0, 0, 480, 270);
      if (noisy) for (let i = 0; i < 1500; i++) { x.fillStyle = `rgb(${Math.random() * 255 | 0},${Math.random() * 255 | 0},${Math.random() * 255 | 0})`; x.fillRect(Math.random() * 480, Math.random() * 270, 8, 8); }
      await new Promise(r => setTimeout(r, 40));
    }
    rec.stop();
    await new Promise(r => (rec.onstop = r));
    const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, [ms, ruido] as [number, boolean]);
  return Buffer.from(b64, 'base64');
}

/** Converte e devolve informações do GIF gerado (cabeçalho, quadros e pixels fora do fundo no 1º e último quadro). */
async function converter(page: Page) {
  await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
  await expect(page.getByText('Concluído!')).toBeVisible({ timeout: 60_000 });
  return page.evaluate(async () => {
    const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('blob:'))!;
    const buf = await (await fetch(img.src)).arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(buf, 0, 6));
    const dec = new (window as any).ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready;
    const n: number = dec.tracks.selectedTrack.frameCount;
    const contar = async (idx: number) => {
      const { image } = await dec.decode({ frameIndex: idx });
      const cv = document.createElement('canvas'); cv.width = image.displayWidth; cv.height = image.displayHeight;
      const cx = cv.getContext('2d')!; cx.drawImage(image, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      // pixels claros (texto) numa região onde o vídeo é escuro
      let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 150 && d[i + 2] > 150) k++;
      return k;
    };
    return { head, frames: n, primeiro: await contar(0), ultimo: await contar(n - 1) };
  });
}

test.describe('Video to GIF Lab', () => {
  test('converte um vídeo curto em um GIF válido e o chat do editor entra nos quadros', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();

    const video = await gravarVideo(page);
    expect(video.length).toBeGreaterThan(1000);
    await page.getByTestId('video-input').setInputFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: video });
    await expect(page.locator('video')).toBeVisible();
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);

    // 1) sem chat
    const sem = await converter(page);
    expect(sem.head).toBe('GIF89a');
    expect(sem.frames).toBeGreaterThan(5);
    expect(sem.ultimo).toBeLessThan(200); // vídeo escuro, quase sem pixels claros

    // 2) com o chat do Editor
    await page.getByLabel(/Incluir chat do Chat Log/).check();
    const com = await converter(page);
    expect(com.head).toBe('GIF89a');
    expect(com.ultimo).toBeGreaterThan(sem.ultimo + 500); // texto desenhado

    // 3) revelando as linhas aos poucos: o 1º quadro tem menos texto que o último
    await page.getByLabel(/Revelar as linhas/).check();
    const revelar = await converter(page);
    expect(revelar.primeiro).toBeLessThan(revelar.ultimo);
    expect(revelar.ultimo).toBeGreaterThan(sem.ultimo + 500);
  });

  test('o texto digitado no editor aparece no chat do GIF', async ({ page }) => {
    await openFresh(page);
    await editorText(page).fill('Mike Johnson diz (gritando): TEXTO NOVO PARA O GIF');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await page.getByTestId('video-input').setInputFiles({ name: 'c.webm', mimeType: 'video/webm', buffer: await gravarVideo(page, 1200) });
    await expect(page.locator('video')).toBeVisible();
    await page.getByLabel(/Incluir chat do Chat Log/).check();

    // o preview do chat sobre o vídeo desenha pixels (o texto do editor)
    const desenhado = await page.locator('canvas[aria-label^="Chat sobre o vídeo"]').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) k++;
      return k;
    });
    expect(desenhado).toBeGreaterThan(200);
  });
});

test.describe('GIF Lab: Diálogos e ações', () => {
  test('o painel edita o mesmo texto do Editor RP, nos dois sentidos', async ({ page }) => {
    await openFresh(page);
    await editorText(page).fill('Mike Johnson diz (normal): começo');
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    const painel = page.getByTestId('gif-dialog-panel');
    await expect(painel).toBeVisible();
    const campo = painel.getByRole('textbox', { name: 'Texto do chat' });
    await expect(campo).toHaveValue('Mike Johnson diz (normal): começo');

    // botões de tom e personagem ativo funcionam aqui
    await campo.fill('');
    await painel.getByRole('button', { name: 'Sarah Miller' }).click();
    await painel.getByRole('button', { name: 'Grito', exact: true }).click();
    await expect(campo).toHaveValue('Sarah Miller diz (gritando): ');
    await painel.getByRole('button', { name: '* /me', exact: true }).click();
    await expect(campo).toHaveValue('Sarah Miller diz (gritando): \n* Sarah Miller ');

    // volta ao Editor: o texto digitado no GIF Lab está lá
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(editorText(page)).toHaveValue('Sarah Miller diz (gritando): \n* Sarah Miller ');

    // e o caminho inverso: editar no Editor aparece no GIF Lab
    await editorText(page).fill('Texto novo vindo do Editor');
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await expect(campo).toHaveValue('Texto novo vindo do Editor');
  });

  test('o texto editado no GIF Lab aparece no chat do vídeo', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await page.getByTestId('video-input').setInputFiles({ name: 'c.webm', mimeType: 'video/webm', buffer: await gravarVideo(page, 1200) });
    await expect(page.locator('video')).toBeVisible();
    await page.getByLabel(/Incluir chat do Chat Log/).check();

    const pixels = () => page.locator('canvas[aria-label^="Chat sobre o vídeo"]').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) k++;
      return k;
    });
    const antes = await pixels();
    const campo = page.getByTestId('gif-dialog-panel').getByRole('textbox', { name: 'Texto do chat' });
    await campo.fill((await campo.inputValue()) + '\nMike Johnson diz (gritando): MAIS UMA LINHA GRANDE NO VIDEO PARA ENCHER');
    await expect.poll(pixels).toBeGreaterThan(antes);
  });
});

test.describe('GIF Lab: fonte e estilo do texto', () => {
  test('tamanho da fonte e espaçamento mudados no GIF Lab valem também no Editor RP', async ({ page }) => {
    await openFresh(page);
    await editorText(page).fill('Mike Johnson diz (normal): olá');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();

    const estilo = page.getByTestId('gif-text-style');
    await expect(estilo).toBeVisible();
    const tamanho = estilo.getByRole('slider', { name: 'Tamanho da fonte' });
    await tamanho.fill('36');
    await expect(estilo.getByText('36px')).toBeVisible();
    await estilo.getByRole('combobox', { name: 'Família da fonte' }).selectOption({ label: 'Impact' });

    // o Editor (dono do estado) recebeu a mudança
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await page.getByRole('button', { name: /Tipografia/ }).click();
    await expect(page.getByText('36px', { exact: true }).first()).toBeVisible();
  });
});

test.describe('GIF Lab: resolução e adaptação', () => {
  /** Dimensões do GIF gerado e cor do pixel do canto superior esquerdo (1º quadro). */
  const medir = (page: Page) => page.evaluate(async () => {
    const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('blob:'))!;
    const buf = await (await fetch(img.src)).arrayBuffer();
    const dec = new (window as any).ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready;
    const { image } = await dec.decode({ frameIndex: 0 });
    const cv = document.createElement('canvas'); cv.width = image.displayWidth; cv.height = image.displayHeight;
    const cx = cv.getContext('2d')!; cx.drawImage(image, 0, 0);
    const p = (x: number, y: number) => [...cx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { w: cv.width, h: cv.height, canto: p(2, 2), centro: p(cv.width >> 1, cv.height >> 1) };
  });

  test('resolução escolhida vira o tamanho do GIF; contain gera faixas pretas e cover preenche', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    const video = await gravarVideo(page, 1200);
    await page.getByTestId('video-input').setInputFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: video });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);

    const painel = page.getByTestId('gif-resolution');
    // tamanho personalizado pequeno (rápido): 200×200, vídeo 16:9
    await painel.getByLabel('Largura personalizada do GIF').fill('200');
    await painel.getByLabel('Altura personalizada do GIF').fill('200');
    await painel.getByRole('button', { name: 'Aplicar' }).click();
    await expect(painel.getByText('200×200')).toBeVisible();

    // o preview passa a ter a proporção da saída
    const caixa = await page.getByTestId('gif-preview-frame').boundingBox();
    expect(Math.abs(caixa!.width - caixa!.height)).toBeLessThan(2);

    await painel.getByRole('button', { name: 'Contain', exact: true }).click();
    await converter(page);
    const contain = await medir(page);
    expect([contain.w, contain.h]).toEqual([200, 200]);
    expect(Math.max(...contain.canto)).toBeLessThan(8);      // faixa preta no topo
    expect(Math.max(...contain.centro)).toBeGreaterThan(20); // vídeo no meio

    await painel.getByRole('button', { name: 'Cover', exact: true }).click();
    await converter(page);
    const cover = await medir(page);
    expect([cover.w, cover.h]).toEqual([200, 200]);
    expect(Math.max(...cover.canto)).toBeGreaterThan(20);    // vídeo preenche o canto
  });

  test('o limite máximo é respeitado ao aplicar um tamanho gigante', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    const painel = page.getByTestId('gif-resolution');
    await painel.getByLabel('Largura personalizada do GIF').fill('9000');
    await painel.getByLabel('Altura personalizada do GIF').fill('5000');
    await painel.getByRole('button', { name: 'Aplicar' }).click();
    await expect(painel.getByText('1920×1920')).toBeVisible();
  });
});

test.describe('GIF Lab: Smart Export, cancelamento e robustez', () => {
  const carregar = async (page: Page, ruido = false, ms = 2200) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    const video = await gravarVideo(page, ms, ruido);
    await page.getByTestId('video-input').setInputFiles({ name: 'clipe.webm', mimeType: 'video/webm', buffer: video });
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  };
  /** Tamanho e dimensões do GIF exibido, lidos do próprio arquivo (decodificador do navegador). */
  const medirGif = (page: Page) => page.evaluate(async () => {
    const img = [...document.querySelectorAll('img')].find(i => i.src.startsWith('blob:'))!;
    const buf = await (await fetch(img.src)).arrayBuffer();
    const dec = new (window as any).ImageDecoder({ data: buf, type: 'image/gif' });
    await dec.tracks.ready;
    const { image } = await dec.decode({ frameIndex: 0 });
    return { bytes: buf.byteLength, w: image.displayWidth, h: image.displayHeight, frames: dec.tracks.selectedTrack.frameCount };
  });

  test('perfil Emoji: 128×128, tamanho medido no arquivo e dentro de 256 KB', async ({ page }) => {
    await carregar(page);
    await page.getByRole('group', { name: 'Perfil do GIF' }).getByRole('button', { name: /Discord Emoji/ }).click();
    await expect(page.getByTestId('gif-profile-badge')).toContainText('Discord Emoji');
    await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
    await expect(page.getByText('Concluído!')).toBeVisible({ timeout: 90_000 });
    const g = await medirGif(page);
    expect([g.w, g.h]).toEqual([128, 128]);
    expect(g.bytes).toBeLessThanOrEqual(256 * 1024);
    await expect(page.getByTestId('gif-result-meta')).toContainText('Dentro do limite');
  });

  test('Smart Export nunca declara o limite cumprido sem medir: texto e arquivo concordam', async ({ page }) => {
    await carregar(page, true, 2500);
    await page.getByRole('group', { name: 'Perfil do GIF' }).getByRole('button', { name: /Discord Emoji/ }).click();
    await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
    await expect(page.getByText('Concluído!')).toBeVisible({ timeout: 180_000 });
    const g = await medirGif(page);
    const meta = await page.getByTestId('gif-result-meta').innerText();
    if (g.bytes <= 256 * 1024) expect(meta).toContain('Dentro do limite');
    else expect(meta).toContain('Acima do limite');
    expect([g.w, g.h].every(v => v <= 128)).toBe(true); // a escada só reduz
  });

  test('cancelar durante a conversão libera tudo e uma nova conversão funciona', async ({ page }) => {
    await carregar(page, false, 3000);
    const painel = page.getByTestId('gif-resolution');
    await painel.getByLabel('Largura personalizada do GIF').fill('1280');
    await painel.getByLabel('Altura personalizada do GIF').fill('720');
    await painel.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
    await page.getByRole('button', { name: /Cancelar Conversão/ }).click();
    await expect(page.getByText('Conversão cancelada pelo usuário.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancelar Conversão/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Converter Vídeo para GIF/ })).toBeEnabled();
    // o app segue responsivo e converte de novo
    await painel.getByRole('button', { name: '854×480' }).click();
    await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
    await expect(page.getByText('Concluído!')).toBeVisible({ timeout: 90_000 });
    expect((await medirGif(page)).w).toBe(854);
  });

  test('trocar de aba durante a conversão não a interrompe', async ({ page }) => {
    await carregar(page);
    await page.getByRole('button', { name: /Converter Vídeo para GIF/ }).click();
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await expect(page.getByText('Concluído!')).toBeVisible({ timeout: 90_000 });
    expect((await medirGif(page)).frames).toBeGreaterThan(5);
  });

  test('vídeo inválido: o app não trava e nada é gerado', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('button', { name: /Video to GIF Lab/ }).click();
    await page.getByTestId('video-input').setInputFiles({ name: 'ruim.webm', mimeType: 'video/webm', buffer: Buffer.from('isto não é um vídeo') });
    await page.waitForTimeout(800);
    const botao = page.getByRole('button', { name: /Converter Vídeo para GIF/ });
    if (await botao.isEnabled()) {
      await botao.click();
      await page.waitForTimeout(3000);
    }
    await expect(page.getByText('Concluído!')).toHaveCount(0);
    await page.getByRole('button', { name: /Editor RP/ }).click();
    await expect(page.getByTestId('preview-canvas')).toBeVisible();
  });

  test('ajustar a resolução à mão não troca o perfil nem o alvo', async ({ page }) => {
    await carregar(page);
    await page.getByRole('group', { name: 'Perfil do GIF' }).getByRole('button', { name: /Discord Emoji/ }).click();
    const painel = page.getByTestId('gif-resolution');
    await painel.getByLabel('Largura personalizada do GIF').fill('200');
    await painel.getByLabel('Altura personalizada do GIF').fill('200');
    await painel.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('gif-profile-badge')).toContainText('Discord Emoji (ajustado)');
    await expect(page.getByTestId('gif-target')).toContainText('256 KB');
    await expect(page.getByTestId('gif-budget')).toContainText('200×200');
  });
});
