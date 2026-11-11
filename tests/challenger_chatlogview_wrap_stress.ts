/**
 * Empirical Adversarial Test: ChatLogView row-breaking algorithm
 */
import { createMockCanvas, createMockContext2D } from './harness/mockEnv';

const mockCanvas = createMockCanvas(1280, 720);
const ctx = createMockContext2D(mockCanvas) as any;
ctx.measureText = (t: string) => ({ width: t.length * 10 });

const maxW = 100; // max 10 chars per line

function simulateChatLogRowBreak(tokenText: string) {
  const rows: Array<{ text: string; width: number }> = [];
  let currentRowTokens: Array<{ text: string; width: number }> = [];
  let currentRowWidth = 0;

  const pushCurrentRow = () => {
    if (currentRowTokens.length > 0) {
      rows.push({
        text: currentRowTokens.map(t => t.text).join(''),
        width: currentRowWidth
      });
      currentRowTokens = [];
      currentRowWidth = 0;
    }
  };

  const words = tokenText.split(/(\s+)/);
  for (const word of words) {
    if (!word) continue;
    const wordW = ctx.measureText(word).width;

    if (wordW > maxW && currentRowTokens.length === 0 && word.trim().length > 0) {
      let chunk = '';
      for (const ch of word) {
        const chunkW = ctx.measureText(chunk + ch).width;
        if (chunkW > maxW && chunk.length > 0) {
          const w = ctx.measureText(chunk).width;
          currentRowTokens.push({ text: chunk, width: w });
          currentRowWidth += w;
          pushCurrentRow();
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk) {
        const w = ctx.measureText(chunk).width;
        currentRowTokens.push({ text: chunk, width: w });
        currentRowWidth += w;
      }
      continue;
    }

    if (currentRowWidth + wordW > maxW && currentRowTokens.length > 0 && word.trim().length > 0) {
      pushCurrentRow();
    }

    currentRowTokens.push({
      text: word,
      width: wordW
    });
    currentRowWidth += wordW;
  }

  pushCurrentRow();
  return rows;
}

console.log('Testing ChatLogView row break with mid-line giant word...');
const result = simulateChatLogRowBreak('Hi AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
console.log('Result rows:', result);

for (const row of result) {
  if (row.width > maxW) {
    console.error(`BUG CONFIRMED in ChatLogView logic: Row "${row.text}" width ${row.width} exceeds maxW ${maxW}!`);
  }
}
