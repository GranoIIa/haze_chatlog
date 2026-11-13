import { CensorRegion, CensorScope, CensorPoint } from '../types';

/**
 * Buffer Pool reutilizável para operações gráficas de mosaico e blur.
 * Elimina completamente a criação de novos elementos canvas a cada frame de renderização,
 * evitando pressão no Garbage Collector e degradação de FPS no preview e na exportação de GIFs.
 */
class CensorBufferPool {
  private bufferCanvas: HTMLCanvasElement | null = null;
  private bufferCtx: CanvasRenderingContext2D | null = null;

  getBuffer(minWidth: number, minHeight: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
    if (typeof document === 'undefined') return null;

    if (!this.bufferCanvas) {
      try {
        this.bufferCanvas = document.createElement('canvas');
        this.bufferCtx = this.bufferCanvas.getContext('2d', { willReadFrequently: true });
      } catch {
        return null;
      }
    }

    if (!this.bufferCanvas || !this.bufferCtx) return null;

    const targetW = Math.max(128, Math.ceil(minWidth));
    const targetH = Math.max(128, Math.ceil(minHeight));

    if (this.bufferCanvas.width < targetW || this.bufferCanvas.height < targetH) {
      this.bufferCanvas.width = Math.max(this.bufferCanvas.width, targetW);
      this.bufferCanvas.height = Math.max(this.bufferCanvas.height, targetH);
    }

    return { canvas: this.bufferCanvas, ctx: this.bufferCtx };
  }

  dispose(): void {
    this.bufferCanvas = null;
    this.bufferCtx = null;
  }
}

export const censorBufferPool = new CensorBufferPool();

/**
 * Calcula o retângulo delimitador (Bounding Box) de uma região de censura.
 */
export function getCensorBoundingBox(
  region: CensorRegion,
  scale: number = 1
): { x: number; y: number; width: number; height: number } {
  if (region.shape === 'rect') {
    return {
      x: Math.round(region.x * scale),
      y: Math.round(region.y * scale),
      width: Math.round(region.width * scale),
      height: Math.round(region.height * scale),
    };
  }

  // Para 'brush', calcula min e max a partir de todos os pontos do traço
  const pts = region.points ?? [{ x: region.x, y: region.y }];
  const r = (region.radius ?? 15) * scale;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of pts) {
    const px = p.x * scale;
    const py = p.y * scale;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  return {
    x: Math.floor(minX - r),
    y: Math.floor(minY - r),
    width: Math.ceil(maxX - minX + r * 2),
    height: Math.ceil(maxY - minY + r * 2),
  };
}

/**
 * Constrói o caminho de recorte (Clip Path) de uma região no contexto do canvas.
 */
function buildCensorPath(ctx: CanvasRenderingContext2D, region: CensorRegion, scale: number): void {
  ctx.beginPath();
  if (region.shape === 'rect') {
    const rx = region.x * scale;
    const ry = region.y * scale;
    const rw = region.width * scale;
    const rh = region.height * scale;
    ctx.rect(rx, ry, rw, rh);
  } else {
    // Pincel agrupado: traça a união dos círculos e linhas do traço
    const pts = region.points ?? [{ x: region.x, y: region.y }];
    const r = (region.radius ?? 15) * scale;
    if (pts.length === 1) {
      ctx.arc(pts[0].x * scale, pts[0].y * scale, r, 0, Math.PI * 2);
    } else {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        ctx.moveTo(p.x * scale + r, p.y * scale);
        ctx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
      }
      // Conecta pontos consecutivos para fechar gaps entre círculos
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = (p2.x - p1.x) * scale;
        const dy = (p2.y - p1.y) * scale;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          const nx = (-dy / dist) * r;
          const ny = (dx / dist) * r;
          ctx.moveTo(p1.x * scale + nx, p1.y * scale + ny);
          ctx.lineTo(p2.x * scale + nx, p2.y * scale + ny);
          ctx.lineTo(p2.x * scale - nx, p2.y * scale - ny);
          ctx.lineTo(p1.x * scale - nx, p1.y * scale - ny);
          ctx.closePath();
        }
      }
    }
  }
}

