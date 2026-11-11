/**
 * Tier 5: módulos do Editor RP unificado (funções puras e renderizadores)
 * - lighting, cameraFx, editorSettings, canvasLayerRenderer, chatRenderer, chatStore
 */

import { describe, test, assert, assertEqual, assertDeepEqual, assertApprox } from '../harness/testRunner';
import { createMockContext2D } from '../harness/mockEnv';
import {
  hexToRgba, sanitizeLighting, drawPhotographicLight, DEFAULT_LIGHTING, LIGHTING_PRESETS
} from '../../src/utils/lighting';
import {
  sanitizeCamera, CAMERA_PRESET_EFFECTS, NO_EFFECTS, drawCameraOverlay, DEFAULT_CAMERA
} from '../../src/utils/cameraFx';
import {
  sanitizeCanvasLayers, drawFittedImage, fitGeometry, isFitMode, num, bool, str
} from '../../src/utils/editorSettings';
import {
  hitTestHandles, hitTestLayerBody, startHandleDrag, applyLayerDrag
} from '../../src/utils/canvasLayerRenderer';
import { renderChatText, ChatStyle } from '../../src/utils/chatRenderer';
import { publishChat, getSharedChat, subscribeSharedChat } from '../../src/utils/chatStore';
import type { CanvasLayer } from '../../src/types';

const ctxOf = (w = 1280, h = 720) => createMockContext2D(w, h) as unknown as CanvasRenderingContext2D & {
  operationHistory: Array<{ method: string; args: any[]; state: any }>;
};

const callsOf = (ctx: any, method: string) => ctx.operationHistory.filter((c: any) => c.method === method);

const baseLayer = (over: Partial<CanvasLayer> = {}): CanvasLayer => ({
  id: 'l1', type: 'sticker', name: 'x', content: 'censored-bar',
  x: 100, y: 100, width: 100, height: 50, rotation: 0, opacity: 1, visible: true, locked: false,
  ...over
});

