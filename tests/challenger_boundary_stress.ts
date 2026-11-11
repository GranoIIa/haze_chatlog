/**
 * Challenger 2: Deep Boundary, Concurrency & Invariant Stress Harness
 * Validates:
 * 1. Edge-case dimensions for calculateCenterCrop (negative, NaN, Infinity, extreme aspect ratios)
 * 2. High-entropy GIF encoding stress: Find exact frame threshold exceeding 256 KB Discord limit
 * 3. Concurrent encoding safety: Multiple SimpleGifEncoder instances running in parallel
 * 4. Concurrent Web Worker stress: 10 MockWorkers processing jobs simultaneously
 * 5. Global URL Leak Invariant Check on the Master Suite
 */

import { setupMockEnv, resetMockEnv, urlTracker, calculateCenterCrop, applyDiscordPreset, createMockCanvas, MockWorker } from './harness/mockEnv';
import { SimpleGifEncoder } from '../src/utils/gifEncoder';
import { runSuite } from './harness/testRunner';

setupMockEnv();

export function testCropBoundaryCorners() {
  console.log('\n--- 1. Testing calculateCenterCrop Edge Cases ---');

  // Case 1: Standard positive
  const standard = calculateCenterCrop(1920, 1080);
  console.log('Standard 16:9 (1920x1080):', standard);

  // Case 2: Zero
  const zero = calculateCenterCrop(0, 0);
  console.log('Zero (0x0):', zero);

  // Case 3: Negative dimensions
  const negative = calculateCenterCrop(-500, 1000);
  console.log('Negative width (-500, 1000):', negative);

  // Case 4: NaN dimensions
  const nanDim = calculateCenterCrop(NaN, 720);
  console.log('NaN width (NaN, 720):', nanDim);

  // Case 5: Infinity dimensions
  const infDim = calculateCenterCrop(Infinity, 720);
  console.log('Infinity width (Infinity, 720):', infDim);

  return { standard, zero, negative, nanDim, infDim };
}

