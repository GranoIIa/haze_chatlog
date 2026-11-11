import React, { useState, useRef, useEffect } from 'react';
import { Character, ParsedLine } from '../../types';
import { CHAR_COLORS } from '../../utils/chatParser';
import { renderChatText } from '../../utils/chatRenderer';
import { publishChat } from '../../utils/chatStore';
import type { CanvasLayer } from '../../types';
import { RP_PRESETS } from '../../utils/rpPresets';
import { RP_STICKERS } from '../../utils/rpStickers';
import {
  drawCanvasLayer, drawLayerHandles, hitTestHandles, hitTestLayerBody, startHandleDrag, applyLayerDrag,
  EMPTY_DRAG, LayerDragState
} from '../../utils/canvasLayerRenderer';
import { CanvasLayersSidebar, PresetKey } from '../CanvasEditor/CanvasLayersSidebar';
import { 
  PhotoAdjustments, DEFAULT_ADJUSTMENTS, applyPhotoAdjustments 
} from '../../utils/photoFilters';
import { 
  Upload, Download, Plus, Trash2, Sparkles, Sliders, Type, 
  Layers, RefreshCw, Move, Clapperboard, Sun, Contrast,
  Flame, Zap, Shield, EyeOff, Palette
} from 'lucide-react';

interface RenderToken {
  text: string;
  isCensored: boolean;
  color: string;
}

interface RenderRow {
  tokens: Array<{
    text: string;
    isCensored: boolean;
    color: string;
    width: number;
  }>;
  totalWidth: number;
}

const STORAGE_KEY = 'haze-chatlog-v2';

// Lê as configurações salvas (nunca a imagem). Falha silenciosa se o storage estiver bloqueado.
const loadSaved = (): Record<string, any> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

type FitMode = 'cover' | 'contain' | 'stretch';
type MouseTool = 'chat' | 'photo' | 'layer' | 'light';

// Posição em frações do canvas (0–1) e largura em % da largura do canvas:
// assim a camada se adapta a qualquer resolução de saída e ao modo Lote.
interface ImageLayer {
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

const RESOLUTION_PRESETS: Array<{ label: string; size: { w: number; h: number } | null }> = [
  { label: 'Original', size: null },
  { label: '1280×720', size: { w: 1280, h: 720 } },
  { label: '1920×1080', size: { w: 1920, h: 1080 } },
  { label: '2560×1440', size: { w: 2560, h: 1440 } },
  { label: '4K UHD', size: { w: 3840, h: 2160 } },
  { label: '1:1 Square', size: { w: 1080, h: 1080 } },
  { label: '4:5 Feed', size: { w: 1080, h: 1350 } }
];

const MIN_RES = 64;
const MAX_RES = 7680;

// Desenha a imagem na área de saída respeitando modo de adaptação, pan (% da área) e zoom.
const drawFittedImage = (
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
  const dx = (w - dw) / 2 + (panXPct / 100) * w;
  const dy = (h - dh) / 2 + (panYPct / 100) * h;
  if (mode === 'contain') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, dx, dy, dw, dh);
};

// ---- Iluminação & luz colorida (portada da versão original) ----
type LightSource = 'radial' | 'conic' | 'rim' | 'ambient' | 'duotone';

interface Lighting {
  enabled: boolean;
  color: string;
  intensity: number;   // 0–100
  radius: number;      // 0–150 (% da maior dimensão)
  softness: number;    // 0–100
  x: number;           // % da largura
  y: number;           // % da altura
  sourceType: LightSource;
  blendMode: GlobalCompositeOperation;
  secondaryColor: string;
  secondaryIntensity: number;
  secondaryX: number;
  secondaryY: number;
}

const DEFAULT_LIGHTING: Lighting = {
  enabled: false, color: '#ff2846', intensity: 70, radius: 80, softness: 85, x: 25, y: 30,
  sourceType: 'radial', blendMode: 'screen',
  secondaryColor: '#1ec8ff', secondaryIntensity: 50, secondaryX: 85, secondaryY: 70
};

const LIGHT_SOURCES: Array<[LightSource, string]> = [
  ['radial', 'Softbox radial'], ['conic', 'Feixe direcional'], ['rim', 'Luz de recorte'],
  ['ambient', 'Ambiente difuso'], ['duotone', 'Duo-tone (2 cores)']
];

