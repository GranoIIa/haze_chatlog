// ---- Câmera RP (Bodycam / CCTV / Noite Fria) e efeitos de filme ----
export type CameraPreset = 'none' | 'bodycam' | 'cctv' | 'noir';
export type EffectKey = 'vintage' | 'bw' | 'brush' | 'vignette' | 'grain' | 'lightleak';

export interface CameraState {
  preset: CameraPreset;
  effects: Record<EffectKey, boolean>;
  custom: {
    bodycamDate: string; bodycamTime: string; bodycamDept: string; bodycamOfficer: string;
    cctvCamName: string; cctvDate: string; cctvTime: string; cctvLocation: string;
  };
}

export const NO_EFFECTS: Record<EffectKey, boolean> = {
  vintage: false, bw: false, brush: false, vignette: false, grain: false, lightleak: false
};

export const DEFAULT_CAMERA: CameraState = {
  preset: 'none',
  effects: { ...NO_EFFECTS },
  custom: {
    bodycamDate: '', bodycamTime: '', bodycamDept: '', bodycamOfficer: '',
    cctvCamName: '', cctvDate: '', cctvTime: '', cctvLocation: ''
  }
};

// Efeitos que cada preset liga (igual à versão original)
export const CAMERA_PRESET_EFFECTS: Record<CameraPreset, Record<EffectKey, boolean>> = {
  none: { ...NO_EFFECTS },
  bodycam: { ...NO_EFFECTS, brush: true },
  cctv: { ...NO_EFFECTS, bw: true, brush: true, vignette: true, grain: true },
  noir: { ...NO_EFFECTS, brush: true, vignette: true, grain: true }
};

export const EFFECT_LABELS: Array<[EffectKey, string]> = [
  ['grain', 'Granulado'], ['vignette', 'Vinheta'], ['lightleak', 'Light leak'],
  ['brush', 'Realce'], ['vintage', 'Vintage'], ['bw', 'P&B']
];

export const sanitizeCamera = (v: any): CameraState => {
  if (!v || typeof v !== 'object') return { ...DEFAULT_CAMERA, effects: { ...NO_EFFECTS }, custom: { ...DEFAULT_CAMERA.custom } };
  const preset: CameraPreset = ['bodycam', 'cctv', 'noir'].includes(v.preset) ? v.preset : 'none';
  const effects = { ...NO_EFFECTS };
  (Object.keys(NO_EFFECTS) as EffectKey[]).forEach(k => { effects[k] = v.effects?.[k] === true; });
  const custom = { ...DEFAULT_CAMERA.custom };
  (Object.keys(custom) as Array<keyof CameraState['custom']>).forEach(k => {
    const s = v.custom?.[k];
    custom[k] = typeof s === 'string' ? s.slice(0, 48) : '';
  });
  return { preset, effects, custom };
};

// Ruído fixo (gerado uma vez) para o granulado ficar igual no preview e no export
let noiseCache: HTMLCanvasElement | null = null;
export const getNoiseCanvas = (): HTMLCanvasElement => {
  if (noiseCache) return noiseCache;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const x = c.getContext('2d')!;
  const id = x.createImageData(256, 256);
  let seed = 1234567;
  for (let i = 0; i < id.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = seed >>> 24;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 70;
  }
  x.putImageData(id, 0, 0);
  noiseCache = c;
  return c;
};

export const applyFilmEffects = (ctx: CanvasRenderingContext2D, w: number, h: number, fx: Record<EffectKey, boolean>) => {
  const canvas = ctx.canvas;
  const filters: string[] = [];
  if (fx.bw) filters.push('grayscale(1)');
  if (fx.vintage) filters.push('sepia(0.7) saturate(1.3) contrast(1.05)');
  if (fx.brush) filters.push('contrast(1.25) saturate(1.2)');
  if (filters.length) {
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width; tmp.height = canvas.height;
    tmp.getContext('2d')!.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filters.join(' ');
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
    ctx.restore();
  }

  if (fx.lightleak) {
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, 'rgba(255,140,60,0.40)');
    g.addColorStop(0.45, 'rgba(255,200,120,0.18)');
    g.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (fx.vignette) {
    ctx.save();
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (fx.grain) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(getNoiseCanvas(), 'repeat')!;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
};

export const drawCameraOverlay = (
  ctx: CanvasRenderingContext2D, w: number, h: number, cam: CameraState, defaultOfficer: string
) => {
  if (cam.preset === 'none') return;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const defDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const defTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const c = cam.custom;

  ctx.save();
  if (cam.preset === 'bodycam') {
    const fs = Math.max(11, Math.round(w * 0.015));
    ctx.font = `bold ${fs}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    const padX = Math.round(w * 0.025);
    const padY = Math.round(h * 0.035);
    const dept = (c.bodycamDept || 'POLICE / SHERIFF').toUpperCase();
    const officer = (c.bodycamOfficer || defaultOfficer || 'M. MENDOZA').toUpperCase();
    ctx.textAlign = 'left';
    ctx.fillText(`AXON BODY 3 · ${c.bodycamDate || defDate} ${c.bodycamTime || defTime}`, padX, padY);
    ctx.fillText(`DEPT: ${dept} · OFC ${officer}`, padX, padY + fs + 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff3b30';
    ctx.fillText('● REC', w - padX, padY);
  } else if (cam.preset === 'cctv') {
    const fs = Math.max(11, Math.round(w * 0.014));
    ctx.font = `bold ${fs}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#6afe87';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    const padX = Math.round(w * 0.025);
    const padY = Math.round(h * 0.035);
    ctx.textAlign = 'left';
    ctx.fillText((c.cctvCamName || 'CAM 03 [SURVEILLANCE HQ]').toUpperCase(), padX, padY);
    ctx.textAlign = 'right';
    ctx.fillText((c.cctvLocation || 'PAL 25FPS · 1080P · LIVE').toUpperCase(), w - padX, padY);
    ctx.textAlign = 'left';
    ctx.fillText(`${c.cctvDate || defDate} ${c.cctvTime || defTime} · LIVE`, padX, h - padY - fs);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);
  } else if (cam.preset === 'noir') {
    ctx.globalCompositeOperation = 'color-burn';
    ctx.fillStyle = 'rgba(10, 25, 45, 0.22)';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
};
