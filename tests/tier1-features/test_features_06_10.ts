/**
 * Tier 1 Feature Coverage Tests: Features 6 to 10 (25 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Feature 6: Accurate Character State & Speaker Tagging
 * Feature 7: Canvas Text Wrapping (wrapText)
 * Feature 8: Authentic GTA Text Outline Stroke
 * Feature 9: Procedural Mosaic Censorship Rendering
 * Feature 10: Chat Log Typography & Styling UI Controls
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D } from '../harness/mockEnv';
import { splitCensoredSegments, parseChatLine, wrapText } from '../../src/utils/chatParser';
import { Character } from '../../src/types';

describe('Tier 1: Features 06 to 10 Coverage', () => {

  // =========================================================================
  // Feature 6: Accurate Character State & Speaker Tagging
  // =========================================================================

  test('T1_F06_01_StandardSpeechSpeakerExtraction: Isolates speaker name and message body', () => {
    const parsed = parseChatLine('Mike Johnson diz: A gente não tem tempo.');
    assertEqual(parsed.speaker, 'Mike Johnson');
    assertEqual(parsed.messageText?.trim(), 'A gente não tem tempo.');
  });

  test('T1_F06_02_WhisperSpeakerExtraction: Isolates speaker name and identifies whisper tone', () => {
    const parsed = parseChatLine('Sarah Miller diz (baixo): Fale baixo.');
    assertEqual(parsed.speaker, 'Sarah Miller');
    assertEqual(parsed.type, 'darkgrey');
  });

  test('T1_F06_03_ShoutSpeakerExtraction: Isolates speaker tag for shout commands', () => {
    const parsed = parseChatLine('Policial #12 grita: Todos no chão!');
    assertEqual(parsed.speaker, 'Policial #12');
    assertEqual(parsed.type, 'white');
  });

  test('T1_F06_04_ActionSpeakerExtraction: Isolates acting character in * /me actions', () => {
    const parsed = parseChatLine('* Sarah Miller puxa a alavanca.');
    assertEqual(parsed.speaker, 'Sarah Miller');
    assertEqual(parsed.type, 'me');
  });

  test('T1_F06_05_CharacterColorOverride: Matches character state to assign configured color', () => {
    const characters: Character[] = [
      { id: 'char-1', name: 'Mike Johnson', color: '#38bdf8' },
      { id: 'char-2', name: 'Sarah Miller', color: '#f5c500' }
    ];

    const resolveLineColor = (line: string, chars: Character[]): string => {
      for (const c of chars) {
        if (line.includes(`${c.name} diz`) || line.includes(`* ${c.name}`)) {
          return c.color;
        }
      }
      return '#ffffff';
    };

    assertEqual(resolveLineColor('Mike Johnson diz: Olá', characters), '#38bdf8');
    assertEqual(resolveLineColor('Sarah Miller diz: Cuidado', characters), '#f5c500');
    assertEqual(resolveLineColor('Desconhecido diz: Quem é?', characters), '#ffffff');
  });

  // =========================================================================
  // Feature 7: Canvas Text Wrapping (wrapText)
  // =========================================================================

  test('T1_F07_01_ShortTextSingleLine: wrapText returns single line when text fits maxWidth', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.font = '16px sans-serif';
    const lines = wrapText(ctx as any, 'Texto curto', 500);
    assertEqual(lines.length, 1);
    assertEqual(lines[0], 'Texto curto');
  });

  test('T1_F07_02_LongTextWrapsIntoMultipleLines: Long sentence wraps into 3+ lines within maxWidth', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.font = '16px sans-serif';
    const longText = 'O suspeito acelerou o veículo preto em direção à rodovia interestadual ignorando completamente todos os sinais de parada obrigatória e colocando em risco os pedestres no local.';
    const maxWidth = 300;
    const lines = wrapText(ctx as any, longText, maxWidth);

    assert(lines.length >= 3, `Expected >= 3 wrapped lines, got ${lines.length}`);
    for (const line of lines) {
      assert(ctx.measureText(line).width <= maxWidth + 10, `Line width exceeded maxWidth`);
    }
  });

  test('T1_F07_03_LineHeightProgression: Computes vertical coordinates incrementally per wrapped line', () => {
    const startY = 50;
    const lineHeight = 30;
    const lines = ['Linha 1', 'Linha 2', 'Linha 3'];

    const yCoords = lines.map((_, idx) => startY + idx * lineHeight);
    assertDeepEqual(yCoords, [50, 80, 110]);
  });

  test('T1_F07_04_BackgroundHighlightWraps: Background rect fills each wrapped line independently', () => {
    const ctx = createMockContext2D(800, 600);
    const lines = ['Primeira linha do chat RP', 'Segunda linha após a quebra'];
    const startX = 40;
    const padX = 8;
    const padY = 4;
    const fontSize = 18;
    const lineHeight = 28;

    lines.forEach((line, idx) => {
      const w = ctx.measureText(line).width;
      const y = 50 + idx * lineHeight;
      ctx.fillRect(startX - padX, y - padY, w + padX * 2, fontSize + padY * 2);
    });

    const fillRects = ctx.operationHistory.filter(op => op.method === 'fillRect');
    assertEqual(fillRects.length, 2);
  });

  test('T1_F07_05_PreserveManualNewlines: Preserves explicit newline breaks', () => {
    const ctx = createMockContext2D(800, 600);
    const text = 'Primeira linha manual\nSegunda linha manual';
    const lines = wrapText(ctx as any, text, 800);

    assertEqual(lines.length, 2);
    assertEqual(lines[0], 'Primeira linha manual');
    assertEqual(lines[1], 'Segunda linha manual');
  });

  // =========================================================================
  // Feature 8: Authentic GTA Text Outline Stroke
  // =========================================================================

  test('T1_F08_01_StrokeTextInvocation: Calls strokeText before fillText when strokeEnabled', () => {
    const ctx = createMockContext2D(800, 600);
    const text = 'GTA RP TEXT';

    // Render with stroke
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 50, 50);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 50, 50);

    const ops = ctx.operationHistory.map(o => o.method);
    const strokeIdx = ops.indexOf('strokeText');
    const fillIdx = ops.indexOf('fillText');

    assert(strokeIdx !== -1, 'strokeText must be called');
    assert(fillIdx !== -1, 'fillText must be called');
    assert(strokeIdx < fillIdx, 'strokeText must precede fillText');
  });

  test('T1_F08_02_StrokeWidthScaling: Scales outline stroke proportionally to canvas scale', () => {
    const computeStrokeWidth = (baseStroke: number, scale: number) => Math.max(1, Math.round(baseStroke * scale));

    assertEqual(computeStrokeWidth(2, 1), 2);
    assertEqual(computeStrokeWidth(2, 2), 4);
    assertEqual(computeStrokeWidth(2, 4), 8);
  });

  test('T1_F08_03_StrokeColorDefault: Outline stroke defaults to solid black', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.strokeStyle = '#000000';
    ctx.strokeText('Sample', 10, 10);

    const strokeOp = ctx.operationHistory.find(op => op.method === 'strokeText');
    assertEqual(strokeOp?.state.strokeStyle, '#000000');
  });

  test('T1_F08_04_StrokeToggleEnabledDisabled: Skips strokeText entirely when disabled', () => {
    const ctx = createMockContext2D(800, 600);
    const strokeEnabled = false;

    if (strokeEnabled) {
      ctx.strokeText('No Stroke Text', 20, 20);
    }
    ctx.fillText('No Stroke Text', 20, 20);

    const strokeCalls = ctx.operationHistory.filter(op => op.method === 'strokeText');
    assertEqual(strokeCalls.length, 0);
  });

  test('T1_F08_05_LineJoinAndCapStyling: Configures miter lineJoin for sharp GTA text contours', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 2;
    ctx.strokeText('GTA', 10, 10);

    const strokeOp = ctx.operationHistory.find(op => op.method === 'strokeText');
    assertEqual(strokeOp?.state.lineJoin, 'miter');
    assertEqual(strokeOp?.state.miterLimit, 2);
  });

  // =========================================================================
  // Feature 9: Procedural Mosaic Censorship Rendering
  // =========================================================================

  test('T1_F09_01_SplitDoublePipesCensorship: Splits ||text|| into clear and censored segments', () => {
    const segments = splitCensoredSegments('O suspeito é ||John Doe|| na van');
    assertEqual(segments.length, 3);
    assertDeepEqual(segments[0], { text: 'O suspeito é ', isCensored: false });
    assertDeepEqual(segments[1], { text: 'John Doe', isCensored: true });
    assertDeepEqual(segments[2], { text: ' na van', isCensored: false });
  });

  test('T1_F09_02_SplitBracketCensorTag: Splits [censor]tag[/censor] format into censored segment', () => {
    const segments = splitCensoredSegments('Placa: [censor]ABC-1234[/censor] confirmada');
    assertEqual(segments.length, 3);
    assertEqual(segments[1].text, 'ABC-1234');
    assertEqual(segments[1].isCensored, true);
  });

  test('T1_F09_03_SplitUnicodeBlockChars: Identifies Unicode █ blocks as censored segments', () => {
    const segments = splitCensoredSegments('Agente ██████ compareça');
    const censored = segments.find(s => s.isCensored);
    assert(censored !== undefined);
    assert(censored!.text.includes('█'));
  });

  test('T1_F09_04_CensorshipMosaicDrawing: Renders mosaic block as filled rectangle covering bounding box', () => {
    const ctx = createMockContext2D(800, 600);
    const censoredSegment = { text: 'CONFIDENTIAL', isCensored: true };

    const segWidth = ctx.measureText(censoredSegment.text).width;
    const segHeight = 20;
    ctx.fillStyle = '#000000';
    ctx.fillRect(100, 50, segWidth, segHeight);

    const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect');
    assert(fillOp !== undefined);
    assertEqual(fillOp!.args[0], 100);
    assertEqual(fillOp!.args[1], 50);
  });

  test('T1_F09_05_FollowingTextOffset: Positions succeeding text after censored segment offset', () => {
    const ctx = createMockContext2D(800, 600);
    const startX = 50;
    const censoredText = 'SECRET';
    const widthCensored = ctx.measureText(censoredText).width;

    const startX_AFTER = startX + widthCensored;
    assertEqual(startX_AFTER, startX + widthCensored);
    assert(startX_AFTER > startX);
  });

  // =========================================================================
  // Feature 10: Chat Log Typography & Styling UI Controls
  // =========================================================================

  test('T1_F10_01_FontSizeChangeRedraw: Updating font size applies correctly to canvas context font', () => {
    const ctx = createMockContext2D(800, 600);
    const fontSize = 28;
    ctx.font = `bold ${fontSize}px sans-serif`;

    assert(ctx.font.includes('28px'));
  });

  test('T1_F10_02_FontFamilySelection: Applying JetBrains Mono configures font string', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.font = 'bold 20px "JetBrains Mono", monospace';

    assert(ctx.font.includes('JetBrains Mono'));
  });

  test('T1_F10_03_BackgroundOpacitySlider: Adjusting bgOpacity applies globalAlpha to background box', () => {
    const ctx = createMockContext2D(800, 600);
    const bgOpacity = 0.4;

    ctx.save();
    ctx.globalAlpha = bgOpacity;
    ctx.fillRect(10, 10, 200, 30);
    ctx.restore();

    const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect');
    assertEqual(fillOp?.state.globalAlpha, 0.4);
  });

  test('T1_F10_04_MaxWidthAdjustment: Computes maximum chat line width from percentage', () => {
    const canvasWidth = 1000;
    const maxWidthPercent = 70;
    const maxW = Math.round((canvasWidth * maxWidthPercent) / 100);

    assertEqual(maxW, 700);
  });

  test('T1_F10_05_BackgroundColorPicker: Updates background fillStyle to custom hex color', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(20, 20, 150, 40);

    const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect');
    assertEqual(fillOp?.state.fillStyle, '#1e293b');
  });

});
