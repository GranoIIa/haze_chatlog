/**
 * Video Studio (POC): monta um vídeo real no navegador (importar, cortar, dividir, reorganizar,
 * chat sincronizado), exporta e valida o ARQUIVO com ffprobe/ffmpeg fora do navegador.
 * Requer ffmpeg/ffprobe no PATH (falha explicitamente se não houver; nunca pula em silêncio).
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 1280, H = 720;
let dir = '';
let fileA = '', fileB = '', bad = '';

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { maxBuffer: 1 << 28 });
  if (r.error) throw new Error(`${cmd} indisponível: ${r.error.message}`);
  return r;
};

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-video-'));
  const mk = (out: string, color: string, hz: number, secs: number) => {
    const r = run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`,
      '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
    expect(r.status, String(r.stderr)).toBe(0);
  };
  fileA = join(dir, 'a-vermelho-440.mp4'); mk(fileA, 'red', 440, 4);
  fileB = join(dir, 'b-azul-880.mp4'); mk(fileB, 'blue', 880, 3);
  bad = join(dir, 'corrompido.mp4'); writeFileSync(bad, Buffer.from('isto nao e um video de verdade'.repeat(50)));
});

const openStudio = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await expect(page.getByTestId('video-studio')).toBeVisible();
};

const frameRGB = (file: string, t: number): Buffer => {
  const r = run('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  expect(r.status, String(r.stderr)).toBe(0);
  expect(r.stdout.length).toBe(W * H * 3);
  return r.stdout;
};
const px = (b: Buffer, x: number, y: number) => { const o = (y * W + x) * 3; return [b[o], b[o + 1], b[o + 2]]; };
const dom = (rgb: number[]) => (rgb[0] > 150 && rgb[2] < 90 ? 'red' : rgb[2] > 150 && rgb[0] < 90 ? 'blue' : 'other');
/** Desvio-padrão da luminância numa região (texto desenhado = variação alta). */
const regionStd = (b: Buffer, x0: number, y0: number, w: number, h: number) => {
  const v: number[] = [];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const [r, g, bl] = px(b, x, y); v.push(0.3 * r + 0.59 * g + 0.11 * bl); }
  const m = v.reduce((a, c) => a + c, 0) / v.length;
  return Math.sqrt(v.reduce((a, c) => a + (c - m) ** 2, 0) / v.length);
};
const pcm = (file: string): Int16Array => {
  const r = run('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-']);
  expect(r.status, String(r.stderr)).toBe(0);
  const b = r.stdout;
  const copy = new Uint8Array(b.length); copy.set(b);
  return new Int16Array(copy.buffer, 0, Math.floor(copy.length / 2));
};
const freqAt = (a: Int16Array, center: number, win = 0.2) => {
  const s = Math.round((center - win / 2) * 48000), e = Math.round((center + win / 2) * 48000);
  let z = 0; for (let i = s + 1; i < e; i++) if ((a[i - 1] < 0) !== (a[i] < 0)) z++;
  return z / 2 / win;
};

