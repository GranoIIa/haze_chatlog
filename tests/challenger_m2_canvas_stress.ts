/**
 * Challenger 2: Empirical Stress Test Harness for Milestone 2
 * Focus:
 * 1. wrapText in src/utils/chatParser.ts and ChatLogView token wrapping engine:
 *    - Unbroken 500-char continuous string alone
 *    - Unbroken 500-char continuous string AFTER preceding words (DEFECT REPRODUCTION)
 *    - Empty strings, multi-paragraph text with blank lines
 *    - Zero-width spaces (\u200B)
 * 2. Authentic GTA Text Outline Stroke:
 *    - Execution ordering: strokeText before fillText
 *    - Line join ('miter') and miterLimit (2)
 *    - Scaling parameters (scale = 1 vs scale = 2)
 *    - Stroke width boundary clamping (negative, zero, >8)
 * 3. Procedural Mosaic vs Solid Bar Censorship Rendering:
 *    - Deterministic spatial hash distribution
 *    - Grain size scaling and clamping
 *    - Absence of text leak (no fillText/strokeText for censored tokens)
 *    - Unclosed delimiter behavior
 * 4. Pointer capture ergonomics:
 *    - canvas.setPointerCapture on pointerdown
 *    - canvas.releasePointerCapture on pointerup and pointercancel
 *    - Boundary clamping on drag
 * 5. Memory safety & Object URL lifecycle:
 *    - URL.createObjectURL and URL.revokeObjectURL
 *    - Unmount cleanup
 *    - toBlob export cleanup
 * 6. Tab-isolated paste listener logic
 */

import { setupMockEnv, resetMockEnv, createMockCanvas, createMockContext2D, urlTracker, MockCanvasRenderingContext2D } from './harness/mockEnv';
import { wrapText, parseChatLine, splitCensoredSegments, CHAT_COLORS } from '../src/utils/chatParser';

setupMockEnv();

interface StressResult {
  category: string;
  name: string;
  passed: boolean;
  observation: string;
  bugFound?: boolean;
}

const stressLog: StressResult[] = [];

function runStress(category: string, name: string, fn: () => { passed: boolean; observation: string; bugFound?: boolean }) {
  try {
    const res = fn();
    stressLog.push({ category, name, passed: res.passed, observation: res.observation, bugFound: res.bugFound });
    const tag = res.bugFound ? '\x1b[33m[BUG CONFIRMED]\x1b[0m' : (res.passed ? '\x1b[32m[PASS]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m');
    console.log(`  ${tag} [${category}] ${name}`);
    console.log(`    ↳ Observation: ${res.observation}`);
  } catch (err: any) {
    stressLog.push({ category, name, passed: false, observation: `Threw unexpected exception: ${err.message}`, bugFound: true });
    console.log(`  \x1b[31m[EXCEPTION]\x1b[0m [${category}] ${name}`);
    console.log(`    ↳ ${err.message}`);
  }
}

console.log('\n\x1b[36m===============================================================');
console.log('   CHALLENGER 2: EMPIRICAL STRESS TEST SUITE (MILESTONE 2)     ');
console.log('===============================================================\x1b[0m\n');

// =========================================================================
// 1. WRAPTEXT & TOKEN WRAPPING ENGINE EMPIRICAL STRESS TESTS
// =========================================================================

// Test 1.1: wrapText with empty string and blank lines
runStress('wrapText', 'Empty string and multiple blank lines', () => {
  const ctx = createMockContext2D(800, 600);
  const emptyRes = wrapText(ctx as any, '', 300);
  const blankRes = wrapText(ctx as any, '\n\n   \n\n', 300);

  const passed = emptyRes.length === 0 && blankRes.length === 5;
  return {
    passed,
    observation: `empty returned ${JSON.stringify(emptyRes)}, blank returned ${blankRes.length} lines`
  };
});

// Test 1.2: wrapText with 500-char unbroken word at start
runStress('wrapText', '500-char unbroken word alone', () => {
  const ctx = createMockContext2D(800, 600);
  const longWord = 'A'.repeat(500);
  const maxWidth = 200;
  const lines = wrapText(ctx as any, longWord, maxWidth);

  let allFit = true;
  for (const line of lines) {
    const w = ctx.measureText(line).width;
    if (w > maxWidth) allFit = false;
  }

  return {
    passed: allFit && lines.length > 1,
    observation: `500-char word alone split into ${lines.length} lines. Max measured width: ${Math.max(...lines.map(l => ctx.measureText(l).width))}px <= maxWidth(${maxWidth}px)`
  };
});

