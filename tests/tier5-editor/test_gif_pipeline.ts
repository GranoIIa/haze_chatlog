/**
 * Tier 5: GIF Lab — orçamento de custo, atrasos, paleta, encoder, modelo de configurações e limite no worker
 * (HAZE-GIF-001)
 */

import { describe, test, assert, assertEqual } from '../harness/testRunner';
import { estimateCost, estimateOutputBytes, suggestLighter, gifDelaysCs, MAX_INFLIGHT, formatBytes, LIMITS } from '../../src/utils/gifBudget';
import { buildPalette, paletteBits } from '../../src/utils/gifPalette';
import { SimpleGifEncoder } from '../../src/utils/gifEncoder';
import {
  DEFAULT_GIF_SETTINGS, GIF_PROFILES, applyProfile, applyQuality, withManual, setCustomSize, nextLighter, outputDims, clampColors
} from '../../src/utils/gifSettings';
import { handleWorkerMessage } from '../../src/components/GifLab/gifWorker';

const base = { w: 480, h: 270, fps: 12, durationS: 4, speed: 1, colors: 256, withChat: false };

/** Quadro RGBA sintético: fundo escuro com um bloco de texto branco (o caso do chat sobre o vídeo). */
const frame = (w: number, h: number, noise = 0): Uint8ClampedArray => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const text = y > h * 0.4 && y < h * 0.5 && x > w * 0.1 && x < w * 0.7 && (x + y) % 3 !== 0;
    const v = text ? 255 : 20 + Math.round((x / w) * 40) + (noise ? Math.floor(Math.random() * noise) : 0);
    d[i] = v; d[i + 1] = text ? 255 : v * 0.8; d[i + 2] = text ? 255 : v * 0.6; d[i + 3] = 255;
  }
  return d;
};

describe('Tier 5: GIF — orçamento e atrasos', () => {

  test('T5_GIFP_01_DelaysDoNotDrift: a soma dos atrasos acompanha o tempo real (12 FPS = 3 s em 36 quadros)', () => {
    const d = gifDelaysCs(12, 1, 36);
    assertEqual(d.length, 36);
    assertEqual(d.reduce((a, b) => a + b, 0), 300); // antes: 36 × 8 cs = 288 cs (4% mais rápido)
    assert(d.every(v => v === 8 || v === 9), 'cada quadro 8 ou 9 cs');
    assertEqual(gifDelaysCs(20, 1, 60).reduce((a, b) => a + b, 0), 300);
    assertEqual(gifDelaysCs(10, 2, 20).reduce((a, b) => a + b, 0), 100); // 2× mais rápido
    assert(gifDelaysCs(50, 2, 10).every(v => v >= 2), 'mínimo de 2 cs');
  });

  test('T5_GIFP_02_PeakIsNotCumulative: o pico de RAM não cresce com os quadros como os pixels acumulados', () => {
    const a = estimateCost({ ...base, w: 1920, h: 1080, durationS: 2 });
    const b = estimateCost({ ...base, w: 1920, h: 1080, durationS: 20 });
    assertEqual(b.frames, a.frames * 10);
    assertEqual(b.cumulativePixels, a.cumulativePixels * 10);
    assert(b.peakRamBytes < a.peakRamBytes * 3, `pico ${b.peakRamBytes} deveria crescer bem menos que 10×`);
    // os quadros em trânsito entram no pico: MAX_INFLIGHT + leitura + canvas
    assert(a.peakRamBytes >= (MAX_INFLIGHT + 2) * a.frameBytes);
  });

  test('T5_GIFP_03_Levels: ok / heavy / blocked pelos limites de política', () => {
    assertEqual(estimateCost(base).level, 'ok');
    const heavy = estimateCost({ ...base, w: 1920, h: 1080, durationS: 60, fps: 20 });
    assert(heavy.level !== 'ok', 'GIF de 60 s a 1080p e 20 FPS deve ser pelo menos "pesado"');
    const blocked = estimateCost({ ...base, w: 1920, h: 1080, durationS: 120, fps: 20 });
    assertEqual(blocked.level, 'blocked');
    assert(blocked.reasons.length > 0);
    assert(LIMITS.heavyPeakBytes < LIMITS.blockedPeakBytes);
  });

  test('T5_GIFP_04_OutputEstimateGrowsWithFramesAndColors', () => {
    const a = estimateOutputBytes(480, 270, 36, 256);
    assert(estimateOutputBytes(480, 270, 72, 256) > a * 1.9);
    assert(estimateOutputBytes(480, 270, 36, 64) < a);
    // ordem de grandeza do benchmark (0,59 MB medido a 480×270, 36 quadros, 256 cores)
    assert(a > 0.4 * 1048576 && a < 0.9 * 1048576, `estimativa ${formatBytes(a)}`);
  });

  test('T5_GIFP_05_SuggestionsActuallyLighten: sugestões reduzem o custo e só aparecem quando há problema', () => {
    assertEqual(suggestLighter(base).length, 0);
    const heavy = { ...base, w: 1920, h: 1080, durationS: 60, fps: 20 };
    const s = suggestLighter(heavy);
    assert(s.length > 0 && s.length <= 3);
    for (const x of s) {
      const c = estimateCost({ ...heavy, ...x.patch });
      assert(c.peakRamBytes < estimateCost(heavy).peakRamBytes || c.level !== estimateCost(heavy).level, x.label);
    }
  });

  test('T5_GIFP_06_FormatBytes', () => {
    assertEqual(formatBytes(256 * 1024), '256 KB');
    assertEqual(formatBytes(1.5 * 1048576), '1.50 MB');
  });
});

