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

export function handleWorkerMessage(job: GifEncodeJob & { buffer?: ArrayBuffer; totalFrames?: number }): void {
  switch (job.type) {
    case 'START': {
      isAborted = false;
      targetWidth = job.width || 480;
      targetHeight = job.height || 360;
      defaultDelay = job.delay || 100;
      totalFramesExpected = job.totalFrames || 0;
      framesProcessed = 0;

      encoder = new SimpleGifEncoder(targetWidth, targetHeight, defaultDelay);
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
          encoder = new SimpleGifEncoder(targetWidth, targetHeight, defaultDelay);
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

        postWorkerMessage({
          type: 'PROGRESS',
          progress,
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