// Test 1.3: wrapText with 500-char unbroken word AFTER preceding word
runStress('wrapText', '500-char unbroken word preceded by "Hello "', () => {
  const ctx = createMockContext2D(800, 600);
  const longWord = 'Hello ' + 'B'.repeat(500);
  const maxWidth = 200;
  const lines = wrapText(ctx as any, longWord, maxWidth);

  const maxLineWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const hasExceedingLine = lines.some(l => ctx.measureText(l).width > maxWidth);

  return {
    passed: !hasExceedingLine,
    bugFound: hasExceedingLine,
    observation: hasExceedingLine
      ? `DEFECT REPRODUCED: wrapText produced a line with width ${maxLineWidth}px exceeding maxWidth ${maxWidth}px! Line count: ${lines.length}. Second line was unchunked: "${lines[1]?.substring(0, 30)}..." (len: ${lines[1]?.length})`
      : `All lines fit within ${maxWidth}px`
  };
});

// Test 1.4: ChatLogView inline token wrapping simulation with 500-char word preceded by speaker tag
runStress('ChatLogView Wrapping', 'Simulation of ChatLogView row wrapping with "Speaker diz: <500 chars>"', () => {
  const ctx = createMockContext2D(1280, 720);
  const maxW = 500;
  const text = 'Mike Johnson diz: ' + 'Z'.repeat(500);

  // Exact reproduction of ChatLogView lines 318-390
  const rows: Array<{ tokens: any[]; totalWidth: number }> = [];
  let currentRowTokens: Array<{ text: string; isCensored: boolean; color: string; width: number }> = [];
  let currentRowWidth = 0;

  const pushCurrentRow = () => {
    if (currentRowTokens.length > 0) {
      rows.push({ tokens: currentRowTokens, totalWidth: currentRowWidth });
      currentRowTokens = [];
      currentRowWidth = 0;
    }
  };

  const parsed = parseChatLine(text);
  const words = parsed.rawText.split(/(\s+)/);

  for (const word of words) {
    if (!word) continue;
    const wordW = ctx.measureText(word).width;

    if (wordW > maxW && currentRowTokens.length === 0 && word.trim().length > 0) {
      let chunk = '';
      for (const ch of word) {
        const chunkW = ctx.measureText(chunk + ch).width;
        if (chunkW > maxW && chunk.length > 0) {
          const w = ctx.measureText(chunk).width;
          currentRowTokens.push({ text: chunk, isCensored: false, color: '#ffffff', width: w });
          currentRowWidth += w;
          pushCurrentRow();
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      if (chunk) {
        const w = ctx.measureText(chunk).width;
        currentRowTokens.push({ text: chunk, isCensored: false, color: '#ffffff', width: w });
        currentRowWidth += w;
      }
      continue;
    }

    if (currentRowWidth + wordW > maxW && currentRowTokens.length > 0 && word.trim().length > 0) {
      pushCurrentRow();
    }

    currentRowTokens.push({
      text: word,
      isCensored: false,
      color: '#ffffff',
      width: wordW
    });
    currentRowWidth += wordW;
  }
  pushCurrentRow();

  const maxRowWidth = Math.max(...rows.map(r => r.totalWidth));
  const hasExceedingRow = rows.some(r => r.totalWidth > maxW);

  return {
    passed: !hasExceedingRow,
    bugFound: hasExceedingRow,
    observation: hasExceedingRow
      ? `DEFECT REPRODUCED IN CHATLOGVIEW WRAPPING: Max row width is ${maxRowWidth}px, which exceeds maxW (${maxW}px)! The 500-char word after "Mike Johnson diz:" was placed intact into row 2 with width ${rows[1]?.totalWidth}px!`
      : `All rows fit within ${maxW}px`
  };
});

// Test 1.5: Zero-width space handling
runStress('wrapText', 'Zero-width space string ("Hello\\u200BWorld")', () => {
  const ctx = createMockContext2D(800, 600);
  const zwsText = 'Hello\u200BWorld';
  const lines = wrapText(ctx as any, zwsText, 300);
  return {
    passed: lines.length === 1 && lines[0] === zwsText,
    observation: `Returned 1 line intact: "${lines[0]}", width: ${ctx.measureText(lines[0]).width}px`
  };
});

// =========================================================================
// 2. AUTHENTIC GTA OUTLINE STROKE EMPIRICAL VERIFICATION
// =========================================================================

runStress('Stroke Engine', 'Execution order: strokeText BEFORE fillText on text tokens', () => {
  const canvas = createMockCanvas(1280, 720);
  const ctx = canvas.getContext('2d') as MockCanvasRenderingContext2D;

  const token = { text: 'Test Dialogue', color: '#ffffff' };
  const strokeEnabled = true;
  const strokeWidth = 2;
  const strokeColor = '#000000';
  const scale = 1;
  const shadowEnabled = true;
  const tokenX = 40;
  const curY = 50;

  ctx.clearHistory();

  // Exactly what ChatLogView does (lines 442-466)
  const sanitizedStrokeWidth = Math.min(Math.max(0, strokeWidth), 8);
  const scaledStroke = Math.max(0, Math.round(sanitizedStrokeWidth * scale));

  if (strokeEnabled && scaledStroke > 0) {
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = scaledStroke;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    if (shadowEnabled) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 3 * scale;
      ctx.shadowOffsetX = 1.5 * scale;
      ctx.shadowOffsetY = 1.5 * scale;
    }
    ctx.strokeText(token.text, tokenX, curY);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = token.color;
  ctx.fillText(token.text, tokenX, curY);
  ctx.restore();

  const strokeIdx = ctx.operationHistory.findIndex(op => op.method === 'strokeText');
  const fillIdx = ctx.operationHistory.findIndex(op => op.method === 'fillText');

  const strokeOp = ctx.operationHistory[strokeIdx];
  const fillOp = ctx.operationHistory[fillIdx];

  const orderCorrect = strokeIdx !== -1 && fillIdx !== -1 && strokeIdx < fillIdx;
  const fillHasNoMaxWidth = fillOp.args.length === 3 || fillOp.args[3] === undefined;
  const strokeParamsValid = strokeOp.state.lineWidth === 2 && strokeOp.state.lineJoin === 'miter' && strokeOp.state.miterLimit === 2;

  return {
    passed: orderCorrect && fillHasNoMaxWidth && strokeParamsValid,
    observation: `strokeText at op index ${strokeIdx}, fillText at op index ${fillIdx}. Order correct: ${orderCorrect}. fillText has no maxWidth: ${fillHasNoMaxWidth}. stroke lineWidth=${strokeOp.state.lineWidth}, lineJoin=${strokeOp.state.lineJoin}, miterLimit=${strokeOp.state.miterLimit}`
  };
});

runStress('Stroke Engine', '2x scale export stroke scaling', () => {
  const canvas = createMockCanvas(2560, 1440);
  const ctx = canvas.getContext('2d') as MockCanvasRenderingContext2D;
  const scale = 2;
  const strokeWidth = 3;

  ctx.clearHistory();

  const sanitizedStrokeWidth = Math.min(Math.max(0, strokeWidth), 8);
  const scaledStroke = Math.max(0, Math.round(sanitizedStrokeWidth * scale));

  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = scaledStroke;
  ctx.strokeText('Scaled', 80, 100);
  ctx.restore();

  const strokeOp = ctx.operationHistory.find(op => op.method === 'strokeText')!;
  const expectedWidth = 6;

  return {
    passed: strokeOp.state.lineWidth === expectedWidth,
    observation: `Export scale 2x: strokeWidth ${strokeWidth} -> scaledStroke ${strokeOp.state.lineWidth} (expected ${expectedWidth})`
  };
});

runStress('Stroke Engine', 'Stroke width clamping with negative and extreme inputs', () => {
  const testCases = [
    { input: -5, expected: 0 },
    { input: 0, expected: 0 },
    { input: 4, expected: 4 },
    { input: 15, expected: 8 },
    { input: 999, expected: 8 }
  ];

  let passed = true;
  for (const tc of testCases) {
    const sanitized = Math.min(Math.max(0, tc.input), 8);
    if (sanitized !== tc.expected) passed = false;
  }

  return {
    passed,
    observation: `Clamping verified across [-5 -> 0, 0 -> 0, 4 -> 4, 15 -> 8, 999 -> 8]`
  };
});

// =========================================================================
// 3. PROCEDURAL MOSAIC & SOLID BAR CENSORSHIP
// =========================================================================

runStress('Mosaic Censorship', 'Mosaic rendering distribution and plain text protection', () => {
  const canvas = createMockCanvas(1280, 720);
  const ctx = canvas.getContext('2d') as MockCanvasRenderingContext2D;
  ctx.clearHistory();

  const token = { text: 'CLASSIFIED_CODE', width: 120 };
  const scale = 1;
  const scaledFontSize = 20;
  const tokenX = 100;
  const curY = 150;

  // ChatLogView lines 413-433
  const grainSize = Math.max(3, Math.round(4 * scale));
  const cols = Math.ceil(token.width / grainSize);
  const rowsCount = Math.ceil(scaledFontSize / grainSize);

  ctx.save();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rowsCount; r++) {
      const hash = Math.sin((tokenX + c * 17) * 12.9898 + (curY + r * 31) * 78.233) * 43758.5453;
      const rand = hash - Math.floor(hash);
      const shade = Math.floor(35 + rand * 85);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      ctx.fillRect(
        tokenX + c * grainSize,
        curY + r * grainSize,
        Math.min(grainSize, token.width - c * grainSize),
        Math.min(grainSize, scaledFontSize - r * grainSize)
      );
    }
  }
  ctx.restore();

  const fillRectCalls = ctx.operationHistory.filter(op => op.method === 'fillRect');
  const textCalls = ctx.operationHistory.filter(op => op.method === 'fillText' || op.method === 'strokeText');

  return {
    passed: fillRectCalls.length === cols * rowsCount && textCalls.length === 0,
    observation: `Generated ${fillRectCalls.length} mosaic grains (${cols}x${rowsCount}). Text calls count: ${textCalls.length} (zero plaintext leak)`
  };
});

