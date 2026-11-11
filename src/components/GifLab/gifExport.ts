/**
 * Pipeline de exportação do GIF (captura no thread principal → codificação no Web Worker).
 *
 * - Backpressure: no máximo MAX_INFLIGHT quadros em trânsito; a captura espera o worker devolver o progresso.
 * - Cancelamento: o AbortSignal termina o worker e libera os canvases.
 * - Limite de tamanho: `maxBytes` interrompe a codificação assim que o arquivo passa do limite.
 * - O resultado traz o tamanho MEDIDO do arquivo (nunca presumido).
 */
import { computeGifFrame } from '../../utils/gifFrame';
import { gifDelaysCs, MAX_INFLIGHT, LIMITS } from '../../utils/gifBudget';
import type { GifSettings } from '../../utils/gifSettings';
import { seekWithRetry, SEEK_FAILURE_MESSAGES } from '../../utils/videoSeek';

/** Falha ao posicionar o vídeo em um quadro (interrompe a conversão com mensagem clara). */
export class SeekFailure extends Error {
  constructor(public frame: number, public total: number, public reason: string) {
    super(`seek falhou no quadro ${frame}/${total}: ${reason}`);
  }
}

export interface ChatOverlayInput {
  fullText: string;
  reveal: boolean;
  /** desenha o chat (texto dado) numa camada transparente do tamanho do quadro */
  build: (w: number, h: number, text: string) => HTMLCanvasElement | null;
}

export interface ExportParams {
  video: HTMLVideoElement;
  settings: GifSettings;
  startTime: number;
  endTime: number;
  chat: ChatOverlayInput | null;
  watermark: string;
  signal: AbortSignal;
  /** interrompe se o GIF passar disso (bytes) */
  maxBytes?: number;
  onProgress?: (p: { frame: number; total: number; bytes: number; phase: 'capture' | 'finish' }) => void;
  /** injeção para testes */
  workerFactory?: () => Worker;
}

export type ExportOutcome =
  | { status: 'done'; blob: Blob; bytes: number; frames: number; width: number; height: number; durationMs: number }
  | { status: 'aborted' }
  | { status: 'too-large'; bytes: number; atFrame: number; total: number };