describe('Tier 5: Editor modules', () => {

  // ---------------- lighting ----------------
  test('T5_LIGHT_01_HexToRgba: expande #rgb, aplica alpha e usa fallback para valor inválido', () => {
    assertEqual(hexToRgba('#ff0000', 0.5), 'rgba(255, 0, 0, 0.5)');
    assertEqual(hexToRgba('#f00', 1), 'rgba(255, 0, 0, 1)');
    assertEqual(hexToRgba('xyz', 0.3), 'rgba(255, 40, 70, 0.3)');
  });

  test('T5_LIGHT_02_SanitizeLighting: limita faixas e rejeita valores inválidos', () => {
    const l = sanitizeLighting({ enabled: true, intensity: 500, radius: -5, color: 'vermelho', sourceType: 'laser', blendMode: 'x', x: 150 });
    assertEqual(l.enabled, true);
    assertEqual(l.intensity, 100);
    assertEqual(l.radius, 10);
    assertEqual(l.color, DEFAULT_LIGHTING.color);
    assertEqual(l.sourceType, 'radial');
    assertEqual(l.blendMode, 'screen');
    assertEqual(l.x, 100);
    assertEqual(sanitizeLighting(null).enabled, false);
  });

  test('T5_LIGHT_03_PresetsAreValid: todo preset sobrevive à sanitização sem perder tipo e mistura', () => {
    assertEqual(LIGHTING_PRESETS.length, 10);
    for (const p of LIGHTING_PRESETS) {
      const s = sanitizeLighting({ ...DEFAULT_LIGHTING, ...p.patch, enabled: true });
      assertEqual(s.sourceType, p.patch.sourceType);
      assertEqual(s.blendMode, p.patch.blendMode);
    }
  });

  test('T5_LIGHT_04_DrawLight: desligada ou com intensidade 0 não desenha; ligada usa a mistura escolhida', () => {
    const off = ctxOf();
    drawPhotographicLight(off, 1280, 720, { ...DEFAULT_LIGHTING, enabled: false });
    assertEqual((off as any).operationHistory.length, 0);

    const zero = ctxOf();
    drawPhotographicLight(zero, 1280, 720, { ...DEFAULT_LIGHTING, enabled: true, intensity: 0 });
    assertEqual((zero as any).operationHistory.length, 0);

    const on = ctxOf();
    drawPhotographicLight(on, 1280, 720, { ...DEFAULT_LIGHTING, enabled: true, blendMode: 'overlay' });
    const fills = callsOf(on, 'fillRect');
    assert(fills.length >= 1, 'deve preencher o canvas');
    assertEqual(fills[0].state.globalCompositeOperation, 'overlay');
  });

  test('T5_LIGHT_05_DuoTone: duo-tone desenha duas fontes de luz', () => {
    const ctx = ctxOf();
    drawPhotographicLight(ctx, 1280, 720, { ...DEFAULT_LIGHTING, enabled: true, sourceType: 'duotone' });
    assertEqual(callsOf(ctx, 'fillRect').length, 2);
  });

  // ---------------- câmera ----------------
  test('T5_CAM_01_SanitizeCamera: preset inválido vira "none" e textos são limitados', () => {
    const c = sanitizeCamera({ preset: 'hack', effects: { grain: true, bw: 'sim' }, custom: { bodycamDept: 'X'.repeat(200), cctvCamName: 5 } });
    assertEqual(c.preset, 'none');
    assertEqual(c.effects.grain, true);
    assertEqual(c.effects.bw, false);
    assertEqual(c.custom.bodycamDept.length, 48);
    assertEqual(c.custom.cctvCamName, '');
    assertEqual(sanitizeCamera(undefined).preset, 'none');
  });

  test('T5_CAM_02_PresetEffects: cada preset liga os efeitos da versão original', () => {
    assertDeepEqual(CAMERA_PRESET_EFFECTS.none, NO_EFFECTS);
    assertEqual(CAMERA_PRESET_EFFECTS.bodycam.brush, true);
    assertEqual(CAMERA_PRESET_EFFECTS.bodycam.grain, false);
    const cctv = CAMERA_PRESET_EFFECTS.cctv;
    assert(cctv.bw && cctv.brush && cctv.vignette && cctv.grain && !cctv.vintage);
    const noir = CAMERA_PRESET_EFFECTS.noir;
    assert(noir.brush && noir.vignette && noir.grain && !noir.bw);
  });

  test('T5_CAM_03_Overlay: Bodycam escreve REC e oficial; CCTV desenha varredura; "none" não desenha', () => {
    const none = ctxOf();
    drawCameraOverlay(none, 1280, 720, DEFAULT_CAMERA, '');
    assertEqual((none as any).operationHistory.length, 0);

    const body = ctxOf();
    drawCameraOverlay(body, 1280, 720, { ...DEFAULT_CAMERA, preset: 'bodycam' }, 'Mike Johnson');
    const texts = callsOf(body, 'fillText').map((c: any) => c.args[0] as string);
    assert(texts.some(t => t.includes('● REC')), 'REC ausente');
    assert(texts.some(t => t.includes('MIKE JOHNSON')), 'oficial padrão ausente');

    const cctv = ctxOf();
    drawCameraOverlay(cctv, 1280, 720, { ...DEFAULT_CAMERA, preset: 'cctv' }, '');
    assert(callsOf(cctv, 'fillRect').length > 100, 'scanlines ausentes');
  });

  // ---------------- editorSettings ----------------
  test('T5_SET_01_Coercers: num/bool/str aplicam o valor padrão a tipos errados', () => {
    assertEqual(num('7', 3), 3);
    assertEqual(num(NaN, 3), 3);
    assertEqual(num(7, 3), 7);
    assertEqual(bool('true', false), false);
    assertEqual(str(5, 'a'), 'a');
  });

  test('T5_SET_02_SanitizeCanvasLayers: descarta camadas inválidas e limita campos', () => {
    assertEqual(sanitizeCanvasLayers('x').length, 0);
    const out = sanitizeCanvasLayers([
      { id: 'a', type: 'sticker', content: 'censored-bar', x: 1, y: 2, width: 50, height: 20, opacity: 9 },
      { id: 'b', type: 'sticker', content: 'nao-existe' },
      { id: 'c', type: 'preset', presetType: 'inexistente' },
      { id: 'd', type: 'malware' },
      { id: 5, type: 'text' },
      { id: 'e', type: 'preset', presetType: 'bodycam', presetData: { x: 1 } }
    ]);
    assertEqual(out.map(l => l.id).join(','), 'a,e');
    assertEqual(out[0].opacity, 1);
    assertEqual(out[1].presetData?.x, 1);
  });

  test('T5_SET_03_DrawFittedImage: cover, contain, esticar, pan e zoom', () => {
    const img = { naturalWidth: 800, naturalHeight: 400 } as any;
    const run = (mode: any, panX = 0, panY = 0, zoom = 100) => {
      const ctx = ctxOf(1000, 1000);
      drawFittedImage(ctx, img, 1000, 1000, mode, panX, panY, zoom);
      return callsOf(ctx, 'drawImage')[0].args as number[]; // img, dx, dy, dw, dh
    };
    let a = run('cover');
    assertApprox(a[3], 2000); assertApprox(a[4], 1000); assertApprox(a[1], -500); assertApprox(a[2], 0);
    a = run('contain');
    assertApprox(a[3], 1000); assertApprox(a[4], 500); assertApprox(a[1], 0); assertApprox(a[2], 250);
    a = run('stretch');
    assertApprox(a[3], 1000); assertApprox(a[4], 1000);
    a = run('contain', 10, 0, 200);
    assertApprox(a[3], 2000); assertApprox(a[1], -500 + 100);

    const ctx = ctxOf(1000, 1000);
    drawFittedImage(ctx, img, 1000, 1000, 'contain', 0, 0, 100);
    assertEqual(callsOf(ctx, 'fillRect').length, 1); // fundo preto das barras do contain
  });

  test('T5_SET_04_PanClamp: a foto não foge do quadro e não deixa buracos', () => {
    // cover 800x400 em 1000x1000: 2000x1000 -> só dá para andar na horizontal (até 50%)
    let g = fitGeometry(800, 400, 1000, 1000, 'cover', 300, 300, 100);
    assertApprox(g.panX, 50); assertApprox(g.panY, 0);
    assertApprox(g.dx, 0); // encostou na borda esquerda
    assert(g.dx <= 0 && g.dx + g.dw >= 1000, 'cobre o quadro inteiro');
    // contain: foto menor que o quadro só anda dentro dele
    g = fitGeometry(800, 400, 1000, 1000, 'contain', 0, 90, 100);
    assertApprox(g.panY, 25); assertApprox(g.dy + g.dh, 1000);
    // com zoom 200% o limite cresce
    g = fitGeometry(800, 400, 1000, 1000, 'cover', -999, 0, 200);
    assertApprox(g.dx, 0 - (g.dw - 1000));
  });

  test('T5_SET_05_FitModeBlurAndGaps: modo desfoque e fundo quando sobra espaço', () => {
    assert(isFitMode('blur') && isFitMode('cover') && !isFitMode('zoom'));
    const img = { naturalWidth: 800, naturalHeight: 400 } as any;
    // desfoque: aplica filtro e desenha a foto duas vezes (fundo ampliado + foto inteira)
    let ctx = ctxOf(1000, 1000);
    drawFittedImage(ctx, img, 1000, 1000, 'blur', 0, 0, 100);
    assertEqual(callsOf(ctx, 'drawImage').length, 2);
    // cover com zoom < 100: sobra espaço, então pinta o fundo (sem buracos transparentes)
    ctx = ctxOf(1000, 1000);
    drawFittedImage(ctx, img, 1000, 1000, 'cover', 0, 0, 60);
    assertEqual(callsOf(ctx, 'fillRect').length, 1);
    // cover normal cobre tudo: sem fundo extra
    ctx = ctxOf(1000, 1000);
    drawFittedImage(ctx, img, 1000, 1000, 'cover', 0, 0, 100);
    assertEqual(callsOf(ctx, 'fillRect').length, 0);
  });

  // ---------------- canvasLayerRenderer ----------------
  test('T5_LAYER_01_HitTestBody: respeita rotação, travamento e presets', () => {
    const l = baseLayer(); // centro (150,125), 100x50
    assert(hitTestLayerBody(l, 150, 125));
    assert(!hitTestLayerBody(l, 250, 125));
    // girada 90°: 50 de largura e 100 de altura em volta do centro
    const r = baseLayer({ rotation: 90 });
    assert(hitTestLayerBody(r, 150, 170), 'ponto acima/abaixo do centro agora está dentro');
    assert(!hitTestLayerBody(r, 195, 125), 'ponto à direita agora está fora');
    assert(!hitTestLayerBody(baseLayer({ locked: true }), 150, 125));
    assert(!hitTestLayerBody(baseLayer({ type: 'preset' }), 150, 125));
    assert(!hitTestLayerBody(baseLayer({ visible: false }), 150, 125));
  });

  test('T5_LAYER_02_HitTestHandles: alça de rotação, cantos e corpo', () => {
    const l = baseLayer(); // centro (150,125); topo y=100
    assertEqual(hitTestHandles(l, 150, 100 - 28), 'rotate');
    assertEqual(hitTestHandles(l, 200, 150), 'resize-se');
    assertEqual(hitTestHandles(l, 100, 100), 'resize-nw');
    assertEqual(hitTestHandles(l, 200, 100), 'resize-ne');
    assertEqual(hitTestHandles(l, 100, 150), 'resize-sw');
    assertEqual(hitTestHandles(l, 150, 125), 'move');
    assertEqual(hitTestHandles(l, 500, 500), null);
    assertEqual(hitTestHandles(baseLayer({ locked: true }), 200, 150), null);
  });

  test('T5_LAYER_03_DragMoveResizeRotate: mover, redimensionar com âncora fixa e girar', () => {
    const l = baseLayer();
    const move = applyLayerDrag(l, { ...startHandleDrag(l, 'move', 150, 125) }, 170, 135, false);
    assertEqual(move?.x, 120); assertEqual(move?.y, 110);

    const st = startHandleDrag(l, 'resize-se', 200, 150); // âncora = canto superior esquerdo (100,100)
    const res = applyLayerDrag(l, st, 300, 250, false)!;
    assertEqual(res.width, 200); assertEqual(res.height, 150);
    assertEqual(res.x, 100); assertEqual(res.y, 100);

    // tamanho mínimo 20
    const tiny = applyLayerDrag(l, st, 101, 101, false)!;
    assertEqual(tiny.width, 20); assertEqual(tiny.height, 20);

    const rotSt = startHandleDrag(l, 'rotate', 150, 72);
    assertEqual(applyLayerDrag(l, rotSt, 150, 0, false)?.rotation, 0);
    assertEqual(applyLayerDrag(l, rotSt, 300, 125, false)?.rotation, 90);
    // Shift trava em múltiplos de 15
    const snapped = applyLayerDrag(l, rotSt, 300, 140, true)!.rotation!;
    assertEqual(snapped % 15, 0);
  });

  // ---------------- chatRenderer / chatStore ----------------
  const style = (over: Partial<ChatStyle> = {}): ChatStyle => ({
    rawText: 'Mike Johnson diz: Olá mundo',
    characters: [{ id: '1', name: 'Mike Johnson', color: '#38bdf8' }],
    fontSize: 20, fontFamily: 'Arial', lineHeightFactor: 1.5,
    strokeEnabled: false, strokeWidth: 2, strokeColor: '#000',
    bgEnabled: false, bgColor: '#000', bgOpacity: 0.5,
    maxWidthPercent: 100, shadowEnabled: false, censorStyle: 'solid',
    showTimestamps: true, chatPos: { x: 10, y: 20 },
    ...over
  });

  test('T5_CHAT_01_RenderScale: posição e fonte acompanham a escala', () => {
    const c1 = ctxOf(); renderChatText(c1, 1280, 720, 1, style());
    const c2 = ctxOf(); renderChatText(c2, 2560, 1440, 2, style());
    const f1 = callsOf(c1, 'fillText')[0]; const f2 = callsOf(c2, 'fillText')[0];
    assertEqual(f1.args[1], 10); assertEqual(f1.args[2], 20);
    assertEqual(f2.args[1], 20); assertEqual(f2.args[2], 40);
    assert(f1.state.font.includes('20px') && f2.state.font.includes('40px'));
  });

  test('T5_CHAT_02_Censorship: texto censurado nunca é escrito no canvas', () => {
    const c = ctxOf();
    renderChatText(c, 1280, 720, 1, style({ rawText: 'A senha ||4892-OMEGA|| é essa' }));
    const texts = callsOf(c, 'fillText').map((x: any) => x.args[0] as string).join('');
    assert(!texts.includes('4892'), 'conteúdo censurado vazou');
    assert(texts.includes('senha'));
  });

  test('T5_CHAT_03_NoBackgroundNoStroke: caixa e contorno respeitam os interruptores', () => {
    const off = ctxOf(); renderChatText(off, 1280, 720, 1, style());
    assertEqual(callsOf(off, 'strokeText').length, 0);
    const on = ctxOf(); renderChatText(on, 1280, 720, 1, style({ strokeEnabled: true, bgEnabled: true }));
    assert(callsOf(on, 'strokeText').length > 0);
    assert(callsOf(on, 'fillRect').length > 0);
  });

  test('T5_STORE_01_PublishSubscribe: notifica assinantes e permite cancelar', () => {
    let calls = 0;
    const unsub = subscribeSharedChat(() => { calls++; });
    publishChat({ style: style(), refWidth: 1280, refHeight: 720 });
    assertEqual(calls, 1);
    assertEqual(getSharedChat()?.refWidth, 1280);
    unsub();
    publishChat({ style: style(), refWidth: 1920, refHeight: 1080 });
    assertEqual(calls, 1);
    assertEqual(getSharedChat()?.refWidth, 1920);
  });
});
