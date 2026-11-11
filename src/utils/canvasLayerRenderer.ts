import { CanvasLayer } from '../types';
import { RP_PRESETS } from './rpPresets';
import { RP_STICKERS } from './rpStickers';

export type DragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-se' | 'resize-sw' | 'rotate' | null;

export interface LayerDragState {
  mode: DragMode;
  startX: number;
  startY: number;
  layerStartX: number;
  layerStartY: number;
  layerStartW: number;
  layerStartH: number;
  layerStartRot: number;
  anchorWorldX: number;
  anchorWorldY: number;
}

export const EMPTY_DRAG: LayerDragState = {
  mode: null, startX: 0, startY: 0, layerStartX: 0, layerStartY: 0,
  layerStartW: 0, layerStartH: 0, layerStartRot: 0, anchorWorldX: 0, anchorWorldY: 0
};

/**
 * Desenha uma camada de RP (preset, adesivo ou texto) no contexto.
 * `scale` converte as coordenadas da camada (px do canvas de referência) para o canvas atual.
 */
export function drawCanvasLayer(
  ctx: CanvasRenderingContext2D,
  layer: CanvasLayer,
  canvasW: number,
  canvasH: number,
  scale: number
): void {
  if (!layer.visible) return;

  ctx.save();
  ctx.globalAlpha = layer.opacity ?? 1;
  if (layer.blendMode) ctx.globalCompositeOperation = layer.blendMode;

  if (layer.type === 'preset' && layer.presetType) {
    // Presets cinematográficos ocupam o canvas inteiro
    const renderer = (RP_PRESETS as any)[layer.presetType];
    if (renderer) renderer.draw(ctx, canvasW, canvasH, layer.presetData || {});
  } else {
    ctx.scale(scale, scale);
    const halfW = layer.width / 2;
    const halfH = layer.height / 2;
    ctx.translate(layer.x + halfW, layer.y + halfH);
    if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

    if (layer.type === 'sticker' && layer.content) {
      const sticker = RP_STICKERS.find(s => s.id === layer.content);
      if (sticker) sticker.draw(ctx, -halfW, -halfH, layer.width, layer.height);
    } else if (layer.type === 'text') {
      const textToDraw = layer.text ?? layer.content ?? '';
      ctx.font = `${layer.fontWeight || 'bold'} ${layer.fontSize || 32}px ${layer.fontFamily || 'Inter, sans-serif'}`;
      const align = ((layer as any).textAlign || 'center') as CanvasTextAlign;
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';

      let textDrawX = 0;
      if (align === 'left') textDrawX = -halfW + 8;
      else if (align === 'right') textDrawX = halfW - 8;

      if (layer.shadow) {
        ctx.shadowColor = layer.shadow.color;
        ctx.shadowBlur = layer.shadow.blur;
        ctx.shadowOffsetX = layer.shadow.offsetX;
        ctx.shadowOffsetY = layer.shadow.offsetY;
      }
      if (layer.strokeWidth && layer.strokeWidth > 0 && layer.strokeColor) {
        ctx.strokeStyle = layer.strokeColor;
        ctx.lineWidth = layer.strokeWidth;
        ctx.strokeText(textToDraw, textDrawX, 0);
      }
      ctx.fillStyle = layer.color || '#ffffff';
      ctx.fillText(textToDraw, textDrawX, 0);
    }
  }
  ctx.restore();
}

/** Caixa tracejada, alça de rotação e alças de canto da camada selecionada (só no preview). */
export function drawLayerHandles(ctx: CanvasRenderingContext2D, layer: CanvasLayer): void {
  if (layer.type === 'preset') return;
  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  ctx.save();
  ctx.translate(layer.x + halfW, layer.y + halfH);
  if (layer.rotation) ctx.rotate((layer.rotation * Math.PI) / 180);

  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(-halfW, -halfH, layer.width, layer.height);
  ctx.setLineDash([]);

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -halfH);
  ctx.lineTo(0, -halfH - 28);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, -halfH - 28, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const hs = 8;
  const hh = hs / 2;
  [[-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH]].forEach(([x, y]) => {
    ctx.fillRect(x - hh, y - hh, hs, hs);
    ctx.strokeRect(x - hh, y - hh, hs, hs);
  });
  ctx.restore();
}

