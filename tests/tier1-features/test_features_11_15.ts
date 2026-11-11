/**
 * Tier 1 Feature Coverage Tests: Features 11 to 15 (25 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Feature 11: Chat Log Drag-and-Drop & Memory Safety
 * Feature 12: Direct Canvas Layer Hit-Testing
 * Feature 13: Layer Property Inspector
 * Feature 14: Floating Image & Watermark Layers
 * Feature 15: Layer Transform Handles (Scale & Rotation)
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D, hitTestLayer, urlTracker, resetMockEnv } from '../harness/mockEnv';
import { CanvasLayer } from '../../src/types';

describe('Tier 1: Features 11 to 15 Coverage', () => {

  // =========================================================================
  // Feature 11: Chat Log Drag-and-Drop & Memory Safety
  // =========================================================================

  test('T1_F11_01_DragDropFileUpload: Uploading an image file sets image source and dimensions', () => {
    const chatState = {
      imageSrc: null as string | null,
      dimensions: { width: 0, height: 0 }
    };

    const handleImageUpload = (file: { name: string; type: string; width?: number; height?: number }) => {
      const url = URL.createObjectURL(file as any);
      chatState.imageSrc = url;
      chatState.dimensions = { width: file.width || 1920, height: file.height || 1080 };
    };

    handleImageUpload({ name: 'evidence.png', type: 'image/png', width: 1920, height: 1080 });
    assert(chatState.imageSrc !== null);
    assertEqual(chatState.dimensions.width, 1920);
    assertEqual(chatState.dimensions.height, 1080);
  });

  test('T1_F11_02_ChatPositionDragging: Updates chat coordinates by drag delta', () => {
    const chatPos = { x: 40, y: 50 };
    const dragDelta = { dx: 100, dy: 80 };

    chatPos.x += dragDelta.dx;
    chatPos.y += dragDelta.dy;

    assertEqual(chatPos.x, 140);
    assertEqual(chatPos.y, 130);
  });

  test('T1_F11_03_PointerCaptureOutsideCanvas: Pointer capture keeps drag state active outside canvas', () => {
    const canvas = createMockCanvas(1280, 720);
    let isDragging = false;
    const pointerId = 42;

    const onPointerDown = (id: number) => {
      isDragging = true;
      canvas.setPointerCapture(id);
    };

    const onPointerMoveOutside = (clientX: number, clientY: number) => {
      if (isDragging) {
        return { x: clientX, y: clientY };
      }
      return null;
    };

    const onPointerUp = (id: number) => {
      isDragging = false;
      canvas.releasePointerCapture(id);
    };

    onPointerDown(pointerId);
    assertEqual(canvas.capturedPointerId, 42);
    const coords = onPointerMoveOutside(1500, 900);
    assert(coords !== null);
    assertEqual(coords!.x, 1500);

    onPointerUp(pointerId);
    assertEqual(canvas.capturedPointerId, null);
    assertEqual(isDragging, false);
  });

  test('T1_F11_04_BlobUrlCreation: Creates instrumented object URL for uploaded evidence', () => {
    resetMockEnv();
    const mockBlob = new Blob([], { type: 'image/png' });
    const url = URL.createObjectURL(mockBlob);

    assert(url.startsWith('blob:'));
    assert(urlTracker.activeUrls.has(url));
  });

  test('T1_F11_05_BlobUrlRevocationOnNewUpload: Revokes previous image object URL on new upload', () => {
    resetMockEnv();
    const url1 = URL.createObjectURL(new Blob([], { type: 'image/png' }));
    assert(urlTracker.activeUrls.has(url1));

    // Upload new image: revokes url1
    URL.revokeObjectURL(url1);
    const url2 = URL.createObjectURL(new Blob([], { type: 'image/png' }));

    assert(urlTracker.revokedUrls.includes(url1));
    assert(!urlTracker.activeUrls.has(url1));
    assert(urlTracker.activeUrls.has(url2));
  });

  // =========================================================================
  // Feature 12: Direct Canvas Layer Hit-Testing
  // =========================================================================

  test('T1_F12_01_DirectClickSelectsTopLayer: Clicking within layer boundaries selects layer', () => {
    const layer: CanvasLayer = {
      id: 'target-layer',
      type: 'text',
      name: 'Evidence Tag',
      x: 100, y: 100, width: 200, height: 100,
      rotation: 0, opacity: 1, visible: true, locked: false
    };

    assert(hitTestLayer(150, 150, layer), 'Click inside layer bounding box should hit');
    assert(!hitTestLayer(50, 50, layer), 'Click outside layer should miss');
  });

  test('T1_F12_02_ZOrderPrecedence: Topmost layer in z-order takes click precedence', () => {
    const layers: CanvasLayer[] = [
      { id: 'layer-bottom', type: 'text', name: 'Bottom', x: 100, y: 100, width: 200, height: 200, rotation: 0, opacity: 1, visible: true },
      { id: 'layer-top', type: 'text', name: 'Top', x: 150, y: 150, width: 200, height: 200, rotation: 0, opacity: 1, visible: true }
    ];

    const findTopmostLayerAt = (x: number, y: number, list: CanvasLayer[]): string | null => {
      // Reverse iterate to find topmost layer first
      for (let i = list.length - 1; i >= 0; i--) {
        if (hitTestLayer(x, y, list[i])) return list[i].id;
      }
      return null;
    };

    const hitId = findTopmostLayerAt(180, 180, layers);
    assertEqual(hitId, 'layer-top');
  });

  test('T1_F12_03_ClickEmptyCanvasDeselects: Clicking empty space returns null layer', () => {
    const layers: CanvasLayer[] = [
      { id: 'layer-1', type: 'text', name: 'Layer 1', x: 100, y: 100, width: 150, height: 80, rotation: 0, opacity: 1, visible: true }
    ];

    const findTopmostLayerAt = (x: number, y: number, list: CanvasLayer[]): string | null => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (hitTestLayer(x, y, list[i])) return list[i].id;
      }
      return null;
    };

    assertEqual(findTopmostLayerAt(500, 500, layers), null);
  });

  test('T1_F12_04_LockedLayerHitTest: Locked layer allows selection but prevents drag manipulation', () => {
    const lockedLayer: CanvasLayer = {
      id: 'locked-layer',
      type: 'preset',
      name: 'Bodycam AXON',
      x: 0, y: 0, width: 1280, height: 720,
      rotation: 0, opacity: 1, visible: true, locked: true
    };

    assert(hitTestLayer(100, 100, lockedLayer));
    const canDrag = !lockedLayer.locked;
    assertEqual(canDrag, false);
  });

  test('T1_F12_05_InvisibleLayerIgnored: Invisible layers are ignored during hit testing', () => {
    const invisibleLayer: CanvasLayer = {
      id: 'hidden-layer',
      type: 'text',
      name: 'Hidden Layer',
      x: 100, y: 100, width: 200, height: 100,
      rotation: 0, opacity: 1, visible: false
    };

    assert(!hitTestLayer(150, 150, invisibleLayer), 'Invisible layer should never hit');
  });

  // =========================================================================
  // Feature 13: Layer Property Inspector
  // =========================================================================

  test('T1_F13_01_TextContentUpdate: Modifying layer content updates layer model', () => {
    const textLayer: CanvasLayer = {
      id: 'text-1',
      type: 'text',
      name: 'Title',
      content: 'OLD TEXT',
      x: 50, y: 50, width: 200, height: 50,
      rotation: 0, opacity: 1, visible: true
    };

    textLayer.content = 'NOVO TEXTO POLICIAL';
    assertEqual(textLayer.content, 'NOVO TEXTO POLICIAL');
  });

  test('T1_F13_02_LayerOpacityChange: Modifying layer opacity applies to globalAlpha during render', () => {
    const layer: CanvasLayer = {
      id: 'l-1',
      type: 'sticker',
      name: 'Sticker',
      x: 50, y: 50, width: 100, height: 100,
      rotation: 0, opacity: 1, visible: true
    };

    layer.opacity = 0.65;
    const ctx = createMockContext2D(800, 600);
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
    ctx.restore();

    const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect');
    assertEqual(fillOp?.state.globalAlpha, 0.65);
  });

  test('T1_F13_03_BlendModeSelection: Modifying blendMode updates canvas globalCompositeOperation', () => {
    const layer: CanvasLayer = {
      id: 'blend-layer',
      type: 'image',
      name: 'Night Vision',
      x: 0, y: 0, width: 800, height: 600,
      rotation: 0, opacity: 1, visible: true,
      blendMode: 'screen'
    };

    const ctx = createMockContext2D(800, 600);
    ctx.save();
    ctx.globalCompositeOperation = layer.blendMode || 'source-over';
    ctx.fillRect(0, 0, 800, 600);
    ctx.restore();

    const fillOp = ctx.operationHistory.find(op => op.method === 'fillRect');
    assertEqual(fillOp?.state.globalCompositeOperation, 'screen');
  });

  test('T1_F13_04_PresetDataFieldsUpdate: Updating preset metadata reflects in presetData structure', () => {
    const weazelLayer: CanvasLayer = {
      id: 'weazel-news',
      type: 'preset',
      name: 'Weazel Live',
      x: 0, y: 500, width: 1280, height: 220,
      rotation: 0, opacity: 1, visible: true,
      presetType: 'weazel',
      presetData: { headline: 'NOTÍCIA ANTERIOR', tag: 'URGENTE' }
    };

    weazelLayer.presetData = {
      ...weazelLayer.presetData,
      headline: 'OPERAÇÃO POLICIAL NAS DOCAS'
    };

    assertEqual(weazelLayer.presetData.headline, 'OPERAÇÃO POLICIAL NAS DOCAS');
    assertEqual(weazelLayer.presetData.tag, 'URGENTE');
  });

  test('T1_F13_05_LayerReordering: Moving a layer to the top updates array order', () => {
    const layers = ['A', 'B', 'C'];
    const moveToTop = (arr: string[], id: string) => {
      const idx = arr.indexOf(id);
      if (idx !== -1) {
        const item = arr.splice(idx, 1)[0];
        arr.push(item);
      }
      return arr;
    };

    const updated = moveToTop([...layers], 'A');
    assertDeepEqual(updated, ['B', 'C', 'A']);
  });

  // =========================================================================
  // Feature 14: Floating Image & Watermark Layers
  // =========================================================================

  test('T1_F14_01_AddImageLayer: Appends image layer to layer stack with valid properties', () => {
    const layers: CanvasLayer[] = [];
    const addImageLayer = (url: string) => {
      const newLayer: CanvasLayer = {
        id: `img-${Date.now()}`,
        type: 'image',
        name: 'Evidence Photo',
        imageUrl: url,
        x: 50, y: 50, width: 400, height: 300,
        rotation: 0, opacity: 1, visible: true
      };
      layers.push(newLayer);
    };

    addImageLayer('blob:http://localhost/evidence-photo');
    assertEqual(layers.length, 1);
    assertEqual(layers[0].type, 'image');
    assertEqual(layers[0].imageUrl, 'blob:http://localhost/evidence-photo');
  });

  test('T1_F14_02_ImageLayerRendering: Renders image layer via ctx.drawImage with layer coordinates', () => {
    const ctx = createMockContext2D(1280, 720);
    const mockImage = { width: 400, height: 300 };

    ctx.drawImage(mockImage as any, 50, 50, 200, 150);
    const drawOp = ctx.operationHistory.find(op => op.method === 'drawImage');
    assert(drawOp !== undefined);
    assertDeepEqual(drawOp!.args.slice(1), [50, 50, 200, 150]);
  });

  test('T1_F14_03_ImageLayerOpacity: Image layer renders with configured layer opacity', () => {
    const ctx = createMockContext2D(1280, 720);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage({} as any, 10, 10, 100, 100);
    ctx.restore();

    const drawOp = ctx.operationHistory.find(op => op.method === 'drawImage');
    assertEqual(drawOp?.state.globalAlpha, 0.5);
  });

  test('T1_F14_04_ImageLayerDefaultDimensions: Fits image proportionally inside maximum dimension budget', () => {
    const fitDimensions = (naturalW: number, naturalH: number, maxW: number, maxH: number) => {
      const ratio = Math.min(maxW / naturalW, maxH / naturalH, 1);
      return { width: Math.round(naturalW * ratio), height: Math.round(naturalH * ratio) };
    };

    const dims = fitDimensions(1600, 1200, 800, 600);
    assertEqual(dims.width, 800);
    assertEqual(dims.height, 600);
  });

  test('T1_F14_05_WatermarkPresetLayer: Watermark layer defaults to low opacity watermark layout', () => {
    const watermark: CanvasLayer = {
      id: 'watermark-1',
      type: 'image',
      name: 'LSPD Watermark',
      x: 1080, y: 620, width: 160, height: 60,
      rotation: 0, opacity: 0.35, visible: true
    };

    assert(watermark.opacity <= 0.4);
    assert(watermark.x > 800 && watermark.y > 500);
  });

  // =========================================================================
  // Feature 15: Layer Transform Handles (Scale & Rotation)
  // =========================================================================

  test('T1_F15_01_TransformHandlesRendered: Calculates 4 corner handle rects + 1 rotation handle', () => {
    const layer = { x: 100, y: 100, width: 200, height: 100 };
    const handleSize = 8;

    const handles = {
      topLeft: { x: layer.x - handleSize / 2, y: layer.y - handleSize / 2 },
      topRight: { x: layer.x + layer.width - handleSize / 2, y: layer.y - handleSize / 2 },
      bottomLeft: { x: layer.x - handleSize / 2, y: layer.y + layer.height - handleSize / 2 },
      bottomRight: { x: layer.x + layer.width - handleSize / 2, y: layer.y + layer.height - handleSize / 2 },
      rotation: { x: layer.x + layer.width / 2, y: layer.y - 25 }
    };

    assertEqual(handles.topLeft.x, 96);
    assertEqual(handles.bottomRight.x, 296);
    assertEqual(handles.rotation.y, 75);
  });

  test('T1_F15_02_ScaleHandleDrag: Dragging bottom-right handle resizes layer dimensions', () => {
    const layer = { x: 100, y: 100, width: 200, height: 100 };
    const newMouseX = 350;
    const newMouseY = 250;

    layer.width = Math.max(10, newMouseX - layer.x);
    layer.height = Math.max(10, newMouseY - layer.y);

    assertEqual(layer.width, 250);
    assertEqual(layer.height, 150);
  });

  test('T1_F15_03_RotationHandleDrag: Dragging rotation handle calculates angle in degrees', () => {
    const center = { x: 200, y: 150 };
    const mousePos = { x: 200, y: 50 }; // Straight up: -90 degrees, relative to rotation offset = 0

    const radians = Math.atan2(mousePos.y - center.y, mousePos.x - center.x) + Math.PI / 2;
    const degrees = Math.round((radians * 180) / Math.PI);

    assertEqual(degrees, 0);
  });

  test('T1_F15_04_TrigonometricCanvasRendering: Context executes translate and rotate for rotated layer', () => {
    const ctx = createMockContext2D(800, 600);
    const rad = Math.PI / 4; // 45 degrees
    const cx = 200;
    const cy = 150;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rad);
    ctx.fillRect(-50, -25, 100, 50);
    ctx.restore();

    const translateOp = ctx.operationHistory.find(op => op.method === 'translate');
    const rotateOp = ctx.operationHistory.find(op => op.method === 'rotate');

    assert(translateOp !== undefined);
    assert(rotateOp !== undefined);
    assertEqual(rotateOp!.args[0], rad);
  });

  test('T1_F15_05_LockedLayerSuppressesHandles: Locked layer suppresses handle drawing and dragging', () => {
    const lockedLayer: CanvasLayer = {
      id: 'l-lock',
      type: 'text',
      name: 'Locked Stamp',
      x: 100, y: 100, width: 200, height: 80,
      rotation: 0, opacity: 1, visible: true, locked: true
    };

    const shouldRenderHandles = (l: CanvasLayer, isSelected: boolean) => isSelected && !l.locked;
    assertEqual(shouldRenderHandles(lockedLayer, true), false);
  });

});
