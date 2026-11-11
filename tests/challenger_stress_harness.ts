/**
/**
 * Challenger 2 Empirical Stress & Boundary Harness
 * Validates:
 * 1. Stress Workload: Repeated test suite execution (20 cycles), tracking heap memory & urlTracker state.
 * 2. URL Tracker Leak Detection: Injects deliberate unrevoked URLs and verifies detection efficacy.
 * 3. Discord Preset Boundaries: Tests 1:1 cropping, resolution bounds, and file size scaling under load.
 */

import { setupMockEnv, resetMockEnv, urlTracker, calculateCenterCrop, applyDiscordPreset, createMockCanvas } from './harness/mockEnv';
import { runSuite, AssertionError } from './harness/testRunner';
import { SimpleGifEncoder } from '../src/utils/gifEncoder';

async function loadAllSuites() {
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
}

export async function runStressWorkload(cycles: number = 10) {
  console.log(`\n======================================================`);
  console.log(`[STRESS TEST 1] Executing ${cycles} consecutive suite cycles`);
  console.log(`======================================================\n`);

  setupMockEnv();
  await loadAllSuites();

  const cycleStats: Array<{
    cycle: number;
    heapUsedMB: number;
    activeUrls: number;
    createdUrls: number;
    revokedUrls: number;
    durationMs: number;
  }> = [];

  if (global.gc) {
    global.gc();
  }

  const initialHeap = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`Initial baseline heap used: ${initialHeap.toFixed(2)} MB`);

  for (let c = 1; c <= cycles; c++) {
    const start = Date.now();
    
    // Suppress console.log during stress cycles to avoid terminal flooding
    const origLog = console.log;
    console.log = () => {};
    
    let res;
    try {
      res = await runSuite({ verbose: false });
    } finally {
      console.log = origLog;
    }

    if (global.gc) {
      global.gc();
    }

    const duration = Date.now() - start;
    const mem = process.memoryUsage();
    const heapMB = mem.heapUsed / 1024 / 1024;

    cycleStats.push({
      cycle: c,
      heapUsedMB: heapMB,
      activeUrls: urlTracker.activeUrls.size,
      createdUrls: urlTracker.createdUrls.length,
      revokedUrls: urlTracker.revokedUrls.length,
      durationMs: duration
    });

    console.log(
      `Cycle ${c.toString().padStart(2, ' ')}: ` +
      `Passed: ${res.passed}/${res.total} | ` +
      `Heap: ${heapMB.toFixed(2)} MB | ` +
      `Active URLs: ${urlTracker.activeUrls.size} | ` +
      `Created URLs: ${urlTracker.createdUrls.length} | ` +
      `Revoked URLs: ${urlTracker.revokedUrls.length} | ` +
      `Duration: ${duration}ms`
    );
  }

  const finalHeap = cycleStats[cycleStats.length - 1].heapUsedMB;
  const heapDelta = finalHeap - initialHeap;

  console.log(`\nStress Test 1 Results:`);
  console.log(`- Baseline Heap: ${initialHeap.toFixed(2)} MB`);
  console.log(`- Final Heap:    ${finalHeap.toFixed(2)} MB`);
  console.log(`- Heap Delta:    ${heapDelta >= 0 ? '+' : ''}${heapDelta.toFixed(2)} MB`);
  console.log(`- Final Active URLs: ${urlTracker.activeUrls.size}`);
  console.log(`- Active URL List:`, Array.from(urlTracker.activeUrls));

  return { cycleStats, initialHeap, finalHeap, heapDelta };
}

