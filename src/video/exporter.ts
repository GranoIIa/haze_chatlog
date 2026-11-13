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
import { activeLayerClips, activeLayers, audioItems, fadeFactor, layout, speedOf, totalDuration, validate, Timeline, MediaRef } from './timeline';
import type { OpenedMedia } from './mediaIO';
import { checkExportLimits } from './limits';

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

/** Janela de PCM estéreo de 48 kHz (comprimento variável só na última). */
type AudioWindow = [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];
const WINDOW = SR / 2; // 0,5 s por janela

/**
 * Gera o áudio da timeline em janelas de 0,5 s, na ordem do tempo, decodificando sob demanda.
 * A memória fica limitada a poucas janelas (nada de montagem inteira em PCM). Trechos sem áudio
 * viram silêncio. Aplica volume, velocidade (muda o tom, sem esticar o tempo), entrada/saída gradual e
 * a fusão das transições (clipes que se sobrepõem são somados com rampas). Fonte fora de 48 kHz é
 * reamostrada por interpolação linear. Uma janela só é entregue quando nenhum clipe futuro
 * pode mais escrever nela (o próximo clipe começa, no máximo, na sobreposição da transição).
 */
async function* audioWindows(
  tl: Timeline, media: Map<string, OpenedMedia>, total: number, signal?: AbortSignal
): AsyncGenerator<AudioWindow, void, unknown> {
  const length = Math.max(1, Math.ceil(total * SR));
  const wins = new Map<number, AudioWindow>();
  let nextFlush = 0;
  const win = (idx: number): AudioWindow => {
    let w = wins.get(idx);
    if (!w) { w = [new Float32Array(WINDOW), new Float32Array(WINDOW)]; wins.set(idx, w); }
    return w;
  };
  const takeReady = (limitSample: number): AudioWindow[] => {
    const out: AudioWindow[] = [];
    while ((nextFlush + 1) * WINDOW <= limitSample && nextFlush * WINDOW < length) {
      const w = win(nextFlush); wins.delete(nextFlush);
      const len = Math.min(WINDOW, length - nextFlush * WINDOW);
      out.push(len === WINDOW ? w : [w[0].slice(0, len), w[1].slice(0, len)]);
      nextFlush++;
    }
    return out;
  };

  const placed = audioItems(tl);
  for (let pi = 0; pi < placed.length; pi++) {
    const p = placed[pi];
    const nextStart = pi + 1 < placed.length ? Math.floor(placed[pi + 1].start * SR) : Infinity;
    for (const w of takeReady(Math.min(Math.floor(p.start * SR), nextStart))) yield w;
    const sink = media.get(p.clip.mediaId)?.audio;
    if (!sink) continue;
    const { inPoint, outPoint, volume } = p.clip;
    const sp = speedOf(p.clip);
    const dur = p.end - p.start;
    for await (const { buffer, timestamp } of sink.buffers(inPoint, outPoint)) {
      if (signal?.aborted) throw new ExportCancelled();
      const from = Math.max(timestamp, inPoint);
      const to = Math.min(timestamp + buffer.duration, outPoint);
      if (to - from <= 0) continue;
      const rate = buffer.sampleRate;
      const srcStart = Math.round((from - timestamp) * rate);
      const d0 = Math.round((p.start + (from - inPoint) / sp) * SR);
      const n = Math.min(Math.round(((to - from) / sp) * SR), length - d0);
      const step = (rate * sp) / SR;                    // amostras de origem por amostra de saída
      for (let c = 0; c < 2; c++) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
        let curIdx = -1; let cur: AudioWindow | null = null;
        for (let i = 0; i < n; i++) {
          const abs = d0 + i;
          const idx = Math.floor(abs / WINDOW);
          if (idx !== curIdx) { curIdx = idx; cur = win(idx); }
          const pos = srcStart + i * step;
          const i0 = Math.floor(pos);
          const v = step === 1 ? src[i0] : src[i0] + ((src[Math.min(i0 + 1, src.length - 1)] - src[i0]) * (pos - i0));
          const rel = abs / SR - p.start;
          const g = volume * fadeFactor(rel, dur, p.audioFadeIn, p.audioFadeOut);
          cur![c][abs - idx * WINDOW] += (v ?? 0) * g;
        }
      }
      for (const w of takeReady(Math.min(d0 + n, nextStart))) yield w;
    }
  }
  for (const w of takeReady(Infinity)) yield w;
  // janelas finais ainda não criadas (silêncio até o fim da montagem)
  while (nextFlush * WINDOW < length) {
    const len = Math.min(WINDOW, length - nextFlush * WINDOW);
    yield [new Float32Array(len), new Float32Array(len)];
    nextFlush++;
  }
}

