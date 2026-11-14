import { abrirExportacao } from './helpers';
/**
 * Video Studio F1: preview com áudio, mudo, zoom, miniaturas, áudio em fluxo com trecho sem áudio.
 * Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir = '';
let fA = '', fB = '', fN = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-f1-'));
  const withAudio = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fA = join(dir, 'a.mp4'); withAudio(fA, 'red', 440, 3);
  fB = join(dir, 'b.mp4'); withAudio(fB, 'blue', 880, 3);
  fN = join(dir, 'sem-audio.mp4');
  ff(['-f', 'lavfi', '-i', 'color=c=green:s=640x360:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', fN]);
});

const open = async (page: Page, files: string[]) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles(files);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(files.length);
};
const pcm = (file: string) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  expect(r.status, String(r.stderr)).toBe(0);
  const u = new Uint8Array(r.stdout.length); u.set(r.stdout);
  return new Int16Array(u.buffer, 0, Math.floor(u.length / 2));
};
const rms = (a: Int16Array, t0: number, t1: number) => {
  let s = 0; const i0 = Math.round(t0 * 48000), i1 = Math.round(t1 * 48000);
  for (let i = i0; i < i1; i++) s += a[i] * a[i];
  return Math.sqrt(s / (i1 - i0));
};
const freq = (a: Int16Array, c: number, win = 0.2) => {
  const s = Math.round((c - win / 2) * 48000), e = Math.round((c + win / 2) * 48000);
  let z = 0; for (let i = s + 1; i < e; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) z++;
  return z / 2 / win;
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

test.describe('Video Studio F1', () => {
  test('preview toca com áudio: o relógio avança e o status mostra trechos agendados', async ({ page }) => {
    await open(page, [fA]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('ativo', { timeout: 10_000 });
    await expect(page.getByTestId('audio-status')).toContainText('trechos', { timeout: 10_000 });
    await expect.poll(async () => (await page.getByTestId('playhead').innerText())).not.toMatch(/^0:00\.00/);
    await page.getByTestId('play').click(); // pausa
    await expect(page.getByTestId('audio-status')).toContainText('parado');
    const t1 = await page.getByTestId('playhead').innerText();
    await page.waitForTimeout(400);
    expect(await page.getByTestId('playhead').innerText()).toBe(t1); // pausado de verdade
  });

  test('a reprodução termina no fim da montagem e para sozinha', async ({ page }) => {
    await open(page, [fA]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('parado', { timeout: 15_000 });
    await expect(page.getByTestId('play')).toContainText('Reproduzir');
  });

  test('silenciar um clipe zera o áudio dele na exportação e mantém o dos outros', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fA, fB]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('mute').click();
    await expect(page.getByTestId('mute')).toContainText('Ativar som');
    const out = await exportTo(page, 'mudo.mp4');
    const a = pcm(out);
    expect(rms(a, 0.5, 2.5)).toBeLessThan(30);          // A silenciado
    expect(rms(a, 3.5, 5.5)).toBeGreaterThan(1500);     // B audível
    expect(Math.abs(freq(a, 4.5) - 880)).toBeLessThan(40);
  });

  test('áudio em fluxo com um trecho SEM áudio no meio: tons nos lugares certos e silêncio no buraco', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fA, fN, fB]);
    await page.getByTestId('add-clip-0').click(); // A 0-3 (440 Hz)
    await page.getByTestId('add-clip-1').click(); // N 3-5 (sem áudio)
    await page.getByTestId('add-clip-2').click(); // B 5-8 (880 Hz)
    await expect(page.getByTestId('playhead')).toContainText('/ 0:08.00');
    const out = await exportTo(page, 'buraco.mp4');
    const probe = JSON.parse(String(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', out]).stdout));
    expect(Number(probe.format.duration)).toBeGreaterThan(7.9); expect(Number(probe.format.duration)).toBeLessThan(8.2);
    const a = pcm(out);
    expect(a.length / 48000).toBeGreaterThan(7.85); expect(a.length / 48000).toBeLessThan(8.2);
    expect(Math.abs(freq(a, 1.5) - 440)).toBeLessThan(30);
    expect(rms(a, 3.3, 4.7)).toBeLessThan(30);          // silêncio no trecho sem áudio
    expect(Math.abs(freq(a, 6.5) - 880)).toBeLessThan(40);
  });

  test('zoom aumenta a largura dos clipes e a miniatura aparece', async ({ page }) => {
    await open(page, [fA]);
    await page.getByTestId('add-clip-0').click();
    const block = page.getByTestId('clip-block').first();
    const w1 = (await block.boundingBox())!.width;
    await page.getByTestId('zoom').fill('300');
    await expect.poll(async () => (await block.boundingBox())!.width).toBeGreaterThan(w1 * 1.5);
    await expect.poll(async () => await block.evaluate(e => getComputedStyle(e).backgroundImage), { timeout: 10_000 }).toContain('url(');
  });
});
