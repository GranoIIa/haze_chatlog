/**
 * Miniatura de um "Visual" aplicado à foto do jogador (mesma pipeline do preview: ajuste de cor,
 * efeitos de filme, iluminação e HUD da câmera). Usa a câmera/luz padrão como base, sem textos do jogador.
 */
import { drawFittedImage } from './editorSettings';
import { applyPhotoAdjustments } from './photoFilters';
import { applyFilmEffects, drawCameraOverlay, DEFAULT_CAMERA } from './cameraFx';
import { drawPhotographicLight, DEFAULT_LIGHTING } from './lighting';
import { applyVisual, type VisualPreset } from './visualPresets';

export const THUMB_W = 320;
export const THUMB_H = 180;

export function renderVisualThumb(img: HTMLImageElement, v: VisualPreset): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const s = applyVisual(v, { camera: DEFAULT_CAMERA, lighting: DEFAULT_LIGHTING });
  drawFittedImage(ctx, img, THUMB_W, THUMB_H, 'cover', 0, 0, 100);
  applyPhotoAdjustments(ctx, THUMB_W, THUMB_H, s.adjustments);
  applyFilmEffects(ctx, THUMB_W, THUMB_H, s.camera.effects);
  drawPhotographicLight(ctx, THUMB_W, THUMB_H, s.lighting);
  drawCameraOverlay(ctx, THUMB_W, THUMB_H, s.camera, '');
  return canvas.toDataURL('image/jpeg', 0.7);
}
