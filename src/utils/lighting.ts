// ---- Iluminação & luz colorida (portada da versão original) ----
export type LightSource = 'radial' | 'conic' | 'rim' | 'ambient' | 'duotone';

export interface Lighting {
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

export const DEFAULT_LIGHTING: Lighting = {
  enabled: false, color: '#ff2846', intensity: 70, radius: 80, softness: 85, x: 25, y: 30,
  sourceType: 'radial', blendMode: 'screen',
  secondaryColor: '#1ec8ff', secondaryIntensity: 50, secondaryX: 85, secondaryY: 70
};

export const LIGHT_SOURCES: Array<[LightSource, string]> = [
  ['radial', 'Softbox radial'], ['conic', 'Feixe direcional'], ['rim', 'Luz de recorte'],
  ['ambient', 'Ambiente difuso'], ['duotone', 'Duo-tone (2 cores)']
];

export const LIGHT_BLENDS: Array<[GlobalCompositeOperation, string]> = [
  ['screen', 'Screen (clarear)'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'],
  ['color-dodge', 'Color dodge (intenso)'], ['lighten', 'Lighten'], ['hard-light', 'Hard light'], ['multiply', 'Multiply (escurecer)']
];

export const LIGHTING_PRESETS: Array<{ label: string; patch: Partial<Lighting> }> = [
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

export const LIGHT_POSITIONS: Array<[string, string, number, number]> = [
  ['↖', 'Topo esquerda', 15, 15], ['↑', 'Topo', 50, 15], ['↗', 'Topo direita', 85, 15],
  ['←', 'Esquerda', 15, 50], ['•', 'Centro', 50, 50], ['→', 'Direita', 85, 50],
  ['↙', 'Base esquerda', 15, 85], ['↓', 'Base', 50, 85], ['↘', 'Base direita', 85, 85]
];

export const hexToRgba = (hex: string, alpha = 1): string => {
  let c = (hex || '').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c, 16);
  if (c.length !== 6 || isNaN(n)) return `rgba(255, 40, 70, ${alpha})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

export const sanitizeLighting = (v: any): Lighting => {
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

export const drawPhotographicLight = (ctx: CanvasRenderingContext2D, W: number, H: number, L: Lighting) => {
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
export const drawLightGizmo = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string, label: string, k: number) => {
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
