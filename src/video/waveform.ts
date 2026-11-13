/**
 * Haze Video Studio (F3): picos de forma de onda por mídia. Decodifica o áudio uma vez, em fluxo
 * (sem guardar o PCM), e guarda só `BUCKETS` valores 0..1. Pode ser cancelado e tem limite de duração.
 */
import type { OpenedMedia } from './mediaIO';

export const BUCKETS = 1200;
export const MAX_WAVEFORM_SECONDS = 30 * 60; // acima disso a miniatura de onda é pulada

/** Devolve picos normalizados (0..1) ou null se a mídia não tem áudio, é longa demais ou foi cancelada. */
export async function computePeaks(m: OpenedMedia, signal?: AbortSignal): Promise<Float32Array | null> {
  if (!m.audio || m.ref.duration > MAX_WAVEFORM_SECONDS) return null;
  const peaks = new Float32Array(BUCKETS);
  const per = m.ref.duration / BUCKETS;
  try {
    for await (const { buffer, timestamp } of m.audio.buffers(0)) {
      if (signal?.aborted) return null;
      const n = buffer.length, rate = buffer.sampleRate, chs = buffer.numberOfChannels;
      const data = Array.from({ length: chs }, (_, c) => buffer.getChannelData(c));
      // um valor por ~1 ms de áudio basta para o pico de cada coluna
      const stride = Math.max(1, Math.floor(rate / 1000));
      for (let i = 0; i < n; i += stride) {
        let v = 0;
        for (let c = 0; c < chs; c++) v = Math.max(v, Math.abs(data[c][i]));
        const b = Math.min(BUCKETS - 1, Math.floor((timestamp + i / rate) / per));
        if (b >= 0 && v > peaks[b]) peaks[b] = v;
      }
    }
  } catch { return null; }
  let max = 0; for (const v of peaks) if (v > max) max = v;
  if (max <= 0) return peaks;               // faixa muda: devolve zeros (desenha linha reta)
  for (let i = 0; i < BUCKETS; i++) peaks[i] /= max;
  return peaks;
}

/** Amostra os picos para `cols` colunas cobrindo [inPoint, outPoint] da mídia (função pura). */
export function sliceBars(peaks: Float32Array, mediaDuration: number, inPoint: number, outPoint: number, cols: number): Float32Array {
  const out = new Float32Array(Math.max(0, cols));
  if (!out.length || !(mediaDuration > 0)) return out;
  const per = mediaDuration / peaks.length;
  for (let c = 0; c < out.length; c++) {
    const t0 = inPoint + ((outPoint - inPoint) * c) / out.length;
    const t1 = inPoint + ((outPoint - inPoint) * (c + 1)) / out.length;
    const b0 = Math.max(0, Math.floor(t0 / per)), b1 = Math.min(peaks.length - 1, Math.max(b0, Math.floor(t1 / per)));
    let v = 0; for (let b = b0; b <= b1; b++) if (peaks[b] > v) v = peaks[b];
    out[c] = v;
  }
  return out;
}
