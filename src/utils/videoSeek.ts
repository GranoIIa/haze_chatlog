/**
 * Posicionamento confiável do vídeo para captura de quadros.
 * Diferente de um simples "esperar o seeked", devolve um resultado tipado para que quem chama
 * nunca exporte silenciosamente um quadro antigo quando o seek falha.
 */

export type SeekResult = 'ok' | 'timeout' | 'error' | 'aborted';

export interface SeekOptions {
  /** Tempo máximo de espera por tentativa (ms). */
  timeoutMs?: number;
  /** Cancela a espera imediatamente. */
  signal?: AbortSignal;
  /** Diferença (s) abaixo da qual já consideramos o vídeo na posição certa. */
  tolerance?: number;
}

/** Subconjunto do HTMLVideoElement que usamos (facilita testes com um vídeo falso). */
export type SeekableVideo = Pick<
  HTMLVideoElement,
  'currentTime' | 'duration' | 'readyState' | 'addEventListener' | 'removeEventListener'
>;

const HAVE_CURRENT_DATA = 2;

/** Uma tentativa de seek. */
export function seekVideo(video: SeekableVideo, targetTime: number, opts: SeekOptions = {}): Promise<SeekResult> {
  const { timeoutMs = 3000, signal, tolerance = 0.005 } = opts;

  return new Promise<SeekResult>((resolve) => {
    if (signal?.aborted) { resolve('aborted'); return; }

    const dur = video.duration && !isNaN(video.duration) ? video.duration : targetTime;
    const clamped = Math.max(0, Math.min(targetTime, dur));

    // Já está na posição e com dados do quadro disponíveis
    if (Math.abs(video.currentTime - clamped) <= tolerance && video.readyState >= HAVE_CURRENT_DATA) {
      resolve('ok');
      return;
    }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: SeekResult) => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const onSeeked = () => {
      // Só vale se o quadro está realmente disponível; senão espera o canplay
      if (video.readyState >= HAVE_CURRENT_DATA) finish('ok');
    };
    const onCanPlay = () => {
      if (video.readyState >= HAVE_CURRENT_DATA) finish('ok');
    };
    const onError = () => finish('error');
    const onAbort = () => finish('aborted');

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish('timeout'), timeoutMs);

    video.currentTime = clamped;
  });
}

/**
 * Seek com novas tentativas. Em caso de timeout, "cutuca" o vídeo para outra posição próxima
 * antes de repetir, o que destrava alguns decodificadores. Erros de mídia e cancelamento não repetem.
 */
export async function seekWithRetry(
  video: SeekableVideo,
  targetTime: number,
  opts: SeekOptions & { retries?: number } = {}
): Promise<SeekResult> {
  const { retries = 2, ...seekOpts } = opts;
  let result: SeekResult = 'timeout';

  for (let attempt = 0; attempt <= retries; attempt++) {
    result = await seekVideo(video, targetTime, seekOpts);
    if (result !== 'timeout') return result;
    if (attempt < retries) {
      // destrava o decodificador antes da próxima tentativa
      const dur = video.duration && !isNaN(video.duration) ? video.duration : targetTime;
      video.currentTime = Math.max(0, Math.min(dur, targetTime + (attempt % 2 === 0 ? 0.05 : -0.05)));
    }
  }
  return result;
}

export const SEEK_FAILURE_MESSAGES: Record<Exclude<SeekResult, 'ok'>, string> = {
  timeout: 'o vídeo não respondeu a tempo',
  error: 'o navegador não conseguiu decodificar o vídeo nesse ponto',
  aborted: 'a conversão foi cancelada'
};
