import { abrirExportacao } from './helpers';
/**
 * Video Studio F2: preset de câmera por clipe, texto livre, chat linha a linha, projeto .haze e reconexão de mídia.
 * Valida os arquivos exportados com ffmpeg fora do navegador. Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 854, H = 480; // tamanho de exportação usado nestes testes
let dir = '';
let fRed = '', fBlue = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-f2-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
});

const open = async (page: Page, files: string[]) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles(files);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(files.length);
};
async function exportTo(page: Page, name: string) {
  await abrirExportacao(page);
  await page.getByTestId('export-size').selectOption({ label: '854×480' });
  await page.getByTestId('export-fps').selectOption('24');
  await page.getByTestId('export').click();
  await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 100_000 });
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByTestId('export-download').click();
  const out = join(dir, name);
  await (await dl).saveAs(out);
  return out;
}
const frame = (file: string, t: number): Buffer => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  expect(r.status, String(r.stderr)).toBe(0);
  expect(r.stdout.length).toBe(W * H * 3);
  return r.stdout;
};
const region = (b: Buffer, x0: number, y0: number, w: number, h: number) => {
  const out: number[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const o = (y * W + x) * 3; out.push(b[o], b[o + 1], b[o + 2]); }
  return out;
};
const lumaStd = (px: number[]) => {
  const v: number[] = []; for (let i = 0; i < px.length; i += 3) v.push(0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]);
  const m = v.reduce((a, c) => a + c, 0) / v.length;
  return Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / v.length);
};
const meanAbsDiff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
/** Quantos pixels da região são "claros" (texto branco/verde sobre fundo saturado). */
const bright = (px: number[]) => { let n = 0; for (let i = 0; i < px.length; i += 3) if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200) n++; return n; };
const reddish = (px: number[]) => { let n = 0; for (let i = 0; i < px.length; i += 3) if (px[i] > 200 && px[i + 1] < 80 && px[i + 2] < 80) n++; return n; };