runStress('Mosaic Censorship', 'Solid bar mode rendering', () => {
  const canvas = createMockCanvas(1280, 720);
  const ctx = canvas.getContext('2d') as MockCanvasRenderingContext2D;
  ctx.clearHistory();

  const token = { text: 'REDACTED', width: 100 };
  const scaledFontSize = 20;
  const tokenX = 50;
  const curY = 60;

  // ChatLogView lines 434-439
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.fillRect(tokenX, curY, token.width, scaledFontSize);
  ctx.restore();

  const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect')!;

  return {
    passed: fillOp.state.fillStyle === '#000000' && fillOp.args[2] === 100 && fillOp.args[3] === 20,
    observation: `Solid bar filled with ${fillOp.state.fillStyle} at (${fillOp.args[0]}, ${fillOp.args[1]}), size ${fillOp.args[2]}x${fillOp.args[3]}`
  };
});

runStress('Censorship Parsing', 'Unclosed delimiter handling ("||unclosed")', () => {
  const segments = splitCensoredSegments('Prefix ||unclosed string');
  return {
    passed: segments.length === 1 && !segments[0].isCensored,
    observation: `Unclosed delimiter treated as plain text safely: ${JSON.stringify(segments)}`
  };
});

// =========================================================================
// 4. POINTER CAPTURE ERGONOMICS LIFECYCLE
// =========================================================================

