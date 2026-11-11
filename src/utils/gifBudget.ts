/**
 * Orçamento de processamento do GIF: estima custo ANTES de converter.
 *
 * Importante: "pixels processados" (soma de todos os quadros) NÃO é pico de RAM. O pipeline é em fluxo:
 * cada quadro é capturado, enviado ao worker e codificado; só os quadros em trânsito (MAX_INFLIGHT) e o
 * arquivo de saída ficam na memória ao mesmo tempo. Por isso o pico depende do TAMANHO DO QUADRO, não da
 * quantidade de quadros, exceto pelo arquivo final (que cresce com os quadros).
 *
 * As constantes vêm de medições (docs/gif-001/bench-*.json) e de políticas de segurança documentadas em
 * docs/gif-001/HAZE-GIF-001_DESIGN.md. Os limites "heavy/blocked" são POLÍTICA do produto (não limites do
 * navegador): servem para avisar antes de travar a aba.
 */

/** Quadros em trânsito entre captura e codificação (backpressure). Medido: a fila real ficou em ≤ 2 quadros. */
export const MAX_INFLIGHT = 3;

/** Tempo médio por quadro medido no benchmark (seek + desenho + leitura + codificação), em segundos. */
export const SECONDS_PER_FRAME = 0.14;

/** Limites de política. */
export const LIMITS = {
  /** acima disso o resumo mostra "pesado" e pede confirmação */
  heavyPeakBytes: 300 * 1024 * 1024,
  heavyFrames: 600,
  heavyOutputBytes: 50 * 1024 * 1024,
  /** acima disso a conversão é bloqueada */
  blockedPeakBytes: 1024 * 1024 * 1024,
  blockedFrames: 3000,
  blockedOutputBytes: 300 * 1024 * 1024,
  /** o worker interrompe a codificação se o arquivo passar disso (proteção em tempo de execução) */
  runtimeOutputBytes: 400 * 1024 * 1024
} as const;

export interface CostInput {
  w: number; h: number; fps: number; durationS: number; speed: number; colors: number; withChat: boolean;
}

export interface CostEstimate {
  frames: number;
  frameBytes: number;               // w*h*4 (um quadro RGBA)
  cumulativePixels: number;         // soma de todos os quadros (NÃO é RAM)
  peakRamBytes: number;             // pico estimado
  outputBytes: number;              // tamanho estimado do GIF (heurística; o real é medido no fim)
  seconds: number;                  // tempo estimado
  level: 'ok' | 'heavy' | 'blocked';
  reasons: string[];
}

/**
 * Bytes por pixel-quadro do GIF, em função da resolução (heurística calibrada no benchmark: quadros maiores
 * comprimem melhor por pixel) e do número de cores. Conteúdo real varia: é uma ESTIMATIVA.
 */
export const estimateOutputBytes = (w: number, h: number, frames: number, colors: number): number => {
  const px = w * h;
  const bpp = BPP_480P * Math.pow(Math.max(px, 1) / (480 * 270), -0.32);
  const colorFactor = Math.pow(Math.log2(Math.max(2, colors)) / 8, 0.9);
  return Math.round(px * frames * bpp * colorFactor);
};
/** bytes por pixel-quadro a 480×270 e 256 cores (benchmark) */
export const BPP_480P = 0.132;