/**
 * Aplica a Tarja Preta Sólida (Opaca) — Padrão Ouro de Anonimização Irreversível.
 */
function drawSolidCensor(ctx: CanvasRenderingContext2D, region: CensorRegion, scale: number): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';

  if (region.shape === 'rect') {
    ctx.fillRect(
      Math.round(region.x * scale),
      Math.round(region.y * scale),
      Math.round(region.width * scale),
      Math.round(region.height * scale)
    );
  } else {
    const pts = region.points ?? [{ x: region.x, y: region.y }];
    const r = (region.radius ?? 15) * scale;
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x * scale, pts[0].y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = r * 2;
      ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * scale, pts[i].y * scale);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Aplica Mosaico Pixelado utilizando o buffer pool reutilizável sem alocações adicionais.
 */
function drawMosaicCensor(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  region: CensorRegion,
  scale: number
): void {
  const bb = getCensorBoundingBox(region, scale);
  const clampX = Math.max(0, Math.min(canvasW - 1, bb.x));
  const clampY = Math.max(0, Math.min(canvasH - 1, bb.y));
  const clampW = Math.max(0, Math.min(canvasW - clampX, bb.width));
  const clampH = Math.max(0, Math.min(canvasH - clampY, bb.height));

  if (clampW <= 0 || clampH <= 0) return;

  const blockSize = Math.max(4, Math.round((region.intensity ?? 12) * scale));
  const smallW = Math.max(1, Math.round(clampW / blockSize));
  const smallH = Math.max(1, Math.round(clampH / blockSize));

  const pool = censorBufferPool.getBuffer(smallW, smallH);
  if (!pool) {
    // Fallback defensivo: se não houver buffer pool disponível, aplica tarja sólida
    drawSolidCensor(ctx, region, scale);
    return;
  }

  const { canvas: bCanvas, ctx: bCtx } = pool;

  // 1. Limpa área de trabalho no buffer
  bCtx.clearRect(0, 0, smallW, smallH);

  // 2. Copia área original do canvas principal reduzida (downscale)
  bCtx.imageSmoothingEnabled = true;
  bCtx.drawImage(ctx.canvas, clampX, clampY, clampW, clampH, 0, 0, smallW, smallH);

  // 3. Aplica recorte no canvas principal delimitado pela região (seja retângulo ou pincel)
  ctx.save();
  buildCensorPath(ctx, region, scale);
  ctx.clip();

  // 4. Desenha de volta esticado com interpolação desativada (nearest neighbor -> mosaico)
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bCanvas, 0, 0, smallW, smallH, clampX, clampY, clampW, clampH);

  ctx.restore();
}

/**
 * Aplica Blur (Desfoque Gaussiano / Box Blur) acelerado por hardware ou via buffer pool.
 */
function drawBlurCensor(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  region: CensorRegion,
  scale: number
): void {
  const bb = getCensorBoundingBox(region, scale);
  const clampX = Math.max(0, Math.min(canvasW - 1, bb.x));
  const clampY = Math.max(0, Math.min(canvasH - 1, bb.y));
  const clampW = Math.max(0, Math.min(canvasW - clampX, bb.width));
  const clampH = Math.max(0, Math.min(canvasH - clampY, bb.height));

  if (clampW <= 0 || clampH <= 0) return;

  const radius = Math.max(2, Math.round((region.intensity ?? 12) * scale));

  ctx.save();
  buildCensorPath(ctx, region, scale);
  ctx.clip();

  // Se o contexto suportar ctx.filter nativo (Chromium, Firefox, Safari modernos)
  if ('filter' in ctx && typeof ctx.filter === 'string') {
    try {
      ctx.filter = `blur(${radius}px)`;
      // Redesenha a porção do próprio canvas sobre si mesmo com o filtro ativo
      ctx.drawImage(ctx.canvas, 0, 0);
      ctx.restore();
      return;
    } catch {
      // Fallback para buffer pool caso o filtro falhe
    }
  }

  // Fallback via buffer pool: downscale e upscale com suavização ativa (box/bilinear blur)
  const pool = censorBufferPool.getBuffer(clampW, clampH);
  if (!pool) {
    ctx.restore();
    drawSolidCensor(ctx, region, scale);
    return;
  }

  const { canvas: bCanvas, ctx: bCtx } = pool;
  const downFactor = Math.max(2, Math.min(8, Math.round(radius / 2)));
  const dw = Math.max(1, Math.round(clampW / downFactor));
  const dh = Math.max(1, Math.round(clampH / downFactor));

  bCtx.clearRect(0, 0, dw, dh);
  bCtx.imageSmoothingEnabled = true;
  bCtx.drawImage(ctx.canvas, clampX, clampY, clampW, clampH, 0, 0, dw, dh);

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bCanvas, 0, 0, dw, dh, clampX, clampY, clampW, clampH);

  ctx.restore();
}