export async function exportTimeline(
  tl: Timeline, opened: Map<string, OpenedMedia>, opts: ExportOptions
): Promise<ExportResult> {
  const t0 = performance.now();
  const { width: W, height: H, fps, signal, onProgress } = opts;
  if (!(W > 0 && H > 0 && fps > 0) || W % 2 || H % 2) throw new ExportError('Resolução ou FPS inválidos (largura e altura precisam ser pares).');
  const refs = new Map<string, MediaRef>([...opened].map(([k, v]) => [k, v.ref]));
  const problems = validate(tl, refs);
  if (!tl.clips.length && !(tl.layers ?? []).length) throw new ExportError('A timeline está vazia: adicione ao menos um clipe.');
  if (problems.length) throw new ExportError(`Projeto inválido: ${problems[0]}`);

  const total = totalDuration(tl);
  const tooBig = checkExportLimits(total);
  if (tooBig) throw new ExportError(tooBig);
  const frames = Math.max(1, Math.ceil(total * fps - 1e-6));
  const needAudio = audioItems(tl).some(p => opened.get(p.clip.mediaId)?.audio);
  const { c, v, a } = await pickFormat(W, H, needAudio);

  const timing = { decodeMs: 0, composeMs: 0, encodeMs: 0, audioMs: 0 };
  onProgress?.(0, 'video');
  const audioGen = needAudio && a ? audioWindows(tl, opened, total, signal) : null;

  const target = new BufferTarget();
  const output = new Output({ format: c.fmt(), target });
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d')!;
  const vsrc = new CanvasSource(canvas, { codec: v, bitrate: Math.round(W * H * fps * 0.1) });
  output.addVideoTrack(vsrc, { frameRate: fps });
  const asrc = audioGen && a ? new AudioBufferSource({ codec: a, bitrate: 128_000 }) : null;
  if (asrc) output.addAudioTrack(asrc);

  let audioPos = 0;       // amostras já enviadas ao encoder
  let audioDone = false;
  const audioTotal = Math.max(1, Math.ceil(total * SR));
  /** Envia janelas de áudio ao encoder até cobrir `upTo` amostras (acompanha o vídeo, memória limitada). */
  const pushAudio = async (upTo: number) => {
    if (!audioGen || !asrc) return;
    while (!audioDone && audioPos < upTo) {
      const tA = performance.now();
      const nx = await audioGen.next();
      if (nx.done) { audioDone = true; break; }
      const [l, r] = nx.value;
      const chunk = new AudioBuffer({ length: l.length, numberOfChannels: CHANNELS, sampleRate: SR });
      chunk.copyToChannel(l, 0); chunk.copyToChannel(r, 1);
      audioPos += l.length;
      await asrc.add(chunk);
      timing.audioMs += Math.round(performance.now() - tA);
    }
  };

  try {
    await output.start();
    // Quais quadros de saída cada clipe cobre (inclui a sobreposição das transições). Cada clipe tem
    // seu próprio decodificador e seu iterador: avançam juntos, um passo por quadro de saída.
    const byClip = new Map<string, number[]>();
    const push = (id: string, k: number) => { let ks = byClip.get(id); if (!ks) { ks = []; byClip.set(id, ks); } ks.push(k); };
    for (let k = 0; k < frames; k++) {
      for (const L of activeLayers(tl, k / fps)) push(L.clip.id, k);
      for (const A of activeLayerClips(tl, k / fps)) push(A.layer.id, k);
    }
    interface Feed { it: AsyncIterator<{ canvas: unknown } | null>; held: Drawable | null; left: number }
    const feeds = new Map<string, Feed>();
    // de onde cada fonte de vídeo lê: clipes da trilha principal e camadas de sobreposição
    const srcById = new Map<string, { mediaId: string; inPoint: number; start: number; speed: number }>();
    for (const p of layout(tl)) srcById.set(p.clip.id, { mediaId: p.clip.mediaId, inPoint: p.clip.inPoint, start: p.start, speed: speedOf(p.clip) });
    for (const l of tl.layers ?? []) srcById.set(l.id, { mediaId: l.mediaId, inPoint: l.inPoint, start: l.start, speed: 1 });
    const feedFor = (id: string): Feed => {
      let f = feeds.get(id);
      if (!f) {
        const p = srcById.get(id)!;
        const ks = byClip.get(id)!;
        const times = (function* () { for (const k of ks) yield p.inPoint + (k / fps - p.start) * p.speed; })();
        const sink = opened.get(p.mediaId)!.makeVideoSink(W);
        f = { it: sink.canvasesAtTimestamps(times)[Symbol.asyncIterator]() as AsyncIterator<{ canvas: unknown } | null>, held: null, left: ks.length };
        feeds.set(id, f);
      }
      return f;
    };

    let i = 0;
    for (let k = 0; k < frames; k++) {
      if (signal?.aborted) throw new ExportCancelled();
      const t = k / fps;
      const layers = activeLayers(tl, t);
      const drawn: Array<Drawable | null> = [];
      for (const L of layers) {
        const f = feedFor(L.clip.id);
        const tD = performance.now();
        const nx = await f.it.next();
        timing.decodeMs += performance.now() - tD;
        if (!nx.done && nx.value) f.held = nx.value.canvas as Drawable;
        drawn.push(f.held);
        if (--f.left <= 0) { try { await f.it.return?.(undefined); } catch { /* ignore */ } feeds.delete(L.clip.id); }
      }
      const lf = new Map<string, Drawable | null>();
      for (const A of activeLayerClips(tl, t)) {
        const f = feedFor(A.layer.id);
        const tD2 = performance.now();
        const nx = await f.it.next();
        timing.decodeMs += performance.now() - tD2;
        if (!nx.done && nx.value) f.held = nx.value.canvas as Drawable;
        lf.set(A.layer.id, f.held);
        if (--f.left <= 0) { try { await f.it.return?.(undefined); } catch { /* ignore */ } feeds.delete(A.layer.id); }
      }
      const tC = performance.now();
      composeFrame(ctx, W, H, drawn, tl, t, lf);
      timing.composeMs += performance.now() - tC;
      const tE = performance.now();
      await vsrc.add(t, 1 / fps);
      timing.encodeMs += performance.now() - tE;
      i++;
      if (asrc) await pushAudio(Math.round(((k + 1) / fps) * SR));
      if (k % 5 === 0) onProgress?.(i / frames, 'video');
    }
    if (signal?.aborted) throw new ExportCancelled();
    await pushAudio(audioTotal);
    await audioGen?.return?.(undefined);
    onProgress?.(1, 'finalizar');
    await output.finalize();
  } catch (e) {
    try { await audioGen?.return?.(undefined); } catch { /* ignore */ }
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