test.describe('Video Studio (POC)', () => {
  test('monta, exporta e o arquivo bate com a edição (cor, áudio, duração, resolução, chat)', async ({ page }) => {
    test.setTimeout(180_000);
    await openStudio(page);
    await page.getByTestId('video-file-input').setInputFiles([fileA, fileB]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);

    await page.getByTestId('add-clip-0').click();
    await page.getByTestId('add-clip-1').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(2);
    await expect(page.getByTestId('playhead')).toContainText('/ 0:07.00');

    // cortar o clipe A para 1s..3s (2 s)
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('trim-in').fill('1'); await page.getByTestId('trim-in').blur();
    await page.getByTestId('trim-out').fill('3'); await page.getByTestId('trim-out').blur();
    await expect(page.getByTestId('playhead')).toContainText('/ 0:05.00');

    // dividir B em t=3.5 (B começa em 2.0, então o corte fica em 1.5 s da mídia)
    await page.getByTestId('playhead-input').fill('3.5');
    await page.getByTestId('split').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(3);

    // reorganizar: A passa para depois do primeiro pedaço de B, ficando B1, A, B2
    await page.getByTestId('clip-block').first().click();
    await page.getByTestId('move-right').click();
    await expect(page.getByTestId('playhead')).toContainText('/ 0:05.00');

    // chat de 2 s a 4 s
    await page.getByTestId('chat-start').fill('2');
    await page.getByTestId('chat-duration').fill('2');
    await page.getByTestId('chat-add').click();
    await expect(page.getByTestId('chat-block')).toHaveCount(1);

    // desfazer/refazer não quebra
    await page.getByTestId('undo').click();
    await expect(page.getByTestId('chat-block')).toHaveCount(0);
    await page.getByTestId('redo').click();
    await expect(page.getByTestId('chat-block')).toHaveCount(1);

    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 120_000 });
    const info = await page.getByTestId('export-result').getByTestId('export-info').innerText();
    console.log('EXPORT INFO:', info);
    const dlPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByTestId('export-download').click();
    const out = join(dir, 'saida.' + (info.startsWith('MP4') ? 'mp4' : 'webm'));
    await (await dlPromise).saveAs(out);

    // ---- validação FORA do navegador
    const probe = JSON.parse(String(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out]).stdout));
    const v = probe.streams.find((s: any) => s.codec_type === 'video');
    const a = probe.streams.find((s: any) => s.codec_type === 'audio');
    console.log('FFPROBE:', JSON.stringify({ fmt: probe.format.format_name, dur: probe.format.duration, v: [v.codec_name, v.width, v.height, v.r_frame_rate, v.nb_frames], a: [a?.codec_name, a?.sample_rate, a?.channels, a?.duration] }));
    expect(v.width).toBe(W); expect(v.height).toBe(H);
    expect(v.r_frame_rate).toBe('30/1');
    if (out.endsWith('.mp4')) { expect(v.codec_name).toBe('h264'); expect(a.codec_name).toBe('aac'); }
    expect(Number(probe.format.duration)).toBeGreaterThan(4.9); expect(Number(probe.format.duration)).toBeLessThan(5.1);
    expect(a).toBeTruthy(); expect(Number(a.duration)).toBeGreaterThan(4.85); expect(Number(a.duration)).toBeLessThan(5.15);
    if (v.nb_frames) expect(Math.abs(Number(v.nb_frames) - 150)).toBeLessThanOrEqual(1);
    const dec = run('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-']);
    expect(String(dec.stderr).trim(), 'decodificação completa sem erros').toBe('');

    // ordem dos quadros: B1 (azul) 0 a 1.5, A (vermelho) 1.5 a 3.5, B2 (azul) 3.5 a 5
    const f = (t: number) => frameRGB(out, t);
    expect(dom(px(f(0.5), 640, 500))).toBe('blue');
    expect(dom(px(f(1.3), 640, 500))).toBe('blue');
    expect(dom(px(f(1.7), 640, 500))).toBe('red');
    expect(dom(px(f(3.3), 640, 500))).toBe('red');
    expect(dom(px(f(3.7), 640, 500))).toBe('blue');
    expect(dom(px(f(4.8), 640, 500))).toBe('blue');

    // chat: aparece só entre 2 e 4 s (canto superior esquerdo: texto desenhado = variação alta)
    const sBefore = regionStd(f(1.7), 24, 24, 400, 60);
    const sDuring = regionStd(f(3.0), 24, 24, 400, 60);
    const sAfter = regionStd(f(4.5), 24, 24, 400, 60);
    console.log('CHAT STD antes/durante/depois:', sBefore.toFixed(1), sDuring.toFixed(1), sAfter.toFixed(1));
    expect(sDuring).toBeGreaterThan(sBefore + 15);
    expect(sDuring).toBeGreaterThan(sAfter + 15);

    // áudio por segmento: 880 Hz, 440 Hz, 880 Hz
    const pc = pcm(out);
    const f1 = freqAt(pc, 0.75), f2 = freqAt(pc, 2.5), f3 = freqAt(pc, 4.25);
    console.log('FREQ:', f1, f2, f3);
    expect(Math.abs(f1 - 880)).toBeLessThan(40); expect(Math.abs(f2 - 440)).toBeLessThan(30); expect(Math.abs(f3 - 880)).toBeLessThan(40);

    // sincronia: a troca de imagem (azul para vermelho) e a de tom (880 para 440) ocorrem juntas, perto de 1.5 s
    const videoFlip = [1.40, 1.44, 1.48, 1.52, 1.56, 1.60].find(t => dom(px(f(t), 640, 500)) === 'red');
    let audioFlip = -1;
    for (let t = 1.30; t <= 1.70; t += 0.02) if (Math.abs(freqAt(pc, t, 0.04) - 440) < 90) { audioFlip = t; break; }
    console.log('SYNC video:', videoFlip, 'audio:', audioFlip.toFixed(2));
    expect(videoFlip).toBeDefined();
    expect(Math.abs(videoFlip! - audioFlip)).toBeLessThan(0.1);
    expect(Math.abs(audioFlip - 1.5)).toBeLessThan(0.1);
  });

  test('cancelar a exportação não gera arquivo e permite exportar de novo', async ({ page }) => {
    test.setTimeout(240_000);
    await openStudio(page);
    await page.getByTestId('video-file-input').setInputFiles([fileA]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    for (let i = 0; i < 6; i++) await page.getByTestId('add-clip-0').click(); // 24 s
    await page.getByTestId('export-size').selectOption({ label: '1920×1080' });
    await page.getByTestId('export-fps').selectOption('60');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-cancel')).toBeVisible();
    await expect(page.getByTestId('export-status')).toContainText('%');
    await page.getByTestId('export-cancel').click();
    await expect(page.getByTestId('video-message')).toContainText('cancelada', { timeout: 30_000 });
    await expect(page.getByTestId('export-result')).toHaveCount(0);
    await expect(page.getByTestId('export')).toBeEnabled();
    // exportar de novo (menor) funciona
    await page.getByTestId('export-size').selectOption({ label: '854×480' });
    await page.getByTestId('export-fps').selectOption('24');
    await page.getByTestId('export').click();
    await expect(page.getByTestId('export-result').getByTestId('export-info')).toBeVisible({ timeout: 180_000 });
  });

  test('arquivo inválido gera mensagem compreensível e não derruba a biblioteca', async ({ page }) => {
    await openStudio(page);
    await page.getByTestId('video-file-input').setInputFiles([fileB, bad]);
    await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('video-message')).toContainText('corrompido.mp4');
    await page.getByTestId('add-clip-0').click();
    await expect(page.getByTestId('clip-block')).toHaveCount(1);
  });

  test('exportar com a timeline vazia fica desabilitado', async ({ page }) => {
    await openStudio(page);
    await expect(page.getByTestId('export')).toBeDisabled();
  });
});
