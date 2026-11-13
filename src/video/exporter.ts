/**
 * Haze Video Studio (POC): exporta a timeline para MP4 (H.264 + AAC) ou, se o navegador não
 * conseguir codificar, WebM. Decodifica quadro a quadro (sem carregar o vídeo na memória),
 * compõe com o mesmo compositor do preview e codifica com WebCodecs via mediabunny.
 */
import {
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
  getFirstEncodableVideoCodec, getFirstEncodableAudioCodec
} from 'mediabunny';
import type { OutputFormat, VideoCodec, AudioCodec } from 'mediabunny';
import { composeFrame, Drawable } from './compositor';
import { layout, totalDuration, validate, Timeline, MediaRef } from './timeline';
import type { OpenedMedia } from './mediaIO';

export class ExportCancelled extends Error {
  constructor() { super('Exportação cancelada.'); this.name = 'ExportCancelled'; }
}
export class ExportError extends Error {
  constructor(message: string) { super(message); this.name = 'ExportError'; }
}

export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number, phase: 'audio' | 'video' | 'finalizar') => void;
}

export interface ExportResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
  width: number;
  height: number;
  fps: number;
  frames: number;
  seconds: number;
  elapsedMs: number;
  /** Onde o tempo foi gasto (ms): esperando o decodificador, desenhando, e no encoder (inclui contrapressão). */
  timing: { decodeMs: number; composeMs: number; encodeMs: number; audioMs: number };
}

const SR = 48000;
const CHANNELS = 2;

interface Candidate { fmt: () => OutputFormat; mime: string; ext: 'mp4' | 'webm'; v: VideoCodec[]; a: AudioCodec[] }
const CANDIDATES: Candidate[] = [
  { fmt: () => new Mp4OutputFormat(), mime: 'video/mp4', ext: 'mp4', v: ['avc'], a: ['aac'] },
  { fmt: () => new WebMOutputFormat(), mime: 'video/webm', ext: 'webm', v: ['vp9', 'vp8'], a: ['opus'] }
];

async function pickFormat(w: number, h: number, needAudio: boolean) {
  for (const c of CANDIDATES) {
    const v = await getFirstEncodableVideoCodec(c.v, { width: w, height: h });
    if (!v) continue;
    let a: AudioCodec | null = null;
    if (needAudio) {
      a = await getFirstEncodableAudioCodec(c.a, { numberOfChannels: CHANNELS, sampleRate: SR });
      if (!a) continue;
    }
    return { c, v, a };
  }
  throw new ExportError(
    'Este navegador não consegue codificar vídeo (nem H.264 nem WebM). Use Chrome ou Edge atualizado.'
  );
}

/** PCM estéreo de 48 kHz da timeline inteira (um Float32Array por canal). */
interface MixedAudio { ch: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>]; length: number }

/**
 * Mistura o áudio de todos os clipes copiando amostras direto para a faixa final (sem um nó de
 * Web Audio por pacote: na primeira versão isso levou 96 s para 60 s de áudio). Se a fonte não
 * estiver em 48 kHz, reamostra por interpolação linear (qualidade suficiente para fala; ver TDD).
 */
async function renderAudio(
  tl: Timeline, media: Map<string, OpenedMedia>, total: number, signal?: AbortSignal
): Promise<MixedAudio | null> {
  const placed = layout(tl).filter(p => media.get(p.clip.mediaId)?.audio);
  if (!placed.length) return null;
  const length = Math.max(1, Math.ceil(total * SR));
  const out: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  for (const p of placed) {
    const sink = media.get(p.clip.mediaId)!.audio!;
    const { inPoint, outPoint, volume } = p.clip;
    for await (const { buffer, timestamp } of sink.buffers(inPoint, outPoint)) {
      if (signal?.aborted) throw new ExportCancelled();
      const from = Math.max(timestamp, inPoint);
      const to = Math.min(timestamp + buffer.duration, outPoint);
      if (to - from <= 0) continue;
      const rate = buffer.sampleRate;
      const srcStart = Math.round((from - timestamp) * rate);
      const dstStart = Math.round((p.start + (from - inPoint)) * SR);
      const dstLen = Math.min(Math.round((to - from) * SR), length - dstStart);
      for (let c = 0; c < 2; c++) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
        const dst = out[c];
        for (let i = 0; i < dstLen; i++) {
          const pos = srcStart + (i * rate) / SR;
          const i0 = Math.floor(pos);
          const v = rate === SR ? src[i0] : src[i0] + ((src[Math.min(i0 + 1, src.length - 1)] - src[i0]) * (pos - i0));
          dst[dstStart + i] += (v ?? 0) * volume;
        }
      }
    }
  }
  return { ch: out, length };
}

