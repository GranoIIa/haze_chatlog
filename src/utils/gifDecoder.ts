/**
 * Decodificador de GIFs animados para Canvas (WebCodecs ImageDecoder)
 * Extrai todos os quadros como ImageBitmap e suas respectivas durações em milissegundos.
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

/**
 * Decodifica um Blob de GIF em uma lista de quadros (ImageBitmap) prontos para desenho no Canvas.
 * Retorna null se ImageDecoder não estiver disponível ou ocorrer falha.
 */
export async function decodeGif(blob: Blob): Promise<DecodedGif | null> {
  if (typeof window === 'undefined' || !('ImageDecoder' in window)) {
    return null;
  }

  try {
    const ImageDecoderCtor = (window as unknown as { ImageDecoder: any }).ImageDecoder;
    const dataSource = typeof blob.stream === 'function' ? blob.stream() : await blob.arrayBuffer();
    const decoder = new ImageDecoderCtor({
      data: dataSource,
      type: 'image/gif'
    });

    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    const frameCount = track?.frameCount ?? 1;
    if (frameCount <= 0) return null;

    const frames: DecodedFrame[] = [];
    let totalDurationMs = 0;
    let width = 0;
    let height = 0;

    for (let i = 0; i < frameCount; i++) {
      const result = await decoder.decode({ frameIndex: i });
      const videoFrame = result.image;
      if (!width && videoFrame.displayWidth) width = videoFrame.displayWidth;
      if (!height && videoFrame.displayHeight) height = videoFrame.displayHeight;

      const bitmap = await createImageBitmap(videoFrame);
      // duration vem em microssegundos (us) na WebCodecs API
      const durationMs = videoFrame.duration ? Math.max(10, Math.round(videoFrame.duration / 1000)) : 100;
      videoFrame.close();

      frames.push({
        image: bitmap,
        durationMs
      });
      totalDurationMs += durationMs;
    }

    return {
      frames,
      width: width || 1280,
      height: height || 720,
      totalDurationMs: totalDurationMs || (frameCount * 100)
    };
  } catch (err) {
    console.warn('[gifDecoder] Falha ao decodificar GIF com ImageDecoder:', err);
    return null;
  }
}

