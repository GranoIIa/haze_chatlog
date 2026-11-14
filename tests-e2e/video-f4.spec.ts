/**
 * Video Studio F4: modelos, fluxo guiado (Simples), presets de destino e edição de texto.
 * Valida os arquivos exportados com ffmpeg fora do navegador. Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
let fRed = '', fBlue = '', fLong = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-f4-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
  fLong = join(dir, 'longo.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=30:d=180', '-f', 'lavfi', '-i', 'sine=f=300:r=48000:d=180',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fLong]);
});

const W = 854, H = 480;
const open = async (page: Page, files: string[]) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles(files);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(files.length);
};
async function download(page: Page, name: string) {
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('export-download').click();
  const out = join(dir, name);
  await (await dl).saveAs(out);
  return out;
}
const probe = (f: string) => JSON.parse(String(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', f]).stdout));
const frame = (file: string, t: number): Buffer => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  expect(r.status, String(r.stderr)).toBe(0);
  expect(r.stdout.length).toBe(W * H * 3);
  return r.stdout;
};
const px = (b: Buffer, x: number, y: number) => { const o = (Math.round(y) * W + Math.round(x)) * 3; return [b[o], b[o + 1], b[o + 2]]; };
const region = (b: Buffer, x0: number, y0: number, w: number, h: number) => {
  const out: number[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 3; out.push(b[o], b[o + 1], b[o + 2]); }
  return out;
};
const lumaStd = (p: number[]) => {
  const v: number[] = []; for (let i = 0; i < p.length; i += 3) v.push(0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2]);
  const m = v.reduce((a, c) => a + c, 0) / v.length;
  return Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / v.length);
};

test.describe('Video Studio F4', () => {
  test('modelo Documentário: monta cenas, transição, fades e textos; Desfazer volta; textos são editáveis', async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('templates-toggle').click();
    await page.getByTestId('tpl-documentario').click();
    await page.getByTestId('tpl-slot-abertura').selectOption({ label: 'vermelho.mp4' });
    await page.getByTestId('tpl-slot-cena1').selectOption({ label: 'azul.mp4' });
    await page.getByTestId('tpl-apply').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(2);
    await expect(page.getByTestId('chat-block')).toHaveCount(3);                 // título, subtítulo e "FIM"
    await expect(page.getByTestId('playhead')).toContainText('/ 0:06.20');       // 4 + 3 - 0,8 de fusão
    await expect(page.getByTestId('video-message')).toContainText('Documentário');

    // editar o texto do título
    await page.getByTestId('overlay-select').first().click();
    await expect(page.getByTestId('overlay-editor')).toBeVisible();
    await page.getByTestId('ov-text').fill('MEU DOCUMENTÁRIO'); await page.getByTestId('ov-text').blur();
    await expect(page.getByTestId('overlay-list')).toContainText('MEU DOCUMENTÁRIO');

    await page.getByTestId('export-preset').selectOption('discord');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 100_000 });
    const out = await download(page, 'documentario.mp4');
    const p = probe(out);
    expect(Number(p.format.duration)).toBeGreaterThan(6.1); expect(Number(p.format.duration)).toBeLessThan(6.5);
    expect(px(frame(out, 0.05), 60, 420)[0]).toBeLessThan(60);                   // entrada gradual: quase preto
    expect(px(frame(out, 1.5), 60, 420)[0]).toBeGreaterThan(200);                // depois da rampa: vermelho pleno
    expect(lumaStd(region(frame(out, 2.0), 150, 190, 554, 70))).toBeGreaterThan(15); // título no centro
    expect(lumaStd(region(frame(out, 6.15), 150, 190, 554, 70))).toBeLessThan(8);    // saída gradual: preto

    // Desfazer: 1º a edição do texto, 2º o próprio modelo (volta à montagem vazia)
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('overlay-list')).not.toContainText('MEU DOCUMENTÁRIO');
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(0);
  });

  test('modelo exige a cena obrigatória e mostra o que falta', async ({ page }) => {
    await open(page, [fRed]);
    await page.getByTestId('templates-toggle').click();
    await page.getByTestId('tpl-documentario').click();
    await page.getByTestId('tpl-slot-cena1').selectOption({ label: 'vermelho.mp4' }); // só uma cena opcional
    await page.getByTestId('tpl-apply').click();
    await expect(page.getByTestId('tpl-errors')).toContainText('Abertura');
    await expect(page.getByTestId('clip-block')).toHaveCount(0);
  });

  test('modelo Registro policial: HUD de bodycam com relógio e chat entrando linha a linha', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fRed]);
    await page.getByTestId('templates-toggle').click();
    await page.getByTestId('tpl-registro-policial').click();
    await page.getByTestId('tpl-slot-bodycam1').selectOption({ label: 'vermelho.mp4' });
    await page.getByTestId('tpl-apply').click();
    await page.getByTestId('export-preset').selectOption('discord');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 100_000 });
    const out = await download(page, 'policial.mp4');
    const hud = lumaStd(region(frame(out, 0.5), 10, 8, 420, 50));
    expect(hud).toBeGreaterThan(20);                                             // HUD da bodycam desde o início
    const chat = (t: number) => lumaStd(region(frame(out, t), 10, 62, 500, 90)); // abaixo do HUD (que ocupa o topo)
    expect(chat(0.4)).toBeLessThan(6);                                           // antes do chat: só vermelho liso
    expect(chat(1.3)).toBeGreaterThan(15);                                       // 1ª linha entrou
    expect(chat(3.7)).toBeGreaterThan(chat(1.3));                                // vídeo de 4 s: as 3 falas se apertam e já entraram
  });

  test('Modo Simples: importar → cortar → texto → visual → exportar para Discord', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('video-mode-simple').click();
    await expect(page.getByTestId('guided-flow')).toBeVisible();
    await expect(page.getByTestId('timeline')).toHaveCount(0);                   // sem a timeline avançada
    await expect(page.getByTestId('guided-flow').getByTestId('simple-progress')).toContainText('importar');
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('simple-clip-1')).toBeVisible();               // entraram sozinhos
    // cortar o vermelho para 2 s e trocar a ordem (azul primeiro)
    await page.getByTestId('simple-out-0').fill('2'); await page.getByTestId('simple-out-0').blur();
    await page.getByTestId('simple-up-1').click();
    await expect(page.getByTestId('simple-clip-0')).toContainText('azul.mp4');
    // texto e visual
    await page.getByTestId('simple-title').fill('MINHA CENA');
    await page.getByTestId('simple-title-add').click();
    await expect(page.getByTestId('simple-overlays')).toContainText('MINHA CENA');
    await page.getByTestId('simple-visual-bodycam').click();
    await page.getByTestId('simple-transition').selectOption('0.5');
    await page.getByTestId('simple-fade').check();
    await expect(page.getByTestId('guided-flow').getByTestId('simple-progress')).toContainText('4.5');      // 3 + 2 - 0,5
    await page.getByTestId('simple-preset').selectOption('discord');
    await expect(page.getByTestId('simple-preset-note')).toContainText('kbps');
    await page.getByTestId('simple-export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 100_000 });
    const out = await download(page, 'simples.mp4');
    const p = probe(out);
    const v = p.streams.find((s: any) => s.codec_type === 'video');
    expect(v.width).toBe(854); expect(v.height).toBe(480); expect(v.r_frame_rate).toBe('24/1');
    expect(Number(p.format.duration)).toBeGreaterThan(4.4); expect(Number(p.format.duration)).toBeLessThan(4.8);
    expect(statSync(out).size).toBeLessThan(10 * 1024 * 1024);
    expect(lumaStd(region(frame(out, 2.0), 10, 8, 420, 50))).toBeGreaterThan(20);  // HUD de bodycam
    expect(px(frame(out, 3.2), 427, 400)[0]).toBeGreaterThan(100);                 // vermelho (2ª cena: fusão já acabou e a saída gradual ainda não começou)
  });

  test('o modo escolhido é lembrado ao recarregar e o Avançado continua o padrão', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-mode-advanced')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('video-mode-simple').click();
    await page.reload();
    await page.getByTestId('tab-video').click();
    await expect(page.getByTestId('video-mode-simple')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('guided-flow')).toBeVisible();
    await page.getByTestId('video-mode-advanced').click();
    await expect(page.getByTestId('timeline')).toBeVisible();
  });

  test('preset Discord limita o tamanho de um vídeo longo (3 min) e o personalizado não', async ({ page }) => {
    test.setTimeout(280_000);
    await open(page, [fLong]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('export-preset').selectOption('discord');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 250_000 });
    const small = statSync(await download(page, 'longo-discord.mp4')).size;
    console.log(`F4: 3 min no preset Discord = ${(small / 1048576).toFixed(2)} MB (alvo 10 MB)`);
    expect(small).toBeLessThan(10 * 1024 * 1024 * 1.15);
    await page.getByTestId('export-preset').selectOption('custom');
    await page.getByTestId('export-size').selectOption({ label: '854×480' });
    await page.getByTestId('export-fps').selectOption('24');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 250_000 });
    const big = statSync(await download(page, 'longo-custom.mp4')).size;
    console.log(`F4: 3 min personalizado 480p24 = ${(big / 1048576).toFixed(2)} MB`);
    expect(big).toBeGreaterThan(small * 1.3);
  });
});