export function testHighEntropyGifStress() {
  console.log('\n--- 2. Testing High-Entropy 128x128 GIF Encoding vs 256 KB Discord Bound ---');

  const canvas = createMockCanvas(128, 128);
  const ctx = canvas.getContext('2d')!;

  // Fill canvas with deterministic pseudo-random high-entropy noise
  const generateNoiseFrame = (seed: number) => {
    const imgData = ctx.createImageData(128, 128);
    let s = seed;
    for (let i = 0; i < imgData.data.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      imgData.data[i] = s & 0xFF;         // R
      imgData.data[i + 1] = (s >>> 8) & 0xFF;  // G
      imgData.data[i + 2] = (s >>> 16) & 0xFF; // B
      imgData.data[i + 3] = 255;          // A
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const results: Array<{ frames: number; bytes: number; kb: number; exceeds256KB: boolean }> = [];

  for (let frames of [5, 10, 15, 16, 17, 18, 20, 25]) {
    const encoder = new SimpleGifEncoder(128, 128, 100);
    encoder.start();

    for (let f = 0; f < frames; f++) {
      generateNoiseFrame(f * 1000 + 42);
      encoder.addFrame(ctx as any);
    }

    const blob = encoder.finish();
    const bytes = blob.size;
    const kb = Number((bytes / 1024).toFixed(2));
    const exceeds256KB = bytes > 256 * 1024;

    results.push({ frames, bytes, kb, exceeds256KB });
    console.log(`  Frames: ${frames.toString().padStart(2, ' ')} | Size: ${kb.toFixed(2).padStart(7, ' ')} KB (${bytes} bytes) | Exceeds 256KB: ${exceeds256KB ? 'YES [EXCEEDED]' : 'NO [PASS]'}`);
  }

  return results;
}

export async function testConcurrentGifEncoding() {
  console.log('\n--- 3. Testing Concurrent GIF Encoding (Re-entrancy / Parallel Instances) ---');

  const instances = 5;
  const promises: Promise<{ id: number; bytes: number; durationMs: number }>[] = [];

  for (let i = 0; i < instances; i++) {
    promises.push((async (id: number) => {
      const start = Date.now();
      const canvas = createMockCanvas(64, 64);
      const ctx = canvas.getContext('2d')!;
      const encoder = new SimpleGifEncoder(64, 64, 100);
      encoder.start();

      for (let f = 0; f < 5; f++) {
        ctx.fillStyle = `rgb(${id * 40}, ${f * 50}, 128)`;
        ctx.fillRect(0, 0, 64, 64);
        encoder.addFrame(ctx as any);
      }

      const blob = encoder.finish();
      return { id, bytes: blob.size, durationMs: Date.now() - start };
    })(i));
  }

  const results = await Promise.all(promises);
  for (const r of results) {
    console.log(`  Instance ${r.id}: Generated ${r.bytes} bytes in ${r.durationMs}ms`);
  }

  // All instances with identical dimensions and frame counts should produce identical or valid byte streams
  const sizes = results.map(r => r.bytes);
  console.log('  Instance byte sizes:', sizes);
  return results;
}

export async function testConcurrentMockWorkers() {
  console.log('\n--- 4. Testing Concurrent Web Workers (10 Parallel Workers) ---');

  const workerCount = 10;
  const promises: Promise<{ id: number; messages: number; terminated: boolean }>[] = [];

  for (let i = 0; i < workerCount; i++) {
    promises.push(new Promise((resolve) => {
      const worker = new MockWorker(`worker_${i}.js`);
      let messageCount = 0;

      worker.onmessage = (e) => {
        messageCount++;
        if (e.data.type === 'PROGRESS' && e.data.progress === 0) {
          worker.postMessage({ type: 'ADD_FRAME' });
        } else if (e.data.type === 'PROGRESS' && e.data.progress === 50) {
          worker.postMessage({ type: 'FINISH' });
        } else if (e.data.type === 'DONE') {
          worker.terminate();
          resolve({ id: i, messages: messageCount, terminated: worker.terminated });
        }
      };

      worker.postMessage({ type: 'START' });
    }));
  }

  const results = await Promise.all(promises);
  for (const r of results) {
    console.log(`  Worker ${r.id}: Processed ${r.messages} messages, terminated: ${r.terminated}`);
  }

  const allTerminated = results.every(r => r.terminated);
  console.log('  All 10 workers terminated cleanly:', allTerminated);
  return results;
}

export async function testSuiteUrlLeakInvariant() {
  console.log('\n--- 5. Testing Master Test Suite URL Leak Invariant ---');

  resetMockEnv();
  console.log(`Initial activeUrls count: ${urlTracker.activeUrls.size}`);

  // Import all test suites
  await import('./tier1-features/test_features_01_05');
  await import('./tier1-features/test_features_06_10');
  await import('./tier1-features/test_features_11_15');
  await import('./tier1-features/test_features_16_20');
  await import('./tier1-features/test_features_21_25');
  await import('./tier2-boundaries/test_tier2_chat');
  await import('./tier2-boundaries/test_tier2_canvas');
  await import('./tier2-boundaries/test_tier2_gif');
  await import('./tier3-crossfeature/test_tier3_pairwise');
  await import('./tier4-scenarios/test_tier4_scenarios');

  // Suppress output
  const origLog = console.log;
  console.log = () => {};
  let res;
  try {
    res = await runSuite({ verbose: false });
  } finally {
    console.log = origLog;
  }

  console.log(`Ran ${res.total} tests: Passed=${res.passed}, Failed=${res.failed}`);
  console.log(`Post-Suite urlTracker.createdUrls: ${urlTracker.createdUrls.length}`);
  console.log(`Post-Suite urlTracker.revokedUrls: ${urlTracker.revokedUrls.length}`);
  console.log(`Post-Suite urlTracker.activeUrls.size: ${urlTracker.activeUrls.size}`);
  console.log(`Post-Suite activeUrls:`, Array.from(urlTracker.activeUrls));

  const hasLeak = urlTracker.activeUrls.size > 0;
  console.log(`URL Leak Invariant Violation: ${hasLeak ? 'FAIL (Leak detected)' : 'PASS (Zero leaks)'}`);

  return { hasLeak, activeUrls: Array.from(urlTracker.activeUrls) };
}

async function runAll() {
  testCropBoundaryCorners();
  testHighEntropyGifStress();
  await testConcurrentGifEncoding();
  await testConcurrentMockWorkers();
  await testSuiteUrlLeakInvariant();
}

runAll();
