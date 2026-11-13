/**
 * Challenger 1: Empirical Adversarial Stress Harness for Milestone 2 (R3)
 * Target: FramePlayer concurrency, mutex serialization, sudden disposal, and lifecycle safety.
 */

import { FramePlayer } from '../src/video/framePlayer';
import type { CanvasSink } from 'mediabunny';

interface TestFrame {
  canvas: { id: string; frameNum: number };
  timestamp: number;
}

interface MockGeneratorTracking {
  createdCount: number;
  nextCount: number;
  returnCount: number;
  activeIterators: Set<AsyncGenerator<TestFrame, void, unknown>>;
  concurrentNextCalls: number;
  maxConcurrentNextCalls: number;
  generatorAlreadyExecutingCaught: boolean;
}

function createTrackingSink(options?: {
  frameInterval?: number;
  totalDuration?: number;
  nextDelayMs?: number;
  throwOnFrame?: number;
  throwOnReturn?: boolean;
}): { sink: CanvasSink; tracking: MockGeneratorTracking } {
  const frameInterval = options?.frameInterval ?? 1 / 30;
  const totalDuration = options?.totalDuration ?? 30;
  const nextDelayMs = options?.nextDelayMs ?? 0;
  const throwOnFrame = options?.throwOnFrame ?? -1;
  const throwOnReturn = options?.throwOnReturn ?? false;

  const tracking: MockGeneratorTracking = {
    createdCount: 0,
    nextCount: 0,
    returnCount: 0,
    activeIterators: new Set(),
    concurrentNextCalls: 0,
    maxConcurrentNextCalls: 0,
    generatorAlreadyExecutingCaught: false
  };

  const sink: CanvasSink = {
    canvases(startSec: number = 0) {
      tracking.createdCount++;
      let currentSec = Math.max(0, startSec);
      let frameIndex = Math.floor(currentSec / frameInterval);
      let isExecuting = false;
      let isReturned = false;

      async function* generate(): AsyncGenerator<TestFrame, void, unknown> {
        try {
          while (currentSec <= totalDuration && !isReturned) {
            if (nextDelayMs > 0) {
              await new Promise(r => setTimeout(r, nextDelayMs));
            }
            if (throwOnFrame >= 0 && frameIndex === throwOnFrame) {
              throw new Error(`Intentional synthetic decode error at frame ${frameIndex}`);
            }
            yield {
              canvas: { id: `canvas_${currentSec.toFixed(3)}`, frameNum: frameIndex },
              timestamp: currentSec
            };
            frameIndex++;
            currentSec = frameIndex * frameInterval;
          }
        } finally {
          tracking.activeIterators.delete(gen);
        }
      }

      const innerGen = generate();

      // Wrap generator to strictly detect concurrent next() calls on the same iterator
      const gen: AsyncGenerator<TestFrame, void, unknown> = {
        async next() {
          tracking.nextCount++;
          if (isExecuting) {
            tracking.generatorAlreadyExecutingCaught = true;
            throw new TypeError('Generator is already executing');
          }
          isExecuting = true;
          tracking.concurrentNextCalls++;
          if (tracking.concurrentNextCalls > tracking.maxConcurrentNextCalls) {
            tracking.maxConcurrentNextCalls = tracking.concurrentNextCalls;
          }

          try {
            return await innerGen.next();
          } finally {
            isExecuting = false;
            tracking.concurrentNextCalls--;
          }
        },
        async return(value?: unknown) {
          tracking.returnCount++;
          isReturned = true;
          tracking.activeIterators.delete(gen);
          if (throwOnReturn) {
            throw new Error('Synthetic return() failure');
          }
          return await innerGen.return(value as any);
        },
        async throw(err?: unknown) {
          tracking.activeIterators.delete(gen);
          return await innerGen.throw(err);
        },
        [Symbol.asyncIterator]() {
          return this;
        }
      };

      tracking.activeIterators.add(gen);
      return gen as any;
    }
  } as unknown as CanvasSink;

  return { sink, tracking };
}

// Test runner helpers
interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, any>;
}

const results: TestResult[] = [];

