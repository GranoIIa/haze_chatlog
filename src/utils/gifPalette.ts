/**
 * Paleta por quadro via median-cut sobre o histograma RGB555 (32 768 faixas).
 * Substitui a amostragem de 256 pixels espaçados: respeita as cores que realmente dominam o quadro
 * (texto branco do chat, tarjas, pele) e permite escolher quantas cores usar (2–256).
 */

export interface GifPalette {
  /** RGB intercalado, `size` entradas (potência de 2) */
  colors: Uint8Array;
  /** bits da tabela (1–8): size = 2^bits */
  bits: number;
  /** índice da paleta para cada faixa RGB555 (só as faixas presentes no quadro são válidas) */
  binToIndex: Uint8Array;
}

const expand5 = (v: number) => (v << 3) | (v >> 2);

/** Menor potência de 2 (em bits, 1–8) que comporta `colors`. */
export const paletteBits = (colors: number): number =>
  Math.min(8, Math.max(1, Math.ceil(Math.log2(Math.max(2, Math.min(256, Math.floor(colors)))))));

export const buildPalette = (pixels: Uint8ClampedArray | Uint8Array, maxColors: number): GifPalette => {
  const bits = paletteBits(maxColors);
  const size = 1 << bits;
  const limit = Math.min(size, Math.max(2, Math.floor(maxColors)));

  // histograma
  const hist = new Uint32Array(32768);
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    hist[((pixels[i] >> 3) << 10) | ((pixels[i + 1] >> 3) << 5) | (pixels[i + 2] >> 3)]++;
  }
  const present: number[] = [];
  for (let b = 0; b < 32768; b++) if (hist[b]) present.push(b);

  const colors = new Uint8Array(size * 3);
  const binToIndex = new Uint8Array(32768);

  type Box = { bins: number[]; count: number };
  const rOf = (b: number) => b >> 10, gOf = (b: number) => (b >> 5) & 31, bOf = (b: number) => b & 31;
  const boxes: Box[] = [{ bins: present, count: present.reduce((a, b) => a + hist[b], 0) }];

  const spread = (box: Box) => {
    let rMin = 31, rMax = 0, gMin = 31, gMax = 0, bMin = 31, bMax = 0;
    for (const b of box.bins) {
      const r = rOf(b), g = gOf(b), bl = bOf(b);
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (bl < bMin) bMin = bl; if (bl > bMax) bMax = bl;
    }
    return { dr: rMax - rMin, dg: gMax - gMin, db: bMax - bMin };
  };

  while (boxes.length < limit) {
    // escolhe a caixa com maior "volume" ponderado que ainda possa ser dividida
    let best = -1, bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.bins.length < 2) continue;
      const s = spread(bx);
      const score = Math.max(s.dr, s.dg, s.db) * Math.sqrt(bx.count);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const bx = boxes[best];
    const s = spread(bx);
    const axis = s.dr >= s.dg && s.dr >= s.db ? 0 : s.dg >= s.db ? 1 : 2;
    const key = axis === 0 ? rOf : axis === 1 ? gOf : bOf;
    const sorted = bx.bins.slice().sort((a, b) => key(a) - key(b));
    // corta na mediana ponderada pela frequência
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += hist[sorted[i]];
      cut = i + 1;
      if (acc >= bx.count / 2) break;
    }
    const a = sorted.slice(0, cut), b = sorted.slice(cut);
    const ca = a.reduce((x, y) => x + hist[y], 0);
    boxes.splice(best, 1, { bins: a, count: ca }, { bins: b, count: bx.count - ca });
  }

  boxes.forEach((bx, idx) => {
    let r = 0, g = 0, b = 0;
    for (const bin of bx.bins) { const w = hist[bin]; r += expand5(rOf(bin)) * w; g += expand5(gOf(bin)) * w; b += expand5(bOf(bin)) * w; binToIndex[bin] = idx; }
    const n = Math.max(1, bx.count);
    colors[idx * 3] = Math.round(r / n); colors[idx * 3 + 1] = Math.round(g / n); colors[idx * 3 + 2] = Math.round(b / n);
  });
  return { colors, bits, binToIndex };
};