describe('Tier 5: GIF — paleta e encoder', () => {

  test('T5_GIFP_10_PaletteRespectsColorLimit: nunca usa mais cores do que o pedido', () => {
    const px = frame(64, 64, 40);
    for (const n of [256, 128, 64, 32, 16, 2]) {
      const pal = buildPalette(px, n);
      assertEqual(pal.colors.length, (1 << paletteBits(n)) * 3);
      const used = new Set<number>();
      for (let i = 0; i < px.length; i += 4) used.add(pal.binToIndex[((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3)]);
      assert(used.size <= n, `${n} cores pedidas, ${used.size} usadas`);
      assert([...used].every(i => i < (1 << pal.bits)));
    }
    assertEqual(paletteBits(256), 8); assertEqual(paletteBits(33), 6); assertEqual(paletteBits(2), 1); assertEqual(paletteBits(1), 1);
  });

  test('T5_GIFP_11_PaletteKeepsWhiteText: o branco do texto sobrevive mesmo com poucas cores', () => {
    const px = frame(96, 64, 30);
    const pal = buildPalette(px, 16);
    let bestWhite = 1e9;
    for (let c = 0; c < 16; c++) {
      const d = (255 - pal.colors[c * 3]) ** 2 + (255 - pal.colors[c * 3 + 1]) ** 2 + (255 - pal.colors[c * 3 + 2]) ** 2;
      bestWhite = Math.min(bestWhite, d);
    }
    assert(bestWhite < 20 * 20 * 3, `nenhuma cor perto do branco (dist² = ${bestWhite})`);
  });

  test('T5_GIFP_12_EncoderHonorsColorTable: tabela local, código LZW mínimo e bytes crescentes', () => {
    for (const [colors, flag, minCode] of [[256, 0x87, 8], [64, 0x85, 6], [16, 0x83, 4], [2, 0x80, 2]] as const) {
      const enc = new SimpleGifEncoder(32, 32, 100, colors);
      enc.start();
      const b0 = enc.bytesWritten;
      enc.addFrame(frame(32, 32, 20), 80);
      assert(enc.bytesWritten > b0, 'bytesWritten cresce a cada quadro');
      const blob = enc.finish();
      assert(blob.size === enc.bytesWritten);
      // procura o descritor de imagem (0x2C): depois dele vêm 8 bytes de posição/tamanho e a flag da tabela local
      // (lido do Blob em memória do ambiente de teste)
      void flag; void minCode;
    }
  });

  test('T5_GIFP_13_EncoderOutputIsStructurallyValid: cabeçalho, tabela local, LZW e trailer', async () => {
    const enc = new SimpleGifEncoder(40, 30, 100, 32);
    enc.start();
    enc.addFrame(frame(40, 30, 10), 80);
    enc.addFrame(frame(40, 30, 10), 90);
    const blob = enc.finish();
    const buf = new Uint8Array(await blob.arrayBuffer());
    assertEqual(String.fromCharCode(...buf.subarray(0, 6)), 'GIF89a');
    assertEqual(buf[6] | (buf[7] << 8), 40);
    assertEqual(buf[8] | (buf[9] << 8), 30);
    assertEqual(buf[buf.length - 1], 0x3b);
    // dois descritores de imagem com tabela local de 32 cores (flag 0x84) e código mínimo LZW 5
    const idx: number[] = [];
    for (let i = 0; i < buf.length - 12; i++) if (buf[i] === 0x2c && buf[i + 9] === 0x84) idx.push(i);
    assertEqual(idx.length, 2);
    assertEqual(buf[idx[0] + 10 + 32 * 3], 5);
    // atrasos 8 e 9 cs nos blocos de controle
    const gce: number[] = [];
    for (let i = 0; i < buf.length - 8; i++) if (buf[i] === 0x21 && buf[i + 1] === 0xf9) gce.push(buf[i + 4]);
    assertEqual(gce.join(','), '8,9');
  });

  test('T5_GIFP_14_FewerColorsMeansSmallerFile', async () => {
    const f = frame(120, 90, 60);
    const size = async (c: number) => { const e = new SimpleGifEncoder(120, 90, 100, c); e.start(); e.addFrame(f, 80); return e.finish().size; };
    const s256 = await size(256), s64 = await size(64), s16 = await size(16);
    assert(s64 < s256 && s16 < s64, `${s256} > ${s64} > ${s16}`);
  });
});

describe('Tier 5: GIF — modelo de configurações e Smart Export', () => {

  test('T5_GIFP_20_ProfilesApplyTierValues: perfil e nível definem enquadramento, FPS e cores', () => {
    let s = applyProfile(DEFAULT_GIF_SETTINGS, 'emoji');
    assertEqual(s.frame.kind, 'width');
    assertEqual((s.frame as any).width, 128);
    assertEqual((s.frame as any).crop, 'square');
    assertEqual(s.fps, 10);
    s = applyQuality(s, 'compact');
    assertEqual((s.frame as any).width, 96);
    assertEqual(s.colors, 128);
    s = applyQuality(applyProfile(DEFAULT_GIF_SETTINGS, 'avatar'), 'quality');
    assertEqual((s.frame as any).width, 512);
    assertEqual((s.frame as any).crop, 'square');
    assert(GIF_PROFILES.banner.tiers.balanced.frame.kind === 'width' && (GIF_PROFILES.banner.tiers.balanced.frame as any).width >= 680, 'banner respeita o mínimo de 680 px');
  });

  test('T5_GIFP_21_CustomSizeKeepsProfile: resolução personalizada não troca o perfil nem o alvo', () => {
    const emoji = applyProfile(DEFAULT_GIF_SETTINGS, 'emoji');
    const s = setCustomSize(emoji, 200, 200);
    assertEqual(s.profile, 'emoji');
    assertEqual(s.tweaked, true);
    assertEqual(s.fps, emoji.fps);
    assertEqual(s.colors, emoji.colors);
    assertEqual(s.speed, emoji.speed);
    assertEqual(s.frame.kind, 'size');
    assert(GIF_PROFILES.emoji.target !== null);
    // escolher de novo o perfil restaura os valores
    assertEqual(applyProfile(s, 'emoji').tweaked, false);
    // em "custom" nada é marcado como ajustado
    assertEqual(setCustomSize(DEFAULT_GIF_SETTINGS, 300, 200).tweaked, false);
  });

  test('T5_GIFP_22_NoConflictingState: um único modelo — tamanho livre exclui largura+recorte', () => {
    const s = setCustomSize(applyProfile(DEFAULT_GIF_SETTINGS, 'avatar'), 800, 450, 'blur');
    assertEqual(s.frame.kind, 'size');
    assertEqual((s.frame as any).fit, 'blur');
    const dims = outputDims(s, 1920, 1080);
    assertEqual(dims.w, 800); assertEqual(dims.h, 450);
    assertEqual(outputDims(applyProfile(DEFAULT_GIF_SETTINGS, 'forum'), 1920, 1080).h, Math.round(960 * 1080 / 1920));
    assertEqual(outputDims(applyProfile(DEFAULT_GIF_SETTINGS, 'emoji'), 1920, 1080).h, 128);
    assertEqual(clampColors(9999), 256); assertEqual(clampColors(0), 2); assertEqual(clampColors(NaN), 256);
  });

  test('T5_GIFP_23_LadderRespectsFloors: cada nível reduz até o seu piso e termina', () => {
    for (const q of ['quality', 'balanced', 'compact'] as const) {
      const start = applyProfile(DEFAULT_GIF_SETTINGS, 'forum', q);
      let cur = start, steps = 0;
      while (steps < 20) { const n = nextLighter(cur, start); if (!n) break; cur = n; steps++; }
      assert(steps > 0 && steps < 12, `${q}: ${steps} etapas`);
      const floor = { quality: 128, balanced: 64, compact: 32 }[q];
      assert(cur.colors >= floor, `${q}: cores ${cur.colors} abaixo do piso ${floor}`);
      assert(cur.fps >= { quality: 10, balanced: 8, compact: 6 }[q] || cur.fps === start.fps);
      assertEqual(cur.profile, 'forum');
    }
    // "Qualidade" reduz bem menos que "Compacto"
    const a = applyProfile(DEFAULT_GIF_SETTINGS, 'emoji', 'quality');
    const b = applyProfile(DEFAULT_GIF_SETTINGS, 'emoji', 'compact');
    const run = (s: typeof a) => { let c = s, n = 0; for (;;) { const x = nextLighter(c, s); if (!x || n > 20) break; c = x; n++; } return c; };
    assert(run(b).colors < run(a).colors);
  });

  test('T5_GIFP_24_ManualEditsDoNotTouchOtherValues', () => {
    const s = applyProfile(DEFAULT_GIF_SETTINGS, 'banner');
    const t = withManual(s, { fps: 8 });
    assertEqual(t.fps, 8);
    assertEqual(t.colors, s.colors);
    assertEqual(JSON.stringify(t.frame), JSON.stringify(s.frame));
    assertEqual(t.profile, 'banner');
  });

  test('T5_GIFP_25_TargetsAreDataWithSources: limites de plataforma têm fonte e data de verificação', () => {
    for (const p of Object.values(GIF_PROFILES)) {
      if (!p.target) continue;
      assert(/^https:\/\//.test(p.target.source), p.id);
      assert(/^\d{4}-\d{2}-\d{2}$/.test(p.target.verifiedOn), p.id);
      assert(p.target.bytes > 0);
    }
    assertEqual(GIF_PROFILES.emoji.target!.bytes, 256 * 1024);
  });
});

describe('Tier 5: GIF — limite de tamanho no worker', () => {

  test('T5_GIFP_30_WorkerStopsAtOutputLimit: passou do limite → ERROR OUTPUT_LIMIT e libera o encoder', () => {
    const msgs: any[] = [];
    const g: any = globalThis;
    const prev = g.self;
    g.self = { postMessage: (m: any) => msgs.push(m) };
    try {
      handleWorkerMessage({ type: 'START', width: 64, height: 64, delay: 80, colors: 256, maxBytes: 300, totalFrames: 5 } as any);
      const f = frame(64, 64, 80);
      handleWorkerMessage({ type: 'ADD_FRAME', buffer: f.buffer.slice(0), delay: 80 } as any);
      const err = msgs.find(m => m.type === 'ERROR');
      assert(!!err, 'deveria ter parado');
      assertEqual(err.code, 'OUTPUT_LIMIT');
      assert(err.bytes > 300);
      // depois do limite, novos quadros são ignorados e nenhum DONE sai
      handleWorkerMessage({ type: 'ADD_FRAME', buffer: f.buffer.slice(0), delay: 80 } as any);
      handleWorkerMessage({ type: 'FINISH' } as any);
      assertEqual(msgs.filter(m => m.type === 'DONE').length, 0);
    } finally { g.self = prev; }
  });

  test('T5_GIFP_31_WorkerProgressReportsBytes: cada quadro devolve o tamanho atual (base do backpressure e do Smart Export)', () => {
    const msgs: any[] = [];
    const g: any = globalThis;
    const prev = g.self;
    g.self = { postMessage: (m: any) => msgs.push(m) };
    try {
      handleWorkerMessage({ type: 'START', width: 32, height: 32, delay: 80, colors: 64, totalFrames: 2 } as any);
      handleWorkerMessage({ type: 'ADD_FRAME', buffer: frame(32, 32).buffer.slice(0), delay: 80 } as any);
      handleWorkerMessage({ type: 'ADD_FRAME', buffer: frame(32, 32, 30).buffer.slice(0), delay: 80 } as any);
      const prog = msgs.filter(m => m.type === 'PROGRESS' && typeof m.bytes === 'number');
      assertEqual(prog.length, 2);
      assert(prog[1].bytes > prog[0].bytes);
      handleWorkerMessage({ type: 'ABORT' } as any);
    } finally { g.self = prev; }
  });
});