test.describe('Video Studio F2', () => {
  test('preset Bodycam por clipe: HUD aparece, o relógio avança com o vídeo e outro clipe fica limpo', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('add-clip-0').click(); // vermelho 0-4
    await page.getByTestId('add-clip-1').click(); // azul 4-7 (sem preset)
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('cam-preset').selectOption('bodycam');
    await page.getByTestId('cam-date').fill('2026-03-01'); await page.getByTestId('cam-date').blur();
    await page.getByTestId('cam-time').fill('23:59:58'); await page.getByTestId('cam-time').blur();
    await page.getByTestId('cam-officer').fill('R. LIMA'); await page.getByTestId('cam-officer').blur();
    const out = await exportTo(page, 'bodycam.mp4');
    const hud = (t: number) => region(frame(out, t), 10, 8, 420, 50);
    const a = hud(0.5), a2 = hud(0.9), c = hud(2.5);
    expect(lumaStd(a)).toBeGreaterThan(20);                       // HUD de texto presente no clipe com preset
    expect(meanAbsDiff(a, a2)).toBeLessThan(meanAbsDiff(a, c) / 2); // mesmo segundo ≈ igual; 2 s depois o relógio mudou
    expect(meanAbsDiff(a, c)).toBeGreaterThan(1.5);
    const clean = region(frame(out, 5.5), 10, 8, 420, 50);        // clipe azul, sem preset
    expect(lumaStd(clean)).toBeLessThan(6);
  });

  test('texto livre com cor e chat linha a linha (mais texto a cada passo)', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fBlue]);
    await page.getByTestId('add-clip-0').click();                  // azul 0-3
    // texto livre vermelho entre 0,5 s e 1,5 s
    await page.getByTestId('chat-kind').selectOption('text');
    await page.getByTestId('chat-text').fill('TÍTULO DA CENA');
    await page.getByTestId('chat-color').fill('#ff0000');
    await page.getByTestId('chat-start').fill('0.5'); await page.getByTestId('chat-duration').fill('1');
    await page.getByTestId('chat-add').click();
    // chat de 3 linhas, uma a cada 0,6 s a partir de 1,6 s
    await page.getByTestId('chat-kind').selectOption('chat');
    await page.getByTestId('chat-text').fill('Ana diz: um\nBia diz: dois\nCaio diz: três');
    await page.getByTestId('chat-step').fill('0.6');
    await page.getByTestId('chat-start').fill('1.6'); await page.getByTestId('chat-duration').fill('1.3');
    await page.getByTestId('chat-add').click();
    await expect(page.getByTestId('chat-block')).toHaveCount(2);
    const out = await exportTo(page, 'texto.mp4');
    const r = (t: number) => region(frame(out, t), 10, 10, 500, 110);
    expect(reddish(r(1.0))).toBeGreaterThan(150);                  // título vermelho visível
    expect(reddish(r(0.2))).toBeLessThan(20);                      // antes
    expect(reddish(r(1.8))).toBeLessThan(20);                      // depois
    const n1 = lumaStd(r(1.75)), n2 = lumaStd(r(2.3)), n3 = lumaStd(r(2.8));
    expect(n2).toBeGreaterThan(n1);                                // 2ª linha entrou
    expect(n3).toBeGreaterThan(n2);                                // 3ª linha entrou
  });

  test('salvar e abrir projeto: timeline volta, mídias ficam offline até reconectar, exportação bloqueada até lá', async ({ page }) => {
    test.setTimeout(150_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('trim-out').fill('3'); await page.getByTestId('trim-out').blur();
    await page.getByTestId('cam-preset').selectOption('cctv');
    await page.getByTestId('chat-kind').selectOption('text');
    await page.getByTestId('chat-text').fill('LEGENDA');
    await page.getByTestId('chat-add').click();
    await expect(page.getByTestId('playhead')).toContainText('/ 0:06.00');
    const dl = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('project-save').click();
    const saved = join(dir, 'projeto.haze');
    await (await dl).saveAs(saved);
    // o arquivo é um ZIP com manifesto v2 e SEM os vídeos
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(readFileSync(saved));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.format).toBe('haze-project'); expect(manifest.schemaVersion).toBe(2); expect(manifest.kind).toBe('video');
    expect(manifest.video.media).toHaveLength(2);
    expect(Object.keys(zip.files).some(n => /\.mp4$/.test(n))).toBe(false);
    expect(readFileSync(saved).length).toBeLessThan(20_000);

    // sessão nova: abrir o projeto
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('project-open-input').setInputFiles(saved);
    await expect(page.getByTestId('pending-media')).toContainText('vermelho.mp4');
    await expect(page.getByTestId('clip-block')).toHaveCount(2);
    await expect(page.getByTestId('clip-block').first()).toContainText('offline');
    await expect(page.getByTestId('playhead')).toContainText('/ 0:06.00');
    await abrirExportacao(page);
    await page.getByTestId('export').click();
    await expect(page.getByTestId('video-message')).toContainText('Reconecte as mídias');

    // reconectar: só um arquivo, depois o outro
    await page.getByTestId('video-file-input').setInputFiles([fRed]);
    await expect(page.getByTestId('pending-media')).not.toContainText('vermelho.mp4');
    await expect(page.getByTestId('pending-media')).toContainText('azul.mp4');
    await page.getByTestId('video-file-input').setInputFiles([fBlue]);
    await expect(page.getByTestId('pending-media')).toHaveCount(0);
    await page.getByTestId('clip-block').first().click();
    await expect(page.getByTestId('cam-preset')).toHaveValue('cctv'); // preset sobreviveu ao projeto
    const out = await exportTo(page, 'reaberto.mp4');
    const probe = JSON.parse(String(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', out]).stdout));
    expect(Number(probe.format.duration)).toBeGreaterThan(5.9); expect(Number(probe.format.duration)).toBeLessThan(6.2);
    const f0 = frame(out, 0.5), f1 = frame(out, 4.0);
    const px = (f: Buffer) => { const o = (300 * W + 427) * 3; return [f[o], f[o + 1], f[o + 2]]; };
    const [r0, g0, b0] = px(f0);
    expect(Math.abs(r0 - b0)).toBeLessThan(30);                  // 1º trecho em P&B (CCTV): o preset sobreviveu ao projeto
    const [r1, , b1] = px(f1);
    expect(b1).toBeGreaterThan(120); expect(r1).toBeLessThan(80); // 2º trecho azul, sem preset
    void g0;
  });

  test('arquivo que não é projeto de vídeo é recusado com mensagem clara', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('project-open-input').setInputFiles(fRed); // um MP4, não um .haze
    await expect(page.getByTestId('video-message')).toContainText(/ZIP|projeto/i);
    await expect(page.getByTestId('clip-block')).toHaveCount(0);
  });
});
