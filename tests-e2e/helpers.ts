import { Page, expect, Download } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------- PNG sintético

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf: Buffer): number => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

/** PNG RGB de cor sólida (rápido e sem dependências). */
export const solidPng = (w: number, h: number, rgb: [number, number, number]): Buffer => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
};

export const pngSize = (buf: Buffer): { w: number; h: number } => {
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};

export const file = (name: string, buffer: Buffer, mimeType = 'image/png') => ({ name, mimeType, buffer });

export const readDownload = async (d: Download): Promise<Buffer> => {
  const p = await d.path();
  return readFileSync(p);
};

// ---------------------------------------------------------------- página

/** Abre o app com armazenamento limpo (localStorage + IndexedDB). */
export async function openFresh(page: Page, uiMode: 'simple' | 'advanced' = 'advanced') {
  await page.goto('/');
  await page.evaluate(async (m) => {
    localStorage.clear();
    if (m === 'advanced') localStorage.setItem('haze-ui-mode-v1', 'advanced'); // os testes antigos usam o painel completo
    await new Promise<void>(r => {
      const q = indexedDB.deleteDatabase('haze-chatlog');
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
  }, uiMode);
  await page.reload();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
}

export const canvasSize = (page: Page) =>
  page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));

/** Cor (RGB) de um ponto do canvas, em fração da largura e altura. */
export const canvasPixel = (page: Page, fx: number, fy: number) =>
  page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement, [x, y]) => {
    const d = c.getContext('2d')!.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data;
    return [d[0], d[1], d[2]];
  }, [fx, fy] as [number, number]);

export const setBackground = async (page: Page, w: number, h: number, rgb: [number, number, number], name = 'fundo.png') => {
  await page.getByTestId('bg-input').setInputFiles(file(name, solidPng(w, h, rgb)));
  await expect.poll(() => canvasSize(page)).toEqual({ w, h });
};

export const layerCount = (page: Page) =>
  page.locator('ul[aria-label^="Lista de camadas"] > li').count();

export const addImageLayer = async (page: Page, name: string, rgb: [number, number, number]) => {
  const before = await layerCount(page);
  await page.getByTestId('layer-input').setInputFiles(file(name, solidPng(120, 60, rgb)));
  await expect.poll(() => layerCount(page)).toBe(before + 1);
};

/** Ctrl+Z / Ctrl+Y fora de campos de texto (o foco precisa estar no corpo da página). */
export const undo = async (page: Page) => { await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+z'); };
export const redo = async (page: Page) => { await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+y'); };

/** Botões de cabeçalho das seções do Editor RP (exclui seções de outras telas). */
export const sectionButtons = (page: Page) =>
  page.locator('section[data-section]:not([data-section="gif-dialogos"]) > h3 > button');

/** Caixa de texto do chat no Editor RP (o GIF Lab, montado em segundo plano, tem outra). */
export const editorText = (page: Page) => page.getByTestId('editor-dialog').locator('textarea');

/** Abre uma seção do painel do Editor RP (id como em src/components/ChatLog/EditorSection.tsx). */
export const openSection = async (page: Page, id: string) => {
  const btn = page.locator(`section[data-section="${id}"] > h3 > button`);
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
};

/** Aguarda o autosave (debounce) antes de recarregar. */
export const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

/** Abre o modal de exportação do Video Studio se ainda não estiver visível. */
export async function abrirExportacao(page: Page) {
  const expBtn = page.getByTestId('export');
  if (!(await expBtn.isVisible())) {
    await page.getByTestId('export-open').click();
  }
}

export type FerramentaVideo = 'midia' | 'texto' | 'legendas' | 'modelos';

/**
 * Ativa uma ferramenta específica no trilho vertical do Video Studio.
 * Se já estiver ativa, não faz nada.
 */
export async function abrirFerramenta(page: Page, ferramenta: FerramentaVideo) {
  const toolId = `tool-${ferramenta === 'midia' ? 'media' : ferramenta === 'texto' ? 'text' : ferramenta === 'legendas' ? 'subtitles' : 'templates'}`;
  const btn = page.getByTestId(toolId);
  if ((await btn.getAttribute('aria-pressed')) !== 'true') {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
  }
}

export type AbaInspetor = 'video' | 'audio' | 'camada';

/**
 * Ativa uma aba específica no Inspetor Contextual do Video Studio.
 * Se já estiver ativa, não faz nada.
 */
export async function abrirAbaInspetor(page: Page, aba: AbaInspetor) {
  const tabId = `inspector-tab-${aba === 'camada' ? 'layer' : aba}`;
  const btn = page.getByTestId(tabId);
  if ((await btn.getAttribute('aria-selected')) !== 'true') {
    await btn.click();
    await expect(btn).toHaveAttribute('aria-selected', 'true');
  }
}

