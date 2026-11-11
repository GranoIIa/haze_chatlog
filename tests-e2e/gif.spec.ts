import { test, expect, Page } from '@playwright/test';
import { openFresh, editorText } from './helpers';

/** Grava um vídeo curto (WebM) dentro do próprio navegador e devolve os bytes. */
async function gravarVideo(page: Page, ms = 1800): Promise<Buffer> {
  const b64 = await page.evaluate(async (dur) => {
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
      await new Promise(r => setTimeout(r, 40));
    }
    rec.stop();
    await new Promise(r => (rec.onstop = r));
    const buf = new Uint8Array(await new Blob(parts).arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  }, ms);
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
