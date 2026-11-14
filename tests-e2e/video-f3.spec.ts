/**
 * Video Studio F3: transição, velocidade, fades, legendas SRT e forma de onda.
 * Valida os arquivos exportados com ffmpeg fora do navegador. Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 854, H = 480;
let dir = '';
let fRed = '', fBlue = '', srt = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-f3-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
  srt = join(dir, 'legenda.srt');
  writeFileSync(srt, '1\r\n00:00:00,500 --> 00:00:01,500\r\n<i>Primeira fala</i>\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nSegunda fala\r\n\r\nlixo\r\n');
});

const open = async (page: Page, files: string[]) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles(files);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(files.length);
};
async function exportTo(page: Page, name: string) {
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
const duration = (f: string) => Number(JSON.parse(String(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', f]).stdout)).format.duration);
const frame = (file: string, t: number): Buffer => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  expect(r.status, String(r.stderr)).toBe(0);
  expect(r.stdout.length).toBe(W * H * 3);
  return r.stdout;
};
const center = (b: Buffer) => { const o = (300 * W + 427) * 3; return [b[o], b[o + 1], b[o + 2]]; };
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
const pcm = (file: string) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  expect(r.status, String(r.stderr)).toBe(0);
  const u = new Uint8Array(r.stdout.length); u.set(r.stdout);
  return new Int16Array(u.buffer, 0, Math.floor(u.length / 2));
};
/** Energia da frequência `f` (Goertzel) numa janela de 0,2 s centrada em `c`. */
const energy = (a: Int16Array, c: number, f: number) => {
  const s = Math.round((c - 0.1) * 48000), n = 9600;
  const k = 2 * Math.cos((2 * Math.PI * f) / 48000);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s0 = a[s + i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
};
const rms = (a: Int16Array, t0: number, t1: number) => {
  let s = 0; const i0 = Math.round(t0 * 48000), i1 = Math.round(t1 * 48000);
  for (let i = i0; i < i1; i++) s += a[i] * a[i];
  return Math.sqrt(s / (i1 - i0));
};

test.describe('Video Studio F3', () => {
  test('transição de 1 s: imagem e som se fundem no meio, e a duração encurta', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();           // 4 s + 3 s
    await page.getByTestId('clip-block').nth(1).click();
    await page.getByTestId('transition').fill('1'); await page.getByTestId('transition').blur();
    await expect(page.getByTestId('playhead')).toContainText('/ 0:06.00'); // 7 s - 1 s de sobreposição
    const out = await exportTo(page, 'transicao.mp4');
    expect(duration(out)).toBeGreaterThan(5.9); expect(duration(out)).toBeLessThan(6.2);
    const [r1, , b1] = center(frame(out, 1.5));
    expect(r1).toBeGreaterThan(200); expect(b1).toBeLessThan(60);                  // só vermelho
    const [rm, , bm] = center(frame(out, 3.5));                                     // meio da fusão (3 a 4 s)
    expect(rm).toBeGreaterThan(70); expect(rm).toBeLessThan(190);
    expect(bm).toBeGreaterThan(70); expect(bm).toBeLessThan(190);                   // mistura dos dois
    const [r2, , b2] = center(frame(out, 5.0));
    expect(b2).toBeGreaterThan(200); expect(r2).toBeLessThan(60);                   // só azul
    const a = pcm(out);
    expect(energy(a, 1.5, 440)).toBeGreaterThan(energy(a, 1.5, 880) * 8);
    expect(energy(a, 3.5, 440)).toBeGreaterThan(energy(a, 1.5, 880) * 4);           // os dois tons presentes na fusão
    expect(energy(a, 3.5, 880)).toBeGreaterThan(energy(a, 1.5, 880) * 4);
    expect(energy(a, 5.0, 880)).toBeGreaterThan(energy(a, 5.0, 440) * 8);
  });

  test('velocidade 2×: o clipe dura metade, o tom sobe uma oitava e o rótulo mostra ×2', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('add-clip-0').click();           // vermelho 4 s a 2× = 2 s
    await page.getByTestId('add-clip-1').click();           // azul 3 s
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('speed').selectOption('2');
    await expect(page.getByTestId('playhead')).toContainText('/ 0:05.00');
    await expect(page.getByTestId('clip-block').first()).toContainText('×2');
    const out = await exportTo(page, 'veloz.mp4');
    expect(duration(out)).toBeGreaterThan(4.9); expect(duration(out)).toBeLessThan(5.2);
    expect(center(frame(out, 1.0))[0]).toBeGreaterThan(200);   // ainda vermelho em 1 s
    expect(center(frame(out, 2.5))[2]).toBeGreaterThan(200);   // azul a partir de 2 s
    const a = pcm(out);
    expect(energy(a, 1.0, 880)).toBeGreaterThan(energy(a, 1.0, 440) * 8); // 440 Hz a 2× vira 880 Hz
  });

  test('entrada e saída graduais: imagem vem do preto e o som sobe', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fRed]);
    await page.getByTestId('add-clip-0').click();           // vermelho 4 s
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('fade-in').fill('1'); await page.getByTestId('fade-in').blur();
    await page.getByTestId('fade-out').fill('1'); await page.getByTestId('fade-out').blur();
    const out = await exportTo(page, 'fade.mp4');
    const red = (t: number) => center(frame(out, t))[0];
    expect(red(0.05)).toBeLessThan(60);                         // quase preto
    expect(red(0.5)).toBeGreaterThan(80); expect(red(0.5)).toBeLessThan(200); // no meio da rampa
    expect(red(2.0)).toBeGreaterThan(220);                      // pleno
    expect(red(3.5)).toBeGreaterThan(80); expect(red(3.5)).toBeLessThan(200); // descendo
    const a = pcm(out);
    expect(rms(a, 0.0, 0.25)).toBeLessThan(rms(a, 1.5, 2.5) * 0.45);
    expect(rms(a, 3.75, 4.0)).toBeLessThan(rms(a, 1.5, 2.5) * 0.45);
  });

  test('legendas SRT: cada fala aparece só no seu intervalo; bloco inválido é ignorado e avisado', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page, [fBlue]);
    await page.getByTestId('add-clip-0').click();           // azul 3 s
    await page.getByTestId('srt-input').setInputFiles(srt);
    await expect(page.getByTestId('video-message')).toContainText('2 legenda');
    await expect(page.getByTestId('video-message')).toContainText('1 bloco');
    await expect(page.getByTestId('chat-block')).toHaveCount(2);
    const out = await exportTo(page, 'legenda.mp4');
    const sub = (t: number) => lumaStd(region(frame(out, t), 200, 400, 454, 70));
    expect(sub(1.0)).toBeGreaterThan(15);                       // 1ª fala
    expect(sub(2.5)).toBeGreaterThan(15);                       // 2ª fala
    expect(sub(0.2)).toBeLessThan(6); expect(sub(1.75)).toBeLessThan(6); expect(sub(1.6)).toBeLessThan(6); // a 2ª fala vai até 3,0 s, então 2,95 s ainda tem legenda
  });

  test('forma de onda aparece no clipe com áudio e o preview toca com transição e velocidade', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page, [fRed, fBlue]);
    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();
    await expect.poll(async () => page.getByTestId('waveform').first().evaluate((cv: HTMLCanvasElement) => {
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
      return false;
    }), { timeout: 15_000 }).toBe(true);
    await page.getByTestId('clip-block').nth(1).click();
    await page.getByTestId('transition').fill('0.5'); await page.getByTestId('transition').blur();
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('speed').selectOption('1.5');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('audio-status')).toContainText('trechos', { timeout: 10_000 });
  });
});
