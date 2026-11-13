/**
 * Decodificador de GIFs animados para Canvas (WebCodecs ImageDecoder)
 * Extrai quadros como ImageBitmap e suas respectivas durações em milissegundos,
 * com salvaguardas rígidas de memória (limite de quadros, redimensionamento de dimensões
 * e sub-amostragem temporal inteligente).
 */

export interface DecodedFrame {
  image: ImageBitmap | CanvasImageSource;
  durationMs: number;
}

export interface DecodedGif {
  frames: DecodedFrame[];
  width: number;
  height: number;
  totalDurationMs: number;
}

export interface DecodeGifOptions {
  /** Número máximo de quadros a armazenar na memória (padrão: 120) */
  maxFrames?: number;
  /** Largura máxima permitida para os bitmaps decodificados (padrão: 1280) */
  maxWidth?: number;
  /** Altura máxima permitida para os bitmaps decodificados (padrão: 720) */
  maxHeight?: number;
  /** Limite de pixels totais descomprimidos na memória (padrão: 80 milhões de pixels ~ 320 MB de RAM) */
  maxPixelBudget?: number;
  /** Sinal para cancelar decodificação prematuramente em caso de novo upload */
  signal?: AbortSignal;
}

export const DEFAULT_DECODE_OPTIONS: Required<Omit<DecodeGifOptions, 'signal'>> = {
  maxFrames: 120,
  maxWidth: 1280,
  maxHeight: 720,
  maxPixelBudget: 80_000_000,
};

/**
 * Decodifica um Blob de GIF em uma lista de quadros (ImageBitmap) prontos para desenho no Canvas.
 * Retorna null se ImageDecoder não estiver disponível ou ocorrer falha/cancelamento.
 */
export async function decodeGif(
  blob: Blob,
  options?: DecodeGifOptions
): Promise<DecodedGif | null> {
  if (typeof window === 'undefined' || !('ImageDecoder' in window)) {
    return null;
  }

  const maxFrames = options?.maxFrames ?? DEFAULT_DECODE_OPTIONS.maxFrames;
  const maxWidth = options?.maxWidth ?? DEFAULT_DECODE_OPTIONS.maxWidth;
  const maxHeight = options?.maxHeight ?? DEFAULT_DECODE_OPTIONS.maxHeight;
  const maxPixelBudget = options?.maxPixelBudget ?? DEFAULT_DECODE_OPTIONS.maxPixelBudget;
  const signal = options?.signal;

  if (signal?.aborted) return null;

  try {
    const ImageDecoderCtor = (window as unknown as { ImageDecoder: any }).ImageDecoder;
    const dataSource = typeof blob.stream === 'function' ? blob.stream() : await blob.arrayBuffer();
    const decoder = new ImageDecoderCtor({
      data: dataSource,
      type: 'image/gif'
    });

    await decoder.tracks.ready;
    if (signal?.aborted) return null;

    const track = decoder.tracks.selectedTrack;
    const totalRawFrames = track?.frameCount ?? 1;
    if (totalRawFrames <= 0) return null;

    // Decodifica o primeiro quadro para obter dimensões exatas e calcular orçamento
    const firstResult = await decoder.decode({ frameIndex: 0 });
    const firstFrame = firstResult.image;
    let rawWidth = firstFrame.displayWidth || 1280;
    let rawHeight = firstFrame.displayHeight || 720;

    // Calcula fator de escala se as dimensões ultrapassarem o teto
    let targetWidth = rawWidth;
    let targetHeight = rawHeight;
    if (targetWidth > maxWidth || targetHeight > maxHeight) {
      const scale = Math.min(maxWidth / targetWidth, maxHeight / targetHeight);
      targetWidth = Math.max(16, Math.round(targetWidth * scale));
      targetHeight = Math.max(16, Math.round(targetHeight * scale));
    }

    // Calcula se há necessidade de sub-amostragem temporal para respeitar maxFrames e maxPixelBudget
    const pixelsPerFrame = targetWidth * targetHeight;
    const budgetFrames = Math.max(1, Math.floor(maxPixelBudget / pixelsPerFrame));
    const effectiveMaxFrames = Math.min(maxFrames, budgetFrames);

    // Passo de sub-amostragem (ex.: se o GIF tem 240 frames e o limite é 120, step = 2)
    const step = totalRawFrames > effectiveMaxFrames ? Math.ceil(totalRawFrames / effectiveMaxFrames) : 1;

    const frames: DecodedFrame[] = [];
    let totalDurationMs = 0;

    // Processa o primeiro quadro já decodificado
    const firstDurationMs = firstFrame.duration ? Math.max(10, Math.round(firstFrame.duration / 1000)) : 100;
    const firstBitmap = await createImageBitmap(
      firstFrame,
      targetWidth !== rawWidth ? { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'medium' } : undefined
    );
    firstFrame.close();

    frames.push({
      image: firstBitmap,
      durationMs: firstDurationMs * step
    });
    totalDurationMs += firstDurationMs * step;

    // Processa os quadros subsequentes respeitando o step de amostragem
    for (let i = step; i < totalRawFrames; i += step) {
      if (signal?.aborted) {
        // Libera os bitmaps já alocados em caso de cancelamento
        frames.forEach(f => {
          if ('close' in f.image && typeof (f.image as any).close === 'function') {
            (f.image as any).close();
          }
        });
        return null;
      }

      const result = await decoder.decode({ frameIndex: i });
      const videoFrame = result.image;
      const durationMs = videoFrame.duration ? Math.max(10, Math.round(videoFrame.duration / 1000)) : 100;

      const bitmap = await createImageBitmap(
        videoFrame,
        targetWidth !== rawWidth ? { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'medium' } : undefined
      );
      videoFrame.close();

      frames.push({
        image: bitmap,
        durationMs: durationMs * step
      });
      totalDurationMs += durationMs * step;
    }

    return {
      frames,
      width: targetWidth,
      height: targetHeight,
      totalDurationMs: totalDurationMs || (frames.length * 100)
    };
  } catch (err) {
    if (!signal?.aborted) {
      console.warn('[gifDecoder] Falha ao decodificar GIF com ImageDecoder:', err);
    }
    return null;
  }
}
