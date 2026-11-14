/**
 * Video Studio: trilha de sobreposição (picture-in-picture) e keyframes.
 * Valida os arquivos exportados com ffmpeg fora do navegador. Requer ffmpeg/ffprobe no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = 854, H = 480;
let dir = '';
let fRed = '', fBlue = '';
const ff = (args: string[]) => {
  const r = spawnSync('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`ffmpeg indisponível: ${r.error.message}`);
  expect(r.status, String(r.stderr)).toBe(0);
};
test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'haze-lay-'));
  const mk = (out: string, color: string, hz: number, secs: number) =>
    ff(['-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${secs}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${secs}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
  fRed = join(dir, 'vermelho.mp4'); mk(fRed, 'red', 440, 4);
  fBlue = join(dir, 'azul.mp4'); mk(fBlue, 'blue', 880, 3);
});

const open = async (page: Page) => {
  await page.goto('/');
  await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);
  await page.getByTestId('add-clip-0').click(); // principal: vermelho 4 s
};
const goTo = async (page: Page, t: number) => { await page.getByTestId('playhead-input').fill(String(t)); };
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
const frame = (file: string, t: number): Buffer => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  expect(r.status, String(r.stderr)).toBe(0);
  expect(r.stdout.length).toBe(W * H * 3);
  return r.stdout;
};
const px = (b: Buffer, x: number, y: number) => { const o = (Math.round(y) * W + Math.round(x)) * 3; return [b[o], b[o + 1], b[o + 2]]; };
const isBlue = (c: number[]) => c[2] > 170 && c[0] < 90;
const isRed = (c: number[]) => c[0] > 170 && c[2] < 90;
const duration = (f: string) => Number(JSON.parse(String(spawnSync('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', f]).stdout)).format.duration);
const pcm = (file: string) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  expect(r.status, String(r.stderr)).toBe(0);
  const u = new Uint8Array(r.stdout.length); u.set(r.stdout);
  return new Int16Array(u.buffer, 0, Math.floor(u.length / 2));
};
const energy = (a: Int16Array, c: number, f: number) => {
  const s = Math.round((c - 0.1) * 48000), n = 9600;
  const k = 2 * Math.cos((2 * Math.PI * f) / 48000);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s0 = a[s + i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / n;
};

test.describe('Video Studio: sobreposição e keyframes', () => {
  test('picture-in-picture: o vídeo sobreposto aparece no canto, só no seu intervalo, com o som dele', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();                  // azul 3 s a partir de 1 s, canto superior direito
    await expect(page.getByTestId('layer-block')).toHaveCount(1);
    await expect(page.getByTestId('layer-inspector')).toBeVisible();
    await expect(page.getByTestId('playhead')).toContainText('/ 0:04.00');
    const out = await exportTo(page, 'pip.mp4');
    expect(duration(out)).toBeGreaterThan(3.9); expect(duration(out)).toBeLessThan(4.2);
    // camada: centro (0,75 · 0,25), escala 0,3 → caixa de ~256x144 em torno de (640,120)
    expect(isBlue(px(frame(out, 2.0), 640, 120))).toBe(true);        // dentro do intervalo
    expect(isBlue(px(frame(out, 2.0), 530, 60))).toBe(true);         // perto do canto da caixa
    expect(isRed(px(frame(out, 2.0), 480, 60))).toBe(true);          // fora da caixa: vídeo principal
    expect(isRed(px(frame(out, 2.0), 427, 300))).toBe(true);         // meio do quadro continua principal
    expect(isRed(px(frame(out, 0.5), 640, 120))).toBe(true);         // antes da camada começar
    const a = pcm(out);
    expect(energy(a, 2.0, 880)).toBeGreaterThan(energy(a, 0.5, 880) * 6 + 1e-3); // som da camada só no intervalo
    expect(energy(a, 0.5, 440)).toBeGreaterThan(0.001);                          // som do principal continua
  });

  test('keyframes de posição: a caixa atravessa o quadro e passa pelo meio no meio do trajeto', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();
    await goTo(page, 1);                                             // início da camada
    await page.getByTestId('layer-x').fill('0.25'); await page.getByTestId('kf-add').click();
    await goTo(page, 3);                                             // 2 s depois
    await page.getByTestId('layer-x').fill('0.75'); await page.getByTestId('kf-add').click();
    await expect(page.getByTestId('kf-list').locator('li')).toHaveCount(2);
    const out = await exportTo(page, 'kf-pos.mp4');
    expect(isBlue(px(frame(out, 1.1), 213, 120))).toBe(true);        // começa à esquerda (0,25)
    expect(isRed(px(frame(out, 1.1), 640, 120))).toBe(true);
    expect(isBlue(px(frame(out, 2.0), 427, 120))).toBe(true);        // meio do trajeto: no centro
    expect(isRed(px(frame(out, 2.0), 213 - 40, 120)) || isRed(px(frame(out, 2.0), 700, 120))).toBe(true);
    expect(isBlue(px(frame(out, 3.3), 640, 120))).toBe(true);        // termina à direita (0,75)
    expect(isRed(px(frame(out, 3.3), 213, 120))).toBe(true);
  });

  test('keyframes de opacidade: a camada surge aos poucos', async ({ page }) => {
    test.setTimeout(120_000);
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();
    await goTo(page, 1);
    await page.getByTestId('layer-opacity').fill('0'); await page.getByTestId('kf-add').click();
    await goTo(page, 3);
    await page.getByTestId('layer-opacity').fill('1'); await page.getByTestId('kf-add').click();
    const out = await exportTo(page, 'kf-op.mp4');
    const early = px(frame(out, 1.1), 640, 120), mid = px(frame(out, 2.0), 640, 120), late = px(frame(out, 3.4), 640, 120);
    expect(isRed(early)).toBe(true);                                 // quase invisível
    expect(mid[0]).toBeGreaterThan(70); expect(mid[0]).toBeLessThan(190);
    expect(mid[2]).toBeGreaterThan(70); expect(mid[2]).toBeLessThan(190); // mistura vermelho e azul
    expect(isBlue(late)).toBe(true);
  });

  test('remover keyframe volta ao valor fixo; remover a camada tira ela do vídeo', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();
    await goTo(page, 1);
    await page.getByTestId('kf-add').click();
    await expect(page.getByTestId('kf-list').locator('li')).toHaveCount(1);
    await page.getByTestId('kf-remove-0').click();
    await expect(page.getByTestId('kf-list')).toHaveCount(0);
    await page.getByTestId('layer-remove').click();
    await expect(page.getByTestId('layer-block')).toHaveCount(0);
    await expect(page.getByTestId('playhead')).toContainText('/ 0:04.00');
  });

  test('arrastar o bloco da camada na timeline muda o início dela', async ({ page }) => {
    test.setTimeout(60_000);
    await open(page);
    await goTo(page, 0);
    await page.getByTestId('add-layer-1').click();                   // começa em 0 s
    const blk = page.getByTestId('layer-block');
    const b = (await blk.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2, { steps: 6 });
    await page.mouse.move(b.x + b.width / 2 + 140, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId('layer-inspector')).toContainText(/começa em 0:0[1-2]/); // ~140 px a 140 px/s = ~1 s
  });

  test('preview mostra a camada sobreposta no instante certo', async ({ page }) => {
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();
    await goTo(page, 2);
    const blueAt = async () => page.getByTestId('video-preview').evaluate((cv: HTMLCanvasElement) => {
      const d = cv.getContext('2d')!.getImageData(Math.round(cv.width * 0.75), Math.round(cv.height * 0.25), 1, 1).data;
      return d[2] > 170 && d[0] < 90;
    });
    await expect.poll(blueAt, { timeout: 10_000 }).toBe(true);
    await goTo(page, 0.5);
    await expect.poll(blueAt, { timeout: 10_000 }).toBe(false);
  });

  test('projeto com camada: salvar, abrir em sessão nova, reconectar as duas mídias e exportar', async ({ page }) => {
    test.setTimeout(150_000);
    await open(page);
    await goTo(page, 1);
    await page.getByTestId('add-layer-1').click();
    await goTo(page, 1);
    await page.getByTestId('layer-x').fill('0.25'); await page.getByTestId('kf-add').click();
    await goTo(page, 3);
    await page.getByTestId('layer-x').fill('0.75'); await page.getByTestId('kf-add').click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByTestId('project-save').click()
    ]);
    const saved = join(dir, 'pip.haze');
    await download.saveAs(saved);

    await page.goto('/');
    await page.getByTestId('tab-video').click();
    await page.getByTestId('project-open-input').setInputFiles(saved);
    await expect(page.getByTestId('pending-media')).toContainText('azul.mp4');
    await expect(page.getByTestId('layer-block')).toHaveCount(1);
    await page.getByTestId('video-file-input').setInputFiles([fRed, fBlue]);
    await expect(page.getByTestId('pending-media')).toHaveCount(0);
    await page.getByTestId('layer-block').click();
    await expect(page.getByTestId('kf-list').locator('li')).toHaveCount(2);   // keyframes sobreviveram
    const out = await exportTo(page, 'pip-reaberto.mp4');
    expect(isBlue(px(frame(out, 2.0), 427, 120))).toBe(true);
  });
});