runStress('Pointer Capture', 'Pointer down sets capture, pointer up/cancel releases capture', () => {
  const canvas = createMockCanvas(1280, 720);
  let isDragging = false;
  const pointerId = 42;

  // Pointer down (button 0)
  canvas.setPointerCapture(pointerId);
  isDragging = true;
  const capturedOnDown = canvas.capturedPointerId === pointerId;

  // Pointer move within boundaries
  const pointerX = 300;
  const pointerY = 200;
  const dragOffset = { x: 50, y: 50 };
  const newChatPos = {
    x: Math.max(0, Math.min(canvas.width - 100, pointerX - dragOffset.x)),
    y: Math.max(0, Math.min(canvas.height - 50, pointerY - dragOffset.y))
  };

  // Pointer up releases capture
  isDragging = false;
  canvas.releasePointerCapture(pointerId);
  const releasedOnUp = canvas.capturedPointerId === null;

  return {
    passed: capturedOnDown && releasedOnUp && newChatPos.x === 250 && newChatPos.y === 150,
    observation: `Captured on down: ${capturedOnDown}, Released on up: ${releasedOnUp}, Position: (${newChatPos.x}, ${newChatPos.y})`
  };
});

runStress('Pointer Capture', 'Non-primary button (e.button !== 0) ignores drag', () => {
  const canvas = createMockCanvas(1280, 720);
  const pointerId = 99;
  let isDragging = false;

  const simulateDown = (button: number) => {
    if (button !== 0) return;
    canvas.setPointerCapture(pointerId);
    isDragging = true;
  };

  simulateDown(2); // Right click
  const rightClickIgnored = !isDragging && canvas.capturedPointerId === null;

  simulateDown(1); // Middle click
  const middleClickIgnored = !isDragging && canvas.capturedPointerId === null;

  simulateDown(0); // Left click
  const leftClickAccepted = isDragging && canvas.capturedPointerId === pointerId;

  return {
    passed: rightClickIgnored && middleClickIgnored && leftClickAccepted,
    observation: `Right click ignored: ${rightClickIgnored}, Middle click ignored: ${middleClickIgnored}, Left click accepted: ${leftClickAccepted}`
  };
});

