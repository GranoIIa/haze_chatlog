import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import {
  openFresh, setBackground, addImageLayer, layerCount, canvasSize, settle,
  readDownload, solidPng, pngSize, file, openSection, editorText
} from './helpers';

test.describe('Projeto .haze', () => {
  test.beforeEach(async ({ page }) => { await openFresh(page); });

  const montarCena = async (page: import('@playwright/test').Page) => {
    await setBackground(page, 640, 360, [30, 40, 90], 'cena.png');
    await addImageLayer(page, 'selo.png', [255, 0, 0]);
    await editorText(page).fill('Mike Johnson diz (rádio): CENA SALVA NO PROJETO');
    await settle(page, 900);
  };

  const salvar = async (page: import('@playwright/test').Page) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Salvar projeto/ }).click()
    ]);
    return download;
  };

  test('salvar gera um ZIP .haze válido com manifesto e imagens', async ({ page }) => {
    await montarCena(page);
    const download = await salvar(page);
    expect(download.suggestedFilename()).toMatch(/\.haze$/);

    const zip = await JSZip.loadAsync(await readDownload(download));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.format).toBe('haze-project');
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.scene.rawText).toContain('CENA SALVA NO PROJETO');
    expect(manifest.background?.assetId).toBeTruthy();
    expect(manifest.imageLayers).toHaveLength(1);
    expect(manifest.assets).toHaveLength(2);

    for (const a of manifest.assets) {
      const bytes = Buffer.from(await zip.file(a.file)!.async('uint8array'));
      expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
    }
    // nada fora de manifest.json e assets/
    expect(Object.keys(zip.files).every(n => n === 'manifest.json' || n.startsWith('assets/'))).toBe(true);
  });

  test('abrir o projeto em uma sessão limpa restaura foto, camadas e texto', async ({ page }) => {
    await montarCena(page);
    const download = await salvar(page);
    const caminho = await download.path();

    await openFresh(page); // sessão nova, sem nada
    expect(await canvasSize(page)).toEqual({ w: 1280, h: 720 });
    expect(await layerCount(page)).toBe(0);

    page.once('dialog', d => d.accept());
    await page.getByTestId('project-input').setInputFiles(caminho);
    await expect(page.getByRole('status')).toContainText('Projeto aberto');

    await expect.poll(() => canvasSize(page)).toEqual({ w: 640, h: 360 });
    await expect.poll(() => layerCount(page)).toBe(1);
    await expect(editorText(page)).toHaveValue('Mike Johnson diz (rádio): CENA SALVA NO PROJETO');
    await expect(page.getByRole('button', { name: /Desfazer/ })).toBeDisabled();

    // e continua editável: editar depois de abrir cria um passo desfazível
    await editorText(page).fill('EDITADO DEPOIS DE ABRIR');
    await settle(page, 800);
    await expect(page.getByRole('button', { name: /Desfazer/ })).toBeEnabled();
  });

  test('arquivos inválidos são recusados e a cena atual fica intacta', async ({ page }) => {
    await montarCena(page);
    const input = page.getByTestId('project-input');

    await input.setInputFiles(file('lixo.haze', Buffer.from('isto não é um zip de verdade, claro que não'), 'application/octet-stream'));
    await expect(page.getByRole('status')).toContainText(/vazio|corrompido|não é um projeto/i);

    // projeto de versão futura
    const download = await salvar(page);
    const zip = await JSZip.loadAsync(await readDownload(download));
    const m = JSON.parse(await zip.file('manifest.json')!.async('string'));
    m.schemaVersion = 99;
    zip.file('manifest.json', JSON.stringify(m));
    const futuro = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    await input.setInputFiles(file('futuro.haze', futuro, 'application/zip'));
    await expect(page.getByRole('status')).toContainText('versão mais nova');

    // asset que é HTML disfarçado de imagem
    const zip2 = await JSZip.loadAsync(await readDownload(download));
    const m2 = JSON.parse(await zip2.file('manifest.json')!.async('string'));
    zip2.file(m2.assets[0].file, '<script>alert(1)</script>');
    const falso = Buffer.from(await zip2.generateAsync({ type: 'uint8array' }));
    await input.setInputFiles(file('falso.haze', falso, 'application/zip'));
    await expect(page.getByRole('status')).toContainText('não é uma imagem válida');

    // a cena original continua lá
    expect(await canvasSize(page)).toEqual({ w: 640, h: 360 });
    expect(await layerCount(page)).toBe(1);
    await expect(editorText(page)).toHaveValue('Mike Johnson diz (rádio): CENA SALVA NO PROJETO');
  });

  test('caminho malicioso no manifesto é descartado com aviso ao usuário', async ({ page }) => {
    await montarCena(page);
    const download = await salvar(page);
    const zip = await JSZip.loadAsync(await readDownload(download));
    const m = JSON.parse(await zip.file('manifest.json')!.async('string'));
    m.assets[0].file = '../../etc/passwd';
    zip.file('manifest.json', JSON.stringify(m));
    const evil = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));

    page.once('dialog', d => d.accept());
    await page.getByTestId('project-input').setInputFiles(file('path.haze', evil, 'application/zip'));
    await expect(page.getByRole('status')).toContainText('avisos');
  });
});

test.describe('Lote (ZIP)', () => {
  test('gera um ZIP com uma imagem por foto, nomes únicos e tamanhos originais', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('tab', { name: 'Lote (ZIP)' }).click();

    await page.getByTestId('batch-input').setInputFiles([
      file('praca.png', solidPng(400, 200, [200, 30, 30])),
      file('praca.png', solidPng(300, 300, [30, 200, 30])), // mesmo nome: não pode sobrescrever
      file('beco.png', solidPng(500, 250, [30, 30, 200]))
    ]);
    await expect(page.getByRole('button', { name: /Gerar ZIP \(3\)/ })).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Gerar ZIP/ }).click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.zip$/);

    const zip = await JSZip.loadAsync(await readDownload(download));
    const nomes = Object.keys(zip.files).sort();
    expect(nomes).toEqual(['beco_chatlog.png', 'praca_chatlog.png', 'praca_chatlog_2.png']);

    const tamanhos: Record<string, { w: number; h: number }> = {};
    for (const n of nomes) tamanhos[n] = pngSize(Buffer.from(await zip.file(n)!.async('uint8array')));
    expect(tamanhos['praca_chatlog.png']).toEqual({ w: 400, h: 200 });
    expect(tamanhos['praca_chatlog_2.png']).toEqual({ w: 300, h: 300 });
    expect(tamanhos['beco_chatlog.png']).toEqual({ w: 500, h: 250 });
  });

  test('com resolução escolhida, todas as fotos saem no mesmo tamanho', async ({ page }) => {
    await openFresh(page);
    await openSection(page, 'resolucao');
    await page.getByRole('button', { name: '1:1 Square' }).click();
    await page.getByRole('tab', { name: 'Lote (ZIP)' }).click();
    await page.getByTestId('batch-input').setInputFiles([
      file('a.png', solidPng(400, 200, [200, 30, 30])),
      file('b.png', solidPng(250, 500, [30, 200, 30]))
    ]);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Gerar ZIP/ }).click()
    ]);
    const zip = await JSZip.loadAsync(await readDownload(download));
    for (const n of Object.keys(zip.files)) {
      expect(pngSize(Buffer.from(await zip.file(n)!.async('uint8array')))).toEqual({ w: 1080, h: 1080 });
    }
  });
});
