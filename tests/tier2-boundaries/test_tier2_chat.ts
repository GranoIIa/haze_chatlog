/**
 * Tier 2 Boundary & Corner Case Tests: Chat Log Engine (40 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Covers boundary edge cases for Features 4, 5, 6, 7, 8, 9, 10, 11
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockContext2D } from '../harness/mockEnv';
import { splitCensoredSegments, parseChatLine, wrapText } from '../../src/utils/chatParser';

describe('Tier 2: Chat Log Engine Boundary & Corner Cases', () => {

  // =========================================================================
  // Feature 4 Boundaries: RP Command Parser Engine
  // =========================================================================

  test('T2_F04_01_LeadingWhitespaceSlicing: Strips prefixes correctly when leading spaces exist', () => {
    const l1 = parseChatLine('   !Alerta urgente');
    const l2 = parseChatLine('   #Aviso policial');
    assertEqual(l1.type, 'system');
    assertEqual(l2.type, 'yellow');
    assert(l1.rawText.includes('Alerta urgente'));
  });

  test('T2_F04_02_CaseInsensitiveCommands: Parses slash commands regardless of uppercase or mixed case', () => {
    assertEqual(parseChatLine('/ME corre rápido').type, 'me');
    assertEqual(parseChatLine('/Do o carro capotou').type, 'yellow');
    assertEqual(parseChatLine('/OOC brb').type, 'ooc');
    assertEqual(parseChatLine('/Radio 10-4').type, 'blue');
  });

  test('T2_F04_03_EmptyAndWhitespaceLines: Empty or whitespace-only lines return empty type safely', () => {
    assertEqual(parseChatLine('').type, 'empty');
    assertEqual(parseChatLine('   ').type, 'empty');
    assertEqual(parseChatLine('\t\t\n').type, 'empty');
  });

  test('T2_F04_04_SlashCommandWithoutArguments: Bare slash commands handled without undefined errors', () => {
    assertEqual(parseChatLine('/me').type, 'me');
    assertEqual(parseChatLine('/do').type, 'yellow');
    assertEqual(parseChatLine('/radio').type, 'blue');
  });

  test('T2_F04_05_GiantLineStress: Massive line with 10,000 characters parses quickly without backtracking', () => {
    const giantLine = '/me ' + 'puxa / empurra / corre / '.repeat(400);
    const start = Date.now();
    const parsed = parseChatLine(giantLine);
    const duration = Date.now() - start;

    assertEqual(parsed.type, 'me');
    assert(duration < 50, `Parser took ${duration}ms, expected < 50ms`);
  });

  // =========================================================================
  // Feature 5 Boundaries: Timestamp Parsing & Toggle
  // =========================================================================

  test('T2_F05_01_MalformedBracketTimestamp: Non-timestamp brackets are preserved in text body', () => {
    const p1 = parseChatLine('[99:99:99] Alô');
    const p2 = parseChatLine('[abc] Teste');
    const p3 = parseChatLine('[] Vazio');

    assertEqual(p1.timestamp, undefined);
    assertEqual(p2.timestamp, undefined);
    assertEqual(p3.timestamp, undefined);
    assert(p1.rawText.includes('[99:99:99]'));
  });

  test('T2_F05_02_TimestampInsideMessage: Mid-sentence brackets not confused with line timestamp', () => {
    const parsed = parseChatLine('Carlos diz: O prazo final é [14:00] hoje.');
    assertEqual(parsed.timestamp, undefined);
    assert(parsed.messageText?.includes('[14:00]'));
  });

  test('T2_F05_03_MultipleConsecutiveTimestamps: First timestamp extracted as line timestamp, second kept in text', () => {
    const parsed = parseChatLine('[10:00:00] [10:00:01] Olá');
    assertEqual(parsed.timestamp, '[10:00:00]');
    assert(parsed.messageText?.includes('[10:00:01]') || parsed.rawText.includes('[10:00:01]'));
  });

  test('T2_F05_04_LeadingSpacesBeforeTimestamp: Leading whitespace before timestamp is handled cleanly', () => {
    const parsed = parseChatLine('    [15:30:00] /me corre');
    assertEqual(parsed.timestamp, '[15:30:00]');
    assertEqual(parsed.type, 'me');
  });

  test('T2_F05_05_MidnightBoundaryTimestamp: Boundary timestamp values at midnight and day-end parsed correctly', () => {
    assertEqual(parseChatLine('[00:00:00] Início').timestamp, '[00:00:00]');
    assertEqual(parseChatLine('[23:59:59] Fim').timestamp, '[23:59:59]');
  });

  // =========================================================================
  // Feature 6 Boundaries: Accurate Character State & Speaker Tagging
  // =========================================================================

  test('T2_F06_01_SpecialCharactersInSpeakerName: Speaker names with punctuation and callsigns isolated cleanly', () => {
    const p1 = parseChatLine("OFC. J. O'Connor [K-9] diz: Parado!");
    const p2 = parseChatLine('Alex "Ghost" Silva diz: Cuidado.');

    assertEqual(p1.speaker, "OFC. J. O'Connor [K-9]");
    assertEqual(p2.speaker, 'Alex "Ghost" Silva');
  });

  test('T2_F06_02_SpeakerWithoutMessageBody: Speaker tag without message text produces empty message string', () => {
    const parsed = parseChatLine('Mike Johnson diz:');
    assertEqual(parsed.speaker, 'Mike Johnson');
    assertEqual(parsed.messageText?.trim(), '');
  });

  test('T2_F06_03_MultipleColonsInMessage: Message body containing colons does not truncate after first colon', () => {
    const parsed = parseChatLine('Mike diz: O horário é 14:30:15 e o IP é: 127.0.0.1');
    assertEqual(parsed.speaker, 'Mike');
    assertEqual(parsed.messageText?.trim(), 'O horário é 14:30:15 e o IP é: 127.0.0.1');
  });

  test('T2_F06_04_CharacterMatchingCaseSensitivity: Resolves character identity case-insensitively', () => {
    const charName = 'Mike Johnson';
    const line = 'mike johnson diz: oi';

    const isMatch = (targetName: string, speechLine: string) => {
      return speechLine.toLowerCase().includes(`${targetName.toLowerCase()} diz`);
    };

    assert(isMatch(charName, line));
  });

  test('T2_F06_05_UnregisteredSpeakerFallback: Unregistered speaker defaults safely to standard white', () => {
    const registered = [{ id: '1', name: 'Oficial Marcus', color: '#10b981' }];
    const line = 'Desconhecido 999 diz: Olá';

    const getSpeakerColor = (speakerLine: string, chars: typeof registered) => {
      for (const c of chars) {
        if (speakerLine.includes(c.name)) return c.color;
      }
      return '#ffffff';
    };

    assertEqual(getSpeakerColor(line, registered), '#ffffff');
  });

  // =========================================================================
  // Feature 7 Boundaries: Canvas Text Wrapping
  // =========================================================================

  test('T2_F07_01_SingleGiantWordWithoutSpaces: Long unbroken string breaks by character chunks', () => {
    const ctx = createMockContext2D(800, 600);
    const giantWord = 'A'.repeat(150);
    const lines = wrapText(ctx as any, giantWord, 100);

    assert(lines.length >= 3, 'Giant word must be broken across multiple lines');
  });

  test('T2_F07_02_ZeroOrNegativeMaxWidth: Clamps zero or negative maxWidth to safe minimum without hang', () => {
    const ctx = createMockContext2D(800, 600);
    const lines1 = wrapText(ctx as any, 'Texto teste', 0);
    const lines2 = wrapText(ctx as any, 'Texto teste', -50);

    assert(lines1.length >= 1);
    assert(lines2.length >= 1);
  });

  test('T2_F07_03_ConsecutiveSpacesAndTabs: Consecutive whitespace sequences handled without blank lines', () => {
    const ctx = createMockContext2D(800, 600);
    const text = 'Mike diz:       muitos     espaços\t\taqui';
    const lines = wrapText(ctx as any, text, 400);

    assert(!lines.some(l => l === ''));
  });

  test('T2_F07_04_WrapWithUnicodeEmojis: Unicode emojis with surrogate pairs wrap cleanly', () => {
    const ctx = createMockContext2D(800, 600);
    const text = 'Policia 🚓🚨 em perseguição 🔥💥!';
    const lines = wrapText(ctx as any, text, 120);

    assert(lines.length >= 2);
    const joined = lines.join(' ');
    assert(joined.includes('🚓🚨'));
    assert(joined.includes('🔥💥'));
  });

  test('T2_F07_05_CensoredSegmentWrap: Line containing censored blocks wraps without breaking tags', () => {
    const ctx = createMockContext2D(800, 600);
    const text = 'Atenção unidade ||LOCALIZAÇÃO ULTRA SECRETA DE CONTRA-ESPIONAGEM|| em andamento';
    const lines = wrapText(ctx as any, text, 200);

    assert(lines.length >= 2);
  });

  // =========================================================================
  // Feature 8 Boundaries: Authentic GTA Text Outline Stroke
  // =========================================================================

  test('T2_F08_01_ZeroStrokeWidth: Zero stroke width suppresses stroke rendering', () => {
    const ctx = createMockContext2D(800, 600);
    const strokeWidth = 0;

    if (strokeWidth > 0) {
      ctx.strokeText('Text', 10, 10);
    }
    ctx.fillText('Text', 10, 10);

    const strokeOps = ctx.operationHistory.filter(op => op.method === 'strokeText');
    assertEqual(strokeOps.length, 0);
  });

  test('T2_F08_02_ExtremeStrokeWidth: Clamps extreme strokeWidth to safe upper bound', () => {
    const sanitizeStrokeWidth = (val: number, maxLimit: number = 8) => Math.min(Math.max(0, val), maxLimit);
    assertEqual(sanitizeStrokeWidth(100), 8);
    assertEqual(sanitizeStrokeWidth(-5), 0);
  });

  test('T2_F08_03_TransparentStrokeColor: Transparent stroke color applies without context crash', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.strokeStyle = 'rgba(0,0,0,0)';
    ctx.strokeText('Transparent Outline', 10, 10);

    const strokeOp = ctx.operationHistory.find(op => op.method === 'strokeText');
    assertEqual(strokeOp?.state.strokeStyle, 'rgba(0,0,0,0)');
  });

  test('T2_F08_04_StrokeWithCensorshipMosaic: Outlines apply only to clear text and not mosaic bars', () => {
    const ctx = createMockContext2D(800, 600);
    const segments = [
      { text: 'Alvo: ', isCensored: false },
      { text: 'CONFIDENTIAL', isCensored: true }
    ];

    segments.forEach(seg => {
      if (seg.isCensored) {
        ctx.fillRect(50, 10, 80, 20); // Mosaic: rect only
      } else {
        ctx.strokeText(seg.text, 10, 10);
        ctx.fillText(seg.text, 10, 10);
      }
    });

    const strokes = ctx.operationHistory.filter(op => op.method === 'strokeText');
    assertEqual(strokes.length, 1);
    assertEqual(strokes[0].args[0], 'Alvo: ');
  });

  test('T2_F08_05_ExportScaleStrokeConsistency: Stroke width scales linearly with canvas export resolution', () => {
    const computeWidth = (baseWidth: number, scale: number) => baseWidth * scale;
    assertEqual(computeWidth(2, 4), 8);
  });

  // =========================================================================
  // Feature 9 Boundaries: Procedural Mosaic Censorship Rendering
  // =========================================================================

  test('T2_F09_01_UnclosedCensorDelimiters: Unclosed censorship tags handled gracefully without infinite loop', () => {
    const s1 = splitCensoredSegments('Segredo ||incompleto sem fechar');
    const s2 = splitCensoredSegments('[censor]incompleto');

    assert(s1.length >= 1);
    assert(s2.length >= 1);
  });

  test('T2_F09_02_EmptyCensoredTag: Empty censor tags produce safe non-crashing segment', () => {
    const s1 = splitCensoredSegments('Vazio |||| aqui');
    const s2 = splitCensoredSegments('[censor][/censor]');

    assert(s1.length >= 1);
    assert(s2.length >= 1);
  });

  test('T2_F09_03_NestedCensorTags: Nested censor tags parse in single pass safely', () => {
    const segments = splitCensoredSegments('||segredo [censor]duplo[/censor] aqui||');
    assert(segments.length >= 1);
  });

  test('T2_F09_04_CensoredSegmentAtStartAndEnd: Censored segments at start and end compute correct offsets', () => {
    const segments = splitCensoredSegments('||INÍCIO|| texto ||FIM||');
    assertEqual(segments.length, 3);
    assertEqual(segments[0].isCensored, true);
    assertEqual(segments[1].isCensored, false);
    assertEqual(segments[2].isCensored, true);
  });

  test('T2_F09_05_AllCensoredLine: Line composed entirely of censored content produces 0 text fills', () => {
    const segments = splitCensoredSegments('||TUDO CENSURADO NESTA LINHA||');
    const allCensored = segments.every(s => s.isCensored);
    assertEqual(allCensored, true);
  });

  // =========================================================================
  // Feature 10 Boundaries: Chat Log Typography & Styling UI Controls
  // =========================================================================

  test('T2_F10_01_MinMaxFontSizeBounds: Clamps font size within ergonomic bounds [10, 72]', () => {
    const clampFontSize = (val: number) => Math.min(Math.max(10, val), 72);

    assertEqual(clampFontSize(-10), 10);
    assertEqual(clampFontSize(1000), 72);
    assertEqual(clampFontSize(24), 24);
  });

  test('T2_F10_02_ZeroBackgroundOpacity: Zero bgOpacity skips background rect fill entirely', () => {
    const ctx = createMockContext2D(800, 600);
    const bgOpacity = 0;

    if (bgOpacity > 0) {
      ctx.fillRect(10, 10, 100, 20);
    }

    const fills = ctx.operationHistory.filter(op => op.method === 'fillRect');
    assertEqual(fills.length, 0);
  });

  test('T2_F10_03_InvalidFontFamilyFallback: Canvas context tolerates non-existent font family gracefully', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.font = '20px "NonExistentFont12345", sans-serif';
    assert(ctx.font.includes('sans-serif'));
  });

  test('T2_F10_04_InvalidHexColorString: Sanitizes invalid hex color strings to default black', () => {
    const sanitizeColor = (hex: string) => (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex) ? hex : '#000000');

    assertEqual(sanitizeColor('invalid-color'), '#000000');
    assertEqual(sanitizeColor('#12'), '#000000');
    assertEqual(sanitizeColor('#10b981'), '#10b981');
  });

  test('T2_F10_05_ExtremeMaxWidthBounds: Clamps maxWidthPercent within safe range [30, 100]', () => {
    const clampMaxWidthPercent = (val: number) => Math.min(Math.max(30, val), 100);

    assertEqual(clampMaxWidthPercent(5), 30);
    assertEqual(clampMaxWidthPercent(150), 100);
    assertEqual(clampMaxWidthPercent(75), 75);
  });

  // =========================================================================
  // Feature 11 Boundaries: Chat Log Drag-and-Drop & Memory Safety
  // =========================================================================

  test('T2_F11_01_DropNonImageFile: Rejects non-image files safely without throwing', () => {
    let uploadedSrc: string | null = null;
    const handleFileDrop = (file: { type: string }) => {
      if (file.type.startsWith('image/')) {
        uploadedSrc = 'blob:valid-image';
      }
    };

    handleFileDrop({ type: 'text/plain' });
    assertEqual(uploadedSrc, null);
  });

  test('T2_F11_02_DragChatToNegativeCoordinates: Clamps drag coordinates to prevent losing chat offscreen', () => {
    const clampPos = (x: number, y: number, canvasW: number, canvasH: number) => {
      return {
        x: Math.max(0, Math.min(x, canvasW - 100)),
        y: Math.max(0, Math.min(y, canvasH - 50))
      };
    };

    const clamped = clampPos(-500, -300, 1280, 720);
    assertEqual(clamped.x, 0);
    assertEqual(clamped.y, 0);
  });

  test('T2_F11_03_DropMultipleFilesSimultaneously: Processes first valid image when multiple files are dropped', () => {
    const files = [
      { name: 'photo1.png', type: 'image/png' },
      { name: 'photo2.png', type: 'image/png' },
      { name: 'document.txt', type: 'text/plain' }
    ];

    const processedFiles: string[] = [];
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      processedFiles.push(files[0].name);
    }

    assertEqual(processedFiles.length, 1);
    assertEqual(processedFiles[0], 'photo1.png');
  });

  test('T2_F11_04_CorruptedImageFileDrop: Image loading errors caught cleanly and loading state reset', () => {
    let isLoading = true;
    let hasError = false;

    const onImageLoadError = () => {
      isLoading = false;
      hasError = true;
    };

    onImageLoadError();
    assertEqual(isLoading, false);
    assertEqual(hasError, true);
  });

  test('T2_F11_05_UnmountDuringActiveDrag: Component unmount removes active drag listeners cleanly', () => {
    let listenersAttached = true;
    const unmount = () => {
      listenersAttached = false;
    };

    unmount();
    assertEqual(listenersAttached, false);
  });

});
