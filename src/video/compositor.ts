/**
 * Haze Video Studio: composição de UM quadro. O preview e a exportação usam EXATAMENTE
 * esta função, então o que o jogador vê é o que sai no arquivo.
 * Ordem: quadro (contido) → preset de câmera do clipe → chats e textos.
 */
import { renderChatText, ChatStyle } from '../utils/chatRenderer';
import { applyFilmEffects, drawCameraOverlay, CAMERA_PRESET_EFFECTS, DEFAULT_CAMERA, CameraState } from '../utils/cameraFx';
import { cameraClock, locate, overlaysAt, overlayText, Timeline, ClipCamera } from './timeline';

export type Drawable = CanvasImageSource & { width: number; height: number };

const BASE_H = 720; // altura de referência para escalar fonte/posição

/** Converte o preset do clipe no estado de câmera do Editor RP, com o relógio no instante `sourceTime`. */
export function toCameraState(cam: ClipCamera, sourceTime: number): CameraState {
  const clock = cameraClock(cam, sourceTime);
  return {
    ...DEFAULT_CAMERA,
    preset: cam.preset,
    effects: { ...CAMERA_PRESET_EFFECTS[cam.preset] },
    custom: {
      ...DEFAULT_CAMERA.custom,
      bodycamDate: clock.date, bodycamTime: clock.time, bodycamDept: cam.dept ?? '', bodycamOfficer: cam.officer ?? '',
      cctvDate: clock.date, cctvTime: clock.time, cctvCamName: cam.camName ?? '', cctvLocation: cam.location ?? ''
    }
  };
}

/** Desenha `frame` (contido no quadro, com faixas pretas), o preset de câmera e os textos ativos em `t`. */
export function composeFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number, H: number, frame: Drawable | null, tl: Timeline, t: number
): void {
  const c = ctx as CanvasRenderingContext2D;
  c.save();
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  if (frame && frame.width > 0 && frame.height > 0) {
    const s = Math.min(W / frame.width, H / frame.height);
    const w = frame.width * s, h = frame.height * s;
    c.drawImage(frame, (W - w) / 2, (H - h) / 2, w, h);
  }
  c.restore();

  // preset de câmera do clipe sob o cursor (mesmos efeitos e HUD do Editor RP)
  const hit = locate(tl, t);
  if (hit?.clip.camera) {
    const cam = toCameraState(hit.clip.camera, hit.sourceTime);
    applyFilmEffects(c, W, H, cam.effects);
    drawCameraOverlay(c, W, H, cam, '');
  }

  const scale = H / BASE_H;
  for (const o of overlaysAt(tl, t)) {
    const text = overlayText(o, t);
    if (!text.trim()) continue;
    if (o.kind === 'text') {
      drawFreeText(c, text, o.x * scale, o.y * scale, Math.round(o.fontSize * scale), o.color ?? '#ffffff', W);
      continue;
    }
    const style: ChatStyle = {
      rawText: text, characters: [], fontSize: o.fontSize, fontFamily: 'Arial, sans-serif',
      lineHeightFactor: 1.25, strokeEnabled: true, strokeWidth: 3, strokeColor: '#000000',
      bgEnabled: true, bgColor: '#000000', bgOpacity: 0.45, maxWidthPercent: 70, shadowEnabled: false,
      censorStyle: 'solid', showTimestamps: false, chatPos: { x: o.x, y: o.y }
    };
    renderChatText(c, W, H, scale, style);
  }
}

/** Título/legenda livre: texto com contorno, uma linha por linha do texto. */
function drawFreeText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, maxW: number): void {
  c.save();
  c.font = `bold ${size}px Arial, sans-serif`;
  c.textBaseline = 'top';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, Math.round(size / 8));
  c.strokeStyle = '#000000';
  c.fillStyle = color;
  const lh = Math.round(size * 1.25);
  text.split(String.fromCharCode(10)).forEach((line, i) => {
    c.strokeText(line, x, y + i * lh, maxW);
    c.fillText(line, x, y + i * lh, maxW);
  });
  c.restore();
}
