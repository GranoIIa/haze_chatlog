/**
 * Haze Video Studio (POC): composição de UM quadro. O preview e a exportação usam EXATAMENTE
 * esta função, então o que o jogador vê é o que sai no arquivo.
 */
import { renderChatText, ChatStyle } from '../utils/chatRenderer';
import { overlaysAt, Timeline } from './timeline';

export type Drawable = CanvasImageSource & { width: number; height: number };

const BASE_H = 720; // altura de referência para escalar fonte/posição do chat

/** Desenha `frame` (contido no quadro, com faixas pretas) e os chats ativos em `t`. */
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

  const scale = H / BASE_H;
  for (const o of overlaysAt(tl, t)) {
    const style: ChatStyle = {
      rawText: o.text, characters: [], fontSize: o.fontSize, fontFamily: 'Arial, sans-serif',
      lineHeightFactor: 1.25, strokeEnabled: true, strokeWidth: 3, strokeColor: '#000000',
      bgEnabled: true, bgColor: '#000000', bgOpacity: 0.45, maxWidthPercent: 70, shadowEnabled: false,
      censorStyle: 'solid', showTimestamps: false, chatPos: { x: o.x, y: o.y }
    };
    renderChatText(c, W, H, scale, style);
  }
}