export const estimateCost = (c: CostInput): CostEstimate => {
  const frames = Math.max(1, Math.floor(Math.max(0.2, c.durationS) * c.fps));
  const frameBytes = c.w * c.h * 4;
  const outputBytes = estimateOutputBytes(c.w, c.h, frames, c.colors);
  // quadros em trânsito + leitura do canvas + canvas de trabalho + camada do chat
  const buffers = (MAX_INFLIGHT + 1 + 1 + (c.withChat ? 1 : 0)) * frameBytes;
  // worker: índices (1 B/px), histograma/paleta, buffer de saída (crescimento ×1,5) e cópia final do Blob
  const worker = c.w * c.h + 512 * 1024 + outputBytes * 2.5;
  const peakRamBytes = Math.round(buffers + worker);
  const seconds = Math.round(frames * SECONDS_PER_FRAME * 10) / 10;

  const reasons: string[] = [];
  let level: CostEstimate['level'] = 'ok';
  const bump = (to: 'heavy' | 'blocked', why: string) => { reasons.push(why); if (to === 'blocked' || level === 'ok') level = to; };
  const mb = (n: number) => `${Math.round(n / 1048576)} MB`;
  if (peakRamBytes > LIMITS.blockedPeakBytes) bump('blocked', `pico de memória estimado em ${mb(peakRamBytes)}`);
  else if (peakRamBytes > LIMITS.heavyPeakBytes) bump('heavy', `pico de memória estimado em ${mb(peakRamBytes)}`);
  if (frames > LIMITS.blockedFrames) bump('blocked', `${frames} quadros`);
  else if (frames > LIMITS.heavyFrames) bump('heavy', `${frames} quadros`);
  if (outputBytes > LIMITS.blockedOutputBytes) bump('blocked', `GIF estimado em ${mb(outputBytes)}`);
  else if (outputBytes > LIMITS.heavyOutputBytes) bump('heavy', `GIF estimado em ${mb(outputBytes)}`);
  return { frames, frameBytes, cumulativePixels: c.w * c.h * frames, peakRamBytes, outputBytes, seconds, level, reasons };
};

export interface Suggestion { label: string; patch: Partial<Pick<CostInput, 'w' | 'h' | 'fps' | 'durationS' | 'colors'>> }

/** Alternativas mais leves (só as que realmente melhoram o nível), da menos para a mais invasiva. */
export const suggestLighter = (c: CostInput): Suggestion[] => {
  if (estimateCost(c).level === 'ok') return [];
  const cands: Suggestion[] = [];
  if (c.colors > 128) cands.push({ label: 'Usar 128 cores', patch: { colors: 128 } });
  if (c.fps > 10) cands.push({ label: `Reduzir para ${Math.max(8, Math.round(c.fps * 0.75))} FPS`, patch: { fps: Math.max(8, Math.round(c.fps * 0.75)) } });
  if (c.durationS > 3) cands.push({ label: `Encurtar para ${Math.max(2, Math.round(c.durationS * 0.6))} s`, patch: { durationS: Math.max(2, Math.round(c.durationS * 0.6)) } });
  const s = 0.75;
  if (Math.min(c.w, c.h) * s >= 64) cands.push({ label: `Reduzir para ${Math.round(c.w * s)}×${Math.round(c.h * s)}`, patch: { w: Math.round(c.w * s), h: Math.round(c.h * s) } });
  const rank = { ok: 0, heavy: 1, blocked: 2 } as const;
  const base = rank[estimateCost(c).level];
  return cands.filter(s2 => rank[estimateCost({ ...c, ...s2.patch }).level] < base || estimateCost({ ...c, ...s2.patch }).peakRamBytes < estimateCost(c).peakRamBytes * 0.9).slice(0, 3);
};

/**
 * Atrasos por quadro em centésimos de segundo (unidade do GIF), sem acumular erro de arredondamento.
 * Ex.: 12 FPS = 8,33 cs/quadro; arredondar cada quadro para 8 cs fazia o GIF rodar 4% mais rápido (medido: 2,88 s em vez de 3 s).
 * Aqui a soma acompanha o tempo real (arredondando o acumulado). Mínimo de 2 cs: navegadores tratam atrasos menores como 10 cs.
 */
export const gifDelaysCs = (fps: number, speed: number, frames: number): number[] => {
  const perFrame = 100 / (Math.max(1, fps) * Math.max(0.1, speed));
  const out: number[] = [];
  let prev = 0;
  for (let i = 1; i <= frames; i++) {
    const cum = Math.round(perFrame * i);
    out.push(Math.max(2, cum - prev));
    prev = cum;
  }
  return out;
};

export const formatBytes = (n: number): string =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
