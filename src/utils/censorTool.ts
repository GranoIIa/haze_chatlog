/**
 * Ferramenta de Censura e Borrão de Imagem (Blur, Mosaico e Tarja).
 * Permite censurar rostos, placas e detalhes confidenciais de fotos de RP
 * de forma não-destrutiva, integrada ao histórico de Undo/Redo e exportação.
 */

export type CensorType = 'blur' | 'pixelate' | 'solid';
export type CensorShape = 'circle' | 'rect';

export interface CensorRegion {
  id: string;
  cx: number;        // Posição central X (fração 0..1 do canvas)
  cy: number;        // Posição central Y (fração 0..1 do canvas)
  width: number;     // Largura da região (fração 0..1 do canvas)
  height: number;    // Altura da região (fração 0..1 do canvas)
  type: CensorType;
  shape: CensorShape;
  intensity: number; // Intensidade (10 a 50)
}

export interface CensorBrushSettings {
  type: CensorType;
  shape: CensorShape;
  size: number;       // Tamanho em px (20 a 200)
  intensity: number;  // Força do efeito (10 a 50)
}

export const DEFAULT_CENSOR_SETTINGS: CensorBrushSettings = {
  type: 'blur',
  shape: 'circle',
  size: 70,
  intensity: 25
};

export const CENSOR_TYPE_LABELS: Record<CensorType, string> = {
  blur: 'Desfoque (Blur)',
  pixelate: 'Mosaico (Pixelado)',
  solid: 'Tarja Preta (Sólida)'
};

/** Valida e sanitiza uma lista de regiões de censura vindas do storage ou projeto. */
export function sanitizeCensorRegions(raw: unknown): CensorRegion[] {
  if (!Array.isArray(raw)) return [];
  const valid: CensorRegion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id : `censor-${Math.random().toString(36).slice(2, 7)}`;
    const cx = typeof r.cx === 'number' && Number.isFinite(r.cx) ? Math.max(0, Math.min(1, r.cx)) : 0.5;
    const cy = typeof r.cy === 'number' && Number.isFinite(r.cy) ? Math.max(0, Math.min(1, r.cy)) : 0.5;
    const width = typeof r.width === 'number' && Number.isFinite(r.width) ? Math.max(0.005, Math.min(1, r.width)) : 0.05;
    const height = typeof r.height === 'number' && Number.isFinite(r.height) ? Math.max(0.005, Math.min(1, r.height)) : 0.05;
    const type: CensorType = r.type === 'pixelate' || r.type === 'solid' ? r.type : 'blur';
    const shape: CensorShape = r.shape === 'rect' ? 'rect' : 'circle';
    const intensity = typeof r.intensity === 'number' && Number.isFinite(r.intensity) ? Math.max(5, Math.min(60, r.intensity)) : 25;

    valid.push({ id, cx, cy, width, height, type, shape, intensity });
  }
  return valid;
}

/** Renderiza uma região de censura no Canvas 2D. */
export function drawCensorRegion(
  ctx: CanvasRenderingContext2D,
  region: CensorRegion,
  canvasWidth: number,
  canvasHeight: number,
  scale: number = 1
): void {
  const cx = region.cx * canvasWidth;
  const cy = region.cy * canvasHeight;
  const rw = region.width * canvasWidth;
  const rh = region.height * canvasHeight;
  const rx = cx - rw / 2;
  const ry = cy - rh / 2;

  if (rw <= 0 || rh <= 0) return;

  const x0 = Math.max(0, Math.floor(rx));
  const y0 = Math.max(0, Math.floor(ry));
  const x1 = Math.min(canvasWidth, Math.ceil(rx + rw));
  const y1 = Math.min(canvasHeight, Math.ceil(ry + rh));
  const boxW = x1 - x0;
  const boxH = y1 - y0;

  if (boxW <= 0 || boxH <= 0) return;

  ctx.save();
  ctx.beginPath();
  if (region.shape === 'circle') {
    const radius = Math.min(rw, rh) / 2;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  } else {
    ctx.rect(x0, y0, boxW, boxH);
  }
  ctx.clip();

  // 1. Tarja sólida
  if (region.type === 'solid') {
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.restore();
    return;
  }

  // 2. Desfoque ou Pixelate
  const sub = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!sub) {
    ctx.restore();
    return;
  }

  if (region.type === 'pixelate') {
    // Efeito de Mosaico
    const blockSize = Math.max(4, Math.round((region.intensity || 25) * scale * 0.45));
    const downW = Math.max(1, Math.round(boxW / blockSize));
    const downH = Math.max(1, Math.round(boxH / blockSize));
    sub.width = downW;
    sub.height = downH;
    const sctx = sub.getContext('2d');
    if (sctx) {
      sctx.imageSmoothingEnabled = true;
      try {
        sctx.drawImage(ctx.canvas, x0, y0, boxW, boxH, 0, 0, downW, downH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sub, 0, 0, downW, downH, x0, y0, boxW, boxH);
      } catch (_) {
        // Fallback em ambientes com restrição de canvas
      }
    }
  } else {
    // Efeito de Desfoque Gaussiano
    sub.width = boxW;
    sub.height = boxH;
    const sctx = sub.getContext('2d');
    if (sctx) {
      try {
        sctx.drawImage(ctx.canvas, x0, y0, boxW, boxH, 0, 0, boxW, boxH);
        const blurRadius = Math.max(3, Math.round((region.intensity || 25) * scale * 0.5));
        ctx.filter = `blur(${blurRadius}px)`;
        ctx.drawImage(sub, x0, y0, boxW, boxH);
        ctx.filter = 'none';
      } catch (_) {
        // Fallback
      }
    }
  }

  ctx.restore();
}

/** Renderiza todas as regiões de censura no Canvas. */
export function drawAllCensorRegions(
  ctx: CanvasRenderingContext2D,
  regions: CensorRegion[],
  canvasWidth: number,
  canvasHeight: number,
  scale: number = 1
): void {
  if (!regions || regions.length === 0) return;
  for (const r of regions) {
    drawCensorRegion(ctx, r, canvasWidth, canvasHeight, scale);
  }
}

/** Desenha a mira/guia visual do pincel ou da caixa sendo arrastada no Canvas. */
export function drawCensorGizmo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  shape: CensorShape,
  width: number,
  height: number
): void {
  ctx.save();
  ctx.strokeStyle = '#10b981'; // tom verde característico
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  if (shape === 'circle') {
    const radius = Math.min(width, height) / 2;
    ctx.arc(x, y, radius, 0, Math.PI * 2);
  } else {
    ctx.rect(x - width / 2, y - height / 2, width, height);
  }
  ctx.stroke();

  // Ponto central de ancoragem
  ctx.setLineDash([]);
  ctx.fillStyle = '#10b981';
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
