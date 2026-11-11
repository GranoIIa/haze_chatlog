import { SimpleGifEncoder } from '../../utils/gifEncoder';
import type { GifEncodeJob, GifWorkerMessage } from '../../types';

// Helper for type-safe postMessage in dedicated worker
const postWorkerMessage = (msg: GifWorkerMessage, transfer?: Transferable[]) => {
  if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function') {
    (self as any).postMessage(msg, transfer);
  }
};

let encoder: SimpleGifEncoder | null = null;
let targetWidth = 480;
let targetHeight = 360;
let defaultDelay = 100;
let totalFramesExpected = 0;
let framesProcessed = 0;
let isAborted = false;
let maxColors = 256;
let maxBytes = Infinity;

export function handleWorkerMessage(job: GifEncodeJob & { buffer?: ArrayBuffer; totalFrames?: number }): void {
  switch (job.type) {
    case 'START': {
      isAborted = false;
      targetWidth = job.width || 480;
      targetHeight = job.height || 360;
      defaultDelay = job.delay || 100;
      maxColors = job.colors || 256;
      maxBytes = job.maxBytes && job.maxBytes > 0 ? job.maxBytes : Infinity;
      totalFramesExpected = job.totalFrames || 0;
      framesProcessed = 0;

      encoder = new SimpleGifEncoder(targetWidth, targetHeight, defaultDelay, maxColors);
      encoder.start();

      postWorkerMessage({
        type: 'PROGRESS',
        progress: 0,
      });
      break;
    }

    case 'ADD_FRAME': {
      if (isAborted) return;

      try {
        if (!encoder) {
          encoder = new SimpleGifEncoder(targetWidth, targetHeight, defaultDelay, maxColors);
          encoder.start();
        }

        let pixelData: Uint8ClampedArray | Uint8Array | null = null;
        if (job.buffer) {
          pixelData = new Uint8ClampedArray(job.buffer);
        } else if (job.frameData && job.frameData.data) {
          pixelData = job.frameData.data;
        }

        if (pixelData && pixelData.length > 0) {
          const frameDelay = job.delay || defaultDelay;
          encoder.addFrame(pixelData, frameDelay);
        }

        framesProcessed++;
        const progress = totalFramesExpected > 0
          ? Math.round((framesProcessed / totalFramesExpected) * 100)
          : 50;

        const bytes = encoder.bytesWritten;
        if (bytes > maxBytes) {
          // o GIF já passou do limite pedido: para na hora e libera a memória
          isAborted = true;
          encoder = null;
          postWorkerMessage({ type: 'ERROR', code: 'OUTPUT_LIMIT', bytes, error: `O GIF passou do limite de ${Math.round(maxBytes / 1024)} KB.` });
          break;
        }
        postWorkerMessage({
          type: 'PROGRESS',
          progress,
          bytes,
        });
      } catch (err: any) {
        postWorkerMessage({
          type: 'ERROR',
          error: err?.message || 'Error encoding frame in worker',
        });
      }
      break;
    }

    case 'FINISH': {
      if (isAborted) return;

      try {
        postWorkerMessage({
          type: 'PROGRESS',
          progress: 100,
        });

        const gifBlob = encoder ? encoder.finish() : new Blob([], { type: 'image/gif' });
        postWorkerMessage({
          type: 'DONE',
          blob: gifBlob,
        });
        encoder = null;
      } catch (err: any) {
        postWorkerMessage({
          type: 'ERROR',
          error: err?.message || 'Error finalizing GIF in worker',
        });
        encoder = null;
      }
      break;
    }

    case 'ABORT': {
      isAborted = true;
      encoder = null;
      break;
    }

    default: {
      postWorkerMessage({
        type: 'ERROR',
        error: `Unknown action: ${(job as any)?.type}`,
      });
      break;
    }
  }
}

if (typeof self !== 'undefined' && typeof (self as any).addEventListener === 'function') {
  (self as any).addEventListener('message', (event: MessageEvent<GifEncodeJob>) => {
    handleWorkerMessage(event.data);
  });
}