async function testCase(suite: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ suite, name, passed: true });
    console.log(`  \x1b[32m✓ [PASS]\x1b[0m [${suite}] ${name}`);
  } catch (err: any) {
    results.push({ suite, name, passed: false, error: err.message, details: err });
    console.log(`  \x1b[31m✗ [FAIL]\x1b[0m [${suite}] ${name}\n    -> Error: ${err.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ' | ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function runEmpiricalSuite() {
  console.log('\n\x1b[35m========================================================================\x1b[0m');
  console.log('\x1b[35m  CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS SUITE FOR FRAMEPLAYER (R3) \x1b[0m');
  console.log('\x1b[35m========================================================================\x1b[0m\n');

  // ============================================================================
  // SUITE 1: CONCURRENT BURST & ORDERING STRESS
  // ============================================================================
  console.log('\x1b[33m--- Suite 1: Concurrent Burst & Ordering Stress ---\x1b[0m');

  await testCase('Burst_Stress', '100 concurrent frameAt calls with monotonically increasing timestamps', async () => {
    const player = new FramePlayer();
    const { sink, tracking } = createTrackingSink({ nextDelayMs: 2 });

    // Fire 100 concurrent requests without awaiting
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 100; i++) {
      const t = i * 0.033; // 30fps stepping
      promises.push(player.frameAt('clip_mono', sink, t));
    }

    const frames = await Promise.all(promises);

    // Verify:
    // 1. None threw "Generator is already executing"
    assertEqual(tracking.generatorAlreadyExecutingCaught, false, 'Generator was called concurrently!');
    // 2. All 100 returned a valid frame
    assertEqual(frames.length, 100);
    for (let i = 0; i < frames.length; i++) {
      assert(frames[i] !== null, `Frame ${i} should not be null`);
    }
    // 3. Max concurrent next calls was strictly 1 (serialized)
    assertEqual(tracking.maxConcurrentNextCalls, 1, 'Max concurrent calls on single generator must be 1');
    player.dispose();
  });

  await testCase('Burst_Stress', '100 concurrent frameAt calls with chaotic random scrub timestamps', async () => {
    const player = new FramePlayer();
    const { sink, tracking } = createTrackingSink({ nextDelayMs: 2 });

    const timestamps = Array.from({ length: 100 }, () => Math.random() * 20);
    const promises = timestamps.map(t => player.frameAt('clip_chaos', sink, t));

    const frames = await Promise.all(promises);

    assertEqual(tracking.generatorAlreadyExecutingCaught, false, 'No generator reentrancy error');
    assertEqual(frames.length, 100);
    assertEqual(tracking.maxConcurrentNextCalls, 1, 'Sequential serialization enforced');
    player.dispose();
  });

  await testCase('Burst_Stress', 'Multi-stream concurrency (3 streams interleaved concurrently)', async () => {
    const player = new FramePlayer();
    const s1 = createTrackingSink({ nextDelayMs: 2 });
    const s2 = createTrackingSink({ nextDelayMs: 2 });
    const s3 = createTrackingSink({ nextDelayMs: 2 });

    const promises: Promise<any>[] = [];
    for (let i = 0; i < 30; i++) {
      promises.push(player.frameAt('clip_1', s1.sink, i * 0.05));
      promises.push(player.frameAt('clip_2', s2.sink, i * 0.05));
      promises.push(player.frameAt('clip_3', s3.sink, i * 0.05));
    }

    const frames = await Promise.all(promises);
    assertEqual(frames.length, 90);

    assertEqual(s1.tracking.generatorAlreadyExecutingCaught, false);
    assertEqual(s2.tracking.generatorAlreadyExecutingCaught, false);
    assertEqual(s3.tracking.generatorAlreadyExecutingCaught, false);

    player.dispose();
  });

  // ============================================================================
  // SUITE 2: SUDDEN DISPOSAL & ORPHANED GENERATOR STRESS
  // ============================================================================
  console.log('\n\x1b[33m--- Suite 2: Sudden Disposal & Orphaned Generator Stress ---\x1b[0m');

  await testCase('Disposal_Stress', 'Dispose while initial frameAt is awaiting decode (shouldReset path)', async () => {
    const player = new FramePlayer();
    // Simulate slow decode: 50ms per next()
    const { sink, tracking } = createTrackingSink({ nextDelayMs: 50 });

    const callPromise = player.frameAt('clip_disp_init', sink, 1.0);

    // Call dispose after 15ms (while it.next() is in-flight)
    await new Promise(r => setTimeout(r, 15));
    player.dispose();

    const res = await callPromise;
    assertEqual(res, null, 'In-flight frameAt must resolve to null upon dispose');

    // Wait for generator to settle
    await new Promise(r => setTimeout(r, 100));

    // Internal inspection via reflective access
    const internalSt = (player as any).st as Map<string, any>;
    const internalQueues = (player as any).queues as Map<string, any>;

    assertEqual(internalSt.size, 0, 'this.st must have 0 generators after dispose');
    assertEqual(internalQueues.size, 0, 'this.queues must have 0 promises after dispose');
    assertEqual(tracking.activeIterators.size, 0, 'Active iterators must be 0 (returned)');
  });

  await testCase('Disposal_Stress', 'Dispose while sequential while-loop is decoding frames', async () => {
    const player = new FramePlayer();
    const { sink, tracking } = createTrackingSink({ frameInterval: 0.033, nextDelayMs: 20 });

    // Initial frame to open generator
    await player.frameAt('clip_loop', sink, 0);

    // Now request frame at 0.15s (requires advancing ~5 frames in while loop)
    const callPromise = player.frameAt('clip_loop', sink, 0.15);

    // Dispose after 30ms (while advancing in while loop)
    await new Promise(r => setTimeout(r, 30));
    player.dispose();

    const res = await callPromise;
    assertEqual(res, null, 'Must return null when disposed during while loop advance');

    await new Promise(r => setTimeout(r, 80));

    const internalSt = (player as any).st as Map<string, any>;
    assertEqual(internalSt.size, 0, 'this.st must be empty');
    assertEqual(tracking.activeIterators.size, 0, 'Generator must be closed');
  });

  await testCase('Disposal_Stress', 'ADVERSARIAL: Dispose during catch-up re-seek (MAX_CATCHUP_FRAMES branch)', async () => {
    const player = new FramePlayer();
    let canvasesCallCount = 0;
    let reseekGenReturned = false;

    const adversarialSink: any = {
      canvases(s: number) {
        canvasesCallCount++;
        const callNum = canvasesCallCount;
        return {
          async next() {
            if (callNum === 1) {
              return { value: { canvas: {}, timestamp: 0 }, done: false };
            } else {
              // Re-seek generator: dispose player while this next() is in-flight!
              player.dispose();
              return { value: { canvas: {}, timestamp: s }, done: false };
            }
          },
          async return() {
            reseekGenReturned = true;
            return { done: true, value: undefined };
          }
        };
      }
    };

    // 1. Initial frameAt to open stream
    await player.frameAt('clip_catchup', adversarialSink, 0);

    // 2. Prepare state so next frameAt enters while loop and exceeds MAX_CATCHUP_FRAMES (8)
    const st = (player as any).st.get('clip_catchup');
    let t = 0.01;
    st.it = {
      async next() {
        t += 0.01;
        return { value: { canvas: {}, timestamp: t }, done: false };
      },
      async return() {
        return { done: true, value: undefined };
      }
    };
    st.nxt = { canvas: {}, timestamp: 0.01 };

    // 3. Request s = 0.20: shouldReset is false (0.20 < 0.01 + 0.35 = 0.36),
    // enters while loop, catchUpCount exceeds 8, triggers re-seek canvases(0.20).
    // In re-seek it.next(), player.dispose() is called.
    const res = await player.frameAt('clip_catchup', adversarialSink, 0.20);
    assertEqual(res, null, 'Result must be null when player is disposed');

    const internalSt = (player as any).st as Map<string, any>;
    if (internalSt.size > 0) {
      console.log(`    \x1b[31m[CRITICAL VULNERABILITY REPRODUCED]\x1b[0m Orphaned keys in this.st: ${Array.from(internalSt.keys()).join(', ')}`);
    }

    assertEqual(internalSt.size, 0, 'VULNERABILITY: Generator resurrected in this.st after dispose() in MAX_CATCHUP_FRAMES branch!');
  });

  await testCase('Disposal_Stress', 'Post-disposal calls to frameAt return null immediately', async () => {
    const player = new FramePlayer();
    const { sink, tracking } = createTrackingSink();
    player.dispose();

    const res1 = await player.frameAt('k1', sink, 1.0);
    const res2 = await player.frameAt('k2', sink, 2.0);

    assertEqual(res1, null);
    assertEqual(res2, null);
    assertEqual(tracking.createdCount, 0, 'No sink.canvases should be created after dispose');
  });

  await testCase('Disposal_Stress', 'Multiple consecutive dispose() calls are idempotent', async () => {
    const player = new FramePlayer();
    const { sink } = createTrackingSink();
    await player.frameAt('k1', sink, 0);

    player.dispose();
    player.dispose();
    player.dispose();

    const internalSt = (player as any).st as Map<string, any>;
    assertEqual(internalSt.size, 0);
  });

  // ============================================================================
  // SUITE 3: FAULT INJECTION & ERROR RECOVERY
  // ============================================================================
  console.log('\n\x1b[33m--- Suite 3: Fault Injection & Error Recovery ---\x1b[0m');

  await testCase('Fault_Injection', 'Decoder throw during step is caught and recovers on next call', async () => {
    const player = new FramePlayer();
    // Sink throws at frame 3
    const { sink } = createTrackingSink({ frameInterval: 0.05, throwOnFrame: 3 });

    // Frame 0: ok
    const f0 = await player.frameAt('clip_err', sink, 0);
    assert(f0 !== null, 'Frame 0 must succeed');

    // Frame 3 (t = 0.15): should throw internally and return null
    const f3 = await player.frameAt('clip_err', sink, 0.15);
    assertEqual(f3, null, 'Error frame must return null gracefully');

    // Internal state should be cleaned
    const internalSt = (player as any).st as Map<string, any>;
    assertEqual(internalSt.has('clip_err'), false, 'Corrupted state must be removed from this.st');

    // Next call with a normal sink should recover without hanging
    const normalSink = createTrackingSink().sink;
    const fRecover = await player.frameAt('clip_err', normalSink, 0.5);
    assert(fRecover !== null, 'FramePlayer must recover on next valid call');

    player.dispose();
  });

  await testCase('Fault_Injection', 'Sink return() rejection is handled cleanly without unhandled rejection', async () => {
    const player = new FramePlayer();
    const { sink } = createTrackingSink({ throwOnReturn: true });

    await player.frameAt('clip_throw_return', sink, 0);
    // Trigger reset by jumping far ahead
    const fJump = await player.frameAt('clip_throw_return', sink, 10.0);
    assert(fJump !== null, 'Jump must succeed even if old iterator throwed on return');

    player.dispose();
  });

  // ============================================================================
  // SUITE 4: PRUNING & ACTIVE STREAM BOUNDARIES
  // ============================================================================
  console.log('\n\x1b[33m--- Suite 4: Prune & Lifecycle Boundaries ---\x1b[0m');

  await testCase('Prune_Stress', 'Prune terminates inactive generators and cleans memory', async () => {
    const player = new FramePlayer();
    const s1 = createTrackingSink();
    const s2 = createTrackingSink();
    const s3 = createTrackingSink();

    await player.frameAt('clip_active', s1.sink, 0);
    await player.frameAt('clip_old1', s2.sink, 0);
    await player.frameAt('clip_old2', s3.sink, 0);

    const internalSt = (player as any).st as Map<string, any>;
    assertEqual(internalSt.size, 3);

    // Prune keeping only 'clip_active'
    player.prune(new Set(['clip_active']));

    assertEqual(internalSt.size, 1);
    assertEqual(internalSt.has('clip_active'), true);
    assertEqual(internalSt.has('clip_old1'), false);
    assertEqual(internalSt.has('clip_old2'), false);

    assertEqual(s2.tracking.activeIterators.size, 0, 'Inactive s2 must be returned');
    assertEqual(s3.tracking.activeIterators.size, 0, 'Inactive s3 must be returned');

    player.dispose();
  });

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n\x1b[35m========================================================================\x1b[0m');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\x1b[35m  RESULTS: Total: ${results.length} | Passed: ${passed} | Failed: ${failed}\x1b[0m`);
  console.log('\x1b[35m========================================================================\x1b[0m\n');

  if (failed > 0) {
    console.error(`FAILED TESTS (${failed}):`);
    for (const r of results.filter(r => !r.passed)) {
      console.error(`- [${r.suite}] ${r.name}: ${r.error}`);
    }
    process.exit(1);
  } else {
    console.log('ALL EMPIRICAL TESTS PASSED.');
  }
}

runEmpiricalSuite().catch(err => {
  console.error('Fatal test harness error:', err);
  process.exit(1);
});
