import type { CanvasLayer } from '../types';
import { RP_PRESETS } from './rpPresets';
import { RP_STICKERS } from './rpStickers';

export const STORAGE_KEY = 'haze-chatlog-v2';

// Lê as configurações salvas (nunca a imagem). Falha silenciosa se o storage estiver bloqueado.
export const loadSaved = (): Record<string, any> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

export type FitMode = 'cover' | 'contain' | 'blur' | 'stretch';
export const FIT_MODES: ReadonlyArray<FitMode> = ['cover', 'contain', 'blur', 'stretch'];
export const isFitMode = (v: unknown): v is FitMode => FIT_MODES.includes(v as FitMode);
export type MouseTool = 'chat' | 'photo' | 'layer' | 'light';

// Posição em frações do canvas (0–1) e largura em % da largura do canvas:
// assim a camada se adapta a qualquer resolução de saída e ao modo Lote.
export interface ImageLayer {
  id: string;
  blobId: string; // chave do arquivo no IndexedDB (cópias compartilham a mesma)
  name: string;
  cx: number;
  cy: number;
  widthPct: number;
  rotation: number;
  opacity: number;
  aboveChat: boolean;
  visible: boolean;
}

export const RESOLUTION_PRESETS: Array<{ label: string; size: { w: number; h: number } | null }> = [
  { label: 'Original', size: null },
  { label: '1280×720', size: { w: 1280, h: 720 } },
  { label: '1920×1080', size: { w: 1920, h: 1080 } },
  { label: '2560×1440', size: { w: 2560, h: 1440 } },
  { label: '4K UHD', size: { w: 3840, h: 2160 } },
  { label: '1:1 Square', size: { w: 1080, h: 1080 } },
  { label: '4:5 Feed', size: { w: 1080, h: 1350 } }
];

export const MIN_RES = 64;
export const MAX_RES = 7680;

/** Retângulo (dx, dy, dw, dh) onde a foto é desenhada, já com o deslocamento limitado para a foto nunca "fugir" do quadro. */
export const fitGeometry = (
  iw: number, ih: number, w: number, h: number,
  mode: FitMode, panXPct: number, panYPct: number, zoomPct: number
) => {
  const zoom = Math.max(0.1, zoomPct / 100);
  let sx: number, sy: number;
  if (mode === 'stretch') {
    sx = (w / iw) * zoom;
    sy = (h / ih) * zoom;
  } else {
    const s = (mode === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)) * zoom;
    sx = s;
    sy = s;
  }
  const dw = iw * sx;
  const dh = ih * sy;
  // folga em % do quadro: foto maior que o quadro só pode andar até a borda; menor, só dentro do quadro
  const limX = (Math.abs(dw - w) / 2 / w) * 100;
  const limY = (Math.abs(dh - h) / 2 / h) * 100;
  const px = Math.max(-limX, Math.min(limX, panXPct));
  const py = Math.max(-limY, Math.min(limY, panYPct));
  return { dx: (w - dw) / 2 + (px / 100) * w, dy: (h - dh) / 2 + (py / 100) * h, dw, dh, panX: px, panY: py };
};

// Desenha a imagem na área de saída respeitando modo de adaptação, pan (% da área) e zoom.
export const drawFittedImage = (
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  mode: FitMode,
  panXPct: number,
  panYPct: number,
  zoomPct: number
) => {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const { dx, dy, dw, dh } = fitGeometry(iw, ih, w, h, mode, panXPct, panYPct, zoomPct);
  const gaps = dw < w - 0.5 || dh < h - 0.5;
  if (mode === 'blur') {
    // faixas preenchidas com a própria foto ampliada e desfocada (em vez de preto)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    const s = Math.max(w / iw, h / ih);
    ctx.save();
    ctx.filter = `blur(${Math.round(Math.max(w, h) / 40)}px) brightness(0.65)`;
    ctx.drawImage(img, (w - iw * s) / 2, (h - ih * s) / 2, iw * s, ih * s);
    ctx.restore();
  } else if (mode === 'contain' || gaps) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, dx, dy, dw, dh);
};

// Camadas de RP (presets, adesivos e texto) vindas do armazenamento: valida cada campo
export const sanitizeCanvasLayers = (v: any): CanvasLayer[] => {
  if (!Array.isArray(v)) return [];
  const n = (x: unknown, f: number) => (typeof x === 'number' && isFinite(x) ? x : f);
  const out: CanvasLayer[] = [];
  for (const l of v.slice(0, 40)) {
    if (!l || typeof l.id !== 'string' || !['preset', 'sticker', 'text'].includes(l.type)) continue;
    if (l.type === 'preset' && !(l.presetType in RP_PRESETS)) continue;
    if (l.type === 'sticker' && !RP_STICKERS.some(st => st.id === l.content)) continue;
    out.push({
      ...l,
      name: typeof l.name === 'string' ? l.name.slice(0, 80) : 'Camada',
      x: n(l.x, 0), y: n(l.y, 0),
      width: Math.max(1, n(l.width, 100)), height: Math.max(1, n(l.height, 100)),
      rotation: n(l.rotation, 0),
      opacity: Math.min(1, Math.max(0, n(l.opacity, 1))),
      visible: l.visible !== false,
      locked: l.locked === true,
      presetData: l.presetData && typeof l.presetData === 'object' ? l.presetData : undefined
    });
  }
  return out;
};

export const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
export const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
export const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