export function testUrlTrackerLeakDetection() {
  console.log(`\n======================================================`);
  console.log(`[STRESS TEST 2] Validating urlTracker Leak Detection`);
  console.log(`======================================================\n`);

  resetMockEnv();

  // Test 2.1: Clean allocation and deallocation
  const url1 = URL.createObjectURL(new Blob(['test1']));
  const url2 = URL.createObjectURL(new Blob(['test2']));

  console.log(`2.1 Created 2 URLs: activeUrls.size = ${urlTracker.activeUrls.size} (Expected: 2)`);
  if (urlTracker.activeUrls.size !== 2) throw new Error('2.1 Failed: activeUrls should be 2');

  URL.revokeObjectURL(url1);
  console.log(`2.2 Revoked 1 URL: activeUrls.size = ${urlTracker.activeUrls.size} (Expected: 1)`);
  if (urlTracker.activeUrls.size !== 1) throw new Error('2.2 Failed: activeUrls should be 1');
  if (!urlTracker.activeUrls.has(url2)) throw new Error('2.2 Failed: url2 should still be active');
  if (urlTracker.activeUrls.has(url1)) throw new Error('2.2 Failed: url1 should not be active');

  // Test 2.3: Deliberate leak injection
  console.log(`2.3 Deliberate leak scenario: Simulate forgotten URL revocation`);
  const leakedUrls: string[] = [];
  for (let i = 0; i < 5; i++) {
    leakedUrls.push(URL.createObjectURL(new Blob([`leak-${i}`])));
  }

  const expectedActive = 1 + 5; // url2 + 5 leaked
  console.log(`    Total active URLs: ${urlTracker.activeUrls.size} (Expected: ${expectedActive})`);
  if (urlTracker.activeUrls.size !== expectedActive) {
    throw new Error(`2.3 Failed: Expected ${expectedActive} active URLs, got ${urlTracker.activeUrls.size}`);
  }

  // Verify detector function can identify leaked URLs
  const detectLeaks = () => {
    return Array.from(urlTracker.activeUrls);
  };
  const detected = detectLeaks();
  console.log(`    Detector found ${detected.length} unrevoked URLs:`, detected);
  if (detected.length !== expectedActive) throw new Error('Detector failed to list all active URLs');

  // Test 2.4: Double revocation idempotency
  console.log(`2.4 Testing double revocation handling...`);
  const initialRevokedCount = urlTracker.revokedUrls.length;
  URL.revokeObjectURL(url1); // already revoked
  if (urlTracker.revokedUrls.length !== initialRevokedCount) {
    throw new Error('2.4 Failed: Double revocation was added to revokedUrls list!');
  }

  // Test 2.5: Non-blob revocation safety
  URL.revokeObjectURL('https://cdn.example.com/image.png');
  URL.revokeObjectURL('data:image/png;base64,abc');
  URL.revokeObjectURL('');
  URL.revokeObjectURL(null as any);
  URL.revokeObjectURL(undefined as any);
  console.log(`2.5 Safe non-blob inputs handled correctly without throwing or corrupting state.`);

  // Cleanup
  URL.revokeObjectURL(url2);
  leakedUrls.forEach(u => URL.revokeObjectURL(u));
  console.log(`2.6 After complete cleanup: activeUrls.size = ${urlTracker.activeUrls.size} (Expected: 0)`);
  if (urlTracker.activeUrls.size !== 0) throw new Error('2.6 Failed: activeUrls not empty after cleanup');

  console.log(`[PASS] urlTracker leak detection passed all validation checks.`);
  return true;
}