const LIGHT_BLENDS: Array<[GlobalCompositeOperation, string]> = [
  ['screen', 'Screen (clarear)'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'],
  ['color-dodge', 'Color dodge (intenso)'], ['lighten', 'Lighten'], ['hard-light', 'Hard light'], ['multiply', 'Multiply (escurecer)']
];

const LIGHTING_PRESETS: Array<{ label: string; patch: Partial<Lighting> }> = [
  { label: 'Boudoir', patch: { color: '#ff2846', intensity: 70, radius: 80, softness: 85, x: 25, y: 30, sourceType: 'radial', blendMode: 'screen' } },
  { label: 'Sunset Warmth', patch: { color: '#ff7832', intensity: 65, radius: 85, softness: 90, x: 15, y: 45, sourceType: 'conic', blendMode: 'screen' } },
  { label: 'Cyber Purple', patch: { color: '#b419ff', intensity: 75, radius: 70, softness: 75, x: 75, y: 25, sourceType: 'radial', blendMode: 'color-dodge' } },
  { label: 'Pink', patch: { color: '#ff3296', intensity: 60, radius: 75, softness: 80, x: 50, y: 20, sourceType: 'radial', blendMode: 'screen' } },
  { label: 'Golden Hour', patch: { color: '#ffc346', intensity: 65, radius: 90, softness: 85, x: 20, y: 20, sourceType: 'radial', blendMode: 'screen' } },
  { label: 'Luz de Velas', patch: { color: '#ff5a14', intensity: 55, radius: 60, softness: 80, x: 40, y: 80, sourceType: 'radial', blendMode: 'soft-light' } },
  { label: 'Luar Cyan', patch: { color: '#1ec8ff', intensity: 70, radius: 65, softness: 70, x: 88, y: 50, sourceType: 'rim', blendMode: 'screen' } },
  { label: 'Estúdio 5500K', patch: { color: '#fffaf0', intensity: 60, radius: 90, softness: 95, x: 50, y: 30, sourceType: 'radial', blendMode: 'screen' } },
  { label: 'Duo-Tone', patch: { color: '#ff2846', secondaryColor: '#1ec8ff', intensity: 65, secondaryIntensity: 50, radius: 75, softness: 80, x: 20, y: 30, secondaryX: 85, secondaryY: 70, sourceType: 'duotone', blendMode: 'screen' } },
  { label: 'Champanhe VIP', patch: { color: '#ffe1a0', intensity: 55, radius: 85, softness: 90, x: 50, y: 15, sourceType: 'ambient', blendMode: 'screen' } }
];

const LIGHT_POSITIONS: Array<[string, string, number, number]> = [
  ['↖', 'Topo esquerda', 15, 15], ['↑', 'Topo', 50, 15], ['↗', 'Topo direita', 85, 15],
  ['←', 'Esquerda', 15, 50], ['•', 'Centro', 50, 50], ['→', 'Direita', 85, 50],
  ['↙', 'Base esquerda', 15, 85], ['↓', 'Base', 50, 85], ['↘', 'Base direita', 85, 85]
];

const hexToRgba = (hex: string, alpha = 1): string => {
  let c = (hex || '').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  if (c.length !== 6 || isNaN(n)) return `rgba(255, 40, 70, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const sanitizeLighting = (v: any): Lighting => {
  const d = DEFAULT_LIGHTING;
  if (!v || typeof v !== 'object') return { ...d };
  const n = (x: unknown, f: number, lo: number, hi: number) =>
    typeof x === 'number' && isFinite(x) ? Math.min(hi, Math.max(lo, x)) : f;
  const hex = (x: unknown, f: string) => (typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x) ? x : f);
  return {
    enabled: v.enabled === true,
    color: hex(v.color, d.color),
    intensity: n(v.intensity, d.intensity, 0, 100),
    radius: n(v.radius, d.radius, 10, 150),
    softness: n(v.softness, d.softness, 0, 100),
    x: n(v.x, d.x, 0, 100),
    y: n(v.y, d.y, 0, 100),
    sourceType: LIGHT_SOURCES.some(([k]) => k === v.sourceType) ? v.sourceType : d.sourceType,
    blendMode: LIGHT_BLENDS.some(([k]) => k === v.blendMode) ? v.blendMode : d.blendMode,
    secondaryColor: hex(v.secondaryColor, d.secondaryColor),
    secondaryIntensity: n(v.secondaryIntensity, d.secondaryIntensity, 0, 100),
    secondaryX: n(v.secondaryX, d.secondaryX, 0, 100),
    secondaryY: n(v.secondaryY, d.secondaryY, 0, 100)
  };
};

const drawPhotographicLight = (ctx: CanvasRenderingContext2D, W: number, H: number, L: Lighting) => {
  if (!L.enabled) return;
  const intensity = L.intensity / 100;
  if (intensity <= 0) return;

  const r = L.radius / 100;
  const softness = L.softness / 100;
  const color = L.color;
  const lx = (L.x / 100) * W;
  const ly = (L.y / 100) * H;
  const maxDim = Math.max(W, H);
  const radiusPx = maxDim * r;

  const rgba = hexToRgba(color, intensity);
  const rgbaMid = hexToRgba(color, intensity * 0.45);
  const rgbaFade = hexToRgba(color, 0);

  ctx.save();
  ctx.globalCompositeOperation = L.blendMode;

  if (L.sourceType === 'radial') {
    const inner = Math.max(0, radiusPx * (1 - softness));
    const g = ctx.createRadialGradient(lx, ly, inner, lx, ly, radiusPx);
    g.addColorStop(0, rgba);
    g.addColorStop(0.35, hexToRgba(color, intensity * 0.7));
    g.addColorStop(0.7, rgbaMid);
    g.addColorStop(1, rgbaFade);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (intensity > 0.25) {
      const core = ctx.createRadialGradient(lx, ly, 0, lx, ly, radiusPx * 0.22);
      core.addColorStop(0, `rgba(255, 255, 255, ${intensity * 0.25})`);
      core.addColorStop(0.5, hexToRgba(color, intensity * 0.15));
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.fillRect(0, 0, W, H);
    }
  } else if (L.sourceType === 'conic') {
    const angle = Math.atan2(H / 2 - ly, W / 2 - lx);
    const beam = (Math.PI / 2.8) * (softness + 0.35);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, radiusPx * 1.6, angle - beam / 2, angle + beam / 2);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, radiusPx * 1.6);
    g.addColorStop(0, rgba);
    g.addColorStop(0.35, hexToRgba(color, intensity * 0.65));
    g.addColorStop(0.75, rgbaMid);
    g.addColorStop(1, rgbaFade);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  } else if (L.sourceType === 'rim') {
    const g = ctx.createRadialGradient(lx, ly, radiusPx * 0.1, lx, ly, radiusPx * 1.25);
    g.addColorStop(0, rgba);
    g.addColorStop(0.3, hexToRgba(color, intensity * 0.8));
    g.addColorStop(0.65, rgbaMid);
    g.addColorStop(1, rgbaFade);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (L.sourceType === 'ambient') {
    const g = ctx.createRadialGradient(lx, ly, 0, W / 2, H / 2, maxDim);
    g.addColorStop(0, rgba);
    g.addColorStop(0.55, hexToRgba(color, intensity * 0.55));
    g.addColorStop(1, hexToRgba(color, intensity * 0.2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  } else if (L.sourceType === 'duotone') {
    const g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, radiusPx);
    g1.addColorStop(0, rgba);
    g1.addColorStop(0.5, rgbaMid);
    g1.addColorStop(1, rgbaFade);
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    const sec = L.secondaryIntensity / 100;
    const sx = (L.secondaryX / 100) * W;
    const sy = (L.secondaryY / 100) * H;
    const g2 = ctx.createRadialGradient(sx, sy, 0, sx, sy, maxDim * 0.7);
    g2.addColorStop(0, hexToRgba(L.secondaryColor, sec));
    g2.addColorStop(0.5, hexToRgba(L.secondaryColor, sec * 0.45));
    g2.addColorStop(1, hexToRgba(L.secondaryColor, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.restore();
};

// Retículo da fonte de luz (só no preview, nunca no export)
const drawLightGizmo = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, k: number) => {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  ctx.arc(x, y, 20 * k, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 16, 19, 0.65)';
  ctx.fill();
  ctx.lineWidth = 2.5 * k;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 26 * k, y); ctx.lineTo(x - 20 * k, y);
  ctx.moveTo(x + 20 * k, y); ctx.lineTo(x + 26 * k, y);
  ctx.moveTo(x, y - 26 * k); ctx.lineTo(x, y - 20 * k);
  ctx.moveTo(x, y + 20 * k); ctx.lineTo(x, y + 26 * k);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2 * k;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 5 * k, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.font = `bold ${Math.round(11 * k)}px "JetBrains Mono", sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 4 * k;
  ctx.fillText(`💡 ${label}`, x + 14 * k, y - 12 * k);
  ctx.restore();
};

// ---- Câmera RP (Bodycam / CCTV / Noite Fria) e efeitos de filme ----
type CameraPreset = 'none' | 'bodycam' | 'cctv' | 'noir';
type EffectKey = 'vintage' | 'bw' | 'brush' | 'vignette' | 'grain' | 'lightleak';

interface CameraState {
  preset: CameraPreset;
  effects: Record<EffectKey, boolean>;
  custom: {
    bodycamDate: string; bodycamTime: string; bodycamDept: string; bodycamOfficer: string;
    cctvCamName: string; cctvDate: string; cctvTime: string; cctvLocation: string;
  };
}

const NO_EFFECTS: Record<EffectKey, boolean> = {
  vintage: false, bw: false, brush: false, vignette: false, grain: false, lightleak: false
};

const DEFAULT_CAMERA: CameraState = {
  preset: 'none',
  effects: { ...NO_EFFECTS },
  custom: {
    bodycamDate: '', bodycamTime: '', bodycamDept: '', bodycamOfficer: '',
    cctvCamName: '', cctvDate: '', cctvTime: '', cctvLocation: ''
  }
};

// Efeitos que cada preset liga (igual à versão original)
const CAMERA_PRESET_EFFECTS: Record<CameraPreset, Record<EffectKey, boolean>> = {
  none: { ...NO_EFFECTS },
  bodycam: { ...NO_EFFECTS, brush: true },
  cctv: { ...NO_EFFECTS, bw: true, brush: true, vignette: true, grain: true },
  noir: { ...NO_EFFECTS, brush: true, vignette: true, grain: true }
};

const EFFECT_LABELS: Array<[EffectKey, string]> = [
  ['grain', 'Granulado'], ['vignette', 'Vinheta'], ['lightleak', 'Light leak'],
  ['brush', 'Realce'], ['vintage', 'Vintage'], ['bw', 'P&B']
];

const sanitizeCamera = (v: any): CameraState => {
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
const getNoiseCanvas = (): HTMLCanvasElement => {
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

const applyFilmEffects = (ctx: CanvasRenderingContext2D, w: number, h: number, fx: Record<EffectKey, boolean>) => {
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

const drawCameraOverlay = (
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

// ---- Persistência das camadas (IndexedDB: metadados + arquivos de imagem) ----
const LAYERS_DB = 'haze-chatlog';

const openLayersDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponível')); return; }
    const req = indexedDB.open(LAYERS_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação abortada'));
  });

const reqResult = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// Grava só os arquivos novos e remove os que nenhuma camada usa mais
const saveLayersToDb = async (
  layers: ImageLayer[],
  blobs: Map<string, Blob>,
  stored: Set<string>
) => {
  const db = await openLayersDb();
  try {
    const used = new Set(layers.map(l => l.blobId));
    const tx = db.transaction(['meta', 'blobs'], 'readwrite');
    tx.objectStore('meta').put(layers, 'layers');
    const bs = tx.objectStore('blobs');
    used.forEach(id => {
      const b = blobs.get(id);
      if (b && !stored.has(id)) bs.put(b, id);
    });
    stored.forEach(id => { if (!used.has(id)) bs.delete(id); });
    await txDone(tx);
    stored.forEach(id => { if (!used.has(id)) stored.delete(id); });
    used.forEach(id => { if (blobs.has(id)) stored.add(id); });
  } finally {
    db.close();
  }
};

const loadLayersFromDb = async (): Promise<{ layers: ImageLayer[]; blobs: Map<string, Blob> }> => {
  const db = await openLayersDb();
  try {
    const tx = db.transaction(['meta', 'blobs'], 'readonly');
    const raw = await reqResult(tx.objectStore('meta').get('layers'));
    const blobs = new Map<string, Blob>();
    const layers: ImageLayer[] = [];
    if (Array.isArray(raw)) {
      for (const l of raw.slice(0, 20)) {
        if (!l || typeof l.id !== 'string' || typeof l.blobId !== 'string') continue;
        if (!blobs.has(l.blobId)) {
          const b = await reqResult(tx.objectStore('blobs').get(l.blobId));
          if (b instanceof Blob) blobs.set(l.blobId, b);
        }
        if (!blobs.has(l.blobId)) continue;
        const n = (x: unknown, f: number) => (typeof x === 'number' && isFinite(x) ? x : f);
        layers.push({
          id: l.id, blobId: l.blobId,
          name: typeof l.name === 'string' ? l.name.slice(0, 120) : 'camada',
          cx: Math.min(1, Math.max(0, n(l.cx, 0.5))), cy: Math.min(1, Math.max(0, n(l.cy, 0.5))),
          widthPct: Math.min(200, Math.max(2, n(l.widthPct, 30))),
          rotation: Math.min(180, Math.max(-180, n(l.rotation, 0))),
          opacity: Math.min(1, Math.max(0, n(l.opacity, 1))),
          aboveChat: l.aboveChat === true, visible: l.visible !== false
        });
      }
    }
    return { layers, blobs };
  } finally {
    db.close();
  }
};

const clearLayersDb = async () => {
  try {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(LAYERS_DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  } catch (_) { /* sem IndexedDB: nada a limpar */ }
};

// Camadas de RP (presets, adesivos e texto) vindas do armazenamento: valida cada campo
const sanitizeCanvasLayers = (v: any): CanvasLayer[] => {
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

const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

export const ChatLogView: React.FC = () => {
  // Container Ref para escopo de eventos globais (ex: paste em abas inativas)
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Configurações restauradas do localStorage (lidas uma única vez)
  const [saved] = useState<Record<string, any>>(loadSaved);

  // Modo de trabalho: foto individual ou lote (ZIP)
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  // Estado da Imagem
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({ width: 1280, height: 720 });
  const [darkening, setDarkening] = useState<number>(num(saved.darkening, 0.15));
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Ajustes de Imagem / Retoque Fotográfico (Estilo Photoshop na GPU/Canvas)
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>({
    ...DEFAULT_ADJUSTMENTS,
    ...(saved.adjustments && typeof saved.adjustments === 'object' ? saved.adjustments : {})
  });

  // Estado do Chat
  const [rawText, setRawText] = useState<string>(
    typeof saved.rawText === 'string' ? saved.rawText :
    "[14:23:45] * Mike Johnson saca um cigarro do bolso e acende com um isqueiro prata.\n" +
    "> A fumaça densa sobe lentamente enquanto ele observa o movimento da rua.\n" +
    "Mike Johnson diz: A gente não tem muito tempo até eles descobrirem a senha ||4892-OMEGA|| do cofre.\n" +
    "(( Sarah Miller: Me dá 2 minutos que estou terminando de puxar os logs. ))\n" +
    "$ [TRANSAÇÃO] Você transferiu $15.000 para Mike Johnson."
  );

  // Configurações de Tipografia e Estilo (Features 8, 9, 10)
  const [fontSize, setFontSize] = useState<number>(num(saved.fontSize, 20));
  const [fontFamily, setFontFamily] = useState<string>(str(saved.fontFamily, "Arial, Helvetica, sans-serif"));
  const [lineHeightFactor, setLineHeightFactor] = useState<number>(num(saved.lineHeightFactor, 1.55));
  const [strokeEnabled, setStrokeEnabled] = useState<boolean>(bool(saved.strokeEnabled, true));
  const [strokeWidth, setStrokeWidth] = useState<number>(num(saved.strokeWidth, 2));
  const [strokeColor, setStrokeColor] = useState<string>(str(saved.strokeColor, "#000000"));
  const [bgEnabled, setBgEnabled] = useState<boolean>(bool(saved.bgEnabled, true));
  const [bgColor, setBgColor] = useState<string>(str(saved.bgColor, "#000000"));
  const [bgOpacity, setBgOpacity] = useState<number>(num(saved.bgOpacity, 0.65));
  const [maxWidthPercent, setMaxWidthPercent] = useState<number>(num(saved.maxWidthPercent, 85));
  const [shadowEnabled, setShadowEnabled] = useState<boolean>(bool(saved.shadowEnabled, false));
  const [censorStyle, setCensorStyle] = useState<'mosaic' | 'solid'>(saved.censorStyle === 'solid' ? 'solid' : 'mosaic');
  const [showTimestamps, setShowTimestamps] = useState<boolean>(bool(saved.showTimestamps, true));

  // Posicionamento do Chat (Drag & Drop com Pointer Events)
  const [chatPos, setChatPos] = useState<{ x: number; y: number }>({
    x: num(saved.chatPos?.x, 40),
    y: num(saved.chatPos?.y, 50)
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Resolução de saída e enquadramento da foto (null = tamanho original da foto)
  const [outputRes, setOutputRes] = useState<{ w: number; h: number } | null>(
    saved.outputRes && num(saved.outputRes.w, 0) >= MIN_RES && num(saved.outputRes.h, 0) >= MIN_RES
      ? { w: Math.min(MAX_RES, saved.outputRes.w), h: Math.min(MAX_RES, saved.outputRes.h) }
      : null
  );
  const [fitMode, setFitMode] = useState<FitMode>(
    saved.fitMode === 'contain' || saved.fitMode === 'stretch' ? saved.fitMode : 'cover'
  );
  const [panX, setPanX] = useState<number>(num(saved.panX, 0));
  const [panY, setPanY] = useState<number>(num(saved.panY, 0));
  const [zoom, setZoom] = useState<number>(num(saved.zoom, 100));
  const [customW, setCustomW] = useState<string>(String(outputRes?.w ?? 1920));
  const [customH, setCustomH] = useState<string>(String(outputRes?.h ?? 1080));

  // Personagens
  const [characters, setCharacters] = useState<Character[]>(
    Array.isArray(saved.characters) && saved.characters.every((c: any) => c && typeof c.id === 'string' && typeof c.name === 'string' && typeof c.color === 'string')
      ? saved.characters
      : [
          { id: '1', name: 'Mike Johnson', color: '#38bdf8' },
          { id: '2', name: 'Sarah Miller', color: '#fb7185' }
        ]
  );
  const [newCharName, setNewCharName] = useState<string>('');
  const [activeCharId, setActiveCharId] = useState<string | null>(null);

  // Camadas de imagem (as imagens ficam num mapa; só os metadados vão ao estado)
  const [layers, setLayers] = useState<ImageLayer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const layerImgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const layerBlobs = useRef<Map<string, Blob>>(new Map());      // blobId -> arquivo original
  const storedBlobIds = useRef<Set<string>>(new Set());          // arquivos já gravados no IndexedDB
  const layersLoaded = useRef(false);                            // evita sobrescrever o salvo antes de carregar
  const layerDragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);
  const layerInputRef = useRef<HTMLInputElement | null>(null);

  // Iluminação: configurações persistidas + modo de posicionar a luz no preview
  const [lighting, setLighting] = useState<Lighting>(() => sanitizeLighting(saved.lighting));
  const [camera, setCamera] = useState<CameraState>(() => sanitizeCamera(saved.camera));
  // Ferramenta do mouse no preview: texto do chat, enquadrar foto, mover camada ou posicionar luz
  const [mouseTool, setMouseTool] = useState<MouseTool>('chat');
  const lightEdit = mouseTool === 'light';
  const photoDragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const lightDragRef = useRef<'main' | 'secondary' | null>(null);
  const patchLighting = (patch: Partial<Lighting>) => setLighting(prev => ({ ...prev, ...patch }));

  // Elementos de RP no mesmo canvas: presets cinemáticos, adesivos e texto (vindos do antigo Canvas Studio)
  const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>(() => sanitizeCanvasLayers(saved.canvasLayers));
  const [selectedCanvasLayerId, setSelectedCanvasLayerId] = useState<string | null>(null);
  const canvasDragRef = useRef<{ id: string; state: LayerDragState } | null>(null);

  const newCanvasLayerId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  const applyPreset = (key: PresetKey) => {
    const preset = (RP_PRESETS as any)[key];
    if (!preset) return;
    const layer: CanvasLayer = {
      id: newCanvasLayerId('preset'), type: 'preset', name: `Preset: ${preset.name}`,
      x: 0, y: 0, width: canvasDims.width, height: canvasDims.height,
      rotation: 0, opacity: 1, visible: true, locked: false,
      presetType: key, presetData: { ...preset.defaultData }
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const addSticker = (stickerId: string) => {
    const sticker = RP_STICKERS.find(st => st.id === stickerId);
    if (!sticker) return;
    let w = 120;
    let h = 120;
    if (sticker.id === 'crime-tape') { w = 550; h = 45; }
    else if (sticker.id === 'censored-bar') { w = 280; h = 50; }
    else if (sticker.id.startsWith('evidence-marker')) { w = 80; h = 90; }
    const layer: CanvasLayer = {
      id: newCanvasLayerId('sticker'), type: 'sticker', name: `Adesivo: ${sticker.name}`, content: sticker.id,
      x: Math.round(canvasDims.width / 2 - w / 2), y: Math.round(canvasDims.height / 2 - h / 2),
      width: w, height: h, rotation: 0, opacity: 1, visible: true, locked: false
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const addTextLayer = () => {
    const text = 'DIGITE SEU TEXTO AQUI';
    const layer: CanvasLayer = {
      id: newCanvasLayerId('text'), type: 'text', name: 'Texto Customizado', text, content: text,
      x: Math.round(canvasDims.width / 2 - 150), y: Math.round(canvasDims.height / 2 - 25),
      width: 300, height: 50, rotation: 0, opacity: 1, visible: true, locked: false,
      fontSize: 32, fontFamily: 'Inter, sans-serif', color: '#ffffff', fontWeight: 'bold',
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6, offsetX: 2, offsetY: 2 }
    };
    setCanvasLayers(prev => [...prev, layer]);
    setSelectedCanvasLayerId(layer.id);
    setSelectedLayerId(null);
  };

  const moveCanvasLayer = (id: string, direction: 'up' | 'down') =>
    setCanvasLayers(prev => {
      const i = prev.findIndex(l => l.id === id);
      const j = direction === 'up' ? i + 1 : i - 1;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const bringCanvasLayerToFront = (id: string) =>
    setCanvasLayers(prev => {
      const l = prev.find(x => x.id === id);
      return l ? [...prev.filter(x => x.id !== id), l] : prev;
    });

  const sendCanvasLayerToBack = (id: string) =>
    setCanvasLayers(prev => {
      const l = prev.find(x => x.id === id);
      return l ? [l, ...prev.filter(x => x.id !== id)] : prev;
    });

  const duplicateCanvasLayer = (id: string) => {
    const src = canvasLayers.find(l => l.id === id);
    if (!src) return;
    const clone: CanvasLayer = {
      ...src, id: newCanvasLayerId(src.type), name: `${src.name} (Cópia)`,
      x: src.x + 20, y: src.y + 20,
      presetData: src.presetData ? { ...src.presetData } : undefined
    };
    setCanvasLayers(prev => [...prev, clone]);
    setSelectedCanvasLayerId(clone.id);
  };

  const deleteCanvasLayer = (id: string) => {
    setCanvasLayers(prev => prev.filter(l => l.id !== id));
    setSelectedCanvasLayerId(cur => (cur === id ? null : cur));
  };

  const updateSelectedCanvasLayer = (updates: Partial<CanvasLayer>) => {
    if (!selectedCanvasLayerId) return;
    setCanvasLayers(prev => prev.map(l => (l.id === selectedCanvasLayerId ? { ...l, ...updates } : l)));
  };

  const updateCanvasPresetField = (field: string, value: any) => {
    if (!selectedCanvasLayerId) return;
    setCanvasLayers(prev => prev.map(l =>
      l.id === selectedCanvasLayerId ? { ...l, presetData: { ...l.presetData, [field]: value } } : l
    ));
  };
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Dimensão final do canvas: resolução escolhida ou tamanho original da foto
  const canvasDims = outputRes ? { width: outputRes.w, height: outputRes.h } : imageDimensions;

  // Troca a resolução mantendo o chat na mesma posição relativa
  const changeResolution = (next: { w: number; h: number } | null) => {
    const nw = next ? next.w : imageDimensions.width;
    const nh = next ? next.h : imageDimensions.height;
    const ratioX = nw / canvasDims.width;
    const ratioY = nh / canvasDims.height;
    setChatPos(p => ({ x: Math.round(p.x * ratioX), y: Math.round(p.y * ratioY) }));
    setCanvasLayers(prev => prev.map(l => l.type === 'preset'
      ? { ...l, width: nw, height: nh }
      : { ...l, x: Math.round(l.x * ratioX), y: Math.round(l.y * ratioY), width: Math.max(1, Math.round(l.width * ratioX)), height: Math.max(1, Math.round(l.height * ratioY)) }));
    setOutputRes(next);
    if (next) { setCustomW(String(next.w)); setCustomH(String(next.h)); }
  };

  const applyCustomResolution = () => {
    const w = Math.round(Number(customW));
    const h = Math.round(Number(customH));
    if (!isFinite(w) || !isFinite(h)) return;
    changeResolution({
      w: Math.min(MAX_RES, Math.max(MIN_RES, w)),
      h: Math.min(MAX_RES, Math.max(MIN_RES, h))
    });
  };

  const resetFraming = () => { setPanX(0); setPanY(0); setZoom(100); };

  // Refs de Canvas e Imagem
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Carregar imagem de forma segura com createObjectURL e liberação prévia
  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    const objectUrl = URL.createObjectURL(file);
    currentBlobUrlRef.current = objectUrl;

    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setImageDimensions({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
      setImageSrc(objectUrl);
    };
    img.onerror = () => {
      if (currentBlobUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        currentBlobUrlRef.current = null;
      }
    };
    img.src = objectUrl;
  };

  // Limpeza de recursos ao desmontar componente
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
      loadedImageRef.current = null;
    };
  }, []);

  // Suporte a colar da área de transferência (Ctrl + V) isolado por aba ativa
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.offsetParent === null || containerRef.current.closest('.hidden')) {
        return;
      }

      if (e.clipboardData?.files && e.clipboardData.files.length > 0) {
        const file = e.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          handleImageUpload(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Handlers de Drag & Drop HTML5 para upload de arquivo
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    }
  };

  const addCharacter = () => {
    if (!newCharName.trim()) return;
    const randomColor = CHAR_COLORS[characters.length % CHAR_COLORS.length];
    setCharacters([...characters, { id: Date.now().toString(), name: newCharName.trim(), color: randomColor }]);
    setNewCharName('');
  };

  const removeCharacter = (id: string) => {
    setCharacters(characters.filter(c => c.id !== id));
    if (activeCharId === id) setActiveCharId(null);
  };

  // Insere texto na posição do cursor do editor (substitui a seleção).
  // Prefixos de linha ganham uma quebra antes se o cursor estiver no meio de uma linha.
  const insertAtCursor = (text: string, startOfLine: boolean = true) => {
    const ta = textareaRef.current;
    const s = ta ? ta.selectionStart : rawText.length;
    const e = ta ? ta.selectionEnd : rawText.length;
    const ins = startOfLine && s > 0 && rawText[s - 1] !== '\n' ? '\n' + text : text;
    setRawText(rawText.slice(0, s) + ins + rawText.slice(e));
    const caret = s + ins.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  // Personagem ativo: o selecionado, ou o primeiro da lista
  const activeChar = characters.find(c => c.id === activeCharId) ?? characters[0];

  // Fala do personagem ativo com o tom escolhido (normal, sussurrando, gritando, baixo...)
  const insertSpeech = (tone: string, charName?: string) => {
    const name = charName ?? activeChar?.name ?? 'Personagem';
    insertAtCursor(`${name} diz (${tone}): `);
  };

  const insertCharSpeech = (charName: string) => {
    const c = characters.find(ch => ch.name === charName);
    if (c) setActiveCharId(c.id);
    insertSpeech('normal', charName);
  };

  // Envolve a seleção em ||...|| (censura); sem seleção, insere um marcador editável
  const insertCensor = () => {
    const ta = textareaRef.current;
    if (ta && ta.selectionStart !== ta.selectionEnd) {
      const s = ta.selectionStart;
      const e = ta.selectionEnd;
      setRawText(rawText.slice(0, s) + '||' + rawText.slice(s, e) + '||' + rawText.slice(e));
      requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(e + 4, e + 4); });
    } else {
      insertAtCursor('||CENSURADO|| ', false);
    }
  };

  // ---- Camadas de imagem (logos, molduras, marcas d'água) ----
  const layerRect = (l: ImageLayer, img: HTMLImageElement, W: number, H: number) => {
    const iw = img.naturalWidth || img.width || 1;
    const ih = img.naturalHeight || img.height || 1;
    const w = (l.widthPct / 100) * W;
    return { cx: l.cx * W, cy: l.cy * H, w, h: (w * ih) / iw };
  };

  const drawLayers = (ctx: CanvasRenderingContext2D, W: number, H: number, above: boolean) => {
    for (const l of layers) {
      if (!!l.aboveChat !== above || !l.visible) continue;
      const img = layerImgs.current.get(l.id);
      if (!img) continue;
      const r = layerRect(l, img, W, H);
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, l.opacity));
      ctx.translate(r.cx, r.cy);
      ctx.rotate((l.rotation * Math.PI) / 180);
      ctx.drawImage(img, -r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
  };

  // Camada mais ao topo sob o ponteiro (considera rotação)
  const hitTestLayer = (px: number, py: number, W: number, H: number): ImageLayer | null => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const img = layerImgs.current.get(l.id);
      if (!img || !l.visible) continue;
      const r = layerRect(l, img, W, H);
      const a = (-l.rotation * Math.PI) / 180;
      const dx = px - r.cx;
      const dy = py - r.cy;
      const lx = dx * Math.cos(a) - dy * Math.sin(a);
      const ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return l;
    }
    return null;
  };

  const MAX_LAYERS = 20;

  const addLayerFiles = (list: FileList | File[]) => {
    const files = Array.from(list).filter(f => f.type.startsWith('image/'));
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const id = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const blobId = `B${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        layerImgs.current.set(id, img);
        layerBlobs.current.set(blobId, file);
        setLayers(prev => prev.length >= MAX_LAYERS ? prev : [
          ...prev,
          {
            id, blobId, name: file.name, cx: 0.5, cy: 0.5, widthPct: 30, rotation: 0,
            opacity: 1, aboveChat: false, visible: true
          }
        ]);
        setSelectedLayerId(id);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    });
  };

  const updateLayer = (id: string, patch: Partial<ImageLayer>) =>
    setLayers(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const removeLayer = (id: string) => {
    setLayers(prev => prev.filter(l => l.id !== id));
    // a imagem fica no mapa enquanto houver cópia (duplicatas compartilham o mesmo elemento)
    setSelectedLayerId(cur => (cur === id ? null : cur));
  };

  const duplicateLayer = (id: string) => {
    setLayers(prev => {
      if (prev.length >= MAX_LAYERS) return prev;
      const i = prev.findIndex(l => l.id === id);
      const src = prev[i];
      const img = layerImgs.current.get(id);
      if (!src || !img) return prev;
      const nid = `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      layerImgs.current.set(nid, img);
      setSelectedLayerId(nid);
      const copy = { ...src, id: nid, name: `${src.name} (cópia)`, cx: Math.min(1, src.cx + 0.03), cy: Math.min(1, src.cy + 0.03) };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  };

  const moveLayerOrder = (id: string, dir: -1 | 1) =>
    setLayers(prev => {
      const i = prev.findIndex(l => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Renderizar a Cena Completa no Canvas (Engine Multiline + Stroke + Mosaico)
  const drawScene = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number = 1,
    bg?: HTMLImageElement | null
  ) => {
    ctx.clearRect(0, 0, width, height);

    // 1. Desenhar Fundo (bg explícito é usado pelo modo Lote)
    const bgImage = bg === undefined ? loadedImageRef.current : bg;
    if (bgImage) {
      drawFittedImage(ctx, bgImage, width, height, fitMode, panX, panY, zoom);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#10141e');
      grad.addColorStop(1, '#080a10');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#1e2638';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40 * scale) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = 0; y < height; y += 40 * scale) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }

    // 2. Aplicar Ajustes Fotográficos de Cor e Shaders
    applyPhotoAdjustments(ctx, width, height, adjustments);

    // 2.1 Efeitos de filme (P&B, vintage, vinheta, granulado...)
    applyFilmEffects(ctx, width, height, camera.effects);

    // 3. Escurecimento da Cena
    if (darkening > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${darkening})`;
      ctx.fillRect(0, 0, width, height);
    }

    // 3.0 Iluminação colorida sobre a cena (antes das camadas e do texto)
    drawPhotographicLight(ctx, width, height, lighting);

    // 3.05 HUD da câmera (Bodycam, CCTV, Noite Fria)
    drawCameraOverlay(ctx, width, height, camera, activeChar?.name ?? '');

    // 3.1 Camadas de imagem abaixo do chat
    drawLayers(ctx, width, height, false);

    // 4. Texto do chat (renderizador compartilhado com o GIF Lab)
    renderChatText(ctx, width, height, scale, {
      rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
      strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
      showTimestamps, chatPos
    });

    // 5. Camadas de imagem acima do chat
    drawLayers(ctx, width, height, true);

    // 6. Elementos de RP (presets, adesivos, texto) por cima de tudo
    canvasLayers.forEach(l => drawCanvasLayer(ctx, l, width, height, scale));
  };

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = canvasDims.width;
    canvas.height = canvasDims.height;
    drawScene(ctx, canvasDims.width, canvasDims.height, 1);

    // Retículos da luz enquanto o modo "posicionar luz" está ativo
    if (lightEdit && lighting.enabled) {
      const k = Math.max(1, canvas.width / 1000);
      drawLightGizmo(ctx, (lighting.x / 100) * canvas.width, (lighting.y / 100) * canvas.height, lighting.color, 'Luz principal', k);
      if (lighting.sourceType === 'duotone') {
        drawLightGizmo(ctx, (lighting.secondaryX / 100) * canvas.width, (lighting.secondaryY / 100) * canvas.height, lighting.secondaryColor, 'Luz de recorte', k);
      }
    }

    // Alças da camada de RP selecionada (só no preview)
    const selCL = canvasLayers.find(l => l.id === selectedCanvasLayerId);
    if (selCL) drawLayerHandles(ctx, selCL);

    // Contorno tracejado da camada selecionada (só no preview, nunca no export)
    const sel = layers.find(l => l.id === selectedLayerId);
    const selImg = sel ? layerImgs.current.get(sel.id) : undefined;
    if (sel && selImg) {
      const r = layerRect(sel, selImg, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(r.cx, r.cy);
      ctx.rotate((sel.rotation * Math.PI) / 180);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = Math.max(2, canvas.width / 600);
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.restore();
    }
  }, [
    layers, selectedLayerId, lightEdit, activeCharId, selectedCanvasLayerId,
    imageSrc, imageDimensions, outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers, darkening, adjustments, rawText, fontSize, fontFamily,
    lineHeightFactor, strokeEnabled, strokeWidth, strokeColor,
    bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled,
    censorStyle, showTimestamps, chatPos, characters
  ]);

  // Publica o chat atual (texto + estilo) para outros módulos, como o GIF Lab
  useEffect(() => {
    publishChat({
      style: {
        rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
        strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
        showTimestamps, chatPos
      },
      refWidth: canvasDims.width,
      refHeight: canvasDims.height
    });
  }, [
    rawText, characters, fontSize, fontFamily, lineHeightFactor, strokeEnabled, strokeWidth,
    strokeColor, bgEnabled, bgColor, bgOpacity, maxWidthPercent, shadowEnabled, censorStyle,
    showTimestamps, chatPos, canvasDims.width, canvasDims.height
  ]);

  // Salva configurações (sem a imagem) com debounce de 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
          strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
          maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
          outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers
        }));
      } catch (_) { /* storage bloqueado ou cheio: segue sem persistir */ }
    }, 400);
    return () => clearTimeout(t);
  }, [
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers
  ]);

  const clearSavedData = async () => {
    if (!window.confirm('Apagar as configurações e camadas salvas e restaurar o padrão?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    await clearLayersDb();
    window.location.reload();
  };

  // ---- Modo Lote (ZIP) ----
  const addBatchFiles = (list: FileList | File[]) => {
    const imgs = Array.from(list).filter(f => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    setBatchError(null);
    setBatchFiles(prev => [...prev, ...imgs]);
  };

  const loadImageFromFile = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(file.name)); };
      img.src = url;
    });

  const canvasToBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png')
    );

  // Aplica as configurações atuais a cada foto. Posição e tamanho do texto
  // são proporcionais à largura do preview atual.
  const generateBatchZip = async () => {
    if (batchFiles.length === 0 || batchProgress) return;
    setBatchError(null);
    setBatchProgress({ done: 0, total: batchFiles.length });
    const failed: string[] = [];
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const refW = canvasDims.width || 1280;
      const used = new Set<string>();

      for (let i = 0; i < batchFiles.length; i++) {
        const file = batchFiles[i];
        try {
          const img = await loadImageFromFile(file);
          const w = outputRes ? outputRes.w : (img.naturalWidth || 1280);
          const h = outputRes ? outputRes.h : (img.naturalHeight || 720);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('sem contexto 2D');
          drawScene(ctx, w, h, w / refW, img);
          const blob = await canvasToBlob(canvas);

          const base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_') || 'foto';
          let name = `${base}_chatlog.png`;
          for (let n = 2; used.has(name); n++) name = `${base}_chatlog_${n}.png`;
          used.add(name);
          zip.file(name, blob);
          canvas.width = 0; canvas.height = 0; // libera memória
        } catch (_) {
          failed.push(file.name);
        }
        setBatchProgress({ done: i + 1, total: batchFiles.length });
        await new Promise(r => setTimeout(r, 0)); // deixa a UI respirar
      }

      if (used.size === 0) throw new Error('Nenhuma imagem pôde ser processada.');
      const out = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(out);
      const link = document.createElement('a');
      link.download = `haze-chatlog-lote-${Date.now()}.zip`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      if (failed.length) setBatchError(`${failed.length} arquivo(s) falharam: ${failed.join(', ')}`);
    } catch (err) {
      setBatchError(err instanceof Error ? err.message : 'Erro ao gerar o ZIP.');
    } finally {
      setBatchProgress(null);
    }
  };

  // Handlers de Arrastar com HTML5 Pointer Capture
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pointerX = (e.clientX - rect.left) * scaleX;
    const pointerY = (e.clientY - rect.top) * scaleY;

    // Modo "posicionar luz": arrasta a luz principal (ou a de recorte, se estiver mais perto)
    if (mouseTool === 'light') {
      if (!lighting.enabled) return;
      const W = canvas.width;
      const H = canvas.height;
      let which: 'main' | 'secondary' = 'main';
      if (lighting.sourceType === 'duotone') {
        const dMain = Math.hypot(pointerX - (lighting.x / 100) * W, pointerY - (lighting.y / 100) * H);
        const dSec = Math.hypot(pointerX - (lighting.secondaryX / 100) * W, pointerY - (lighting.secondaryY / 100) * H);
        if (dSec < dMain) which = 'secondary';
      }
      lightDragRef.current = which;
      layerDragRef.current = null;
      setIsDragging(true);
      patchLighting(which === 'main'
        ? { x: Math.max(0, Math.min(100, (pointerX / W) * 100)), y: Math.max(0, Math.min(100, (pointerY / H) * 100)) }
        : { secondaryX: Math.max(0, Math.min(100, (pointerX / W) * 100)), secondaryY: Math.max(0, Math.min(100, (pointerY / H) * 100)) });
      return;
    }

    // Ferramenta "Enquadrar foto": arrastar desloca a foto dentro da resolução (pan)
    if (mouseTool === 'photo') {
      photoDragRef.current = { x: pointerX, y: pointerY, panX, panY };
      layerDragRef.current = null;
      lightDragRef.current = null;
      setIsDragging(true);
      return;
    }

    // Ferramenta "Mover camada": clique seleciona e arrasta; clique no vazio deseleciona
    if (mouseTool === 'layer') {
      // a) alças (redimensionar/girar) do elemento de RP selecionado
      const selRP = canvasLayers.find(l => l.id === selectedCanvasLayerId);
      if (selRP) {
        const mode = hitTestHandles(selRP, pointerX, pointerY);
        if (mode && mode !== 'move') {
          canvasDragRef.current = { id: selRP.id, state: startHandleDrag(selRP, mode, pointerX, pointerY) };
          layerDragRef.current = null;
          setIsDragging(true);
          return;
        }
      }
      // b) corpo de um elemento de RP (do topo para baixo)
      for (let i = canvasLayers.length - 1; i >= 0; i--) {
        const l = canvasLayers[i];
        if (hitTestLayerBody(l, pointerX, pointerY)) {
          setSelectedCanvasLayerId(l.id);
          setSelectedLayerId(null);
          canvasDragRef.current = {
            id: l.id,
            state: { ...EMPTY_DRAG, mode: 'move', startX: pointerX, startY: pointerY, layerStartX: l.x, layerStartY: l.y, layerStartW: l.width, layerStartH: l.height, layerStartRot: l.rotation || 0 }
          };
          layerDragRef.current = null;
          setIsDragging(true);
          return;
        }
      }
      canvasDragRef.current = null;
      // c) camadas de imagem
      const hit = hitTestLayer(pointerX, pointerY, canvas.width, canvas.height);
      if (hit) {
        setSelectedLayerId(hit.id);
        setSelectedCanvasLayerId(null);
        layerDragRef.current = {
          id: hit.id,
          offX: pointerX - hit.cx * canvas.width,
          offY: pointerY - hit.cy * canvas.height
        };
        setIsDragging(true);
        return;
      }
      setSelectedLayerId(null);
      setSelectedCanvasLayerId(null);
      return;
    }

    // Ferramenta "Texto chat" (padrão): arrasta o bloco de texto
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
    setIsDragging(true);
    setDragOffset({ x: pointerX - chatPos.x, y: pointerY - chatPos.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const pointerX = (e.clientX - rect.left) * scaleX;
    const pointerY = (e.clientY - rect.top) * scaleY;

    const cd = canvasDragRef.current;
    if (cd) {
      const target = canvasLayers.find(l => l.id === cd.id);
      if (target && !target.locked) {
        const changes = applyLayerDrag(target, cd.state, pointerX, pointerY, e.shiftKey);
        if (changes) setCanvasLayers(prev => prev.map(l => (l.id === cd.id ? { ...l, ...changes } : l)));
      }
      return;
    }

    const pd = photoDragRef.current;
    if (pd) {
      setPanX(Math.round(Math.max(-100, Math.min(100, pd.panX + ((pointerX - pd.x) / canvas.width) * 100))));
      setPanY(Math.round(Math.max(-100, Math.min(100, pd.panY + ((pointerY - pd.y) / canvas.height) * 100))));
      return;
    }

    if (lightDragRef.current) {
      const px = Math.max(0, Math.min(100, (pointerX / canvas.width) * 100));
      const py = Math.max(0, Math.min(100, (pointerY / canvas.height) * 100));
      patchLighting(lightDragRef.current === 'main' ? { x: px, y: py } : { secondaryX: px, secondaryY: py });
      return;
    }

    const ld = layerDragRef.current;
    if (ld) {
      updateLayer(ld.id, {
        cx: Math.max(0, Math.min(1, (pointerX - ld.offX) / canvas.width)),
        cy: Math.max(0, Math.min(1, (pointerY - ld.offY) / canvas.height))
      });
      return;
    }

    setChatPos({
      x: Math.max(0, Math.min(canvas.width - 100, pointerX - dragOffset.x)),
      y: Math.max(0, Math.min(canvas.height - 50, pointerY - dragOffset.y))
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    layerDragRef.current = null;
    lightDragRef.current = null;
    photoDragRef.current = null;
    canvasDragRef.current = null;
    setIsDragging(false);
    if (previewCanvasRef.current?.hasPointerCapture(e.pointerId)) {
      try {
        previewCanvasRef.current.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
  };

  // Exportação Segura 2x com Canvas toBlob
  // Renderiza a cena final em 2× e devolve o PNG (usado por Exportar e Copiar)
  const renderExportBlob = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const exportCanvas = document.createElement('canvas');
      const scale = 2;
      exportCanvas.width = canvasDims.width * scale;
      exportCanvas.height = canvasDims.height * scale;

      const ctx = exportCanvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas indisponível')); return; }

      drawScene(ctx, exportCanvas.width, exportCanvas.height, scale);
      exportCanvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem'))),
        'image/png'
      );
    });

  const exportImage = async () => {
    try {
      const blob = await renderExportBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `haze-chatlog-${Date.now()}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Não foi possível exportar.', 'error');
    }
  };

  // Aviso curto (toast) para feedback de ações
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const showNotice = (text: string, kind: 'ok' | 'error' = 'ok') => {
    setNotice({ text, kind });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // Restaura as camadas salvas ao abrir o app
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { layers: savedLayers, blobs } = await loadLayersFromDb();
        if (cancelled) return;
        const imgsByBlob = new Map<string, HTMLImageElement>();
        for (const [blobId, blob] of blobs) {
          const url = URL.createObjectURL(blob);
          try {
            imgsByBlob.set(blobId, await new Promise<HTMLImageElement>((res, rej) => {
              const i = new Image();
              i.onload = () => res(i);
              i.onerror = () => rej(new Error('imagem inválida'));
              i.src = url;
            }));
          } catch (_) { /* arquivo corrompido: ignora essa camada */ }
          finally { URL.revokeObjectURL(url); }
        }
        if (cancelled) return;
        const ok = savedLayers.filter(l => imgsByBlob.has(l.blobId));
        blobs.forEach((b, id) => { layerBlobs.current.set(id, b); storedBlobIds.current.add(id); });
        ok.forEach(l => layerImgs.current.set(l.id, imgsByBlob.get(l.blobId)!));
        if (ok.length) setLayers(prev => (prev.length ? prev : ok));
      } catch (_) {
        /* sem IndexedDB (ex.: janela privada): o app segue sem salvar camadas */
      } finally {
        if (!cancelled) layersLoaded.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Salva as camadas (com debounce) sempre que a lista muda
  useEffect(() => {
    if (!layersLoaded.current) return;
    const t = setTimeout(() => {
      saveLayersToDb(layers, layerBlobs.current, storedBlobIds.current).catch((err) => {
        if (err instanceof Error && err.message === 'IndexedDB indisponível') return;
        const full = err?.name === 'QuotaExceededError';
        showNotice(full ? 'Armazenamento cheio: as camadas não foram salvas.' : 'Não foi possível salvar as camadas.', 'error');
      });
    }, 500);
    return () => clearTimeout(t);
  }, [layers]);

  // Copia a imagem final (PNG 2×) para a área de transferência.
  // Passa a Promise do blob ao ClipboardItem para manter o gesto do usuário válido durante a renderização.
  const copyImage = async () => {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      showNotice('Este navegador não permite copiar imagens. Use Exportar.', 'error');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderExportBlob() })]);
      showNotice('Imagem copiada! Cole com Ctrl+V.');
    } catch (err) {
      const denied = err instanceof DOMException && err.name === 'NotAllowedError';
      showNotice(
        denied ? 'Permissão negada para copiar. Libere o acesso à área de transferência ou use Exportar.' : 'Não foi possível copiar a imagem. Use Exportar.',
        'error'
      );
    }
  };

  // ---- Desfazer / Refazer (snapshots das configurações, com debounce) ----
  const snapshot = {
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers
  };
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  const pastRef = useRef<string[]>([]);
  const futureRef = useRef<string[]>([]);
  const committedRef = useRef<string | null>(null);
  const [histCount, setHistCount] = useState({ past: 0, future: 0 });
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Modo foco (esconde os controles) e medida da área do preview para ajustar o canvas
  const [focusMode, setFocusMode] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const HISTORY_LIMIT = 100;

  // Roda do mouse: zoom da foto (ferramenta Foto) ou tamanho da camada selecionada (ferramenta Camada)
  useEffect(() => {
    const cv = previewCanvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      const f = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      if (mouseTool === 'photo') {
        e.preventDefault();
        setZoom(z => Math.round(Math.max(25, Math.min(400, z * f))));
      } else if (mouseTool === 'layer' && selectedCanvasLayerId) {
        e.preventDefault();
        setCanvasLayers(prev => prev.map(l => {
          if (l.id !== selectedCanvasLayerId || l.type === 'preset' || l.locked) return l;
          const w = Math.max(20, Math.round(l.width * f));
          const h = Math.max(20, Math.round(l.height * f));
          return { ...l, width: w, height: h, x: Math.round(l.x - (w - l.width) / 2), y: Math.round(l.y - (h - l.height) / 2) };
        }));
      } else if (mouseTool === 'layer' && selectedLayerId) {
        e.preventDefault();
        setLayers(prev => prev.map(l =>
          l.id === selectedLayerId ? { ...l, widthPct: Math.max(2, Math.min(200, l.widthPct * f)) } : l
        ));
      }
    };
    cv.addEventListener('wheel', onWheel, { passive: false });
    return () => cv.removeEventListener('wheel', onWheel);
  }, [mouseTool, selectedLayerId, selectedCanvasLayerId]);

  const syncHistCount = () => setHistCount({ past: pastRef.current.length, future: futureRef.current.length });

  // Registra mudanças 500ms após o usuário parar (agrupa arrastes de slider e digitação)
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = JSON.stringify(snapshotRef.current);
      if (committedRef.current === null) { committedRef.current = cur; return; }
      if (cur === committedRef.current) return;
      pastRef.current.push(committedRef.current);
      if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
      futureRef.current = [];
      committedRef.current = cur;
      syncHistCount();
    }, 500);
    return () => clearTimeout(t);
  }, [
    darkening, adjustments, rawText, fontSize, fontFamily, lineHeightFactor,
    strokeEnabled, strokeWidth, strokeColor, bgEnabled, bgColor, bgOpacity,
    maxWidthPercent, shadowEnabled, censorStyle, showTimestamps, chatPos, characters,
    outputRes, fitMode, panX, panY, zoom, lighting, camera, canvasLayers
  ]);

  const applySnapshot = (json: string) => {
    const s = JSON.parse(json);
    setDarkening(s.darkening); setAdjustments(s.adjustments); setRawText(s.rawText);
    setFontSize(s.fontSize); setFontFamily(s.fontFamily); setLineHeightFactor(s.lineHeightFactor);
    setStrokeEnabled(s.strokeEnabled); setStrokeWidth(s.strokeWidth); setStrokeColor(s.strokeColor);
    setBgEnabled(s.bgEnabled); setBgColor(s.bgColor); setBgOpacity(s.bgOpacity);
    setMaxWidthPercent(s.maxWidthPercent); setShadowEnabled(s.shadowEnabled);
    setCensorStyle(s.censorStyle); setShowTimestamps(s.showTimestamps);
    setChatPos(s.chatPos); setCharacters(s.characters);
    setOutputRes(s.outputRes); setFitMode(s.fitMode);
    setPanX(s.panX); setPanY(s.panY); setZoom(s.zoom);
    setLighting(sanitizeLighting(s.lighting));
    setCamera(sanitizeCamera(s.camera));
    setCanvasLayers(sanitizeCanvasLayers(s.canvasLayers));
    if (s.outputRes) { setCustomW(String(s.outputRes.w)); setCustomH(String(s.outputRes.h)); }
  };

  // Antes de desfazer/refazer, grava como passo qualquer mudança ainda pendente no debounce
  const flushPending = () => {
    const cur = JSON.stringify(snapshotRef.current);
    if (committedRef.current !== null && cur !== committedRef.current) {
      pastRef.current.push(committedRef.current);
      futureRef.current = [];
      committedRef.current = cur;
    }
  };

  const undo = () => {
    flushPending();
    const prev = pastRef.current.pop();
    if (prev === undefined || committedRef.current === null) { syncHistCount(); return; }
    futureRef.current.push(committedRef.current);
    committedRef.current = prev;
    applySnapshot(prev);
    syncHistCount();
  };

  const redo = () => {
    flushPending();
    const next = futureRef.current.pop();
    if (next === undefined || committedRef.current === null) { syncHistCount(); return; }
    pastRef.current.push(committedRef.current);
    committedRef.current = next;
    applySnapshot(next);
    syncHistCount();
  };

  const nudgeChat = (dx: number, dy: number) => {
    setChatPos(p => ({
      x: Math.max(0, Math.min(canvasDims.width - 100, p.x + dx)),
      y: Math.max(0, Math.min(canvasDims.height - 50, p.y + dy))
    }));
  };

  // Atalhos globais (só quando a aba do Chat Log está visível)
  const deleteSelectedLayer = () => {
    if (selectedCanvasLayerId) deleteCanvasLayer(selectedCanvasLayerId);
    else if (selectedLayerId) removeLayer(selectedLayerId);
  };
  const shortcutsRef = useRef({ undo, redo, exportImage, copyImage, nudgeChat, insertCharSpeech, characters, deleteSelectedLayer });
  shortcutsRef.current = { undo, redo, exportImage, copyImage, nudgeChat, insertCharSpeech, characters, deleteSelectedLayer };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = containerRef.current;
      if (!el || el.offsetParent === null || el.closest('.hidden')) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const isText = tag === 'TEXTAREA' || tag === 'SELECT' ||
        (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'file', 'color'].includes((t as HTMLInputElement).type)) ||
        !!t?.isContentEditable;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = shortcutsRef.current;

      if (mod && k === 's') { e.preventDefault(); s.exportImage(); return; }
      if (e.key === 'Escape') { setShowShortcuts(false); setFocusMode(false); return; }
      if (isText) return;
      if (!mod && !e.altKey && k === 'f') { setFocusMode(v => !v); return; }
      if (!mod && !e.altKey && /^[1-4]$/.test(e.key)) {
        setMouseTool((['chat', 'photo', 'layer', 'light'] as const)[parseInt(e.key) - 1]);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && t === previewCanvasRef.current) {
        e.preventDefault();
        s.deleteSelectedLayer();
        return;
      } // em campos de texto o Ctrl+Z nativo do navegador continua valendo

      // Ctrl+C copia a imagem final, exceto se houver texto selecionado na página
      if (mod && k === 'c' && !e.shiftKey && !e.altKey && !window.getSelection()?.toString()) {
        e.preventDefault();
        s.copyImage();
        return;
      }
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); s.undo(); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); s.redo(); return; }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const c = s.characters[parseInt(e.key) - 1];
        if (c) { e.preventDefault(); s.insertCharSpeech(c.name); }
        return;
      }
      // Setas movem o chat só com o canvas focado (clique nele), para não travar a rolagem da página
      if (!mod && !e.altKey && e.key.startsWith('Arrow') && t === previewCanvasRef.current) {
        const step = e.shiftKey ? 10 : 1;
        const d: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step]
        };
        e.preventDefault();
        s.nudgeChat(d[e.key][0], d[e.key][1]);
        return;
      }
      if (e.key === '?' ) { setShowShortcuts(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={containerRef} className="max-w-[1800px] mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

      {/* Aviso de feedback (copiar/exportar) */}
      <div aria-live="polite" role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
        {notice && (
          <div className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-xl border ${
            notice.kind === 'ok'
              ? 'bg-emerald-500 text-slate-950 border-emerald-300'
              : 'bg-rose-950 text-rose-200 border-rose-500/50'
          }`}>
            {notice.text}
          </div>
        )}
      </div>
      
      {/* Coluna da Esquerda: Controles (4 cols) */}
      <div className={focusMode ? 'hidden' : 'lg:col-span-4 xl:col-span-3 space-y-4 min-w-0'}>

        {/* Alternador de modo: Foto individual / Lote (ZIP) */}
        <div role="tablist" aria-label="Modo de trabalho" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#121722] border border-[#1E2638]">
          {([['single', 'Foto individual'], ['batch', 'Lote (ZIP)']] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              onClick={() => setMode(key)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === key ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Desfazer / Refazer / Atalhos */}
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={histCount.past === 0}
            aria-label="Desfazer (Ctrl+Z)"
            title="Desfazer (Ctrl+Z)"
            className="flex-1 py-1.5 rounded-lg text-[11px] border border-[#1E2638] text-slate-300 hover:border-emerald-500/40 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            ↶ Desfazer{histCount.past ? ` (${histCount.past})` : ''}
          </button>
          <button
            onClick={redo}
            disabled={histCount.future === 0}
            aria-label="Refazer (Ctrl+Y)"
            title="Refazer (Ctrl+Y)"
            className="flex-1 py-1.5 rounded-lg text-[11px] border border-[#1E2638] text-slate-300 hover:border-emerald-500/40 disabled:opacity-35 disabled:cursor-not-allowed"
          >
            Refazer ↷
          </button>
          <button
            onClick={() => setShowShortcuts(v => !v)}
            aria-expanded={showShortcuts}
            aria-label="Atalhos de teclado"
            title="Atalhos de teclado (?)"
            className="px-3 py-1.5 rounded-lg text-[11px] border border-[#1E2638] text-slate-300 hover:border-emerald-500/40"
          >
            ⌨
          </button>
        </div>

        {showShortcuts && (
          <div role="region" aria-label="Atalhos de teclado" className="p-3 rounded-xl bg-[#121722] border border-emerald-500/30 text-[11px] text-slate-300 space-y-1">
            {[
              ['Ctrl+Z', 'Desfazer (fora de campos de texto)'],
              ['Ctrl+Y / Ctrl+Shift+Z', 'Refazer'],
              ['Ctrl+S', 'Exportar PNG 2×'],
              ['Ctrl+C (fora de campos de texto)', 'Copiar imagem final'],
              ['Alt+1…9', 'Inserir fala do personagem nº'],
              ['Setas (canvas focado)', 'Mover o chat 1px (Shift = 10px)'],
              ['Ctrl+V', 'Colar print como fundo'],
              ['Del (canvas focado)', 'Remover a camada selecionada'],
              ['1 / 2 / 3 / 4', 'Ferramenta: Texto, Foto, Camada, Luz'],
              ['Roda do mouse', 'Zoom da foto ou tamanho da camada'],
              ['F', 'Modo foco (preview maior)'],
              ['?', 'Mostrar/ocultar esta lista'],
              ['Esc', 'Fechar / sair do modo foco']
            ].map(([k, d]) => (
              <div key={k} className="flex justify-between gap-3">
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] whitespace-nowrap">{k}</kbd>
                <span className="text-right">{d}</span>
              </div>
            ))}
          </div>
        )}

        {mode === 'batch' && (
          <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Lote de fotos</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Aplica o chat e os ajustes atuais a todas as fotos e baixa um .zip. Posição e tamanho do texto
              acompanham o preview ({canvasDims.width}px de largura).{' '}
              {outputRes ? `Todas saem em ${outputRes.w}×${outputRes.h}.` : 'Cada foto sai na resolução original.'}
            </p>
            <input
              ref={batchInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) addBatchFiles(e.target.files); e.target.value = ''; }}
            />
            <div
              onClick={() => batchInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
              onDrop={(e) => { e.preventDefault(); addBatchFiles(e.dataTransfer.files); }}
              className="cursor-pointer border-2 border-dashed border-[#1E2638] hover:border-emerald-500/50 rounded-xl p-4 text-center text-xs text-slate-300"
            >
              Clique ou arraste várias fotos
            </div>

            {batchFiles.length > 0 && (
              <ul className="max-h-40 overflow-y-auto space-y-1 text-[11px] text-slate-300">
                {batchFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-[#0B0E14]">
                    <span className="truncate">{f.name}</span>
                    <button
                      aria-label={`Remover ${f.name}`}
                      disabled={!!batchProgress}
                      onClick={() => setBatchFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-slate-500 hover:text-rose-400 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {batchProgress && (
              <div>
                <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{batchProgress.done}/{batchProgress.total} processadas</p>
              </div>
            )}
            {batchError && <p role="alert" className="text-[11px] text-rose-400">{batchError}</p>}

            <div className="flex gap-2">
              <button
                onClick={generateBatchZip}
                disabled={batchFiles.length === 0 || !!batchProgress}
                className="flex-1 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {batchProgress ? 'Gerando…' : `Gerar ZIP (${batchFiles.length})`}
              </button>
              <button
                onClick={() => { setBatchFiles([]); setBatchError(null); }}
                disabled={batchFiles.length === 0 || !!batchProgress}
                className="px-3 py-2 rounded-lg text-xs border border-[#1E2638] text-slate-300 disabled:opacity-40"
              >
                Limpar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={clearSavedData}
          className="w-full text-[11px] text-slate-500 hover:text-slate-300 underline-offset-2 hover:underline"
        >
          Restaurar configurações padrão
        </button>

        {/* Painel de Upload de Fundo com Drag & Drop */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Fundo da Cena
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {canvasDims.width}×{canvasDims.height}px
            </span>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`group cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${
              isDraggingFile 
                ? 'border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-500/30' 
                : 'border-[#1E2638] hover:border-emerald-500/50 bg-[#0B0E14]/40 hover:bg-emerald-500/[0.02]'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
              accept="image/*"
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2">
              <div className="p-2.5 rounded-full bg-slate-800/60 text-slate-400 group-hover:text-emerald-400 transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <p className="text-xs font-medium text-slate-300">
                Clique ou arraste um print do RP
              </p>
              <p className="text-[10px] text-slate-500">
                PNG, JPG, WebP ou cole com <kbd className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[9px]">Ctrl+V</kbd>
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-[#1E2638] flex items-center justify-between text-xs">
            <span className="text-slate-400">Escurecimento</span>
            <div className="flex items-center gap-2 w-1/2">
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.05"
                value={darkening}
                onChange={(e) => setDarkening(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="font-mono text-slate-300 text-[11px] w-8 text-right">
                {Math.round(darkening * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Painel de Resolução & Adaptação da foto */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Resolução &amp; Adaptação</span>
            <span className="text-[11px] font-mono text-slate-300">
              {outputRes ? `${outputRes.w}×${outputRes.h}` : 'Original'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Resolução de exportação">
            {RESOLUTION_PRESETS.map(p => {
              const active = p.size === null
                ? outputRes === null
                : outputRes?.w === p.size.w && outputRes?.h === p.size.h;
              return (
                <button
                  key={p.label}
                  aria-pressed={active}
                  onClick={() => changeResolution(p.size)}
                  className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                    active ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number" min={MIN_RES} max={MAX_RES} value={customW} aria-label="Largura personalizada"
              onChange={(e) => setCustomW(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCustomResolution()}
              className="w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 font-mono"
            />
            <span className="text-slate-500 text-xs">×</span>
            <input
              type="number" min={MIN_RES} max={MAX_RES} value={customH} aria-label="Altura personalizada"
              onChange={(e) => setCustomH(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyCustomResolution()}
              className="w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 font-mono"
            />
            <button
              onClick={applyCustomResolution}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10"
            >
              Aplicar
            </button>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 block mb-1">Modo de adaptação da foto</span>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Modo de adaptação">
              {([['cover', 'Cover'], ['contain', 'Contain'], ['stretch', 'Esticar']] as const).map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={fitMode === key}
                  onClick={() => setFitMode(key)}
                  className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                    fitMode === key ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#1E2638]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Mover foto na resolução</span>
              <button onClick={resetFraming} className="text-[11px] text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline">
                Centralizar
              </button>
            </div>
            {([
              ['Pan X (horizontal)', panX, setPanX, -100, 100, 1, '%'],
              ['Pan Y (vertical)', panY, setPanY, -100, 100, 1, '%'],
              ['Zoom da foto', zoom, setZoom, 25, 400, 1, '%']
            ] as const).map(([label, value, setter, min, max, step, unit]) => (
              <div key={label}>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>{label}</span>
                  <span className="font-mono text-slate-200">{value}{unit}</span>
                </div>
                <input
                  type="range" min={min} max={max} step={step} value={value} aria-label={label}
                  onChange={(e) => setter(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Painel de Camadas & Overlays */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Camadas &amp; Overlays</span>
            <span className="text-[11px] font-mono text-slate-300">{layers.length} camada{layers.length === 1 ? '' : 's'}</span>
          </div>

          <input
            ref={layerInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files) addLayerFiles(e.target.files); e.target.value = ''; }}
          />
          <button
            onClick={() => layerInputRef.current?.click()}
            disabled={layers.length >= MAX_LAYERS}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={(e) => { e.preventDefault(); addLayerFiles(e.dataTransfer.files); }}
            className="w-full py-2 rounded-lg border border-dashed border-[#1E2638] hover:border-emerald-500/50 text-xs text-slate-300 disabled:opacity-40"
          >
            + Adicionar camada de imagem
          </button>

          {layers.length === 0 ? (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Sobreponha logos, molduras, marcas d'água ou fotos secundárias (PNG com transparência funciona melhor).
              Use a ferramenta Mover camada (3) na barra do preview para arrastá-las; a roda do mouse muda o tamanho. As camadas ficam salvas neste navegador.
            </p>
          ) : (
            <ul className="space-y-1" aria-label="Lista de camadas (a de cima é a última da lista)">
              {[...layers].reverse().map((l) => {
                const selected = l.id === selectedLayerId;
                return (
                  <li
                    key={l.id}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] ${
                      selected ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[#1E2638] bg-[#0B0E14]'
                    }`}
                  >
                    <button
                      onClick={() => updateLayer(l.id, { visible: !l.visible })}
                      aria-label={l.visible ? `Ocultar ${l.name}` : `Mostrar ${l.name}`}
                      title={l.visible ? 'Ocultar' : 'Mostrar'}
                      className="px-1 text-slate-400 hover:text-slate-100"
                    >
                      {l.visible ? '👁' : '—'}
                    </button>
                    <button
                      onClick={() => setSelectedLayerId(selected ? null : l.id)}
                      aria-pressed={selected}
                      className="flex-1 min-w-0 text-left truncate text-slate-200"
                      title={l.name}
                    >
                      {l.name}
                    </button>
                    <button onClick={() => moveLayerOrder(l.id, 1)} aria-label={`Subir ${l.name}`} title="Trazer para frente" className="px-1 text-slate-400 hover:text-slate-100">↑</button>
                    <button onClick={() => moveLayerOrder(l.id, -1)} aria-label={`Descer ${l.name}`} title="Enviar para trás" className="px-1 text-slate-400 hover:text-slate-100">↓</button>
                    <button onClick={() => duplicateLayer(l.id)} aria-label={`Duplicar ${l.name}`} title="Duplicar" className="px-1 text-slate-400 hover:text-slate-100">⧉</button>
                    <button onClick={() => removeLayer(l.id)} aria-label={`Remover ${l.name}`} title="Remover" className="px-1 text-slate-500 hover:text-rose-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {(() => {
            const sel = layers.find(l => l.id === selectedLayerId);
            if (!sel) return null;
            return (
              <div className="space-y-2 pt-2 border-t border-[#1E2638]">
                {([
                  ['Tamanho (largura)', Math.round(sel.widthPct), 2, 200, '%', (v: number) => updateLayer(sel.id, { widthPct: v })],
                  ['Rotação', Math.round(sel.rotation), -180, 180, '°', (v: number) => updateLayer(sel.id, { rotation: v })],
                  ['Opacidade', Math.round(sel.opacity * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { opacity: v / 100 })],
                  ['Posição X', Math.round(sel.cx * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { cx: v / 100 })],
                  ['Posição Y', Math.round(sel.cy * 100), 0, 100, '%', (v: number) => updateLayer(sel.id, { cy: v / 100 })]
                ] as const).map(([label, value, min, max, unit, onChange]) => (
                  <div key={label}>
                    <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                      <span>{label}</span>
                      <span className="font-mono text-slate-200">{value}{unit}</span>
                    </div>
                    <input
                      type="range" min={min} max={max} value={value} aria-label={label}
                      onChange={(e) => onChange(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                    />
                  </div>
                ))}
                <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sel.aboveChat}
                    onChange={(e) => updateLayer(sel.id, { aboveChat: e.target.checked })}
                    className="accent-emerald-500"
                  />
                  Desenhar acima do texto do chat
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => updateLayer(sel.id, { cx: 0.5, cy: 0.5 })}
                    className="py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Centralizar
                  </button>
                  <button
                    onClick={() => updateLayer(sel.id, { widthPct: 100, cx: 0.5, rotation: 0 })}
                    className="py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Ajustar à largura
                  </button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Elementos de RP: presets cinemáticos, adesivos, texto (antigo Canvas Studio) */}
        <details open className="rounded-2xl bg-[#0F141F] border border-[#1E2638] shadow-md">
          <summary className="cursor-pointer select-none px-4 py-3 text-xs font-bold uppercase tracking-wider text-emerald-400">
            Elementos de RP · presets, adesivos e texto
          </summary>
          <div className="px-2 pb-3 space-y-3">
            <CanvasLayersSidebar
              layers={canvasLayers}
              setLayers={setCanvasLayers}
              selectedLayerId={selectedCanvasLayerId}
              setSelectedLayerId={(id) => { setSelectedCanvasLayerId(id); if (id) setSelectedLayerId(null); }}
              applyPreset={applyPreset}
              addSticker={addSticker}
              addTextLayer={addTextLayer}
              moveLayer={moveCanvasLayer}
              bringLayerToFront={bringCanvasLayerToFront}
              sendLayerToBack={sendCanvasLayerToBack}
              duplicateLayer={duplicateCanvasLayer}
              deleteLayer={deleteCanvasLayer}
              updateSelectedLayer={updateSelectedCanvasLayer}
              updatePresetDataField={updateCanvasPresetField}
            />
          </div>
        </details>

        {/* Painel de Câmera RP & Efeitos */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Câmera RP &amp; Efeitos</span>
            <span className="text-[11px] font-mono text-slate-300">
              {({ none: 'Padrão', bodycam: 'Bodycam', cctv: 'CCTV', noir: 'Noite Fria' } as const)[camera.preset]}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Preset de câmera">
            {([['none', 'Padrão'], ['bodycam', 'Bodycam'], ['cctv', 'CCTV'], ['noir', 'Noite Fria']] as const).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={camera.preset === key}
                onClick={() => {
                  // clicar no preset ativo volta ao Padrão
                  const next: CameraPreset = camera.preset === key && key !== 'none' ? 'none' : key;
                  setCamera(c => ({ ...c, preset: next, effects: { ...CAMERA_PRESET_EFFECTS[next] } }));
                }}
                className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                  camera.preset === key ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {(() => {
            const now = new Date();
            const p2 = (n: number) => String(n).padStart(2, '0');
            const nowDate = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
            const nowTime = `${p2(now.getHours())}:${p2(now.getMinutes())}:${p2(now.getSeconds())}`;
            const setCustom = (patch: Partial<CameraState['custom']>) =>
              setCamera(c => ({ ...c, custom: { ...c.custom, ...patch } }));
            const field = (label: string, key: keyof CameraState['custom'], placeholder: string) => (
              <label key={key} className="text-[11px] text-slate-400">
                {label}
                <input
                  type="text" maxLength={48} value={camera.custom[key]} placeholder={placeholder}
                  onChange={(e) => setCustom({ [key]: e.target.value } as Partial<CameraState['custom']>)}
                  className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200 font-mono placeholder:text-slate-600"
                />
              </label>
            );
            if (camera.preset === 'bodycam') {
              return (
                <div className="grid grid-cols-2 gap-2">
                  {field('Data', 'bodycamDate', nowDate)}
                  {field('Hora', 'bodycamTime', nowTime)}
                  {field('Departamento', 'bodycamDept', 'POLICE / SHERIFF')}
                  {field('Oficial', 'bodycamOfficer', activeChar?.name ?? 'M. MENDOZA')}
                  <button
                    onClick={() => setCustom({ bodycamDate: nowDate, bodycamTime: nowTime })}
                    className="col-span-2 py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Usar data e hora de agora
                  </button>
                </div>
              );
            }
            if (camera.preset === 'cctv') {
              return (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">{field('Nome da câmera', 'cctvCamName', 'CAM 03 [SURVEILLANCE HQ]')}</div>
                  {field('Data', 'cctvDate', nowDate)}
                  {field('Hora', 'cctvTime', nowTime)}
                  <div className="col-span-2">{field('Informação (canto superior)', 'cctvLocation', 'PAL 25FPS · 1080P · LIVE')}</div>
                  <button
                    onClick={() => setCustom({ cctvDate: nowDate, cctvTime: nowTime })}
                    className="col-span-2 py-1.5 rounded-lg border border-[#1E2638] text-[11px] text-slate-300 hover:border-emerald-500/40"
                  >
                    Usar data e hora de agora
                  </button>
                </div>
              );
            }
            return null;
          })()}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-slate-400">Efeitos de filme</span>
              <button
                onClick={() => setCamera(c => ({ ...c, effects: { ...NO_EFFECTS } }))}
                className="text-[11px] text-slate-300 hover:text-emerald-300 underline-offset-2 hover:underline"
              >
                Limpar
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Efeitos de filme">
              {EFFECT_LABELS.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={camera.effects[key]}
                  onClick={() => setCamera(c => ({ ...c, effects: { ...c.effects, [key]: !c.effects[key] } }))}
                  className={`py-1.5 rounded-lg text-[11px] border transition-colors ${
                    camera.effects[key] ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Painel de Iluminação & Luz Colorida */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Iluminação &amp; Luz Colorida</span>
            <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={lighting.enabled}
                onChange={(e) => { patchLighting({ enabled: e.target.checked }); if (!e.target.checked && mouseTool === 'light') setMouseTool('chat'); }}
                className="accent-emerald-500"
                aria-label="Ativar iluminação"
              />
              <span className={lighting.enabled ? 'text-emerald-300' : 'text-slate-500'}>{lighting.enabled ? 'ATIVA' : 'DESLIGADA'}</span>
            </label>
          </div>

          {lighting.enabled && (
            <>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Presets de iluminação">
                {LIGHTING_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => patchLighting({ ...p.patch, enabled: true })}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-[#1E2638] hover:border-emerald-500/40 text-[11px] text-slate-300 text-left"
                  >
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.patch.color }} />
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">
                  Tipo de fonte
                  <select
                    value={lighting.sourceType}
                    onChange={(e) => patchLighting({ sourceType: e.target.value as LightSource })}
                    className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200"
                  >
                    {LIGHT_SOURCES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
                <label className="text-[11px] text-slate-400">
                  Mistura
                  <select
                    value={lighting.blendMode}
                    onChange={(e) => patchLighting({ blendMode: e.target.value as GlobalCompositeOperation })}
                    className="mt-1 w-full p-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-[11px] text-slate-200"
                  >
                    {LIGHT_BLENDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Cor da luz</span>
                <input
                  type="color" value={lighting.color} aria-label="Cor da luz"
                  onChange={(e) => patchLighting({ color: e.target.value })}
                  className="w-10 h-6 rounded bg-transparent cursor-pointer"
                />
              </div>

              {([
                ['Intensidade', lighting.intensity, 0, 100, (v: number) => patchLighting({ intensity: v })],
                ['Raio', lighting.radius, 10, 150, (v: number) => patchLighting({ radius: v })],
                ['Suavidade', lighting.softness, 0, 100, (v: number) => patchLighting({ softness: v })],
                ['Posição X', Math.round(lighting.x), 0, 100, (v: number) => patchLighting({ x: v })],
                ['Posição Y', Math.round(lighting.y), 0, 100, (v: number) => patchLighting({ y: v })]
              ] as const).map(([label, value, min, max, onChange]) => (
                <div key={label}>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{label}</span>
                    <span className="font-mono text-slate-200">{value}%</span>
                  </div>
                  <input
                    type="range" min={min} max={max} value={value} aria-label={`Luz: ${label}`}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                  />
                </div>
              ))}

              {lighting.sourceType === 'duotone' && (
                <div className="space-y-2 pt-2 border-t border-[#1E2638]">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Cor da luz de recorte</span>
                    <input
                      type="color" value={lighting.secondaryColor} aria-label="Cor da luz de recorte"
                      onChange={(e) => patchLighting({ secondaryColor: e.target.value })}
                      className="w-10 h-6 rounded bg-transparent cursor-pointer"
                    />
                  </div>
                  {([
                    ['Recorte: intensidade', lighting.secondaryIntensity, (v: number) => patchLighting({ secondaryIntensity: v })],
                    ['Recorte: X', Math.round(lighting.secondaryX), (v: number) => patchLighting({ secondaryX: v })],
                    ['Recorte: Y', Math.round(lighting.secondaryY), (v: number) => patchLighting({ secondaryY: v })]
                  ] as const).map(([label, value, onChange]) => (
                    <div key={label}>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>{label}</span>
                        <span className="font-mono text-slate-200">{value}%</span>
                      </div>
                      <input
                        type="range" min={0} max={100} value={value} aria-label={`Luz: ${label}`}
                        onChange={(e) => onChange(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Posição rápida da luz</span>
                <div className="grid grid-cols-3 gap-1 w-28">
                  {LIGHT_POSITIONS.map(([sym, label, px, py]) => (
                    <button
                      key={label}
                      onClick={() => patchLighting({ x: px, y: py })}
                      title={label}
                      aria-label={`Luz: ${label}`}
                      className="py-1 rounded border border-[#1E2638] text-xs text-slate-300 hover:border-emerald-500/40"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setMouseTool(t => (t === 'light' ? 'chat' : 'light'))}
                aria-pressed={lightEdit}
                className={`w-full py-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                  lightEdit ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/40'
                }`}
              >
                {lightEdit ? '💡 Arrastando a luz no preview (clique para sair)' : '💡 Posicionar luz arrastando no preview'}
              </button>
            </>
          )}
        </div>

        {/* Painel de Tipografia & Estilo do Chat (Feature 10) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Tipografia &amp; Estilo do Chat
            </span>
          </div>

          {/* Fonte & Família */}
          <div className="space-y-2 text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Família da Fonte</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="w-full p-2 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Arial, Helvetica, sans-serif">Arial / GTA Standard</option>
                <option value="ChaletLondonNineteenSixty, Arial, sans-serif">Chalet London (GTA V)</option>
                <option value='"JetBrains Mono", monospace'>JetBrains Mono (Logs / OOC)</option>
                <option value='"Trebuchet MS", sans-serif'>Trebuchet MS</option>
                <option value="Impact, sans-serif">Impact</option>
                <option value="Georgia, serif">Georgia</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Tamanho</span>
                  <span className="font-mono text-slate-200">{fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="48"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                  <span>Espaçamento</span>
                  <span className="font-mono text-slate-200">{lineHeightFactor.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1.1"
                  max="2.2"
                  step="0.05"
                  value={lineHeightFactor}
                  onChange={(e) => setLineHeightFactor(parseFloat(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Contorno GTA & Sombra */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={strokeEnabled}
                  onChange={(e) => setStrokeEnabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Contorno Autêntico GTA</span>
              </label>

              {strokeEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={strokeColor}
                    onChange={(e) => setStrokeColor(e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                    title="Cor do contorno"
                  />
                  <span className="font-mono text-[10px] text-slate-400">{strokeWidth}px</span>
                </div>
              )}
            </div>

            {strokeEnabled && (
              <input
                type="range"
                min="1"
                max="6"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            )}
          </div>

          {/* Fundo do Chat (Highlight Boxes) */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={bgEnabled}
                  onChange={(e) => setBgEnabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <Palette className="w-3.5 h-3.5 text-emerald-400" />
                <span>Caixa de Fundo (Highlight)</span>
              </label>

              {bgEnabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) => setBgColor(e.target.value)}
                    className="w-6 h-6 rounded border border-slate-700 bg-transparent cursor-pointer"
                    title="Cor do fundo"
                  />
                  <span className="font-mono text-[10px] text-slate-400">{Math.round(bgOpacity * 100)}%</span>
                </div>
              )}
            </div>

            {bgEnabled && (
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bgOpacity}
                onChange={(e) => setBgOpacity(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
              />
            )}
          </div>

          {/* Largura Máxima, Estilo de Censura e Timestamps */}
          <div className="pt-2 border-t border-[#1E2638] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Largura Máx. Chat</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={maxWidthPercent}
                  onChange={(e) => setMaxWidthPercent(parseInt(e.target.value))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] text-slate-300 w-8 text-right">{maxWidthPercent}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400">Estilo de Censura</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCensorStyle('mosaic')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    censorStyle === 'mosaic'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#1E2638]'
                  }`}
                >
                  Mosaico
                </button>
                <button
                  onClick={() => setCensorStyle('solid')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    censorStyle === 'solid'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#0B0E14] text-slate-400 border border-[#1E2638]'
                  }`}
                >
                  Tarja Preta
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={showTimestamps}
                  onChange={(e) => setShowTimestamps(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>Exibir Timestamps [HH:MM:SS]</span>
              </label>
            </div>
          </div>
        </div>

        {/* Laboratório Fotográfico (Retoque de Imagem estilo Photoshop) */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" /> Retoque Fotográfico (Color Grading)
            </span>
            <button
              onClick={() => setAdjustments({ ...DEFAULT_ADJUSTMENTS })}
              className="text-[10px] text-slate-400 hover:text-emerald-400"
            >
              Resetar
            </button>
          </div>

          {/* Color Grading Presets */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'golden-hour' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'golden-hour'
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-amber-400" /> Golden Hour</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'midnight-neon' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'midnight-neon'
                  ? 'border-sky-500 bg-sky-500/15 text-sky-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-sky-400" /> Midnight Neon</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'grit-crime' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'grit-crime'
                  ? 'border-red-500 bg-red-500/15 text-red-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Contrast className="w-3.5 h-3.5 text-red-400" /> Grit &amp; Crime</div>
            </button>

            <button
              onClick={() => setAdjustments(prev => ({ ...prev, colorPreset: 'vintage-90s' }))}
              className={`px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                adjustments.colorPreset === 'vintage-90s'
                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300 font-semibold'
                  : 'border-[#1E2638] bg-[#0B0E14] text-slate-400 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-1.5"><Flame className="w-3.5 h-3.5 text-emerald-400" /> San Andreas 90s</div>
            </button>
          </div>

          {/* Sliders de Ajuste Fino */}
          <div className="space-y-2 pt-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Brilho</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.brightness}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.brightness}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Contraste</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="-50" max="50" value={adjustments.contrast}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, contrast: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.contrast}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Nitidez (Sharpen)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.sharpen}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, sharpen: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.sharpen}%</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">Depth of Field (Bokeh)</span>
              <div className="flex items-center gap-2 w-1/2">
                <input
                  type="range" min="0" max="100" value={adjustments.depthOfField}
                  onChange={(e) => setAdjustments(prev => ({ ...prev, depthOfField: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500 h-1 bg-slate-800 rounded cursor-pointer"
                />
                <span className="font-mono text-[10px] w-6 text-right text-slate-300">{adjustments.depthOfField}%</span>
              </div>
            </div>
          </div>

          {/* Letterbox de Cinema */}
          <div className="pt-2 border-t border-[#1E2638] flex items-center justify-between text-xs">
            <button
              onClick={() => setAdjustments(prev => ({ ...prev, letterbox: !prev.letterbox }))}
              className={`w-full py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all font-semibold ${
                adjustments.letterbox
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                  : 'bg-[#0B0E14] border-[#1E2638] text-slate-400 hover:text-white'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              <span>{adjustments.letterbox ? 'Letterbox 21:9 Ativo (Barras de Cinema)' : 'Ativar Letterbox 21:9 (Cinema)'}</span>
            </button>
          </div>
        </div>

        {/* Editor de Texto do Chat */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5" /> Diálogos &amp; Ações
            </span>
            <span className="text-[10px] text-slate-500">
              * /me, &gt; /ame, $ din, (( ooc ))
            </span>
          </div>

          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={6}
            className="w-full p-3 rounded-xl bg-[#0B0E14] border border-[#1E2638] text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-y"
            placeholder="Digite ou cole as falas do chat aqui..."
          />

          <div>
            <span className="text-[11px] text-slate-400 block mb-1.5">
              Tom de voz · fala de <strong style={{ color: activeChar?.color }}>{activeChar?.name ?? 'Personagem'}</strong>
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['Fala', 'normal', 'Fala normal', '#ffffff'],
                ['Sussurro', 'sussurrando', 'Sussurrando', '#94a3b8'],
                ['Grito', 'gritando', 'Gritando', '#ffffff'],
                ['Baixo', 'baixo', 'Falando baixo', '#cbd5e1'],
                ['Rádio', 'rádio', 'Fala no rádio', '#38bdf8'],
                ['Celular', 'celular', 'Ligação ou mensagem', '#f5c500']
              ] as const).map(([label, tone, tip, color]) => (
                <button
                  key={tone}
                  onClick={() => insertSpeech(tone)}
                  title={`${tip} (“diz (${tone}):”)`}
                  style={{ color, borderColor: `${color}55` }}
                  className={`px-2 py-1.5 rounded-lg border bg-[#0B0E14] hover:bg-slate-800 text-[11px] transition-colors ${tone === 'gritando' ? 'font-extrabold' : 'font-semibold'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-[11px] text-slate-400 block mb-1.5">Ações e marcadores</span>
            <div className="grid grid-cols-4 gap-1.5">
              {([
                ['* /me', () => insertAtCursor(`* ${activeChar?.name ?? 'Personagem'} `), 'Ação do personagem ativo', '#cc99ff'],
                ['> /ame', () => insertAtCursor('> '), 'Ação sobre o personagem', '#cc99ff'],
                ['* /do', () => insertAtCursor('* '), 'Ação do ambiente', '#cc99ff'],
                ['$ Item', () => insertAtCursor('$ '), 'Item ou dinheiro', '#f5c500'],
                ['# Cel', () => insertAtCursor('# '), 'Mensagem ou ligação', '#f5c500'],
                ['! Sis', () => insertAtCursor('! '), 'Notificação do sistema', '#f87171'],
                ['(( OOC', () => insertAtCursor('(( '), 'Fora do personagem', '#94a3b8']
              ] as const).map(([label, fn, tip, color]) => (
                <button
                  key={label}
                  onClick={fn}
                  title={tip}
                  style={{ color, borderColor: `${color}55` }}
                  className="px-2 py-1.5 rounded-lg border bg-[#0B0E14] hover:bg-slate-800 text-[11px] font-semibold transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={insertCensor}
              title="Selecione um trecho no editor e clique para censurar; sem seleção insere um marcador"
              className="mt-1.5 w-full px-2 py-1.5 rounded-lg border border-red-400/30 bg-red-950/40 hover:bg-red-900/50 text-red-300 text-[11px] font-semibold transition-colors"
            >
              ||Censurar seleção||
            </button>
          </div>
        </div>

        {/* Gerenciador de Personagens */}
        <div className="p-4 rounded-2xl bg-[#121722] border border-[#1E2638] shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" /> Personagens da Cena
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newCharName}
              onChange={(e) => setNewCharName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCharacter()}
              placeholder="Nome do personagem..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#0B0E14] border border-[#1E2638] text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={addCharacter}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {characters.map((char) => (
              <div
                key={char.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-all"
                style={{
                  borderColor: char.id === activeChar?.id ? char.color : `${char.color}40`,
                  backgroundColor: `${char.color}${char.id === activeChar?.id ? '30' : '15'}`,
                  color: char.color,
                  boxShadow: char.id === activeChar?.id ? `0 0 0 1px ${char.color}` : undefined
                }}
              >
                <button
                  onClick={() => insertCharSpeech(char.name)}
                  aria-pressed={char.id === activeChar?.id}
                  className="font-medium hover:underline text-[11px]"
                  title="Define como personagem ativo e insere a fala"
                >
                  {char.name}
                </button>
                <button
                  onClick={() => removeCharacter(char.id)}
                  className="opacity-60 hover:opacity-100 hover:text-red-400 ml-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Coluna da Direita: Preview Interativo Canvas (8 cols) */}
      <div className={`${focusMode ? 'lg:col-span-12' : 'lg:col-span-8 xl:col-span-9'} flex flex-col gap-4 min-w-0 lg:sticky lg:top-4`}>

        {/* Barra Superior do Canvas */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-[#121722] border border-[#1E2638]">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div role="toolbar" aria-label="Ferramenta do mouse" className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Mouse</span>
              {([
                ['chat', 'Texto chat', '1', 'Arrastar move o bloco de texto'],
                ['photo', 'Enquadrar foto', '2', 'Arrastar desloca a foto; a roda dá zoom'],
                ['layer', 'Mover camada', '3', 'Arrastar move a camada; a roda muda o tamanho'],
                ['light', 'Posicionar luz', '4', 'Arrastar move a luz (ative a iluminação)']
              ] as const).map(([key, label, hotkey, tip]) => (
                <button
                  key={key}
                  onClick={() => setMouseTool(key)}
                  aria-pressed={mouseTool === key}
                  title={`${tip} (${hotkey})`}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                    mouseTool === key
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/60'
                      : 'border-[#1E2638] text-slate-300 hover:border-emerald-500/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {mouseTool === 'chat' && 'Arraste para posicionar o chat'}
              {mouseTool === 'photo' && 'Arraste para enquadrar a foto · roda do mouse = zoom'}
              {mouseTool === 'layer' && (layers.length ? 'Clique numa camada para selecionar e arrastar · roda = tamanho' : 'Adicione uma camada no painel à esquerda')}
              {mouseTool === 'light' && (lighting.enabled ? 'Arraste para posicionar a luz' : 'Ative a iluminação no painel para usar esta ferramenta')}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFocusMode(v => !v)}
              aria-pressed={focusMode}
              title="Modo foco: esconde os controles e amplia o preview (F)"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              {focusMode ? '⤡ Mostrar controles' : '⤢ Modo foco'}
            </button>
            <button
              onClick={() => setChatPos({ x: 40, y: 50 })}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Posição
            </button>
            <button
              onClick={copyImage}
              title="Copia o PNG 2× para a área de transferência (Ctrl+C)"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
            >
              ⧉ Copiar imagem
            </button>
            <button
              onClick={exportImage}
              className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Download className="w-4 h-4" /> Exportar 2× Ultra HD
            </button>
          </div>
        </div>

        {/* Viewport do Canvas com Drag & Drop */}
        <div
          ref={viewportRef}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl overflow-hidden bg-[#07090E] border transition-colors flex items-center justify-center p-2 h-[60vh] lg:h-[calc(100vh-9.5rem)] min-h-[360px] shadow-2xl ${
            isDraggingFile ? 'border-emerald-400 ring-2 ring-emerald-500/30' : 'border-[#1E2638]'
          }`}
        >
          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            tabIndex={0}
            aria-label="Preview do chat log. Setas movem o texto, Shift acelera."
            style={{
              touchAction: 'none',
              // Ajusta à área disponível (reduz ou amplia até 2×) mantendo a proporção
              ...(viewSize.w > 0 ? (() => {
                const k = Math.min((viewSize.w - 16) / canvasDims.width, (viewSize.h - 16) / canvasDims.height, 2);
                return { width: Math.max(1, Math.floor(canvasDims.width * k)), height: Math.max(1, Math.floor(canvasDims.height * k)) };
              })() : {})
            }}
            className={`rounded-lg shadow-lg ${mouseTool === 'light' ? 'cursor-crosshair' : mouseTool === 'photo' ? 'cursor-move' : mouseTool === 'layer' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
          />

          {!imageSrc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
              <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-3">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-sm font-bold text-white mb-1">
                Visualização Interativa de Chat Log &amp; Retoque
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Arraste um print do seu jogo para cá ou cole com Ctrl+V.
                Use os controles de tipografia e retoque fotográfico para dar aspecto de cinema.
              </p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
