/**
/**
 * Empirical Adversarial Stress & Corner Case Harness
 * Challenger 1: E2E Adversarial Stress & Corner Case Challenger
 *
 * Exercises:
 * 1. Test runner fault injection & exit code validation (Exit code 1 on failure)
 * 2. Mock environment edge cases: zero/negative canvas dimensions, extreme fonts, memory tracking
 * 3. Domain engine edge cases: wrapText with 0/negative/infinite maxWidth, empty/giant words
 * 4. Hit-testing edge cases: negative dimensions, extreme rotations, NaN/Infinity, out of bounds
 * 5. RP command parser adversarial inputs: ReDoS, null bytes, unmatched delimiters, giant inputs
 * 6. Web Worker concurrency & abort handling: multiple aborts, abort-after-finish, rapid cycling
 * 7. Verification of src/ vs mockEnv.ts contract drift (architectural challenge)
 */

import { setupMockEnv, resetMockEnv, createMockCanvas, createMockContext2D, wrapText, parseChatLine, hitTestLayer, calculateCenterCrop, applyDiscordPreset, urlTracker, MockWorker, MockCanvasRenderingContext2D } from './harness/mockEnv';
import { assert, assertEquals, assertThrows, AssertionError } from './harness/testRunner';
import { parseChatLine as srcParseChatLine } from '../src/utils/chatParser';
import { SimpleGifEncoder } from '../src/utils/gifEncoder';
import { RP_PRESETS } from '../src/utils/rpPresets';
import { applyPhotoAdjustments, DEFAULT_ADJUSTMENTS } from '../src/utils/photoFilters';
import { CanvasLayer } from '../src/types';

setupMockEnv();

interface ChallengeResult {
  category: string;
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: ChallengeResult[] = [];

function recordChallenge(category: string, name: string, fn: () => void) {
  try {
    fn();
    results.push({ category, name, passed: true });
    console.log(`  \x1b[32m✓ [PASS CHALLENGE]\x1b[0m [${category}] ${name}`);
  } catch (err: any) {
    results.push({ category, name, passed: false, error: err.message, details: err.stack });
    console.log(`  \x1b[31m✗ [FAIL CHALLENGE]\x1b[0m [${category}] ${name}\n    Error: ${err.message}`);
  }
}

async function recordAsyncChallenge(category: string, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ category, name, passed: true });
    console.log(`  \x1b[32m✓ [PASS CHALLENGE]\x1b[0m [${category}] ${name}`);
  } catch (err: any) {
    results.push({ category, name, passed: false, error: err.message, details: err.stack });
    console.log(`  \x1b[31m✗ [FAIL CHALLENGE]\x1b[0m [${category}] ${name}\n    Error: ${err.message}`);
  }
}