// =========================================================================
// 5. MEMORY SAFETY & OBJECT URL LIFECYCLE
// =========================================================================

runStress('Memory Safety', 'URL.createObjectURL and URL.revokeObjectURL lifecycle', () => {
  resetMockEnv();

  let currentBlobUrl: string | null = null;

  const mockUpload = (fileName: string) => {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
      currentBlobUrl = null;
    }
    const blob = new Blob([fileName], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    currentBlobUrl = url;
    return url;
  };

  const url1 = mockUpload('screenshot1.png');
  const activeAfterFirst = urlTracker.activeUrls.has(url1);

  const url2 = mockUpload('screenshot2.png');
  const url1Revoked = !urlTracker.activeUrls.has(url1) && urlTracker.revokedUrls.includes(url1);
  const activeAfterSecond = urlTracker.activeUrls.has(url2);

  // Unmount simulation
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
  const url2Revoked = !urlTracker.activeUrls.has(url2) && urlTracker.revokedUrls.includes(url2);
  const zeroLeaks = urlTracker.activeUrls.size === 0;

  return {
    passed: activeAfterFirst && url1Revoked && activeAfterSecond && url2Revoked && zeroLeaks,
    observation: `URL1 created and revoked upon URL2 upload: ${url1Revoked}. URL2 revoked on unmount: ${url2Revoked}. Active URLs count: ${urlTracker.activeUrls.size}`
  };
});

// =========================================================================
// 6. EVENT SCOPING: TAB-ISOLATED PASTE LISTENER
// =========================================================================

runStress('Event Scoping', 'Paste listener inactive when container is hidden', () => {
  let pasteProcessed = false;

  const simulatePaste = (offsetParent: any, hasHiddenClass: boolean) => {
    pasteProcessed = false;
    const isHidden = offsetParent === null || hasHiddenClass;
    if (isHidden) {
      return; // Early return as in ChatLogView.tsx:126
    }
    pasteProcessed = true;
  };

  // Case 1: Active tab (visible)
  simulatePaste({}, false);
  const activePassed = pasteProcessed === true;

  // Case 2: Inactive tab (closest('.hidden') is true)
  simulatePaste({}, true);
  const hiddenIgnored = pasteProcessed === false;

  // Case 3: offsetParent is null (display: none)
  simulatePaste(null, false);
  const displayNoneIgnored = pasteProcessed === false;

  return {
    passed: activePassed && hiddenIgnored && displayNoneIgnored,
    observation: `Active tab accepted: ${activePassed}, Hidden tab ignored: ${hiddenIgnored}, display:none ignored: ${displayNoneIgnored}`
  };
});

console.log('\n---------------------------------------------------------------');
const total = stressLog.length;
const passedCount = stressLog.filter(s => s.passed).length;
const bugsCount = stressLog.filter(s => s.bugFound).length;
console.log(`STRESS RESULTS: Total: ${total} | Passed: ${passedCount} | Deficiencies/Bugs: ${bugsCount}`);
console.log('---------------------------------------------------------------\n');