export async function exportTimeline(
  tl: Timeline, opened: Map<string, OpenedMedia>, opts: ExportOptions
): Promise<ExportResult> {
  const t0 = performance.now();
  const { width: W, height: H, fps, signal, onProgress } = opts;
  if (!(W > 0 && H > 0 && fps > 0) || W % 2 || H % 2) throw new ExportError('Resolução ou FPS inválidos (largura e altura precisam ser pares).');
  const refs = new Map<string, MediaRef>([...opened].map(([k, v]) => [k, v.ref]));
  const problems = validate(tl, refs);
  if (!tl.clips.length) throw new ExportError('A timeline está vazia: adicione ao menos um clipe.');
  if (problems.length) throw new ExportError(`Projeto inválido: ${problems[0]}`);

  const total = totalDuration(tl);
  const frames = Math.max(1, Math.ceil(total * fps - 1e-6));
  const placed = layout(tl);
  const needAudio = placed.some(p => opened.get(p.clip.mediaId)?.audio);
  const { c, v, a } = await pickFormat(W, H, needAudio);

  const timing = { decodeMs: 0, composeMs: 0, encodeMs: 0, audioMs: 0 };
  onProgress?.(0, 'audio');
  const tAudio = performance.now();
  const audio = needAudio ? await renderAudio(tl, opened, total, signal) : null;
  timing.audioMs = Math.round(performance.now() - tAudio);
  if (signal?.aborted) throw new ExportCancelled();

  const target = new BufferTarget();
  const output = new Output({ format: c.fmt(), target });
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const vsrc = new CanvasSource(canvas, { codec: v, bitrate: Math.round(W * H * fps * 0.1) });
  output.addVideoTrack(vsrc, { frameRate: fps });
  const asrc = audio && a ? new AudioBufferSource({ codec: a, bitrate: 128_000 }) : null;
  if (asrc) output.addAudioTrack(asrc);

  // um decodificador por mídia, já na largura da saída (evita ampliar um quadro reduzido do preview)
  const sinks = new Map<string, ReturnType<OpenedMedia['makeVideoSink']>>();
  const sinkFor = (m: OpenedMedia) => { let k = sinks.get(m.ref.id); if (!k) { k = m.makeVideoSink(W); sinks.set(m.ref.id, k); } return k; };
  let audioPos = 0;
  const audioTotal = audio ? audio.length : 0;
  const pushAudio = async (upTo: number) => {
    if (!audio || !asrc || upTo <= audioPos) return;
    const len = Math.min(upTo, audioTotal) - audioPos;
    if (len <= 0) return;
    const chunk = new AudioBuffer({ length: len, numberOfChannels: CHANNELS, sampleRate: SR });
    for (let ch = 0; ch < CHANNELS; ch++) {
      chunk.copyToChannel(audio.ch[ch].subarray(audioPos, audioPos + len), ch);
    }
    audioPos += len;
    await asrc.add(chunk);
  };

  try {
    await output.start();
    let i = 0;
    for (const p of placed) {
      const m = opened.get(p.clip.mediaId)!;
      const first = Math.ceil(p.start * fps - 1e-6);
      const last = Math.min(frames, Math.ceil(p.end * fps - 1e-6));
      if (last <= first) continue;
      const times = (function* () {
        for (let k = first; k < last; k++) yield p.clip.inPoint + (k / fps - p.start);
      })();
      let k = first;
      let held: Drawable | null = null;
      const it = sinkFor(m).canvasesAtTimestamps(times)[Symbol.asyncIterator]();
      for (;;) {
        const tD = performance.now();
        const nx = await it.next();
        timing.decodeMs += performance.now() - tD;
        if (nx.done) break;
        const wrapped = nx.value;
        if (signal?.aborted) throw new ExportCancelled();
        if (wrapped) held = wrapped.canvas as Drawable;
        const tC = performance.now();
        composeFrame(ctx, W, H, held, tl, k / fps);
        timing.composeMs += performance.now() - tC;
        const tE = performance.now();
        await vsrc.add(k / fps, 1 / fps);
        timing.encodeMs += performance.now() - tE;
        i++;
        if (asrc && (k + 1) % Math.ceil(fps / 2) === 0) await pushAudio(Math.round(((k + 1) / fps) * SR));
        if (k % 5 === 0) onProgress?.(i / frames, 'video');
        k++;
      }
    }
    if (signal?.aborted) throw new ExportCancelled();
    await pushAudio(audioTotal);
    onProgress?.(1, 'finalizar');
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* já finalizado/cancelado */ }
    if (e instanceof ExportCancelled || e instanceof ExportError) throw e;
    if (signal?.aborted) throw new ExportCancelled();
    throw new ExportError(`Falha ao exportar: ${(e as Error)?.message || 'erro desconhecido'}.`);
  }

  const buf = target.buffer;
  if (!buf) throw new ExportError('A codificação terminou sem gerar arquivo.');
  return {
    blob: new Blob([buf], { type: c.mime }), mime: c.mime, ext: c.ext, videoCodec: v, audioCodec: a,
    width: W, height: H, fps, frames, seconds: total, elapsedMs: Math.round(performance.now() - t0),
    timing: { decodeMs: Math.round(timing.decodeMs), composeMs: Math.round(timing.composeMs), encodeMs: Math.round(timing.encodeMs), audioMs: timing.audioMs }
  };
}
