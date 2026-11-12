/**
 * "Visuais": estilos de um clique do Modo Simples. Cada visual combina câmera RP, iluminação e retoque
 * já existentes no editor (nada novo é desenhado: só liga os mesmos controles do Modo Avançado).
 */
import { CAMERA_PRESET_EFFECTS, type CameraPreset, type CameraState } from './cameraFx';
import { LIGHTING_PRESETS, type Lighting } from './lighting';
import { DEFAULT_ADJUSTMENTS, type PhotoAdjustments } from './photoFilters';

export interface VisualPreset {
  id: string;
  label: string;
  hint: string;
  camera: CameraPreset;
  /** nome de um preset de iluminação existente (null = luz desligada) */
  light: string | null;
  adjustments: Partial<PhotoAdjustments>;
}

export const VISUAL_PRESETS: VisualPreset[] = [
  { id: 'original', label: 'Original', hint: 'Sem efeitos', camera: 'none', light: null, adjustments: {} },
  { id: 'bodycam', label: 'Bodycam', hint: 'Câmera corporal policial', camera: 'bodycam', light: null, adjustments: {} },
  { id: 'cctv', label: 'CCTV', hint: 'Câmera de segurança', camera: 'cctv', light: null, adjustments: {} },
  { id: 'noir', label: 'Noite fria', hint: 'Tom azulado e granulado', camera: 'noir', light: 'Luar Cyan', adjustments: {} },
  { id: 'sunset', label: 'Pôr do sol', hint: 'Luz dourada quente', camera: 'none', light: 'Golden Hour', adjustments: {} },
  { id: 'neon', label: 'Neon', hint: 'Roxo e ciano de balada', camera: 'none', light: 'Cyber Purple', adjustments: { colorPreset: 'midnight-neon' } },
  { id: 'vintage', label: 'Anos 90', hint: 'Cores gastas e granulado', camera: 'none', light: null, adjustments: { colorPreset: 'vintage-90s', grain: 25 } },
  { id: 'crime', label: 'Crime urbano', hint: 'Dessaturado e escuro', camera: 'none', light: null, adjustments: { colorPreset: 'grit-crime', vignette: 30 } }
];

export const findVisual = (id: string): VisualPreset | undefined => VISUAL_PRESETS.find(v => v.id === id);

/** Estado resultante de aplicar um visual (mantém textos e campos personalizados da câmera). */
export const applyVisual = (
  v: VisualPreset,
  cur: { camera: CameraState; lighting: Lighting }
): { camera: CameraState; lighting: Lighting; adjustments: PhotoAdjustments } => {
  const patch = v.light ? LIGHTING_PRESETS.find(p => p.label === v.light)?.patch : undefined;
  return {
    camera: { ...cur.camera, preset: v.camera, effects: { ...CAMERA_PRESET_EFFECTS[v.camera] } },
    lighting: patch ? { ...cur.lighting, ...patch, enabled: true } : { ...cur.lighting, enabled: false },
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...v.adjustments }
  };
};