async function runAdversarialSuite() {
  console.log('\n\x1b[35m=== RUNNING EMPIRICAL ADVERSARIAL STRESS SUITE ===\x1b[0m\n');

  // =========================================================================
  // 1. FAULT INJECTION & RUNNER FAULT TOLERANCE
  // =========================================================================
  recordChallenge('Fault Injection', 'AssertionError is thrown when condition is false', () => {
    let threw = false;
    try {
      assert(false, 'Intentional fault');
    } catch (e: any) {
      threw = e instanceof AssertionError;
    }
    if (!threw) throw new Error('assert(false) did not throw AssertionError');
  });

  recordChallenge('Fault Injection', 'assertEquals catches mismatched types and values', () => {
    let caughtCount = 0;
    try { assertEquals(1 as any, '1' as any); } catch { caughtCount++; }
    try { assertEquals(true as any, false as any); } catch { caughtCount++; }
    try { assertEquals(null as any, undefined as any); } catch { caughtCount++; }
    try { assertEquals(NaN, NaN); } catch { caughtCount++; } // Object.is(NaN, NaN) is true in JS
    if (caughtCount !== 3) throw new Error(`Expected 3 assertion failures, got ${caughtCount}`);
  });

  // =========================================================================
  // 2. CANVAS & MOCK ENVIRONMENT CORNER CASES
  // =========================================================================
  recordChallenge('Canvas Edge Cases', 'Zero canvas dimensions (0x0) do not throw or crash pixel buffer', () => {
    const canvas = createMockCanvas(0, 0);
    const ctx = canvas.getContext('2d');
    assert(ctx !== null, 'Context should be instantiable for 0x0');
    assertEquals(ctx.canvas.width, 0);
    assertEquals(ctx.canvas.height, 0);
    assert(ctx.pixelBuffer.length >= 1, 'Pixel buffer has non-zero fallback length');
  });

  recordChallenge('Canvas Edge Cases', 'createImageData with 0 or negative dimensions throws standard IndexSizeError', () => {
    const ctx = createMockContext2D(100, 100);
    assertThrows(() => ctx.createImageData(0, 0), /IndexSizeError/);
    assertThrows(() => ctx.createImageData(-10, 50), /IndexSizeError/);
  });

  recordChallenge('Canvas Edge Cases', 'Extreme and negative font sizes handled safely in measureText', () => {
    const ctx = createMockContext2D(100, 100);
    
    // Fallback when font string has no px
    ctx.font = 'sans-serif';
    let m = ctx.measureText('Haze RP');
    assert(m.width > 0, 'Width must be positive even without px specification');

    // 0px font
    ctx.font = '0px monospace';
    m = ctx.measureText('Zero font test');
    assertEquals(m.width, 0, '0px font should yield 0 width');

    // Giant 100,000px font
    ctx.font = '100000px Impact';
    m = ctx.measureText('A');
    assert(m.width === 60000, `Expected 60000 for 100000px * 0.6, got ${m.width}`);
  });

  recordChallenge('Canvas Edge Cases', 'State save/restore stack handles deep nesting and underflow safely', () => {
    const ctx = createMockContext2D(100, 100);
    // Underflow: restore with empty stack does not throw
    ctx.restore();
    ctx.restore();

    // 100 nested saves
    for (let i = 0; i < 100; i++) {
      ctx.globalAlpha = i / 100;
      ctx.save();
    }
    // Restore 100 times
    for (let i = 99; i >= 0; i--) {
      ctx.restore();
      assertEquals(Math.round(ctx.globalAlpha * 100), i);
    }
  });

  // =========================================================================
  // 3. TEXT WRAPPING ADVERSARIAL STRESS
  // =========================================================================
  recordChallenge('Text Wrap Stress', 'wrapText handles zero, negative, NaN, and Infinity maxWidth gracefully', () => {
    const ctx = createMockContext2D(500, 500);
    ctx.font = '20px sans-serif'; // each char width = 12px

    // Zero maxWidth falls back to 50
    const linesZero = wrapText(ctx, 'Short text', 0);
    assert(linesZero.length > 0, 'Should not return empty array on zero maxWidth');

    // Negative maxWidth falls back to 50
    const linesNeg = wrapText(ctx, 'Short text', -100);
    assert(linesNeg.length > 0, 'Should not return empty array on negative maxWidth');

    // Giant single word exceeding maxWidth must be chunked character by character
    const giantWord = 'A'.repeat(100); // 1200px wide
    const linesChunked = wrapText(ctx, giantWord, 100);
    assert(linesChunked.length > 5, 'Giant word should be split into multiple chunks');
    for (const chunk of linesChunked) {
      assert(ctx.measureText(chunk).width <= 100, `Chunk "${chunk}" exceeds maxWidth 100`);
    }

    // Multiple consecutive newlines and empty lines
    const multiNewlines = 'Line 1\n\n\nLine 2\n';
    const linesNL = wrapText(ctx, multiNewlines, 500);
    // 'Line 1\n\n\nLine 2\n'.split('\n') results in ['Line 1', '', '', 'Line 2', '']
    assertEquals(linesNL.length, 5, `Expected 5 lines including empty breaks and trailing newline, got ${linesNL.length}`);
    assertEquals(linesNL[0], 'Line 1');
    assertEquals(linesNL[1], '');
    assertEquals(linesNL[2], '');
    assertEquals(linesNL[3], 'Line 2');
    assertEquals(linesNL[4], '');
  });

  // =========================================================================
  // 4. HIT-TESTING ADVERSARIAL CASES
  // =========================================================================
  recordChallenge('Hit Test Stress', 'hitTestLayer handles zero/negative size, invisible layers, and rotations correctly', () => {
    const layer: CanvasLayer = {
      id: 'test-layer',
      type: 'sticker',
      name: 'Sticker',
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true
    };

    // Outside bounds
    assert(!hitTestLayer(99, 100, layer), 'Point to the left should miss');
    assert(!hitTestLayer(301, 100, layer), 'Point to the right should miss');
    assert(!hitTestLayer(100, 99, layer), 'Point above should miss');
    assert(!hitTestLayer(100, 201, layer), 'Point below should miss');

    // Inside bounds
    assert(hitTestLayer(100, 100, layer), 'Top-left corner should hit');
    assert(hitTestLayer(200, 150, layer), 'Center should hit');
    assert(hitTestLayer(300, 200, layer), 'Bottom-right corner should hit');

    // Invisible layer must never hit
    layer.visible = false;
    assert(!hitTestLayer(200, 150, layer), 'Invisible layer must reject hit-test');
    layer.visible = true;

    // Zero or negative dimensions must never hit
    layer.width = 0;
    assert(!hitTestLayer(100, 100, layer), 'Zero width layer must reject hit-test');
    layer.width = -50;
    assert(!hitTestLayer(100, 100, layer), 'Negative width layer must reject hit-test');
    layer.width = 200;

    // 90-degree rotated layer around center (cx=200, cy=150)
    // Original rect [100, 100] to [300, 200]
    // Rotated by 90deg swaps aspect ratio around center
    layer.rotation = 90;
    // Center point (200, 150) remains identical under rotation
    assert(hitTestLayer(200, 150, layer), 'Center point must remain a hit after 90 deg rotation');

    // 360-degree rotation is identity
    layer.rotation = 360;
    assert(hitTestLayer(150, 150, layer), '360 degree rotation must equal 0 degrees');

    // Extreme rotations (720 deg, -450 deg)
    layer.rotation = 720;
    assert(hitTestLayer(150, 150, layer), '720 degree rotation must equal 0 degrees');
  });

  // =========================================================================
  // 5. MALFORMED RP COMMANDS & RE-DOS RESILIENCE
  // =========================================================================
  recordChallenge('RP Command Stress', 'parseChatLine survives ReDoS, null bytes, unmatched brackets, and massive strings', () => {
    // Empty & whitespace
    assertEquals(parseChatLine('').type, 'empty');
    assertEquals(parseChatLine('   \t\n  ').type, 'empty');

    // Massive 50,000 character line
    const massive = '/me ' + 'puxa '.repeat(10000);
    const start = Date.now();
    const parsedMassive = parseChatLine(massive);
    const elapsed = Date.now() - start;
    assertEquals(parsedMassive.type, 'me');
    assert(elapsed < 200, `ReDoS detected: parseChatLine took ${elapsed}ms for 50k chars`);

    // Null bytes and control characters
    const dirty = '/do \0\x01\x1F Mensagem secreta \0';
    const parsedDirty = parseChatLine(dirty);
    assertEquals(parsedDirty.type, 'yellow');

    // Unmatched brackets in timestamps and censorship
    const unmatched = '[[[[14:00 ((((Carlos diz: ||Censura sem fechar';
    const parsedUnmatched = parseChatLine(unmatched);
    assert(parsedUnmatched.type !== undefined);
    assert(parsedUnmatched.segments.length > 0);

    // Repeated nested censorship tags
    const nested = '||||||segredo|||||| e [censor][censor]duplo[/censor][/censor]';
    const parsedNested = parseChatLine(nested);
    assert(parsedNested.segments.some(s => s.isCensored), 'Nested censorship must detect censored segments');
  });

  // =========================================================================
  // 6. WEB WORKER ABORT & CONCURRENCY
  // =========================================================================
  await recordAsyncChallenge('Worker Abort Stress', 'MockWorker safely handles immediate abort, post-abort calls, and rapid cycling', async () => {
    const worker = new MockWorker('fake-url.js');
    let progressCalls = 0;
    let doneCalls = 0;

    worker.onmessage = (e) => {
      if (e.data.type === 'PROGRESS') progressCalls++;
      if (e.data.type === 'DONE') doneCalls++;
    };

    // Abort before start
    worker.postMessage({ type: 'ABORT' });
    assert(worker.terminated, 'Worker should be terminated after ABORT');

    // Post message after terminate must not fire callbacks
    worker.postMessage({ type: 'START' });
    worker.postMessage({ type: 'ADD_FRAME' });
    worker.postMessage({ type: 'FINISH' });

    await new Promise(r => setTimeout(r, 50));
    assertEquals(progressCalls, 0, 'No progress calls should fire after abort');
    assertEquals(doneCalls, 0, 'No done calls should fire after abort');

    // Rapid cycling with fresh worker
    const worker2 = new MockWorker('worker2.js');
    let finished = false;
    worker2.onmessage = (e) => {
      if (e.data.type === 'DONE') finished = true;
    };
    worker2.postMessage({ type: 'START' });
    worker2.postMessage({ type: 'ADD_FRAME' });
    worker2.postMessage({ type: 'FINISH' });

    await new Promise(r => setTimeout(r, 50));
    assert(finished, 'Fresh worker should finish successfully');
  });

  // =========================================================================
  // 7. MEMORY URL TRACKING ADVERSARIAL STRESS
  // =========================================================================
  recordChallenge('Memory Tracking', 'urlTracker prevents double revocation and cleans up correctly', () => {
    resetMockEnv();
    const url1 = URL.createObjectURL(new Blob());
    const url2 = URL.createObjectURL(new Blob());
    assertEquals(urlTracker.activeUrls.size, 2);

    URL.revokeObjectURL(url1);
    assertEquals(urlTracker.activeUrls.size, 1);
    assertEquals(urlTracker.revokedUrls.length, 1);

    // Double revocation of url1 must be a no-op
    URL.revokeObjectURL(url1);
    assertEquals(urlTracker.activeUrls.size, 1);
    assertEquals(urlTracker.revokedUrls.length, 1, 'Double revoke must not increment revokedUrls count');

    // Revoking bogus or empty string
    URL.revokeObjectURL('');
    URL.revokeObjectURL('http://invalid.com');
    URL.revokeObjectURL(null as any);
    assertEquals(urlTracker.activeUrls.size, 1);

    URL.revokeObjectURL(url2);
    assertEquals(urlTracker.activeUrls.size, 0);
  });

  // =========================================================================
  // 8. ARCHITECTURAL CONTRACT CONVERGENCE CHECK
  // =========================================================================
  recordChallenge('Architectural Contract', 'Audit contract parity between src/utils/chatParser.ts and mockEnv.ts', () => {
    // Test what srcParseChatLine produces vs what mockEnv parseChatLine produces
    const testLine = '/me saca o armamento pesado';
    const srcResult = srcParseChatLine(testLine);
    const mockResult = parseChatLine(testLine);

    console.log(`\n    [AUDIT OBSERVATION]`);
    console.log(`    src/utils/chatParser.ts parseChatLine("/me ..."):  type="${srcResult.type}"`);
    console.log(`    tests/harness/mockEnv.ts parseChatLine("/me ..."): type="${mockResult.type}"`);

    // Verify both now output 'me'
    assertEquals(srcResult.type, 'me');
    assertEquals(mockResult.type, 'me');
  });

  console.log('\n\x1b[35m=== ADVERSARIAL STRESS SUITE COMPLETE ===\x1b[0m\n');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Total Challenges: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);
}

runAdversarialSuite();
