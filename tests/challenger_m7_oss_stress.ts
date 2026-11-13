/**
 * Challenger M7 Empirical Stress Harness: Open Source Intelligence & Streaming POC (HAZE-OSS-001)
 *
 * Validates:
 * 1. Mediabunny exports and StreamTarget API contract.
 * 2. BufferTarget behavior and hard limits (ARRAY_BUFFER_MAX_SIZE = 2**32).
 * 3. StreamTarget chunked writing, position tracking, and WritableStream backpressure.
 * 4. TypeScript POC implementation from Section 5.3 (type check, runtime execution, abort/fallback).
 * 5. WritableStream locking issue on cancellation when stream is acquired by StreamTarget.
 * 6. Bitrate & memory mathematical verification.
 */

import {
  Output,
  Mp4OutputFormat,
  WebMOutputFormat,
  StreamTarget,
  BufferTarget,
  Target,
  CanvasSource,
  AudioBufferSource,
  type StreamTargetChunk
} from 'mediabunny';

// --- Part 1: Verify POC from Section 5.3 ---

export interface StreamingExportDestination {
  kind: 'filesystem' | 'memory_fallback';
  target: Target;
  finalizeDestination: () => Promise<Blob | null>;
  cancelDestination: () => Promise<void>;
}

export async function createStreamingDestination(
  suggestedName: string,
  ext: 'mp4' | 'webm',
  mockWindow?: any
): Promise<StreamingExportDestination> {
  const mimeType = ext === 'mp4' ? 'video/mp4' : 'video/webm';
  const win = mockWindow !== undefined ? mockWindow : (typeof window !== 'undefined' ? window : undefined);

  if (win && 'showSaveFilePicker' in win) {
    try {
      const fileHandle = await win.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: ext === 'mp4' ? 'MP4 Video' : 'WebM Video',
            accept: { [mimeType]: [`.${ext}`] }
          }
        ]
      });

      const fileStream: WritableStream = await fileHandle.createWritable();

      const target = new StreamTarget(fileStream, {
        chunked: true,
        chunkSize: 16 * 1024 * 1024
      });

      return {
        kind: 'filesystem',
        target,
        finalizeDestination: async () => {
          return null;
        },
        cancelDestination: async () => {
          try {
            await fileStream.abort();
          } catch {
            // Closed or aborted (Note: if locked by StreamTarget, this throws ERR_INVALID_STATE)
          }
        }
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Exportação cancelada pelo usuário.');
      }
      // Fallback
    }
  }

  const bufferTarget = new BufferTarget();
  return {
    kind: 'memory_fallback',
    target: bufferTarget,
    finalizeDestination: async () => {
      const buf = bufferTarget.buffer;
      if (!buf) throw new Error('A codificação terminou sem gerar arquivo.');
      return new Blob([buf], { type: mimeType });
    },
    cancelDestination: async () => {}
  };
}

// --- Part 2: Empirical Test Runner ---