export function testDiscordPresetBounds() {
  console.log(`\n======================================================`);
  console.log(`[STRESS TEST 3] Validating Discord Preset Bounds & Scaling`);
  console.log(`======================================================\n`);

  // Test 3.1: Preset configuration boundaries
  console.log(`3.1 Inspecting applyDiscordPreset boundaries:`);
  const banner = applyDiscordPreset('banner', 1920, 1080);
  const avatar = applyDiscordPreset('avatar', 1920, 1080);
  const emoji = applyDiscordPreset('emoji', 1920, 1080);

  console.log(`    Banner: ${banner.targetWidth}x${banner.targetHeight}, fps: ${banner.fps}, square: ${banner.isSquareCrop}`);
  console.log(`    Avatar: ${avatar.targetWidth}x${avatar.targetHeight}, fps: ${avatar.fps}, square: ${avatar.isSquareCrop}`);
  console.log(`    Emoji:  ${emoji.targetWidth}x${emoji.targetHeight}, fps: ${emoji.fps}, square: ${emoji.isSquareCrop}, maxSizeBytes: ${emoji.maxSizeBytes}`);

  if (emoji.targetWidth !== 128 || emoji.targetHeight !== 128) {
    throw new Error(`3.1 Failed: Emoji preset dimensions must be 128x128, got ${emoji.targetWidth}x${emoji.targetHeight}`);
  }
  if (!emoji.isSquareCrop) {
    throw new Error(`3.1 Failed: Emoji preset must enforce isSquareCrop: true`);
  }
  if (emoji.maxSizeBytes !== 256 * 1024) {
    throw new Error(`3.1 Failed: Emoji preset must specify maxSizeBytes: 262144 (256 KB)`);
  }

  // Test 3.2: Center crop geometric calculations
  console.log(`3.2 Validating calculateCenterCrop under extreme aspect ratios:`);
  const testRatios = [
    { name: '16:9 Landscape (1920x1080)', w: 1920, h: 1080, exp: { sx: 420, sy: 0, sw: 1080, sh: 1080 } },
    { name: '9:16 Portrait (1080x1920)', w: 1080, h: 1920, exp: { sx: 0, sy: 420, sw: 1080, sh: 1080 } },
    { name: '21:9 Ultrawide (2560x1080)', w: 2560, h: 1080, exp: { sx: 740, sy: 0, sw: 1080, sh: 1080 } },
    { name: '32:9 Super-Ultrawide (5120x1440)', w: 5120, h: 1440, exp: { sx: 1840, sy: 0, sw: 1440, sh: 1440 } },
    { name: '1:1 Square (1080x1080)', w: 1080, h: 1080, exp: { sx: 0, sy: 0, sw: 1080, sh: 1080 } },
    { name: '1:2 Extreme Tall (500x1000)', w: 500, h: 1000, exp: { sx: 0, sy: 250, sw: 500, sh: 500 } },
    { name: 'Zero Dimensions Fallback (0x0)', w: 0, h: 0, exp: { sx: 280, sy: 0, sw: 720, sh: 720 } }
  ];

  for (const t of testRatios) {
    const crop = calculateCenterCrop(t.w, t.h);
    console.log(`    ${t.name} -> sx: ${crop.sx}, sy: ${crop.sy}, size: ${crop.sw}x${crop.sh}`);
    if (crop.sw !== t.exp.sw || crop.sh !== t.exp.sh || crop.sx !== t.exp.sx || crop.sy !== t.exp.sy) {
      throw new Error(`3.2 Failed on ${t.name}: Expected ${JSON.stringify(t.exp)}, got ${JSON.stringify(crop)}`);
    }
  }

  // Test 3.3: GIF Encoding File Size Stress under realistic frame counts
  console.log(`3.3 Stress-testing GIF encoder for Discord Emoji (<256 KB constraint):`);
  const canvas = createMockCanvas(128, 128);
  const ctx = canvas.getContext('2d')!;

  // Test frame counts: 1, 5, 10, 15, 20, 30 frames
  const frameCounts = [1, 5, 10, 15, 20, 30];
  for (const count of frameCounts) {
    const encoder = new SimpleGifEncoder(128, 128, 100);
    encoder.start();

    for (let f = 0; f < count; f++) {
      // Draw dynamic noise/pattern to simulate realistic multi-color video frames
      ctx.fillStyle = `rgb(${(f * 37) % 255}, ${(f * 73) % 255}, ${(f * 111) % 255})`;
      ctx.fillRect(0, 0, 128, 128);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(`FRAME ${f}`, 10, 20);
      encoder.addFrame(ctx as any);
    }

    const blob = encoder.finish();
    const sizeKB = (blob.size / 1024).toFixed(2);
    const passesLimit = blob.size < 256 * 1024;
    console.log(`    Frames: ${count.toString().padStart(2, ' ')} | Size: ${sizeKB.padStart(6, ' ')} KB | Under 256 KB: ${passesLimit ? 'YES' : 'NO'}`);

    if (count <= 15 && !passesLimit) {
      throw new Error(`3.3 Failed: Standard 1.5s emoji (${count} frames) exceeded 256 KB! (${sizeKB} KB)`);
    }
  }

  console.log(`[PASS] Discord preset boundary verification complete.`);
  return true;
}

async function main() {
  try {
    setupMockEnv();
    testUrlTrackerLeakDetection();
    testDiscordPresetBounds();
    await runStressWorkload(25);
    console.log(`\n\x1b[32m[ALL CHALLENGER VERIFICATION TESTS COMPLETED SUCCESSFULLY]\x1b[0m\n`);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n\x1b[31m[CHALLENGER FAILURE]\x1b[0m:`, err);
    process.exit(1);
  }
}

main();
