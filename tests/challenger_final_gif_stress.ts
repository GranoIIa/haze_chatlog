import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { DynamicUint8Buffer, NeuQuant, SimpleGifEncoder } from '../src/utils/gifEncoder';

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, passed: true, durationMs });
    console.log(`  ✓ [PASS] ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    results.push({ name, passed: false, durationMs, details: err.message || String(err) });
    console.error(`  ✗ [FAIL] ${name} (${durationMs}ms) - ${err.message}`);
  }
}

function verifyGifWithPil(filePath: string, expectedWidth: number, expectedHeight: number, expectedFrames: number = 1): void {
  const verifyScript = path.resolve('tests/verify_gif.py');
  try {
    const cmd = `python "${verifyScript}" "${filePath}" ${expectedWidth} ${expectedHeight} ${expectedFrames}`;
    const out = execSync(cmd, { encoding: 'utf-8' });
    assert(out.includes('PIL_VERIFIED_SUCCESS'), `Python output: ${out}`);
  } catch (e: any) {
    throw new Error(`PIL Verification failed: ${e.stdout || e.message}`);
  }
}

async function main() {
  console.log('\n=== EMPIRICAL CHALLENGER: GIF ENCODER & LZW ADVERSARIAL STRESS SUITE ===\n');

  const tmpDir = path.resolve('tests/tmp_stress');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // -------------------------------------------------------------
  // SUITE 1: DynamicUint8Buffer Stress & Boundary Handling
  // -------------------------------------------------------------
  console.log('► SUITE 1: DynamicUint8Buffer Stress & Boundary Handling');

  await runTest('DynamicUint8Buffer: micro-chunk stress (chunkSize=1) forces 100+ reallocations without corruption', () => {
    const buf = new DynamicUint8Buffer(2, 1);
    for (let i = 0; i < 200; i++) {
      buf.writeByte(i & 0xff);
    }
    assert(buf.length === 200, `Expected length 200, got ${buf.length}`);
    const sub = buf.toSubarray();
    assert(sub.length === 200, `Expected sub length 200, got ${sub.length}`);
    for (let i = 0; i < 200; i++) {
      assert(sub[i] === (i & 0xff), `Byte mismatch at ${i}: ${sub[i]} !== ${i & 0xff}`);
    }
  });

  await runTest('DynamicUint8Buffer: massive single write exceeding initialCapacity by 50x', () => {
    const buf = new DynamicUint8Buffer(1024, 1024);
    const largeData = new Uint8Array(50000);
    for (let i = 0; i < largeData.length; i++) largeData[i] = (i * 3) & 0xff;
    
    buf.writeBytes(largeData);
    assert(buf.length === 50000, `Expected length 50000, got ${buf.length}`);
    assert(buf.capacity >= 50000, `Capacity should be >= 50000, was ${buf.capacity}`);
    const sub = buf.toSubarray();
    assert(sub[49999] === ((49999 * 3) & 0xff), 'End byte mismatch in large write');
  });

  await runTest('DynamicUint8Buffer: zero-length write and boundary calls do not alter state', () => {
    const buf = new DynamicUint8Buffer(64, 64);
    buf.writeByte(42);
    buf.writeBytes(new Uint8Array(0));
    buf.writeBytes([], 0, 0);
    buf.writeString('');
    assert(buf.length === 1, `Length should remain 1, was ${buf.length}`);
    assert(buf.toSubarray()[0] === 42, 'Value corrupted by zero write');
  });

  await runTest('DynamicUint8Buffer: writeShort enforces exact little-endian encoding', () => {
    const buf = new DynamicUint8Buffer(16, 16);
    buf.writeShort(0x1234);
    const sub = buf.toSubarray();
    assert(sub[0] === 0x34, `Expected low byte 0x34, got 0x${sub[0].toString(16)}`);
    assert(sub[1] === 0x12, `Expected high byte 0x12, got 0x${sub[1].toString(16)}`);
  });

  await runTest('DynamicUint8Buffer: reset() allows full buffer reuse without re-allocating new objects', () => {
    const buf = new DynamicUint8Buffer(128, 128);
    buf.writeBytes(new Uint8Array([1, 2, 3, 4, 5]));
    assert(buf.length === 5, 'Initial write failed');
    buf.reset();
    assert(buf.length === 0, 'Reset failed to zero position');
    buf.writeBytes(new Uint8Array([99, 100]));
    assert(buf.length === 2, 'Subsequent write length mismatch');
    const sub = buf.toSubarray();
    assert(sub[0] === 99 && sub[1] === 100, 'Subsequent write data mismatch');
  });

  // -------------------------------------------------------------
  // SUITE 2: LZW O(1) Dictionary & NeuQuant Performance Stress
  // -------------------------------------------------------------
  console.log('\n► SUITE 2: LZW O(1) Dictionary & NeuQuant Performance Stress');

  await runTest('LZW Stress: Run-length heavy 512x512 solid frame (triggers repeated dictionary 4096 code fills and clear codes)', async () => {
    const width = 512;
    const height = 512;
    const encoder = new SimpleGifEncoder(width, height, 100);
    encoder.start();

    // Solid RGBA: all pixels (50, 150, 200, 255)
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 50;
      pixels[i + 1] = 150;
      pixels[i + 2] = 200;
      pixels[i + 3] = 255;
    }

    const t0 = performance.now();
    encoder.addFrame(pixels);
    const encodeDuration = performance.now() - t0;
    console.log(`    [Metric] 512x512 solid frame encoded in ${encodeDuration.toFixed(2)}ms (target < 50ms)`);
    assert(encodeDuration < 50, `Encoding took ${encodeDuration}ms, exceeding 50ms ceiling`);

    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    assert(buffer.length > 0, 'Output buffer is empty');
    assert(buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46, 'Invalid GIF header');
    assert(buffer[buffer.length - 1] === 0x3b, 'Missing GIF trailer 0x3B');

    const outPath = path.join(tmpDir, 'stress_solid_512.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, width, height, 1);
  });

  await runTest('LZW Stress: High-entropy 512x512 pseudorandom noise frame (stresses NeuQuant + O(1) hash map lookups)', async () => {
    const width = 512;
    const height = 512;
    const encoder = new SimpleGifEncoder(width, height, 100);
    encoder.start();

    // High entropy pseudorandom noise: LCG algorithm for deterministic repeatability
    const pixels = new Uint8ClampedArray(width * height * 4);
    let seed = 123456789;
    for (let i = 0; i < pixels.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      pixels[i] = seed & 0xff;
      pixels[i + 1] = (seed >> 8) & 0xff;
      pixels[i + 2] = (seed >> 16) & 0xff;
      pixels[i + 3] = 255;
    }

    const t0 = performance.now();
    encoder.addFrame(pixels);
    const encodeDuration = performance.now() - t0;
    console.log(`    [Metric] 512x512 random noise encoded in ${encodeDuration.toFixed(2)}ms (target < 150ms)`);
    assert(encodeDuration < 150, `Encoding took ${encodeDuration}ms, exceeding 150ms ceiling (freeze detected!)`);

    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const outPath = path.join(tmpDir, 'stress_noise_512.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, width, height, 1);
  });

  await runTest('Multi-Frame Stress: 25 frames of 256x256 animated sequence encoded seamlessly', async () => {
    const width = 256;
    const height = 256;
    const frameCount = 25;
    const encoder = new SimpleGifEncoder(width, height, 40); // 25fps = 40ms delay
    encoder.start();

    const framePixels = new Uint8ClampedArray(width * height * 4);
    const t0 = performance.now();

    for (let f = 0; f < frameCount; f++) {
      // Shifting gradient animation
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          framePixels[idx] = (x + f * 10) % 256;
          framePixels[idx + 1] = (y + f * 5) % 256;
          framePixels[idx + 2] = (x + y + f * 8) % 256;
          framePixels[idx + 3] = 255;
        }
      }
      encoder.addFrame(framePixels);
    }

    const totalDuration = performance.now() - t0;
    const avgPerFrame = totalDuration / frameCount;
    console.log(`    [Metric] 25 frames (256x256) total: ${totalDuration.toFixed(2)}ms, avg: ${avgPerFrame.toFixed(2)}ms/frame`);
    assert(avgPerFrame < 25, `Average frame encoding (${avgPerFrame}ms) exceeded 25ms limit`);

    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    assert(buffer.length > 50000, `Generated animation is suspiciously small: ${buffer.length} bytes`);

    const outPath = path.join(tmpDir, 'stress_animation_25f.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, width, height, frameCount);
  });

  // -------------------------------------------------------------
  // SUITE 3: Boundary Geometries & Extreme Inputs
  // -------------------------------------------------------------
  console.log('\n► SUITE 3: Boundary Geometries & Extreme Inputs');

  await runTest('Boundary Geometry: 1x1 minimal pixel frame encoding and validation', async () => {
    const encoder = new SimpleGifEncoder(1, 1, 100);
    encoder.start();
    const pixel = new Uint8ClampedArray([255, 0, 128, 255]);
    encoder.addFrame(pixel);
    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const outPath = path.join(tmpDir, 'stress_1x1.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, 1, 1, 1);
  });

  await runTest('Boundary Geometry: Odd prime dimensions (37x19) with gradient', async () => {
    const width = 37;
    const height = 19;
    const encoder = new SimpleGifEncoder(width, height, 100);
    encoder.start();
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = (i * 17) % 256;
      pixels[i + 1] = (i * 29) % 256;
      pixels[i + 2] = (i * 41) % 256;
      pixels[i + 3] = 255;
    }
    encoder.addFrame(pixels);
    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const outPath = path.join(tmpDir, 'stress_37x19.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, width, height, 1);
  });

  await runTest('High-Resolution Frame: 1024x1024 (1,048,576 pixels, 4MB RGBA buffer)', async () => {
    const width = 1024;
    const height = 1024;
    const encoder = new SimpleGifEncoder(width, height, 100);
    encoder.start();

    // Concentric color circles pattern
    const pixels = new Uint8ClampedArray(width * height * 4);
    const cx = width / 2;
    const cy = height / 2;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const dist = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        pixels[idx] = Math.floor(dist) % 256;
        pixels[idx + 1] = Math.floor(dist * 1.5) % 256;
        pixels[idx + 2] = Math.floor(dist * 2.2) % 256;
        pixels[idx + 3] = 255;
      }
    }

    const t0 = performance.now();
    encoder.addFrame(pixels);
    const duration = performance.now() - t0;
    console.log(`    [Metric] 1024x1024 frame encoded in ${duration.toFixed(2)}ms (target < 350ms)`);
    assert(duration < 350, `1024x1024 frame took ${duration}ms, exceeding 350ms ceiling`);

    const blob = encoder.finish();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const outPath = path.join(tmpDir, 'stress_1024x1024.gif');
    fs.writeFileSync(outPath, buffer);
    verifyGifWithPil(outPath, width, height, 1);
  });

  // -------------------------------------------------------------
  // SUITE 4: Memory Leak & Heap Retention Stress Test
  // -------------------------------------------------------------
  console.log('\n► SUITE 4: Memory Leak & Heap Retention Stress Test');

  await runTest('Heap Safety: 50 successive encoder instances with frame additions execute without memory exhaustion', async () => {
    if (global.gc) global.gc();
    const initialMem = process.memoryUsage().heapUsed;

    for (let i = 0; i < 50; i++) {
      const enc = new SimpleGifEncoder(128, 128, 50);
      enc.start();
      const p = new Uint8ClampedArray(128 * 128 * 4);
      p.fill(i * 5);
      enc.addFrame(p);
      const b = enc.finish();
      assert(b.size > 0, 'Blob size zero');
    }

    if (global.gc) global.gc();
    const finalMem = process.memoryUsage().heapUsed;
    const growthMb = (finalMem - initialMem) / (1024 * 1024);
    console.log(`    [Metric] Heap delta after 50 encoder runs: ${growthMb.toFixed(2)} MB`);
    // Should not retain more than 25MB after 50 encoder iterations
    assert(growthMb < 25, `Heap retained ${growthMb.toFixed(2)}MB, indicating uncollected buffers`);
  });

  // Clean up tmpDir
  try {
    const files = fs.readdirSync(tmpDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tmpDir, file));
    }
    fs.rmdirSync(tmpDir);
  } catch (e) {
    // ignore cleanup error
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n------------------------------------------------------------');
  console.log('Adversarial Stress Test Summary:');
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  Total Tests:  ${results.length}`);
  console.log(`  Passed:       ${passed}`);
  console.log(`  Failed:       ${failed}`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('>>> [VERDICT: APPROVE] All adversarial stress challenges PASSED! <<<\n');
  }
}

main().catch(err => {
  console.error('Fatal stress suite runner error:', err);
  process.exit(1);
});