async function runEmpiricalTests() {
  console.log('=== CHALLENGER M7 EMPIRICAL TEST SUITE ===');
  let passCount = 0;
  let failCount = 0;

  function assert(cond: boolean, msg: string) {
    if (!cond) {
      console.error(`[FAIL] ${msg}`);
      failCount++;
      throw new Error(`Assertion failed: ${msg}`);
    } else {
      console.log(`[PASS] ${msg}`);
      passCount++;
    }
  }

  // TEST 1: mediabunny symbols and types
  console.log('\n--- Test 1: mediabunny Symbol & Target API Inspection ---');
  assert(typeof StreamTarget === 'function', 'StreamTarget is exported as a class');
  assert(typeof BufferTarget === 'function', 'BufferTarget is exported as a class');
  assert(typeof Target === 'function', 'Target is exported as base class');
  assert(StreamTarget.prototype instanceof Target, 'StreamTarget extends Target');
  assert(BufferTarget.prototype instanceof Target, 'BufferTarget extends Target');

  // TEST 2: StreamTarget constructor validation
  console.log('\n--- Test 2: StreamTarget Constructor & Options Validation ---');
  let threwOnInvalidStream = false;
  try {
    // @ts-expect-error test runtime validation
    new StreamTarget(null);
  } catch (e: any) {
    threwOnInvalidStream = e instanceof TypeError;
  }
  assert(threwOnInvalidStream, 'StreamTarget rejects non-WritableStream with TypeError');

  let threwOnBadChunkSize = false;
  try {
    const dummyWritable = new WritableStream<StreamTargetChunk>();
    new StreamTarget(dummyWritable, { chunkSize: 500 }); // < 1024
  } catch (e: any) {
    threwOnBadChunkSize = e instanceof TypeError;
  }
  assert(threwOnBadChunkSize, 'StreamTarget rejects chunkSize < 1024 with TypeError');

  // TEST 3: StreamTarget chunked writing & position verification
  console.log('\n--- Test 3: StreamTarget Real Chunk Stream Simulation ---');
  const writtenChunks: StreamTargetChunk[] = [];
  let streamClosed = false;
  let streamAborted = false;

  const testWritable = new WritableStream<StreamTargetChunk>({
    write(chunk) {
      writtenChunks.push({
        type: chunk.type,
        data: new Uint8Array(chunk.data),
        position: chunk.position
      });
    },
    close() {
      streamClosed = true;
    },
    abort() {
      streamAborted = true;
    }
  });

  const streamTarget = new StreamTarget(testWritable, {
    chunked: true,
    chunkSize: 4096 // 4 KB for test
  });

  const targetInternal = streamTarget as any;
  targetInternal._start();

  // Write 10 KB of data at offset 0
  const sampleData = new Uint8Array(10 * 1024);
  for (let i = 0; i < sampleData.length; i++) sampleData[i] = i % 256;

  targetInternal._write(sampleData, 0);
  await targetInternal._flush();
  await targetInternal._finalize(); // Flushes all pending chunks and closes stream writer

  assert(writtenChunks.length === 3, `StreamTarget successfully flushed exactly 3 chunks (got ${writtenChunks.length})`);
  assert(writtenChunks.every(c => c.type === 'write'), 'All emitted chunks have type="write"');
  assert(writtenChunks[0].position === 0 && writtenChunks[0].data.byteLength === 4096, 'Chunk 0 at pos 0, size 4096');
  assert(writtenChunks[1].position === 4096 && writtenChunks[1].data.byteLength === 4096, 'Chunk 1 at pos 4096, size 4096');
  assert(writtenChunks[2].position === 8192 && writtenChunks[2].data.byteLength === 2048, 'Chunk 2 at pos 8192, size 2048');

  const totalBytesWritten = writtenChunks.reduce((acc, c) => acc + c.data.byteLength, 0);
  assert(totalBytesWritten === sampleData.length, `Total bytes flushed (${totalBytesWritten}) matches written data (${sampleData.length})`);
  assert(streamClosed, 'Underlying stream was cleanly closed by _finalize()');

  // TEST 4: Challenge WritableStream Lock on Cancellation
  console.log('\n--- Test 4: WritableStream Lock & Cancel Behavior ---');
  const lockWritable = new WritableStream({
    write() {},
    close() {},
    abort() {}
  });
  const lockTarget = new StreamTarget(lockWritable, { chunked: true });
  const lockInternal = lockTarget as any;
  lockInternal._start();
  assert(lockWritable.locked === true, 'WritableStream becomes locked once StreamTarget starts');

  let directAbortThrew = false;
  try {
    await lockWritable.abort(new Error('direct abort'));
  } catch (e: any) {
    directAbortThrew = e.name === 'TypeError' || e.message.includes('locked');
  }
  assert(directAbortThrew, 'Calling writable.abort() directly while locked throws ERR_INVALID_STATE');

  // Proper cancellation must close target writer
  let closeSuccess = false;
  try {
    await lockInternal._close();
    closeSuccess = true;
  } catch (e) {
    closeSuccess = false;
  }
  assert(closeSuccess, 'target._close() successfully closes stream writer and drains stream without locking errors');

  // TEST 5: POC Fallback and User Abort Handling
  console.log('\n--- Test 5: Section 5.3 POC Runtime & Fallback Verification ---');

  // Case A: showSaveFilePicker cancelled by user (AbortError)
  let userCancelHandled = false;
  try {
    const mockWinAbort = {
      showSaveFilePicker: async () => {
        const err = new Error('The user aborted a request.');
        err.name = 'AbortError';
        throw err;
      }
    };
    await createStreamingDestination('test.mp4', 'mp4', mockWinAbort);
  } catch (e: any) {
    userCancelHandled = e.message === 'Exportação cancelada pelo usuário.';
  }
  assert(userCancelHandled, 'createStreamingDestination handles user AbortError with friendly message');

  // Case B: showSaveFilePicker fails with SecurityError -> graceful fallback to BufferTarget
  const mockWinSecurityError = {
    showSaveFilePicker: async () => {
      const err = new Error('Cross origin not allowed');
      err.name = 'SecurityError';
      throw err;
    }
  };
  const fallbackDest = await createStreamingDestination('test.mp4', 'mp4', mockWinSecurityError);
  assert(fallbackDest.kind === 'memory_fallback', 'Gracefully falls back to memory_fallback on SecurityError');
  assert(fallbackDest.target instanceof BufferTarget, 'Fallback target is BufferTarget');

  // Case C: Environment without showSaveFilePicker (e.g. Firefox/Safari/Node)
  const noPickerDest = await createStreamingDestination('test.webm', 'webm', {});
  assert(noPickerDest.kind === 'memory_fallback', 'Gracefully falls back to memory_fallback when showSaveFilePicker is absent');

  // Case D: Successful FileSystem stream
  let mockHandleClosed = false;
  const mockFileStream = new WritableStream({
    write(chunk) {},
    close() { mockHandleClosed = true; }
  });
  const mockWinSuccess = {
    showSaveFilePicker: async () => ({
      createWritable: async () => mockFileStream
    })
  };
  const streamDest = await createStreamingDestination('test.mp4', 'mp4', mockWinSuccess);
  assert(streamDest.kind === 'filesystem', 'Selects filesystem destination when supported');
  assert(streamDest.target instanceof StreamTarget, 'Destination target is StreamTarget');
  const finalizedBlob = await streamDest.finalizeDestination();
  assert(finalizedBlob === null, 'Filesystem export returns null Blob (written directly to disk)');

  // TEST 6: Bitrate & Memory Calculations
  console.log('\n--- Test 6: Mathematical Verification of Bitrate & RAM Claims ---');

  // 1080p60: 10 min @ 12 Mbps
  const s_1080p = (12 * 1e6 * 600) / 8; // in bytes
  const mb_1080p = s_1080p / 1e6;
  assert(mb_1080p === 900, `1080p60 10min @ 12 Mbps is exactly 900 MB (decimal): ${mb_1080p} MB`);

  // 4K60: 10 min @ 50 Mbps (worker report line 358)
  const s_4k_50 = (50 * 1e6 * 600) / 8;
  const mb_4k_50 = s_4k_50 / 1e6;
  assert(mb_4k_50 === 3750, `4K60 10min @ 50 Mbps is exactly 3750 MB (decimal): ${mb_4k_50} MB`);
  const ram_peak_4k_50 = 2.5 * mb_4k_50 + 150;
  assert(ram_peak_4k_50 === 9525, `RAM peak formula (2.5 * S + 150) yields 9525 MB for 50 Mbps: ${ram_peak_4k_50} MB`);

  // 4K60: 10 min @ 120 Mbps (ShadowPlay / NVENC CQP High Bitrate)
  const s_4k_120 = (120 * 1e6 * 600) / 8;
  const gb_4k_120 = s_4k_120 / 1e9;
  const gib_4k_120 = s_4k_120 / (1024 * 1024 * 1024);
  console.log(`4K60 10min @ 120 Mbps: Raw size = ${gb_4k_120} GB (decimal) / ${gib_4k_120.toFixed(2)} GiB (binary)`);
  assert(gb_4k_120 === 9.0, `4K60 10min @ 120 Mbps raw file size is 9.0 GB decimal: ${gb_4k_120} GB`);
  const ram_peak_4k_120 = 2.5 * (s_4k_120 / 1e6) + 150;
  assert(ram_peak_4k_120 === 22650, `RAM peak formula (2.5 * S + 150) yields 22,650 MB (22.65 GB) RAM for 120 Mbps`);

  // TEST 7: BufferTarget Hard Limit (ARRAY_BUFFER_MAX_SIZE = 2**32)
  console.log('\n--- Test 7: BufferTarget ArrayBuffer Size Boundary Check ---');
  const bt = new BufferTarget();
  const btInternal = bt as any;
  assert(typeof btInternal._ensureSize === 'function', 'BufferTarget has internal _ensureSize');

  let caughtBufferOverflow = false;
  try {
    // Attempting to size beyond 2**32 (4 GiB)
    btInternal._ensureSize(2 ** 32 + 1);
  } catch (e: any) {
    caughtBufferOverflow = e.message.includes('ArrayBuffer exceeded maximum size of 4294967296 bytes');
  }
  assert(caughtBufferOverflow, 'BufferTarget enforces hard 4 GiB maximum (2**32), throwing fatal error if exceeded');

  console.log(`\n========================================`);
  console.log(`TOTAL TESTS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
  console.log(`========================================`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runEmpiricalTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
