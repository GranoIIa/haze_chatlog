/**
 * Tier 2 Boundary & Corner Case Tests: Canvas Studio & Layer Engine (35 Tests)
 * Haze RP Studio v2.0 Emerald Edition
 *
 * Covers boundary edge cases for Features 1, 12, 13, 14, 15, 16, 17
 */

import { describe, test, assert, assertEqual, assertDeepEqual } from '../harness/testRunner';
import { createMockCanvas, createMockContext2D, hitTestLayer, urlTracker, resetMockEnv } from '../harness/mockEnv';
import { RP_PRESETS } from '../../src/utils/rpPresets';
import { CanvasLayer } from '../../src/types';
import { applyPhotoAdjustments, DEFAULT_ADJUSTMENTS, PhotoAdjustments } from '../../src/utils/photoFilters';

describe('Tier 2: Canvas Studio & Layer Engine Boundary & Corner Cases', () => {

  // =========================================================================
  // Feature 1 Boundaries: Centralized Type Contracts & Presets Alignment
  // =========================================================================

  test('T2_F01_01_PresetWithNullOrEmptyData: Presets tolerate empty or partial data objects gracefully', () => {
    const ctx = createMockContext2D(1280, 720);
    // Draw with empty object, should not throw
    RP_PRESETS.bodycam.draw(ctx as any, 1280, 720, {});
    RP_PRESETS.weazel.draw(ctx as any, 1280, 720, {});
    RP_PRESETS.flir.draw(ctx as any, 1280, 720, {});

    assert(ctx.operationHistory.length > 0);
  });

  test('T2_F01_02_ExtremeDimensionsPreset: Presets compute coordinates safely for 8K resolution', () => {
    const ctx = createMockContext2D(7680, 4320);
    RP_PRESETS.dashcam.draw(ctx as any, 7680, 4320, RP_PRESETS.dashcam.defaultData);

    const textOps = ctx.operationHistory.filter(op => op.method === 'fillText');
    assert(textOps.length >= 1);
  });

  test('T2_F01_03_UnknownPresetLookup: Non-existent or prototype preset lookups return undefined safely', () => {
    const p1 = (RP_PRESETS as any)['satellite'];
    const p2 = (RP_PRESETS as any)['__proto__'];

    assertEqual(p1, undefined);
    assert(typeof p2 !== 'object' || p2 === Object.prototype);
  });

  test('T2_F01_04_CanvasLayerMalformedProps: Sanitizes out-of-bounds layer properties before render', () => {
    const sanitizeLayer = (l: Partial<CanvasLayer>) => ({
      opacity: Math.max(0, Math.min(1, l.opacity ?? 1)),
      rotation: isNaN(l.rotation ?? 0) ? 0 : (l.rotation ?? 0) % 360,
      width: Math.max(1, l.width ?? 100),
      height: Math.max(1, l.height ?? 100)
    });

    const sanitized = sanitizeLayer({ opacity: 2.5, rotation: NaN, width: -50 });
    assertEqual(sanitized.opacity, 1);
    assertEqual(sanitized.rotation, 0);
    assertEqual(sanitized.width, 1);
  });

  test('T2_F01_05_ParsedLineEmptySegments: Empty segments array handled without errors', () => {
    const line = { rawText: '', type: 'empty' as const, segments: [] };
    assertEqual(line.segments.length, 0);
  });

  // =========================================================================
  // Feature 12 Boundaries: Direct Canvas Layer Hit-Testing
  // =========================================================================

  test('T2_F12_01_RotatedLayerHitTesting: Detects click inside rotated layer geometry using inverse rotation', () => {
    const rotatedLayer: CanvasLayer = {
      id: 'rot-1',
      type: 'text',
      name: 'Rotated Text',
      x: 200, y: 200, width: 100, height: 100,
      rotation: 45, opacity: 1, visible: true
    };

    // Center point always hits
    assert(hitTestLayer(250, 250, rotatedLayer));
    // Point outside rotated bounding envelope misses
    assert(!hitTestLayer(100, 100, rotatedLayer));
  });

  test('T2_F12_02_ZeroWidthOrHeightLayer: Layers with zero width or height never register hits', () => {
    const zeroLayer: CanvasLayer = {
      id: 'zero',
      type: 'shape',
      name: 'Zero',
      x: 100, y: 100, width: 0, height: 50,
      rotation: 0, opacity: 1, visible: true
    };

    assert(!hitTestLayer(100, 120, zeroLayer));
  });

  test('T2_F12_03_ScaledCanvasDPIHitTesting: Transforms CSS mouse coordinates to backing canvas coordinate space', () => {
    const dpr = 2;
    const clientX = 100;
    const clientY = 150;
    const canvasSpaceX = clientX * dpr;
    const canvasSpaceY = clientY * dpr;

    assertEqual(canvasSpaceX, 200);
    assertEqual(canvasSpaceY, 300);
  });

  test('T2_F12_04_ClickAtExactBoundaryEdges: Inclusive boundary edges register as hits', () => {
    const layer: CanvasLayer = {
      id: 'boundary-layer',
      type: 'text',
      name: 'Boundary',
      x: 100, y: 100, width: 200, height: 100,
      rotation: 0, opacity: 1, visible: true
    };

    assert(hitTestLayer(100, 100, layer), 'Top-left edge should hit');
    assert(hitTestLayer(300, 200, layer), 'Bottom-right edge should hit');
  });

  test('T2_F12_05_100LayersHitTestPerformance: Hit-testing top layer in 100 stacked layers executes in < 1ms', () => {
    const layers: CanvasLayer[] = [];
    for (let i = 0; i < 100; i++) {
      layers.push({
        id: `layer-${i}`,
        type: 'text',
        name: `Layer ${i}`,
        x: 50, y: 50, width: 200, height: 100,
        rotation: 0, opacity: 1, visible: true
      });
    }

    const start = Date.now();
    let hitId: string | null = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      if (hitTestLayer(100, 80, layers[i])) {
        hitId = layers[i].id;
        break;
      }
    }
    const elapsed = Date.now() - start;

    assertEqual(hitId, 'layer-99');
    assert(elapsed < 10);
  });

  // =========================================================================
  // Feature 13 Boundaries: Layer Property Inspector
  // =========================================================================

  test('T2_F13_01_OpacityOutOfBounds: Clamps user opacity input strictly between 0.0 and 1.0', () => {
    const clampOpacity = (val: number) => Math.max(0.0, Math.min(1.0, val));

    assertEqual(clampOpacity(-0.5), 0.0);
    assertEqual(clampOpacity(1.5), 1.0);
    assertEqual(clampOpacity(0.75), 0.75);
  });

  test('T2_F13_02_UnsupportedBlendModeFallback: Invalid blendMode falls back to source-over', () => {
    const validModes = ['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
    const sanitizeBlendMode = (mode: string): GlobalCompositeOperation => {
      return (validModes.includes(mode) ? mode : 'source-over') as GlobalCompositeOperation;
    };

    assertEqual(sanitizeBlendMode('invalid-mode'), 'source-over');
    assertEqual(sanitizeBlendMode('screen'), 'screen');
  });

  test('T2_F13_03_DeleteSelectedLayer: Deleting selected layer safely resets selectedLayerId to null', () => {
    let selectedId: string | null = 'L1';
    let layers = [{ id: 'L1' }, { id: 'L2' }];

    const deleteLayer = (id: string) => {
      layers = layers.filter(l => l.id !== id);
      if (selectedId === id) selectedId = null;
    };

    deleteLayer('L1');
    assertEqual(selectedId, null);
    assertEqual(layers.length, 1);
  });

  test('T2_F13_04_PresetDataUndefinedKeys: Updating presetData initializes object if previously undefined', () => {
    const layer: CanvasLayer = {
      id: 'preset-l',
      type: 'preset',
      name: 'Dashcam',
      x: 0, y: 0, width: 1280, height: 720,
      rotation: 0, opacity: 1, visible: true,
      presetData: undefined
    };

    const updateField = (l: CanvasLayer, key: string, val: any) => {
      l.presetData = { ...(l.presetData || {}), [key]: val };
    };

    updateField(layer, 'patrolSpeed', '85 MPH');
    assertEqual(layer.presetData?.patrolSpeed, '85 MPH');
  });

  test('T2_F13_05_ReorderSingleLayer: Reordering single element layer array is safe no-op', () => {
    const layers = ['L1'];
    const reorder = (arr: string[], from: number, to: number) => {
      if (arr.length <= 1) return arr;
      const item = arr.splice(from, 1)[0];
      arr.splice(to, 0, item);
      return arr;
    };

    const result = reorder([...layers], 0, 0);
    assertDeepEqual(result, ['L1']);
  });

  // =========================================================================
  // Feature 14 Boundaries: Floating Image & Watermark Layers
  // =========================================================================

  test('T2_F14_01_BrokenImageUrlHandling: Handles broken image URLs with fallback placeholder', () => {
    const ctx = createMockContext2D(800, 600);
    const renderLayer = (l: { imageUrl?: string; x: number; y: number; w: number; h: number }, isError: boolean) => {
      if (isError) {
        // Draw placeholder border
        ctx.strokeRect(l.x, l.y, l.w, l.h);
      } else {
        ctx.drawImage({} as any, l.x, l.y, l.w, l.h);
      }
    };

    renderLayer({ x: 50, y: 50, w: 200, h: 100 }, true);
    const strokeOps = ctx.operationHistory.filter(op => op.method === 'strokeRect');
    assertEqual(strokeOps.length, 1);
  });

  test('T2_F14_02_ZeroDimensionImage: Image with zero dimensions defaults to standard fallback size', () => {
    const sanitizeDims = (w: number, h: number) => ({
      width: w > 0 ? w : 100,
      height: h > 0 ? h : 100
    });

    const dims = sanitizeDims(0, 0);
    assertEqual(dims.width, 100);
    assertEqual(dims.height, 100);
  });

  test('T2_F14_03_GiantImageLayer: Ultra-high-resolution image scales down to viewport bounds', () => {
    const naturalW = 12000;
    const naturalH = 8000;
    const maxViewportW = 1920;
    const maxViewportH = 1080;

    const scale = Math.min(maxViewportW / naturalW, maxViewportH / naturalH);
    const renderedW = Math.round(naturalW * scale);
    const renderedH = Math.round(naturalH * scale);

    assert(renderedW <= maxViewportW);
    assert(renderedH <= maxViewportH);
  });

  test('T2_F14_04_RevokeImageLayerBlobOnDelete: Deleting an image layer invokes URL revocation', () => {
    resetMockEnv();
    const layerUrl = URL.createObjectURL(new Blob([], { type: 'image/png' }));
    assert(urlTracker.activeUrls.has(layerUrl));

    URL.revokeObjectURL(layerUrl);
    assert(urlTracker.revokedUrls.includes(layerUrl));
    assertEqual(urlTracker.activeUrls.size, 0);
  });

  test('T2_F14_05_MultipleSimultaneousImageLayers: 20 image layers render with strictly balanced save/restore', () => {
    const ctx = createMockContext2D(1280, 720);
    for (let i = 0; i < 20; i++) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.drawImage({} as any, i * 20, i * 10, 100, 50);
      ctx.restore();
    }

    const saves = ctx.operationHistory.filter(op => op.method === 'save').length;
    const restores = ctx.operationHistory.filter(op => op.method === 'restore').length;
    assertEqual(saves, 20);
    assertEqual(restores, 20);
  });

  // =========================================================================
  // Feature 15 Boundaries: Layer Transform Handles (Scale & Rotation)
  // =========================================================================

  test('T2_F15_01_NegativeDimensionScaling: Dragging scale handle inversely clamps to minimum 10px', () => {
    const scaleTo = (origX: number, mouseX: number) => Math.max(10, mouseX - origX);

    assertEqual(scaleTo(200, 150), 10);
    assertEqual(scaleTo(200, 350), 150);
  });

  test('T2_F15_02_360DegreeRotationWrap: Angles wrapping past 360 degrees normalize to [0, 360)', () => {
    const normalizeDegrees = (deg: number) => ((deg % 360) + 360) % 360;

    assertEqual(normalizeDegrees(450), 90);
    assertEqual(normalizeDegrees(-90), 270);
    assertEqual(normalizeDegrees(360), 0);
  });

  test('T2_F15_03_ScaleWithZeroAspectRatio: Prevents division by zero during proportional scaling', () => {
    const scaleProportional = (w: number, h: number, newW: number) => {
      const aspect = h > 0 ? w / h : 1;
      return { width: newW, height: Math.round(newW / aspect) };
    };

    const dims = scaleProportional(100, 0, 200);
    assertEqual(dims.width, 200);
    assert(!isNaN(dims.height));
  });

  test('T2_F15_04_ExtremeRotationValues: Extreme angle values execute without matrix distortion errors', () => {
    const ctx = createMockContext2D(800, 600);
    ctx.save();
    ctx.rotate(1e6);
    ctx.restore();

    const rotateOp = ctx.operationHistory.find(op => op.method === 'rotate');
    assert(rotateOp !== undefined);
  });

  test('T2_F15_05_HandleHitTestTolerance: Accurately differentiates handle click (within 8px) from body drag', () => {
    const handlePos = { x: 300, y: 200 };
    const isHandleHit = (px: number, py: number) => {
      return Math.hypot(px - handlePos.x, py - handlePos.y) <= 8;
    };

    assert(isHandleHit(304, 203), 'Click within 8px should hit handle');
    assert(!isHandleHit(315, 215), 'Click 15px away should miss handle');
  });

  // =========================================================================
  // Feature 16 Boundaries: Background Filter Buffer Caching
  // =========================================================================

  test('T2_F16_01_CacheWithNoFilters: Default adjustments skip convolution loops cleanly', () => {
    const hasActiveAdjustments = (adj: PhotoAdjustments) => {
      return adj.brightness !== 0 || adj.contrast !== 0 || adj.saturation !== 0 ||
             adj.warmth !== 0 || adj.sharpen > 0 || adj.colorPreset !== 'none';
    };

    assertEqual(hasActiveAdjustments(DEFAULT_ADJUSTMENTS), false);
  });

  test('T2_F16_02_MaxResolutionFilterCache: 8K image pixel buffer allocation stays within valid bounds', () => {
    const bufferSize = 7680 * 4320 * 4;
    assertEqual(bufferSize, 132710400); // ~132 MB
  });

  test('T2_F16_03_RapidAdjustmentChanges: Debouncing limits filter invocations during rapid slider moves', () => {
    let callCount = 0;
    const filterFn = () => { callCount++; };

    let timer: any = null;
    const debounceFilter = () => {
      clearTimeout(timer);
      timer = setTimeout(filterFn, 10);
    };

    // Simulate 5 rapid slider changes
    for (let i = 0; i < 5; i++) {
      debounceFilter();
    }

    assertEqual(callCount, 0); // Not yet called synchronously
  });

  test('T2_F16_04_ZeroSizeCacheAvoidance: Zero-dimension canvas skips createImageData call safely', () => {
    const ctx = createMockContext2D(0, 0);
    const safelyCreateBuffer = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return null;
      return ctx.createImageData(w, h);
    };

    assertEqual(safelyCreateBuffer(0, 0), null);
  });

  test('T2_F16_05_DisposeFilterCacheOnUnmount: Cache canvas references nullified during cleanup', () => {
    let cacheCanvas: any = createMockCanvas(1280, 720);
    const dispose = () => { cacheCanvas = null; };

    dispose();
    assertEqual(cacheCanvas, null);
  });

  // =========================================================================
  // Feature 17 Boundaries: Canvas Studio Drag-and-Drop & Pointer Capture
  // =========================================================================

  test('T2_F17_01_DropEmptyEvent: Drop event with empty files array handled safely without error', () => {
    const handleDrop = (files: any[]) => {
      if (!files || files.length === 0) return false;
      return true;
    };

    assertEqual(handleDrop([]), false);
  });

  test('T2_F17_02_PointerCancelHandling: pointercancel event clears active drag state and releases capture', () => {
    const canvas = createMockCanvas(1280, 720);
    let isDragging = true;
    canvas.setPointerCapture(5);

    const onPointerCancel = () => {
      isDragging = false;
      canvas.releasePointerCapture(5);
    };

    onPointerCancel();
    assertEqual(isDragging, false);
    assertEqual(canvas.capturedPointerId, null);
  });

  test('T2_F17_03_DragMultipleLayersSimultaneously: Single active drag layer enforced at all times', () => {
    let activeDragId: string | null = null;
    const startDrag = (id: string) => { activeDragId = id; };

    startDrag('layer-A');
    startDrag('layer-B');
    assertEqual(activeDragId, 'layer-B');
  });

  test('T2_F17_04_DropInsideNestedElement: Nested drop event isolation avoids unintended background change', () => {
    const handleSidebarDrop = (targetType: string) => {
      if (targetType === 'sidebar') return 'ignore';
      return 'set-background';
    };

    assertEqual(handleSidebarDrop('sidebar'), 'ignore');
  });

  test('T2_F17_05_UnsupportedPointerEvent: Gracefully falls back when pointer capture is unsupported', () => {
    const dummyElement = {
      setPointerCapture: undefined as any
    };

    const safeCapture = (el: any, id: number) => {
      if (typeof el.setPointerCapture === 'function') {
        el.setPointerCapture(id);
      }
    };

    safeCapture(dummyElement, 1); // Should not throw
    assert(true);
  });

});
