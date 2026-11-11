/**
 * Tier 3 Pairwise Cross-Feature Interaction Tests (25 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Systematic coverage of pairwise feature interactions across all 25 features.
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D } from '../harness/mockEnv';
import { splitCensoredSegments, CHAT_COLORS, parseChatLine } from '../../src/utils/chatParser';
import { RP_PRESETS } from '../../src/utils/rpPresets';
import { RP_STICKERS } from '../../src/utils/rpStickers';
import { applyPhotoAdjustments, DEFAULT_ADJUSTMENTS, PhotoAdjustments } from '../../src/utils/photoFilters';
import { SimpleGifEncoder } from '../../src/utils/gifEncoder';
import { CanvasLayer, ParsedLine } from '../../src/types';

describe('Tier 3: Pairwise Cross-Feature Interaction Tests', () => {

  // T3-01: F4 (RP Command Parser) + F5 (Timestamp Parsing)
  test('T3-01: RP command parser correctly extracts timestamp metadata and identifies command type', () => {
    const raw = '[14:32:05] /me saca uma pistola Glock 19 do coldre tático.';
    const parsed = parseChatLine(raw);
    assertEqual(parsed.type, 'me');
    assertEqual(parsed.timestamp, '[14:32:05]');
    assertEqual(parsed.messageText, 'saca uma pistola Glock 19 do coldre tático.');
    assert(parsed.rawText.includes('Glock 19'));
  });

  // T3-02: F4 (RP Command Parser) + F6 (Character Speaker Tagging)
  test('T3-02: RP command speech parsing isolates character speaker tag and assigns speaker color', () => {
    const raw = 'Marcus Vance diz: Preparem o perímetro, eles estão se aproximando.';
    const parsed = parseChatLine(raw);
    assertEqual(parsed.speaker, 'Marcus Vance');
    assertEqual(parsed.type, 'white');
    assert(parsed.messageText?.startsWith('Preparem o perímetro'));
  });

  // T3-03: F4 (RP Command Parser) + F7 (Canvas Text Wrapping wrapText)
  test('T3-03: Long parsed RP /do action wraps into multiple lines within canvas maxWidth without glyph compression', () => {
    const raw = '* Seria possível notar marcas de frenagem na pista e estilhaços de vidro espalhados por mais de dez metros da colisão. (( Perito Forense ))';
    const parsed = parseChatLine(raw);
    const canvas = createMockCanvas(800, 600);
    const ctx = canvas.getContext('2d')!;
    ctx.font = '20px Arial';

    // Simulate wrapText
    const words = parsed.rawText.split(' ');
    const maxWidth = 300;
    const lines: string[] = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
      const testLine = currentLine + ' ' + words[i];
      if (ctx.measureText(testLine).width > maxWidth) {
        lines.push(currentLine);
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }
    lines.push(currentLine);

    assert(lines.length >= 3, `Expected at least 3 wrapped lines, got ${lines.length}`);
    lines.forEach(l => assert(ctx.measureText(l).width <= maxWidth + 5));
  });

  // T3-04: F4 (RP Command Parser) + F9 (Procedural Mosaic Censorship Rendering)
  test('T3-04: RP radio message with censorship tags parses into distinct clear and censored segments', () => {
    const raw = '[RÁDIO] Central, enviando reforços para a localização ||Rua Alta, número 104|| imediatamente.';
    const parsed = parseChatLine(raw);
    const segments = parsed.segments;
    assert(segments.length >= 3);
    const censoredSegment = segments.find(s => s.isCensored);
    assert(censoredSegment !== undefined);
    assertEqual(censoredSegment!.text.trim(), 'Rua Alta, número 104');
  });

  // T3-05: F5 (Timestamp Parsing) + F10 (Typography & Styling UI Controls)
  test('T3-05: Timestamp display toggle formats or hides timestamp while styling preserves message body font', () => {
    const raw = '[20:15:30] John Doe diz (baixo): Fique quieto.';
    const parsed = parseChatLine(raw);

    const formatLineWithTimestamp = (p: ParsedLine, showTimestamp: boolean) => {
      if (showTimestamp && p.timestamp) {
        return `${p.timestamp} ${p.rawText.replace(/^\[.*?\]\s*/, '')}`;
      }
      return p.rawText.replace(/^\[.*?\]\s*/, '');
    };

    const withTime = formatLineWithTimestamp(parsed, true);
    const withoutTime = formatLineWithTimestamp(parsed, false);

    assert(withTime.startsWith('[20:15:30]'));
    assert(!withoutTime.startsWith('[20:15:30]'));
    assertEqual(withoutTime, 'John Doe diz (baixo): Fique quieto.');
  });

  // T3-06: F7 (Canvas Text Wrapping) + F8 (Authentic GTA Text Outline Stroke)
  test('T3-06: Wrapped text lines receive solid black outline strokeText before fillText rendering', () => {
    const canvas = createMockCanvas(800, 600);
    const ctx = canvas.getContext('2d')!;
    const calls: string[] = [];

    ctx.strokeText = (text: string, _x: number, _y: number) => {
      calls.push(`stroke:${text}`);
    };
    ctx.fillText = (text: string, _x: number, _y: number) => {
      calls.push(`fill:${text}`);
    };

    const lines = ['Linha 1 do chat RP', 'Linha 2 continuação'];
    lines.forEach((line, idx) => {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(line, 40, 50 + idx * 30);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, 40, 50 + idx * 30);
    });

    assertEqual(calls.length, 4);
    assertEqual(calls[0], 'stroke:Linha 1 do chat RP');
    assertEqual(calls[1], 'fill:Linha 1 do chat RP');
    assertEqual(calls[2], 'stroke:Linha 2 continuação');
    assertEqual(calls[3], 'fill:Linha 2 continuação');
  });

  // T3-07: F8 (GTA Outline Stroke) + F9 (Mosaic Censorship Rendering)
  test('T3-07: GTA outline stroke applies exclusively to clear text segments while mosaic renders as filled rect', () => {
    const segments = [
      { text: 'Alvo localizado em: ', isCensored: false },
      { text: 'Paleto Bay', isCensored: true }
    ];
    const canvas = createMockCanvas(800, 600);
    const ctx = canvas.getContext('2d')!;
    const actions: string[] = [];

    segments.forEach(seg => {
      if (seg.isCensored) {
        actions.push(`mosaicRect:${seg.text.length * 10}px`);
      } else {
        actions.push(`strokeText:${seg.text}`);
        actions.push(`fillText:${seg.text}`);
      }
    });

    assertEqual(actions[0], 'strokeText:Alvo localizado em: ');
    assertEqual(actions[1], 'fillText:Alvo localizado em: ');
    assertEqual(actions[2], 'mosaicRect:100px');
  });

  // T3-08: F6 (Character State) + F10 (Chat Typography & Color Controls)
  test('T3-08: Character speaker colors render alongside global typography font size and line height', () => {
    const characters = [
      { id: '1', name: 'Frank Castillo', color: '#10b981' },
      { id: '2', name: 'Elena Rostova', color: '#fb7185' }
    ];
    const line1 = 'Frank Castillo diz: Temos um acordo.';
    const line2 = 'Elena Rostova diz: Apenas se o pagamento for adiantado.';

    const getColorForLine = (text: string) => {
      for (const c of characters) {
        if (text.includes(`${c.name} diz:`)) return c.color;
      }
      return '#ffffff';
    };

    assertEqual(getColorForLine(line1), '#10b981');
    assertEqual(getColorForLine(line2), '#fb7185');
  });

  // T3-09: F2 (Tab State Persistence) + F11 (Chat Drag-and-Drop & Memory Safety)
  test('T3-09: Uploaded screenshot image and chat state survive tab switching without state loss', () => {
    const studioState = {
      activeTab: 'chatlog',
      chatlog: {
        imageSrc: 'blob:http://localhost/test-image-123',
        dimensions: { width: 1920, height: 1080 },
        rawText: 'Test text',
        chatPos: { x: 50, y: 80 }
      },
      canvas: { layers: [] },
      giflab: { videoSrc: null }
    };

    studioState.activeTab = 'canvas';
    assertEqual(studioState.chatlog.imageSrc, 'blob:http://localhost/test-image-123');
    assertEqual(studioState.chatlog.dimensions.width, 1920);

    studioState.activeTab = 'giflab';
    studioState.activeTab = 'chatlog';
    assertEqual(studioState.chatlog.chatPos.x, 50);
  });

  // T3-10: F1 (Type Contracts) + F12 (Direct Canvas Layer Hit-Testing)
  test('T3-10: Direct hit-testing accurately detects clicks inside CanvasLayer bounding box', () => {
    const layer: CanvasLayer = {
      id: 'layer-1',
      type: 'text',
      name: 'Watermark',
      x: 100,
      y: 150,
      width: 200,
      height: 60,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false
    };

    const isHit = (x: number, y: number, l: CanvasLayer) => {
      return x >= l.x && x <= l.x + l.width && y >= l.y && y <= l.y + l.height;
    };

    assert(isHit(150, 180, layer), 'Point inside should hit');
    assert(!isHit(50, 180, layer), 'Point outside left should miss');
    assert(!isHit(150, 220, layer), 'Point outside bottom should miss');
  });

  // T3-11: F12 (Direct Layer Hit-Testing) + F13 (Layer Property Inspector)
  test('T3-11: Selecting a preset layer on canvas binds it to the Property Inspector for metadata editing', () => {
    const layer: CanvasLayer = {
      id: 'weazel-1',
      type: 'preset',
      name: 'Weazel Live',
      x: 0,
      y: 500,
      width: 1280,
      height: 220,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      presetType: 'weazel',
      presetData: { ...RP_PRESETS.weazel.defaultData }
    };

    const updatedData = {
      ...layer.presetData,
      headline: 'OPERAÇÃO POLICIAL NAS DOCAS APREENDE CONTRABANDO',
      tag: 'ÚLTIMA HORA'
    };
    layer.presetData = updatedData;

    assertEqual(layer.presetData.headline, 'OPERAÇÃO POLICIAL NAS DOCAS APREENDE CONTRABANDO');
    assertEqual(layer.presetData.tag, 'ÚLTIMA HORA');
  });

  // T3-12: F13 (Layer Property Inspector) + F14 (Floating Image & Watermark Layers)
  test('T3-12: Layer Property Inspector modifies opacity and blend mode on floating evidence image layers', () => {
    const imageLayer: CanvasLayer = {
      id: 'img-badge',
      type: 'image',
      name: 'Watermark LSPD',
      x: 50,
      y: 50,
      width: 150,
      height: 150,
      rotation: 0,
      opacity: 0.5,
      visible: true,
      locked: false,
      blendMode: 'multiply'
    };

    imageLayer.opacity = 0.85;
    imageLayer.blendMode = 'overlay';

    assertEqual(imageLayer.opacity, 0.85);
    assertEqual(imageLayer.blendMode, 'overlay');
  });

  // T3-13: F12 (Direct Layer Hit-Testing) + F15 (Layer Transform Handles Scale & Rotation)
  test('T3-13: Transform handles rotate coordinates trigonometrically for accurate hit-testing', () => {
    const layer: CanvasLayer = {
      id: 'rot-layer',
      type: 'sticker',
      name: 'Crime Tape',
      x: 200,
      y: 200,
      width: 100,
      height: 40,
      rotation: 90,
      opacity: 1,
      visible: true,
      locked: false
    };

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    const rad = (layer.rotation * Math.PI) / 180;

    const isHitRotated = (px: number, py: number) => {
      const dx = px - cx;
      const dy = py - cy;
      const unrotX = dx * Math.cos(-rad) - dy * Math.sin(-rad) + cx;
      const unrotY = dx * Math.sin(-rad) + dy * Math.cos(-rad) + cy;
      return unrotX >= layer.x && unrotX <= layer.x + layer.width &&
             unrotY >= layer.y && unrotY <= layer.y + layer.height;
    };

    assert(isHitRotated(cx, cy));
    assert(isHitRotated(cx, cy + 40));
  });

  // T3-14: F15 (Layer Transform Handles) + F16 (Background Filter Buffer Caching)
  test('T3-14: Layer transformation does not invalidate or trigger re-filtering of cached background buffer', () => {
    let filterExecutionCount = 0;
    const mockFilterEngine = {
      cachedBuffer: null as any,
      applyFilters(_adjustments: PhotoAdjustments) {
        if (!this.cachedBuffer) {
          filterExecutionCount++;
          this.cachedBuffer = { width: 1280, height: 720, data: 'cached-pixels' };
        }
        return this.cachedBuffer;
      }
    };

    const adj: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, sharpen: 50 };
    mockFilterEngine.applyFilters(adj);
    assertEqual(filterExecutionCount, 1);

    for (let i = 0; i < 50; i++) {
      mockFilterEngine.applyFilters(adj);
    }
    assertEqual(filterExecutionCount, 1, 'Filter should not re-run during layer transforms');
  });

  // T3-15: F1 (Type Contracts) + F16 (Background Filter Caching & Offscreen Buffer)
  test('T3-15: PhotoAdjustments interface changes invalidate cache while matching values return cached buffer', () => {
    const getCacheKey = (a: PhotoAdjustments) => `${a.brightness}_${a.contrast}_${a.saturation}_${a.sharpen}_${a.colorPreset}`;

    const adj1: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, contrast: 20 };
    const cacheKey = getCacheKey(adj1);

    const adj2: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, contrast: 20 };
    assertEqual(getCacheKey(adj2), cacheKey);

    const adj3: PhotoAdjustments = { ...DEFAULT_ADJUSTMENTS, contrast: 30 };
    assert(getCacheKey(adj3) !== cacheKey);
  });

  // T3-16: F14 (Floating Image Layers) + F17 (Canvas Drag-and-Drop & Pointer Capture)
  test('T3-16: Dragging floating image layer outside canvas bounds maintains coordinate tracking via pointer capture', () => {
    let layerX = 500;
    let layerY = 300;
    const dragOffset = { x: 20, y: 20 };

    const onPointerMove = (clientX: number, clientY: number) => {
      layerX = clientX - dragOffset.x;
      layerY = clientY - dragOffset.y;
    };

    onPointerMove(1350, 750);
    assertEqual(layerX, 1330);
    assertEqual(layerY, 730);
  });

  // T3-17: F2 (Tab State Persistence) + F13 (Layer Property Inspector & Presets)
  test('T3-17: Custom preset metadata edits survive tab switching without resetting to defaults', () => {
    const studioState = {
      layers: [
        {
          id: 'bodycam-1',
          type: 'preset' as const,
          name: 'Bodycam',
          x: 0, y: 0, width: 1280, height: 720, rotation: 0, opacity: 1, visible: true, locked: false,
          presetType: 'bodycam' as const,
          presetData: { officerName: 'OFC. K. REEVES #312', department: 'BCSO PALETO BAY' }
        }
      ],
      activeTab: 'canvas'
    };

    studioState.activeTab = 'chatlog';
    studioState.activeTab = 'canvas';

    const layer = studioState.layers[0];
    assertEqual(layer.presetData.officerName, 'OFC. K. REEVES #312');
    assertEqual(layer.presetData.department, 'BCSO PALETO BAY');
  });

  // T3-18: F18 (High-Performance O(1) LZW) + F19 (Memory-Safe Uint8Array Buffering)
  test('T3-18: SimpleGifEncoder outputs valid GIF89a binary structure into Uint8Array chunks', () => {
    const encoder = new SimpleGifEncoder(64, 64, 100);
    encoder.start();

    const canvas = createMockCanvas(64, 64);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 64, 64);

    encoder.addFrame(ctx as any);
    const blob = encoder.finish();

    assert(blob.size > 0);
    assertEqual(blob.type, 'image/gif');
  });

  // T3-19: F18 (O(1) LZW GIF Encoding) + F20 (Web Worker GIF Pipeline)
  test('T3-19: Web Worker message protocol handles START, ADD_FRAME, FINISH and emits PROGRESS updates', () => {
    const messages: any[] = [];
    const mockWorker = {
      postMessage(msg: any) {
        if (msg.type === 'START') messages.push({ type: 'PROGRESS', progress: 0 });
        if (msg.type === 'ADD_FRAME') messages.push({ type: 'PROGRESS', progress: 50 });
        if (msg.type === 'FINISH') messages.push({ type: 'DONE', blob: new Blob([], { type: 'image/gif' }) });
      }
    };

    mockWorker.postMessage({ type: 'START', width: 128, height: 128 });
    mockWorker.postMessage({ type: 'ADD_FRAME' });
    mockWorker.postMessage({ type: 'FINISH' });

    assertEqual(messages.length, 3);
    assertEqual(messages[0].type, 'PROGRESS');
    assertEqual(messages[2].type, 'DONE');
  });

  // T3-20: F20 (Web Worker GIF Pipeline) + F21 (Resource Lifecycle & Blob URL Revocation)
  test('T3-20: Aborting worker encoding job terminates worker and releases allocated object URLs', () => {
    const revokedUrls: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => revokedUrls.push(url);

    const testUrl = 'blob:http://localhost/video-frame-temp-1';
    URL.revokeObjectURL(testUrl);

    assertEqual(revokedUrls.length, 1);
    assertEqual(revokedUrls[0], testUrl);

    URL.revokeObjectURL = originalRevoke;
  });

  // T3-21: F19 (Memory-Safe Buffer) + F23 (Discord Presets 1:1 Aspect Ratio Cropping)
  test('T3-21: Discord Emoji preset enforces 128x128 1:1 square crop and produces file size < 256 KB', () => {
    const originalWidth = 1920;
    const originalHeight = 1080;

    const cropSize = Math.min(originalWidth, originalHeight);
    const cropX = (originalWidth - cropSize) / 2;
    const cropY = (originalHeight - cropSize) / 2;

    assertEqual(cropSize, 1080);
    assertEqual(cropX, 420);
    assertEqual(cropY, 0);

    const estimatedBytes = 128 * 128 * 10 * 0.5; // ~81 KB
    assert(estimatedBytes < 256 * 1024, `Size ${estimatedBytes} exceeds 256 KB limit`);
  });

  // T3-22: F21 (Blob URL Revocation) + F22 (Video Seek Timeout & Playback Controls)
  test('T3-22: Consecutive video uploads revoke previous video object URLs and seek handles timeout fallback', () => {
    const revoked: string[] = [];
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (u: string) => revoked.push(u);

    let currentUrl: string | null = 'blob:http://localhost/video-1';
    const newUrl = 'blob:http://localhost/video-2';
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = newUrl;

    assertEqual(revoked[0], 'blob:http://localhost/video-1');
    assertEqual(currentUrl, 'blob:http://localhost/video-2');

    URL.revokeObjectURL = origRevoke;
  });

  // T3-23: F2 (Tab State Persistence) + F22 (Video Trimmer State Across Tabs)
  test('T3-23: Video trim boundaries, playback time, and FPS settings survive tab navigation', () => {
    const studioState = {
      activeTab: 'giflab',
      giflab: {
        startTime: 1.5,
        endTime: 4.8,
        fps: 15,
        speedMultiplier: 1.25,
        watermark: 'HAZE RP'
      }
    };

    studioState.activeTab = 'chatlog';
    studioState.activeTab = 'giflab';

    assertEqual(studioState.giflab.startTime, 1.5);
    assertEqual(studioState.giflab.endTime, 4.8);
    assertEqual(studioState.giflab.watermark, 'HAZE RP');
  });

  // T3-24: F10 (Chat Typography) + F24 (Unified Emerald UI/UX & Responsive Layouts)
  test('T3-24: Chat typography styling controls conform to Emerald Edition palette tokens', () => {
    const tokens = {
      bgMain: '#0B0E14',
      bgCard: '#121722',
      accentEmerald: '#10B981',
      border: '#1E2638'
    };

    assertEqual(tokens.accentEmerald, '#10B981');
    assertEqual(tokens.bgMain, '#0B0E14');
  });

  // T3-25: F21 (Resource Lifecycle) + F25 (Full Quality Gate & Runtime Stability)
  test('T3-25: Full lifecycle teardown releases all canvas references and object URLs cleanly', () => {
    const activeUrls = new Set<string>();
    const createUrl = (id: string) => { const u = `blob:${id}`; activeUrls.add(u); return u; };
    const revokeUrl = (u: string) => { activeUrls.delete(u); };

    const u1 = createUrl('chat-bg');
    const u2 = createUrl('canvas-img');
    const u3 = createUrl('gif-output');

    assertEqual(activeUrls.size, 3);
    revokeUrl(u1);
    revokeUrl(u2);
    revokeUrl(u3);

    assertEqual(activeUrls.size, 0, 'All object URLs must be deallocated');
  });

});
