/**
 * Miniaturas dos "Visuais" aplicados à foto do jogador.
 *
 * Fidelidade: usa a mesma sequência de desenho do preview (enquadramento → ajuste de cor → efeitos de filme →
 * iluminação → HUD da câmera), na mesma proporção do quadro de saída. Diferenças conhecidas e aceitas:
 * resolução reduzida (THUMB_W), HUD sem o nome do oficial e sem camadas/chat (não fazem parte do visual).
 *
 * Desempenho: a foto original (até 4K) é reduzida UMA vez para uma base do tamanho da miniatura; cada visual parte
 * dessa base. A geração é incremental (uma miniatura por tarefa ociosa) e cancelável.
 */
import { drawFittedImage, type FitMode } from './editorSettings';
import { applyPhotoAdjustments } from './photoFilters';
import { applyFilmEffects, drawCameraOverlay, DEFAULT_CAMERA } from './cameraFx';
import { drawPhotographicLight, DEFAULT_LIGHTING } from './lighting';
import { applyVisual, type VisualPreset } from './visualPresets';

export const THUMB_W = 480;
export const THUMB_MIN_H = 120;
export const THUMB_MAX_H = 640;

export interface ThumbFrame { w: number; h: number; fit: FitMode; panX: number; panY: number; zoom: number; /** escurecimento da cena (0–1), igual ao do preview */ darkening: number }

/** Tamanho da miniatura: largura fixa, altura na proporção do quadro de saída. */
export const thumbSize = (frame: Pick<ThumbFrame, 'w' | 'h'>): { w: number; h: number } => {
  const ratio = frame.w > 0 && frame.h > 0 ? frame.h / frame.w : 9 / 16;
  return { w: THUMB_W, h: Math.max(THUMB_MIN_H, Math.min(THUMB_MAX_H, Math.round(THUMB_W * ratio))) };
};

/** Identidade de um conjunto de miniaturas: foto + enquadramento. Mudou algo aqui, as miniaturas antigas não valem. */
export const thumbKey = (src: string, f: ThumbFrame): string =>
  `${src}|${f.w}x${f.h}|${f.fit}|${Math.round(f.panX * 10)}|${Math.round(f.panY * 10)}|${Math.round(f.zoom)}|${Math.round(f.darkening * 100)}`;

// ---------------------------------------------------------------- cache LRU (só strings pequenas)

export class ThumbCache<T> {
  private map = new Map<string, T>();
  constructor(private readonly max = 4) {}
  get(key: string): T | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key); this.map.set(key, v); // marca como recente
    return v;
  }
  set(key: string, value: T) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
  get size() { return this.map.size; }
  clear() { this.map.clear(); }
}

// ---------------------------------------------------------------- tarefa incremental e cancelável

export interface ThumbJobResult { done: number; failed: number; cancelled: boolean }

export const idleSchedule = (fn: () => void): void => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(fn, { timeout: 250 });
  else setTimeout(fn, 0);
};

/**
 * Gera uma miniatura por tarefa ociosa. Resultado obsoleto (`isStale()`) é descartado antes de ser entregue;
 * falha em um visual não impede os outros.
 */
export async function runThumbJob(opts: {
  ids: string[];
  render: (id: string) => string;
  isStale: () => boolean;
  onThumb: (id: string, url: string) => void;
  schedule?: (fn: () => void) => void;
}): Promise<ThumbJobResult> {
  const schedule = opts.schedule ?? idleSchedule;
  let done = 0, failed = 0;
  for (const id of opts.ids) {
    await new Promise<void>(res => schedule(res));
    if (opts.isStale()) return { done, failed, cancelled: true };
    try {
      const url = opts.render(id);
      if (opts.isStale()) return { done, failed, cancelled: true };
      if (url) { opts.onThumb(id, url); done++; } else failed++;
    } catch {
      failed++;
    }
  }
  return { done, failed, cancelled: false };
}

// ---------------------------------------------------------------- desenho

/** Foto já enquadrada no tamanho da miniatura (a imagem grande é desenhada só aqui). */
export function renderBase(img: HTMLImageElement, frame: ThumbFrame): HTMLCanvasElement {
  const { w, h } = thumbSize(frame);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');
  drawFittedImage(ctx, img, w, h, frame.fit, frame.panX, frame.panY, frame.zoom);
  return canvas;
}

export function renderVisualThumb(base: HTMLCanvasElement, v: VisualPreset, darkening = 0): string {
  const { width: w, height: h } = base;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const s = applyVisual(v, { camera: DEFAULT_CAMERA, lighting: DEFAULT_LIGHTING });
  ctx.drawImage(base, 0, 0);
  applyPhotoAdjustments(ctx, w, h, s.adjustments);
  applyFilmEffects(ctx, w, h, s.camera.effects);
  if (darkening > 0) { ctx.fillStyle = `rgba(0, 0, 0, ${darkening})`; ctx.fillRect(0, 0, w, h); } // mesma ordem do preview
  drawPhotographicLight(ctx, w, h, s.lighting);
  drawCameraOverlay(ctx, w, h, s.camera, '');
  const url = canvas.toDataURL('image/jpeg', 0.7);
  canvas.width = canvas.height = 0; // libera o buffer
  return url;
}