/**
 * Função principal de renderização de censuras na cena.
 *
 * ORDEM DE COMPOSIÇÃO:
 * - `scope === 'background'`: aplicado logo após os efeitos de filme da foto original.
 * - `scope === 'final'`: aplicado no topo de toda a composição (cobre chatlog, stickers, HUD e texto),
 *   garantindo 100% de sigilo contra vazamento de informações confidenciais sobrepostas.
 */
export function drawAllCensorRegions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regions: CensorRegion[] | undefined | null,
  scope: CensorScope,
  scale: number = 1
): void {
  if (!regions || regions.length === 0) return;

  // Filtra as regiões correspondentes ao estágio atual da composição.
  // Regiões sem scope definido assumem 'final' por padrão seguro (fail-closed contra vazamentos).
  const targetRegions = regions.filter(r => {
    const s = r.scope ?? 'final';
    return s === scope;
  });

  if (targetRegions.length === 0) return;

  for (const region of targetRegions) {
    if (region.type === 'solid') {
      drawSolidCensor(ctx, region, scale);
    } else if (region.type === 'mosaic') {
      drawMosaicCensor(ctx, width, height, region, scale);
    } else if (region.type === 'blur') {
      drawBlurCensor(ctx, width, height, region, scale);
    }
  }
}

/**
 * Cria uma nova região de pincel contínuo agrupado.
 */
export function createBrushCensorRegion(
  id: string,
  type: CensorRegion['type'],
  scope: CensorScope,
  startX: number,
  startY: number,
  radius: number = 20,
  intensity: number = 12
): CensorRegion {
  return {
    id,
    type,
    shape: 'brush',
    scope,
    x: startX,
    y: startY,
    width: radius * 2,
    height: radius * 2,
    radius,
    intensity,
    points: [{ x: startX, y: startY }],
  };
}

/**
 * Adiciona um ponto ao traço da pincelada com filtragem de distância mínima
 * para evitar redundância de pontos idênticos sem perder a suavidade.
 */
export function appendPointToBrushRegion(
  region: CensorRegion,
  x: number,
  y: number,
  minDist: number = 3
): CensorRegion {
  const pts = region.points ? [...region.points] : [{ x: region.x, y: region.y }];
  const last = pts[pts.length - 1];

  if (last && Math.hypot(x - last.x, y - last.y) < minDist) {
    return region;
  }

  pts.push({ x, y });

  const bb = getCensorBoundingBox({ ...region, points: pts }, 1);
  return {
    ...region,
    x: bb.x,
    y: bb.y,
    width: bb.width,
    height: bb.height,
    points: pts,
  };
}

/**
 * Aplica anonimização irreversível direta (Burn-in) em uma imagem ou canvas.
 * Queima os pixels confidenciais definitivamente, garantindo que o compartilhamento
 * de arquivos ou projetos .haze não exponha os dados originais sob as camadas.
 */
export function burnInCensorshipOnCanvas(
  targetCanvas: HTMLCanvasElement,
  regions: CensorRegion[]
): void {
  if (!regions || regions.length === 0) return;
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // Aplica todas as regiões (tanto background quanto final) diretamente na imagem base
  drawAllCensorRegions(ctx, targetCanvas.width, targetCanvas.height, regions, 'background', 1);
  drawAllCensorRegions(ctx, targetCanvas.width, targetCanvas.height, regions, 'final', 1);
}
