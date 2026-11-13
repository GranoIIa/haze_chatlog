/**
 * Haze Video Studio: composição de UM quadro. O preview e a exportação usam EXATAMENTE
 * esta função, então o que o jogador vê é o que sai no arquivo.
 * Ordem: camadas de vídeo (1 clipe, ou 2 durante uma transição; cada uma com seu preset de câmera
 * e sua opacidade) → chats e textos.
 */
import { renderChatText, ChatStyle } from '../utils/chatRenderer';
import { applyFilmEffects, drawCameraOverlay, CAMERA_PRESET_EFFECTS, DEFAULT_CAMERA, CameraState } from '../utils/cameraFx';
import { activeLayerClips, activeLayers, cameraClock, overlaysAt, overlayText, Timeline, ClipCamera } from './timeline';

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

/** Quadro de um clipe ativo. `frames[i]` corresponde a `activeLayers(tl, t)[i]`. */
export type LayerFrames = Array<Drawable | null>;

// canvas de apoio para fundir duas camadas com presets diferentes (reaproveitado entre quadros)
let scratch: { c: HTMLCanvasElement | OffscreenCanvas; w: number; h: number } | null = null;
function scratchCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch || scratch.w !== w || scratch.h !== h) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    scratch = { c, w, h };
  }
  const x = scratch.c.getContext('2d') as CanvasRenderingContext2D;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, w, h);
  return x;
}

function drawContained(c: CanvasRenderingContext2D, W: number, H: number, frame: Drawable, alpha: number): void {
  const s = Math.min(W / frame.width, H / frame.height);
  const w = frame.width * s, h = frame.height * s;
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(frame, (W - w) / 2, (H - h) / 2, w, h);
  c.restore();
}

/** Desenha as camadas de vídeo ativas em `t` (com presets e opacidades) e os textos por cima. */
export function composeFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  W: number, H: number, frames: Drawable | null | LayerFrames, tl: Timeline, t: number,
  layerFrames?: Map<string, Drawable | null>
): void {
  const c = ctx as CanvasRenderingContext2D;
  const layers = activeLayers(tl, t);
  const list: LayerFrames = Array.isArray(frames) ? frames : [frames];
  c.save();
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  c.restore();

  if (layers.length <= 1) {
    // caminho comum (sem transição): efeitos direto no quadro final
    const L = layers[0], f = list[0];
    if (L && f && f.width > 0 && f.height > 0) drawContained(c, W, H, f, L.alpha);
    if (L?.clip.camera) {
      const cam = toCameraState(L.clip.camera, L.sourceTime);
      applyFilmEffects(c, W, H, cam.effects);
      drawCameraOverlay(c, W, H, cam, '');
    }
  } else {
    // transição: cada camada passa por um canvas próprio (para o preset de uma não afetar a outra)
    layers.forEach((L, i) => {
      const f = list[i];
      if (!f || f.width <= 0 || f.height <= 0) return;
      if (!L.clip.camera) { drawContained(c, W, H, f, L.alpha); return; }
      const sx = scratchCanvas(W, H);
      sx.fillStyle = '#000'; sx.fillRect(0, 0, W, H);
      drawContained(sx, W, H, f, 1);
      const cam = toCameraState(L.clip.camera, L.sourceTime);
      applyFilmEffects(sx, W, H, cam.effects);
      drawCameraOverlay(sx, W, H, cam, '');
      c.save(); c.globalAlpha = L.alpha; c.drawImage(scratch!.c as CanvasImageSource, 0, 0); c.restore();
    });
  }

  // trilha de sobreposição (picture-in-picture), por cima do vídeo principal e por baixo dos textos
  for (const A of activeLayerClips(tl, t)) {
    const f = layerFrames?.get(A.layer.id);
    if (!f || f.width <= 0 || f.height <= 0 || A.tr.opacity <= 0) continue;
    const s = Math.min(W / f.width, H / f.height) * A.tr.scale;
    const w = f.width * s, h = f.height * s;
    c.save();
    c.globalAlpha = A.tr.opacity;
    c.drawImage(f, A.tr.x * W - w / 2, A.tr.y * H - h / 2, w, h);
    c.restore();
  }

  const scale = H / BASE_H;
  for (const o of overlaysAt(tl, t)) {
    const text = overlayText(o, t);
    if (!text.trim()) continue;
    if (o.kind === 'text') {
      drawFreeText(c, text, o.align === 'center' ? W / 2 : o.x * scale, o.y * scale, Math.round(o.fontSize * scale), o.color ?? '#ffffff', W, o.align === 'center');
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
function drawFreeText(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, maxW: number, center: boolean): void {
  c.save();
  c.font = `bold ${size}px Arial, sans-serif`;
  c.textBaseline = 'top';
  c.textAlign = center ? 'center' : 'left';
  c.lineJoin = 'round';
  c.lineWidth = Math.max(2, Math.round(size / 8));
  c.strokeStyle = '#000000';
  c.fillStyle = color;
  const lh = Math.round(size * 1.25);
  text.split(String.fromCharCode(10)).forEach((line, i) => {
    c.strokeText(line, x, y + i * lh, maxW * 0.9);
    c.fillText(line, x, y + i * lh, maxW * 0.9);
  });
  c.restore();
}