/** Coordenadas locais (rotação inversa) de um ponto em relação ao centro da camada. */
const toLocal = (layer: CanvasLayer, mx: number, my: number) => {
  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  const dx = mx - (layer.x + halfW);
  const dy = my - (layer.y + halfH);
  const rad = ((layer.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { lx: dx * cos + dy * sin, ly: -dx * sin + dy * cos, halfW, halfH };
};

export function hitTestHandles(layer: CanvasLayer, mx: number, my: number): DragMode {
  if (layer.type === 'preset' || layer.locked) return null;
  const { lx, ly, halfW, halfH } = toLocal(layer, mx, my);
  const r = 10;

  if (lx * lx + (ly + halfH + 28) * (ly + halfH + 28) <= (r + 4) * (r + 4)) return 'rotate';
  if (Math.abs(lx + halfW) <= r && Math.abs(ly + halfH) <= r) return 'resize-nw';
  if (Math.abs(lx - halfW) <= r && Math.abs(ly + halfH) <= r) return 'resize-ne';
  if (Math.abs(lx - halfW) <= r && Math.abs(ly - halfH) <= r) return 'resize-se';
  if (Math.abs(lx + halfW) <= r && Math.abs(ly - halfH) <= r) return 'resize-sw';
  if (Math.abs(lx) <= halfW && Math.abs(ly) <= halfH) return 'move';
  return null;
}

export function hitTestLayerBody(layer: CanvasLayer, mx: number, my: number): boolean {
  if (!layer.visible || layer.locked || layer.type === 'preset') return false;
  const { lx, ly, halfW, halfH } = toLocal(layer, mx, my);
  return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
}

/** Estado inicial de um arraste de alça (redimensionar/girar) com âncora oposta fixa. */
export function startHandleDrag(layer: CanvasLayer, mode: DragMode, mx: number, my: number): LayerDragState {
  const rad = ((layer.rotation || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  const cx = layer.x + halfW;
  const cy = layer.y + halfH;

  let ox = 0;
  let oy = 0;
  if (mode === 'resize-se') { ox = -halfW; oy = -halfH; }
  else if (mode === 'resize-sw') { ox = halfW; oy = -halfH; }
  else if (mode === 'resize-ne') { ox = -halfW; oy = halfH; }
  else if (mode === 'resize-nw') { ox = halfW; oy = halfH; }

  return {
    mode, startX: mx, startY: my,
    layerStartX: layer.x, layerStartY: layer.y,
    layerStartW: layer.width, layerStartH: layer.height,
    layerStartRot: layer.rotation || 0,
    anchorWorldX: cx + ox * cos - oy * sin,
    anchorWorldY: cy + ox * sin + oy * cos
  };
}

/** Aplica o movimento do ponteiro ao arraste em curso e devolve as mudanças da camada. */
export function applyLayerDrag(
  layer: CanvasLayer,
  drag: LayerDragState,
  mx: number,
  my: number,
  shiftKey: boolean
): Partial<CanvasLayer> | null {
  if (drag.mode === 'move') {
    return {
      x: Math.round(drag.layerStartX + (mx - drag.startX)),
      y: Math.round(drag.layerStartY + (my - drag.startY))
    };
  }

  if (drag.mode === 'rotate') {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    let deg = (Math.atan2(my - cy, mx - cx) * 180) / Math.PI + 90;
    deg = ((Math.round(deg) % 360) + 360) % 360;
    if (shiftKey) deg = Math.round(deg / 15) * 15;
    return { rotation: deg };
  }

  if (drag.mode && drag.mode.startsWith('resize-')) {
    const rad = ((drag.layerStartRot || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const ax = drag.anchorWorldX;
    const ay = drag.anchorWorldY;
    const dx = mx - ax;
    const dy = my - ay;
    const projX = dx * cos + dy * sin;
    const projY = -dx * sin + dy * cos;

    let w = layer.width;
    let h = layer.height;
    let cxn = ax;
    let cyn = ay;
    if (drag.mode === 'resize-se') {
      w = Math.max(20, Math.round(projX)); h = Math.max(20, Math.round(projY));
      cxn = ax + cos * (w / 2) - sin * (h / 2); cyn = ay + sin * (w / 2) + cos * (h / 2);
    } else if (drag.mode === 'resize-sw') {
      w = Math.max(20, Math.round(-projX)); h = Math.max(20, Math.round(projY));
      cxn = ax - cos * (w / 2) - sin * (h / 2); cyn = ay - sin * (w / 2) + cos * (h / 2);
    } else if (drag.mode === 'resize-ne') {
      w = Math.max(20, Math.round(projX)); h = Math.max(20, Math.round(-projY));
      cxn = ax + cos * (w / 2) + sin * (h / 2); cyn = ay + sin * (w / 2) - cos * (h / 2);
    } else if (drag.mode === 'resize-nw') {
      w = Math.max(20, Math.round(-projX)); h = Math.max(20, Math.round(-projY));
      cxn = ax - cos * (w / 2) + sin * (h / 2); cyn = ay - sin * (w / 2) - cos * (h / 2);
    }
    return { x: Math.round(cxn - w / 2), y: Math.round(cyn - h / 2), width: w, height: h };
  }

  return null;
}
