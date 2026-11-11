import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { SimpleGifEncoder, DynamicUint8Buffer, NeuQuant } from '../src/utils/gifEncoder';

async function run() {
  console.log('Testing SimpleGifEncoder with Python PIL oracle...');
  
  // Test 1: Simple 32x32 image
  const encoder = new SimpleGifEncoder(32, 32, 100);
  encoder.start();
  const pixels = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = (i * 7) % 256;
    pixels[i + 1] = (i * 13) % 256;
    pixels[i + 2] = (i * 19) % 256;
    pixels[i + 3] = 255;
  }
  encoder.addFrame(pixels);
  const blob = encoder.finish();
  const buf = Buffer.from(await blob.arrayBuffer());

  const testGifPath = path.resolve('tests/test_sample.gif');
  fs.writeFileSync(testGifPath, buf);

  console.log(`Saved sample GIF (${buf.length} bytes) to ${testGifPath}`);

  // Validate with Python PIL
  const pyScript = [
    'from PIL import Image',
    `im = Image.open(r"${testGifPath}")`,
    'print("PIL Format:", im.format, "Size:", im.size, "Frames:", getattr(im, "n_frames", 1))',
    'im.seek(0)',
    'pixels = list(im.getdata())',
    'print("Decoded pixels count:", len(pixels))',
    'print("PIL Verification: SUCCESS")',
  ].join('; ');
  const result = execSync(`python -c "${pyScript}"`).toString();
  console.log(result);
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
