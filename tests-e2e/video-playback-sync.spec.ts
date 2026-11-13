/**
 * Video Studio: o que o preview MOSTRA durante a reprodução bate com o que a timeline diz no mesmo instante.
 * Dois clipes bem diferentes (testsrc2 12 s, smptebars 8 s, GOP longo). Requer ffmpeg no PATH.
 */
import { test, expect, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let A = '', B = '';
test.beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'haze-sync-'));
  A = join(dir, 'a.mp4'); B = join(dir, 'b.mp4');
  const mk = (out: string, src: string, hz: number, d: number) => {
    const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', `${src}=s=1280x720:r=30:d=${d}`, '-f', 'lavfi', '-i', `sine=f=${hz}:r=48000:d=${d}`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-g', '9999', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out], { maxBuffer: 1 << 26 });
    expect(r.status, String(r.stderr)).toBe(0);
  };
  mk(A, 'testsrc2', 440, 12); mk(B, 'smptebars', 880, 8);
});

/** Assinatura 8x8 de médias de cinza do canvas. */
const grid = (page: Page) => page.evaluate(() => {
  const c = document.querySelector('[data-testid="video-preview"]') as HTMLCanvasElement;
  const g = document.createElement('canvas'); g.width = 8; g.height = 8;
  g.getContext('2d')!.drawImage(c, 0, 0, 8, 8);
  const d = g.getContext('2d')!.getImageData(0, 0, 8, 8).data; const o: number[] = [];
  for (let i = 0; i < d.length; i += 4) o.push((d[i] + d[i + 1] + d[i + 2]) / 3);
  return o;
});
const dist = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
const secs = async (page: Page) => { const m = (await page.getByTestId('playhead').innerText()).match(/^(\d+):(\d+\.\d+)/)!; return +m[1] * 60 + +m[2]; };
const seek = async (page: Page, s: number) => { await page.getByTestId('playhead-input').fill(String(s)); await page.waitForTimeout(700); };

test('durante a reprodução a imagem corresponde ao clipe do instante (sem congelar nem trocar fora de hora)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/'); await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles([A, B]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);
  await page.getByTestId('add-clip-0').click(); await page.getByTestId('add-clip-1').click();
  await page.waitForTimeout(800);
  await seek(page, 3); const refA = await grid(page);
  await seek(page, 15); const refB = await grid(page);
  expect(dist(refA, refB)).toBeGreaterThan(8); // as referências são distinguíveis
  await seek(page, 9.5);
  await page.getByTestId('play').click();
  const rows: Array<{ t: number; who: string; d: number }> = []; const sigs = new Set<string>();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const t = await secs(page); const g = await grid(page);
    const dA = dist(g, refA), dB = dist(g, refB);
    sigs.add(g.map(v => Math.round(v / 4)).join(','));
    rows.push({ t, who: dA < dB ? 'A' : 'B', d: Math.min(dA, dB) });
  }
  await page.getByTestId('play').click();
  console.log('SYNC', JSON.stringify(rows.filter((_, i) => i % 4 === 0)));
  // o playhead andou e passou da emenda (12 s)
  expect(rows[rows.length - 1].t).toBeGreaterThan(12.5);
  // antes da emenda (com folga de 0,4 s) mostra A; depois dela, B
  for (const r of rows) {
    if (r.t < 11.6) expect(r.who, `t=${r.t}`).toBe('A');
    if (r.t > 12.4) expect(r.who, `t=${r.t}`).toBe('B');
  }
  expect(sigs.size).toBeGreaterThan(5);
});

test('tocar a partir do meio, pausar e retomar continua de onde parou', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/'); await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles([A]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(1);
  await page.getByTestId('add-clip-0').click(); await page.waitForTimeout(600);
  await seek(page, 5);
  await page.getByTestId('play').click(); await page.waitForTimeout(1200);
  await page.getByTestId('play').click(); await page.waitForTimeout(300);
  const t1 = await secs(page);
  expect(t1).toBeGreaterThan(5.5); expect(t1).toBeLessThan(7.5);
  await page.getByTestId('play').click(); await page.waitForTimeout(1000);
  const t2 = await secs(page); await page.getByTestId('play').click();
  expect(t2).toBeGreaterThan(t1 + 0.5);
});

test('a timeline ocupa a largura do painel e mostra a montagem inteira (sem rolar)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/'); await page.getByTestId('tab-video').click();
  await page.getByTestId('video-file-input').setInputFiles([A, B]);
  await expect(page.getByTestId('video-library').locator('li')).toHaveCount(2);
  await page.getByTestId('add-clip-0').click(); await page.getByTestId('add-clip-1').click();
  await page.waitForTimeout(800);
  const m = await page.evaluate(() => {
    const wrap = document.querySelector('[data-testid="timeline"]')!.getBoundingClientRect();
    const ed = document.querySelector('.timeline-editor')!.getBoundingClientRect();
    const bs = [...document.querySelectorAll('[data-testid="clip-block"]')].map(e => e.getBoundingClientRect());
    return { wrapW: wrap.width, edW: ed.width, edH: ed.height, last: bs[bs.length - 1].right, edRight: ed.right, n: bs.length };
  });
  expect(m.edW).toBeGreaterThan(m.wrapW - 40);   // não fica preso nos 600 px padrão da biblioteca
  expect(m.edH).toBeLessThan(200);               // nem em 600 px de altura vazia
  expect(m.n).toBe(2);
  expect(m.last).toBeLessThanOrEqual(m.edRight + 1); // o segundo clipe está visível sem rolagem
  // "Ajustar" refaz o encaixe depois de mexer no zoom
  await page.getByTestId('zoom').fill('200');
  await page.getByTestId('zoom-fit').click();
  const after = await page.evaluate(() => { const bs = [...document.querySelectorAll('[data-testid="clip-block"]')].map(e => e.getBoundingClientRect()); return { last: bs[1].right, edRight: document.querySelector('.timeline-editor')!.getBoundingClientRect().right }; });
  expect(after.last).toBeLessThanOrEqual(after.edRight + 1);
});
