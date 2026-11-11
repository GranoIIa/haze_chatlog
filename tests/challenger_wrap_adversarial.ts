/**
 * Empirical Adversarial Test: wrapText with mid-line oversized words
 */
import { wrapText } from '../src/utils/chatParser';
import { createMockCanvas, createMockContext2D } from './harness/mockEnv';

const mockCanvas = createMockCanvas(1280, 720);
const ctx = createMockContext2D(mockCanvas) as any;

// Set character width to 10px in measureText
ctx.measureText = (t: string) => ({ width: t.length * 10 });

const maxWidth = 100; // max 10 characters per line
const textWithMidLineGiantWord = "Hi AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

console.log('Testing wrapText with mid-line giant word...');
const result = wrapText(ctx, textWithMidLineGiantWord, maxWidth);
console.log('Result lines:', result);

for (const line of result) {
  const w = ctx.measureText(line).width;
  console.log(`Line "${line}" -> width: ${w}px (maxWidth: ${maxWidth}px)`);
  if (w > maxWidth) {
    console.error(`BUG CONFIRMED: Line "${line}" exceeds maxWidth (${w}px > ${maxWidth}px)!`);
  }
}
