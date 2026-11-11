import type { FitMode } from './editorSettings';

export interface GifOutSize { w: number; h: number }

export const GIF_MIN_RES = 32;
export const GIF_MAX_RES = 1920; // o GIF guarda todos os quadros na memória: acima disso o navegador sofre

/** Resoluções do editor que cabem em um GIF (sem 2560×1440 e 4K). */
export const GIF_RESOLUTION_PRESETS: Array<{ label: string; size: GifOutSize | null }> = [
  { label: 'Original', size: null },
  { label: '854×480', size: { w: 854, h: 480 } },
  { label: '1280×720', size: { w: 1280, h: 720 } },
  { label: '1920×1080', size: { w: 1920, h: 1080 } },
  { label: '1:1 Square', size: { w: 1080, h: 1080 } },
  { label: '4:5 Feed', size: { w: 1080, h: 1350 } }
];

export const clampGifSize = (w: number, h: number): GifOutSize | null => {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  const c = (n: number) => Math.min(GIF_MAX_RES, Math.max(GIF_MIN_RES, Math.round(n)));
  return { w: c(w), h: c(h) };
};

export interface GifFrameGeometry {
  outWidth: number; outHeight: number;
  /** origem no vídeo */ sx: number; sy: number; sw: number; sh: number;
  /** destino no quadro */ dx: number; dy: number; dw: number; dh: number;
  /** pinta o fundo de preto antes (modo contain) */ fillBackground: boolean;
}

/**
 * Onde o vídeo é desenhado em cada quadro do GIF.
 * - Sem `outSize`: largura escolhida + proporção original (ou recorte 1:1 central), como antes.
 * - Com `outSize`: quadro com exatamente w×h e o vídeo adaptado por cover / contain / stretch.
 */
export const computeGifFrame = (
  vw: number, vh: number, cropMode: 'original' | 'square', targetWidth: number,
  outSize: GifOutSize | null, fit: FitMode
): GifFrameGeometry => {
  if (!outSize) {
    if (cropMode === 'square') {
      const side = Math.min(vw, vh);
      return {
        outWidth: targetWidth, outHeight: targetWidth,
        sx: Math.round((vw - side) / 2), sy: Math.round((vh - side) / 2), sw: side, sh: side,
        dx: 0, dy: 0, dw: targetWidth, dh: targetWidth, fillBackground: false
      };
    }
    const h = Math.round(targetWidth * (vh / vw));
    return { outWidth: targetWidth, outHeight: h, sx: 0, sy: 0, sw: vw, sh: vh, dx: 0, dy: 0, dw: targetWidth, dh: h, fillBackground: false };
  }
  const { w, h } = outSize;
  if (fit === 'stretch') {
    return { outWidth: w, outHeight: h, sx: 0, sy: 0, sw: vw, sh: vh, dx: 0, dy: 0, dw: w, dh: h, fillBackground: false };
  }
  const s = fit === 'cover' ? Math.max(w / vw, h / vh) : Math.min(w / vw, h / vh);
  if (fit === 'cover') {
    // recorta só a parte visível do vídeo
    const sw = w / s, sh = h / s;
    return { outWidth: w, outHeight: h, sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, dx: 0, dy: 0, dw: w, dh: h, fillBackground: false };
  }
  const dw = vw * s, dh = vh * s;
  return { outWidth: w, outHeight: h, sx: 0, sy: 0, sw: vw, sh: vh, dx: (w - dw) / 2, dy: (h - dh) / 2, dw, dh, fillBackground: true };
};