export const exportGif = async (p: ExportParams): Promise<ExportOutcome> => {
  const { video, settings, startTime, endTime, signal } = p;
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const frame = settings.frame;
  const geo = frame.kind === 'size'
    ? computeGifFrame(vw, vh, 'original', 0, frame.size, frame.fit)
    : computeGifFrame(vw, vh, frame.crop, frame.width, null, 'cover');
  const { outWidth, outHeight, sx, sy, sw, sh, dx, dy, dw, dh } = geo;

  const clip = Math.max(0.2, endTime - startTime);
  const total = Math.max(1, Math.floor(clip * settings.fps));
  const interval = clip / total;
  const delays = gifDelaysCs(settings.fps, settings.speed, total);

  const canvas = document.createElement('canvas');
  canvas.width = outWidth; canvas.height = outHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Não foi possível criar o canvas de captura.');

  // camada do chat: fixa, ou refeita quando entra uma linha nova (revelar)
  const lines = p.chat ? p.chat.fullText.split('\n') : [];
  const lineIdx = lines.map((l, i) => (l.trim() ? i : -1)).filter(i => i >= 0);
  const reveal = !!(p.chat && p.chat.reveal && lineIdx.length > 1);
  let shown = -1;
  let overlay: HTMLCanvasElement | null = p.chat && !reveal ? p.chat.build(outWidth, outHeight, p.chat.fullText) : null;

  const worker = p.workerFactory ? p.workerFactory() : new Worker(new URL('./gifWorker.ts', import.meta.url), { type: 'module' });
  const release = () => {
    try { worker.terminate(); } catch { /* já encerrado */ }
    canvas.width = 0; canvas.height = 0;
    if (overlay) { overlay.width = 0; overlay.height = 0; overlay = null; }
  };

  // ---- comunicação com o worker (progresso = quadro codificado) ----
  let started = false;
  let done = 0;
  let sent = 0;
  let lastBytes = 0;
  let finishedEarly = false;
  let wake: (() => void) | null = null;
  let finish: ((o: ExportOutcome | Error) => void) | null = null;
  const finished = new Promise<ExportOutcome | Error>(res => { finish = res; });
  const startedAt = performance.now();

  worker.onmessage = (e: MessageEvent) => {
    const d = e.data;
    if (d.type === 'PROGRESS') {
      if (!started) { started = true; return; }
      if (typeof d.bytes === 'number') lastBytes = d.bytes;
      if (d.progress !== 100) done++;
      if (wake) { const w = wake; wake = null; w(); }
    } else if (d.type === 'DONE') {
      const blob: Blob = d.blob;
      finish?.({ status: 'done', blob, bytes: blob.size, frames: total, width: outWidth, height: outHeight, durationMs: performance.now() - startedAt });
    } else if (d.type === 'ERROR') {
      if (d.code === 'OUTPUT_LIMIT') finish?.({ status: 'too-large', bytes: d.bytes ?? lastBytes, atFrame: done, total });
      else finish?.(new Error(d.error || 'Erro no codificador de GIF.'));
    }
  };
  worker.onerror = () => finish?.(new Error('Falha crítica no Web Worker.'));
  const onAbort = () => finish?.({ status: 'aborted' });
  signal.addEventListener('abort', onAbort);

  const waitForAck = () => new Promise<void>(res => { wake = res; });

  worker.postMessage({
    type: 'START', width: outWidth, height: outHeight, delay: delays[0] * 10, totalFrames: total,
    colors: settings.colors,
    maxBytes: Math.min(p.maxBytes ?? Infinity, LIMITS.runtimeOutputBytes)
  });

  // captura em paralelo ao resultado do worker: o que terminar primeiro (erro/limite/cancelamento) vence
  const capture = (async (): Promise<Error | null> => {
    try {
      for (let i = 0; i < total; i++) {
        if (signal.aborted) return null;
        // backpressure: espera o worker esvaziar a fila
        while (sent - done >= MAX_INFLIGHT) {
          if (signal.aborted) return null;
          await Promise.race([waitForAck(), finished.then(() => undefined)]);
          if (finishedEarly) return null;
        }
        p.onProgress?.({ frame: i + 1, total, bytes: lastBytes, phase: 'capture' });

        const seek = await seekWithRetry(video, startTime + i * interval, { timeoutMs: 3000, retries: 2, signal });
        if (signal.aborted || seek === 'aborted') return null;
        if (seek !== 'ok') throw new SeekFailure(i + 1, total, SEEK_FAILURE_MESSAGES[seek]);
        if (finishedEarly) return null;

        ctx.clearRect(0, 0, outWidth, outHeight);
        if (geo.fillBackground) {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, outWidth, outHeight);
          if (geo.fillBackground === 'blur') {
            const k = Math.max(outWidth / vw, outHeight / vh);
            ctx.save();
            ctx.filter = `blur(${Math.round(Math.max(outWidth, outHeight) / 40)}px) brightness(0.65)`;
            ctx.drawImage(video, (outWidth - vw * k) / 2, (outHeight - vh * k) / 2, vw * k, vh * k);
            ctx.restore();
          }
        }
        ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw, dh);

        if (reveal && p.chat) {
          // 80% do clipe revela as linhas; o restante mostra o chat completo
          const t = Math.min(1, (i + 1) / Math.max(1, Math.floor(total * 0.8)));
          const n = Math.max(1, Math.ceil(lineIdx.length * t));
          if (n !== shown) {
            shown = n;
            if (overlay) { overlay.width = 0; overlay.height = 0; }
            overlay = p.chat.build(outWidth, outHeight, lines.slice(0, lineIdx[n - 1] + 1).join('\n'));
          }
        }
        if (overlay) ctx.drawImage(overlay, 0, 0);

        if (p.watermark.trim()) {
          ctx.save();
          ctx.font = 'bold 12px "Inter", sans-serif';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.shadowColor = 'rgba(0,0,0,0.8)';
          ctx.shadowBlur = 4;
          ctx.fillText(p.watermark, 10, outHeight - 10);
          ctx.restore();
        }

        const img = ctx.getImageData(0, 0, outWidth, outHeight);
        const buffer = img.data.buffer;
        sent++;
        worker.postMessage({ type: 'ADD_FRAME', buffer, delay: delays[i] * 10 }, [buffer]);
      }
      if (!signal.aborted && !finishedEarly) {
        p.onProgress?.({ frame: total, total, bytes: lastBytes, phase: 'finish' });
        worker.postMessage({ type: 'FINISH' });
      }
      return null;
    } catch (err: any) {
      return err instanceof Error ? err : new Error(String(err));
    }
  })();

  void finished.then(() => { finishedEarly = true; });

  try {
    const first = await Promise.race([finished, capture.then(e => (e ? e : new Promise<never>(() => { /* espera o worker */ })))]);
    if (first instanceof Error) throw first;
    return first;
  } finally {
    signal.removeEventListener('abort', onAbort);
    release();
  }
};

export interface SmartAttempt {
  settings: GifSettings;
  outcome: ExportOutcome;
}
